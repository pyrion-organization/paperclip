import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  Plus,
  Trash2,
} from "lucide-react";
import { isUuidLike } from "@paperclipai/shared/agent-url-key";
import { cn } from "@/lib/classnames";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SecretBindingPicker, type SecretBindingValue } from "./SecretBindingPicker";
import {
  getDefaultForSchema,
  getDefaultValues,
  labelFromKey,
  resolveType,
  validateJsonSchemaForm,
  type JsonSchemaNode,
} from "./json-schema-form-utils";
export type { JsonSchemaNode } from "./json-schema-form-utils";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Threshold for string length above which a Textarea is used instead of a standard Input.
 */
const TEXTAREA_THRESHOLD = 200;
const EMPTY_FORM_ERRORS: Record<string, string> = {};

const EMPTY_ITEMS: unknown[] = [];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface JsonSchemaFormProps {
  /** The JSON Schema to render. */
  schema: JsonSchemaNode;
  /** Current form values. */
  values: Record<string, unknown>;
  /** Called whenever any field value changes. */
  onChange: (values: Record<string, unknown>) => void;
  /** Validation errors keyed by JSON pointer path (e.g. "/apiKey"). */
  errors?: Record<string, string>;
  /** If true, all fields are disabled. */
  disabled?: boolean;
  /** Additional CSS class for the root container. */
  className?: string;
}

// ---------------------------------------------------------------------------
// Internal Components
// ---------------------------------------------------------------------------

interface FieldWrapperProps {
  label: string;
  description?: string;
  required?: boolean;
  error?: string;
  disabled?: boolean;
  children: React.ReactNode;
}

/**
 * Common wrapper for form fields that handles labels, descriptions, and error messages.
 */
const FieldWrapper = React.memo(({
  label,
  description,
  required,
  error,
  disabled,
  children,
}: FieldWrapperProps) => {
  return (
    <div className={cn("space-y-2", disabled && "opacity-60")}>
      <div className="flex items-center justify-between">
        {label && (
          <Label className="text-sm font-medium">
            {label}
            {required && <span className="ml-1 text-destructive">*</span>}
          </Label>
        )}
      </div>
      {children}
      {description && (
        <p className="text-[12px] text-muted-foreground leading-relaxed">
          {description}
        </p>
      )}
      {error && (
        <p className="text-[12px] font-medium text-destructive">{error}</p>
      )}
    </div>
  );
});

FieldWrapper.displayName = "FieldWrapper";

interface FormFieldProps {
  propSchema: JsonSchemaNode;
  value: unknown;
  onChange: (val: unknown) => void;
  error?: string;
  disabled?: boolean;
  label: string;
  isRequired?: boolean;
  errors: Record<string, string>; // needed for recursion
  path: string; // needed for recursion error filtering
}

/**
 * Specialized field for boolean (checkbox) values.
 */
const BooleanField = React.memo(({
  id,
  value,
  onChange,
  disabled,
  label,
  isRequired,
  description,
  error,
}: {
  id: string;
  value: unknown;
  onChange: (val: unknown) => void;
  disabled: boolean;
  label: string;
  isRequired?: boolean;
  description?: string;
  error?: string;
}) => (
  <div className="flex items-start gap-x-3">
    <Checkbox
      id={id}
      checked={!!value}
      onCheckedChange={onChange}
      disabled={disabled}
    />
    <div className="grid gap-1.5 leading-none">
      {label && (
        <Label
          htmlFor={id}
          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
        >
          {label}
          {isRequired && <span className="ml-1 text-destructive">*</span>}
        </Label>
      )}
      {description && (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}
      {error && (
        <p className="text-xs font-medium text-destructive">{error}</p>
      )}
    </div>
  </div>
));

BooleanField.displayName = "BooleanField";

/**
 * Specialized field for enum (select) values.
 */
const EnumField = React.memo(({
  value,
  onChange,
  disabled,
  label,
  isRequired,
  description,
  error,
  options,
}: {
  value: unknown;
  onChange: (val: unknown) => void;
  disabled: boolean;
  label: string;
  isRequired?: boolean;
  description?: string;
  error?: string;
  options: unknown[];
}) => (
  <FieldWrapper
    label={label}
    description={description}
    required={isRequired}
    error={error}
    disabled={disabled}
  >
    <Select
      value={String(value ?? "")}
      onValueChange={onChange}
      disabled={disabled}
    >
      <SelectTrigger className="w-full">
        <SelectValue placeholder="Select an option" />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={String(option)} value={String(option)}>
            {String(option)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  </FieldWrapper>
));

EnumField.displayName = "EnumField";

/**
 * Specialized field for secret-ref values. Renders a picker for existing
 * company secrets plus a raw-value fallback. A UUID-shaped value is treated
 * as a bound secret reference; anything else is a raw value that the server
 * converts to a stored secret on save.
 */
const SecretField = React.memo(({
  value,
  onChange,
  disabled,
  label,
  isRequired,
  description,
  error,
  defaultValue,
  maxLength,
}: {
  value: unknown;
  onChange: (val: unknown) => void;
  disabled: boolean;
  label: string;
  isRequired?: boolean;
  description?: string;
  error?: string;
  defaultValue?: unknown;
  maxLength?: number;
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const isTextArea = maxLength != null && maxLength > TEXTAREA_THRESHOLD;

  const stringValue = typeof value === "string" ? value : "";
  const trimmed = stringValue.trim();
  const isBoundToSecret = trimmed.length > 0 && isUuidLike(trimmed);
  const hasRawValue = stringValue.length > 0 && !isBoundToSecret;

  const [showRawInput, setShowRawInput] = useState(hasRawValue);

  // Keep the raw-input panel open when the parent loads a raw value after
  // mount (e.g. an environment-config form rendering with empty defaults
  // before its API response arrives). We only promote to `true` here; manual
  // toggles off are still preserved as long as `hasRawValue` is false.
  useEffect(() => {
    if (hasRawValue) setShowRawInput(true);
  }, [hasRawValue]);

  const bindingValue: SecretBindingValue | null = isBoundToSecret
    ? { secretId: trimmed }
    : null;

  const handlePickerChange = useCallback(
    (next: SecretBindingValue | null) => {
      if (next) {
        onChange(next.secretId);
        setShowRawInput(false);
        setIsVisible(false);
      } else {
        onChange("");
      }
    },
    [onChange],
  );

  const rawInput = isTextArea ? (
    <div className="relative">
      {isVisible ? (
        <Textarea
          value={stringValue}
          onChange={(e) => onChange(e.target.value)}
          placeholder={String(defaultValue ?? "")}
          disabled={disabled}
          className="min-h-[140px] pr-10 font-mono text-xs"
          aria-invalid={!!error}
        />
      ) : (
        <Textarea
          // Render a placeholder summary instead of the secret content while
          // hidden. This avoids exposing multi-line secrets (e.g. SSH
          // private keys) on screen-shares; clicking the eye toggle reveals
          // the editable textarea above.
          value={
            stringValue.length === 0
              ? ""
              : `Sensitive — ${stringValue.length} characters hidden. Click the eye to reveal.`
          }
          readOnly
          placeholder={String(defaultValue ?? "")}
          disabled={disabled}
          className="min-h-[140px] pr-10 font-mono text-xs italic text-muted-foreground"
          aria-invalid={!!error}
        />
      )}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="absolute right-0 top-0 px-3 py-2 hover:bg-transparent"
        onClick={() => setIsVisible(!isVisible)}
        disabled={disabled}
      >
        {isVisible ? (
          <EyeOff className="size-4 text-muted-foreground" />
        ) : (
          <Eye className="size-4 text-muted-foreground" />
        )}
        <span className="sr-only">
          {isVisible ? "Hide secret" : "Show secret"}
        </span>
      </Button>
    </div>
  ) : (
    <div className="relative">
      <Input
        type={isVisible ? "text" : "password"}
        value={stringValue}
        onChange={(e) => onChange(e.target.value)}
        placeholder={String(defaultValue ?? "")}
        disabled={disabled}
        className="pr-10"
        aria-invalid={!!error}
      />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
        onClick={() => setIsVisible(!isVisible)}
        disabled={disabled}
      >
        {isVisible ? (
          <EyeOff className="size-4 text-muted-foreground" />
        ) : (
          <Eye className="size-4 text-muted-foreground" />
        )}
        <span className="sr-only">
          {isVisible ? "Hide secret" : "Show secret"}
        </span>
      </Button>
    </div>
  );

  return (
    <FieldWrapper
      label={label}
      description={
        description ||
        "Pick an existing company secret, or paste a raw value (Paperclip will store it as a secret on save)."
      }
      required={isRequired}
      error={error}
      disabled={disabled}
    >
      <div className="space-y-2">
        <SecretBindingPicker
          value={bindingValue}
          onChange={handlePickerChange}
          label=""
          placeholder="Select an existing secret"
          allowVersionSelector={false}
          emptyHint="No active secrets yet. Create one or paste a raw value below."
          disabled={disabled}
        />
        {!isBoundToSecret ? (
          showRawInput ? (
            <div className="space-y-1">
              {rawInput}
              {!hasRawValue ? (
                <button
                  type="button"
                  className="text-[11px] text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    setShowRawInput(false);
                    setIsVisible(false);
                  }}
                  disabled={disabled}
                >
                  Hide raw value input
                </button>
              ) : null}
            </div>
          ) : (
            <button
              type="button"
              className="text-[11px] text-muted-foreground hover:text-foreground"
              onClick={() => setShowRawInput(true)}
              disabled={disabled}
            >
              Or paste a raw value
            </button>
          )
        ) : null}
      </div>
    </FieldWrapper>
  );
});

SecretField.displayName = "SecretField";

/**
 * Specialized field for numeric (number/integer) values.
 */
const NumberField = React.memo(({
  value,
  onChange,
  disabled,
  label,
  isRequired,
  description,
  error,
  defaultValue,
  type,
}: {
  value: unknown;
  onChange: (val: unknown) => void;
  disabled: boolean;
  label: string;
  isRequired?: boolean;
  description?: string;
  error?: string;
  defaultValue?: unknown;
  type: "number" | "integer";
}) => (
  <FieldWrapper
    label={label}
    description={description}
    required={isRequired}
    error={error}
    disabled={disabled}
  >
    <Input
      type="number"
      step={type === "integer" ? "1" : "any"}
      value={value !== undefined ? String(value) : ""}
      onChange={(e) => {
        const val = e.target.value;
        onChange(val === "" ? undefined : Number(val));
      }}
      placeholder={String(defaultValue ?? "")}
      disabled={disabled}
      aria-invalid={!!error}
    />
  </FieldWrapper>
));

NumberField.displayName = "NumberField";

/**
 * Specialized field for string values, rendering either an Input or Textarea based on length or format.
 */
const StringField = React.memo(({
  value,
  onChange,
  disabled,
  label,
  isRequired,
  description,
  error,
  defaultValue,
  format,
  maxLength,
}: {
  value: unknown;
  onChange: (val: unknown) => void;
  disabled: boolean;
  label: string;
  isRequired?: boolean;
  description?: string;
  error?: string;
  defaultValue?: unknown;
  format?: string;
  maxLength?: number;
}) => {
  const isTextArea = format === "textarea" || (maxLength && maxLength > TEXTAREA_THRESHOLD);
  return (
    <FieldWrapper
      label={label}
      description={description}
      required={isRequired}
      error={error}
      disabled={disabled}
    >
      {isTextArea ? (
        <Textarea
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          placeholder={String(defaultValue ?? "")}
          disabled={disabled}
          className="min-h-[100px]"
          aria-invalid={!!error}
        />
      ) : (
        <Input
          type="text"
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          placeholder={String(defaultValue ?? "")}
          disabled={disabled}
          aria-invalid={!!error}
        />
      )}
    </FieldWrapper>
  );
});

StringField.displayName = "StringField";

/**
 * Specialized field for array values, handling dynamic addition and removal of items.
 */
const ArrayItemField = React.memo(({
  item,
  index,
  items,
  itemSchema,
  onChange,
  disabled,
  errors,
  path,
}: {
  item: unknown;
  index: number;
  items: unknown[];
  itemSchema: JsonSchemaNode;
  onChange: (val: unknown) => void;
  disabled: boolean;
  errors: Record<string, string>;
  path: string;
}) => {
  const handleItemChange = useCallback(
    (newVal: unknown) => {
      const newItems = [...items];
      newItems[index] = newVal;
      onChange(newItems);
    },
    [index, items, onChange],
  );

  return (
    <FormField
      propSchema={itemSchema}
      value={item}
      label=""
      path={`${path}/${index}`}
      onChange={handleItemChange}
      disabled={disabled}
      errors={errors}
    />
  );
});

ArrayItemField.displayName = "ArrayItemField";

const ArrayField = React.memo(({
  propSchema,
  value,
  onChange,
  error,
  disabled,
  label,
  errors,
  path,
}: {
  propSchema: JsonSchemaNode;
  value: unknown;
  onChange: (val: unknown) => void;
  error?: string;
  disabled: boolean;
  label: string;
  errors: Record<string, string>;
  path: string;
}) => {
  const items = Array.isArray(value) ? value : EMPTY_ITEMS;
  const itemSchema = propSchema.items as JsonSchemaNode;
  const isComplex = resolveType(itemSchema) === "object";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-sm font-medium">{label}</Label>
          {propSchema.description && (
            <p className="text-xs text-muted-foreground">
              {propSchema.description}
            </p>
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={
            disabled ||
            (propSchema.maxItems !== undefined &&
              items.length >= (propSchema.maxItems as number))
          }
          onClick={() => {
            const newItem = getDefaultForSchema(itemSchema);
            onChange([...items, newItem]);
          }}
        >
          <Plus className="mr-2 size-4" />
          {isComplex ? "Add item" : "Add"}
        </Button>
      </div>

      <div className="space-y-3">
        {items.map((item, index) => (
          <div
            key={`${path}.${index}`}
            className="group relative flex items-start gap-x-2 rounded-lg border p-3"
          >
            <div className="flex-1">
              <div className="mb-2 text-xs font-medium text-muted-foreground">
                Item {index + 1}
              </div>
              <ArrayItemField
                item={item}
                index={index}
                items={items}
                itemSchema={itemSchema}
                onChange={onChange}
                disabled={disabled}
                errors={errors}
                path={path}
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 text-muted-foreground hover:text-destructive"
              disabled={
                disabled ||
                (propSchema.minItems !== undefined &&
                  items.length <= (propSchema.minItems as number))
              }
              onClick={() => {
                const newItems = [...items];
                newItems.splice(index, 1);
                onChange(newItems);
              }}
            >
              <Trash2 className="size-4" />
              <span className="sr-only">Remove item</span>
            </Button>
          </div>
        ))}
        {items.length === 0 && (
          <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
            No items added yet.
          </div>
        )}
      </div>
      {error && (
        <p className="text-xs font-medium text-destructive">{error}</p>
      )}
    </div>
  );
});

ArrayField.displayName = "ArrayField";

/**
 * Specialized field for object values, handling recursive rendering of nested properties.
 */
const ObjectField = React.memo(({
  propSchema,
  value,
  onChange,
  disabled,
  label,
  errors,
  path,
}: {
  propSchema: JsonSchemaNode;
  value: unknown;
  onChange: (val: unknown) => void;
  disabled: boolean;
  label: string;
  errors: Record<string, string>;
  path: string;
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const handleObjectChange = (newVal: Record<string, unknown>) => {
    onChange(newVal);
  };

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <button
        type="button"
        className="flex w-full items-center justify-between"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <div className="text-left">
          <Label className="cursor-pointer text-sm font-semibold">
            {label}
          </Label>
          {propSchema.description && (
            <p className="text-xs text-muted-foreground">
              {propSchema.description}
            </p>
          )}
        </div>
        {isCollapsed ? (
          <ChevronRight className="size-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="size-4 text-muted-foreground" />
        )}
      </button>

      {!isCollapsed && (
        <div className="pt-2">
          <JsonSchemaForm
            schema={propSchema}
            values={(value as Record<string, unknown>) ?? {}}
            onChange={handleObjectChange}
            disabled={disabled}
            errors={Object.fromEntries(
              Object.entries(errors).flatMap(([errPath, err]) =>
                errPath.startsWith(`${path}/`)
                  ? [[errPath.replace(path, ""), err]]
                  : [],
              ),
            )}
          />
        </div>
      )}
    </div>
  );
});

ObjectField.displayName = "ObjectField";

/**
 * Orchestrator component that selects and renders the appropriate field type based on the schema node.
 */
const FormField = React.memo(({
  propSchema,
  value,
  onChange,
  error,
  disabled,
  label,
  isRequired,
  errors,
  path,
}: FormFieldProps) => {
  const type = resolveType(propSchema);
  const isReadOnly = disabled || propSchema.readOnly === true;

  switch (type) {
    case "boolean":
      return (
        <BooleanField
          id={path}
          value={value}
          onChange={onChange}
          disabled={isReadOnly}
          label={label}
          isRequired={isRequired}
          description={propSchema.description}
          error={error}
        />
      );

    case "enum":
      return (
        <EnumField
          value={value}
          onChange={onChange}
          disabled={isReadOnly}
          label={label}
          isRequired={isRequired}
          description={propSchema.description}
          error={error}
          options={propSchema.enum ?? []}
        />
      );

    case "secret-ref":
      return (
        <SecretField
          value={value}
          onChange={onChange}
          disabled={isReadOnly}
          label={label}
          isRequired={isRequired}
          description={propSchema.description}
          error={error}
          defaultValue={propSchema.default}
          maxLength={typeof propSchema.maxLength === "number" ? propSchema.maxLength : undefined}
        />
      );

    case "number":
    case "integer":
      return (
        <NumberField
          value={value}
          onChange={onChange}
          disabled={isReadOnly}
          label={label}
          isRequired={isRequired}
          description={propSchema.description}
          error={error}
          defaultValue={propSchema.default}
          type={type as "number" | "integer"}
        />
      );

    case "array":
      return (
        <ArrayField
          propSchema={propSchema}
          value={value}
          onChange={onChange}
          error={error}
          disabled={isReadOnly}
          label={label}
          errors={errors}
          path={path}
        />
      );

    case "object":
      return (
        <ObjectField
          propSchema={propSchema}
          value={value}
          onChange={onChange}
          disabled={isReadOnly}
          label={label}
          errors={errors}
          path={path}
        />
      );

    default: // string
      return (
        <StringField
          value={value}
          onChange={onChange}
          disabled={isReadOnly}
          label={label}
          isRequired={isRequired}
          description={propSchema.description}
          error={error}
          defaultValue={propSchema.default}
          format={propSchema.format}
          maxLength={propSchema.maxLength}
        />
      );
  }
});

FormField.displayName = "FormField";

const SchemaPropertyField = React.memo(({
  fieldKey,
  propSchema,
  values,
  errors,
  disabled,
  requiredFields,
  onFieldChange,
}: {
  fieldKey: string;
  propSchema: JsonSchemaNode;
  values: Record<string, unknown>;
  errors: Record<string, string>;
  disabled?: boolean;
  requiredFields: Set<string>;
  onFieldChange: (key: string, value: unknown) => void;
}) => {
  const updateFieldValue = useCallback(
    (val: unknown) => onFieldChange(fieldKey, val),
    [fieldKey, onFieldChange],
  );
  const value = values[fieldKey];
  const isRequired = requiredFields.has(fieldKey);
  const error = errors[`/${fieldKey}`];
  const label = labelFromKey(fieldKey, propSchema);
  const path = `/${fieldKey}`;

  return (
    <FormField
      propSchema={propSchema}
      value={value}
      onChange={updateFieldValue}
      error={error}
      disabled={disabled}
      label={label}
      isRequired={isRequired}
      errors={errors}
      path={path}
    />
  );
});

SchemaPropertyField.displayName = "SchemaPropertyField";

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

/**
 * Main JsonSchemaForm component.
 * Renders a form based on a subset of JSON Schema specification.
 * Supports primitive types, enums, secrets, objects, and arrays with recursion.
 */
export function JsonSchemaForm({
  schema,
  values,
  onChange,
  errors = EMPTY_FORM_ERRORS,
  disabled,
  className,
}: JsonSchemaFormProps) {
  const type = resolveType(schema);

  const handleRootScalarChange = useCallback((newVal: unknown) => {
    // If root is a scalar, values IS the value
    onChange(newVal as Record<string, unknown>);
  }, [onChange]);

  // Memoize to avoid re-renders when parent provides new object references.
  // Keep these hooks before scalar early returns to preserve hook ordering.
  const properties = useMemo(() => schema.properties ?? {}, [schema.properties]);
  const requiredFields = useMemo(
    () => new Set(schema.required ?? []),
    [schema.required],
  );

  const handleFieldChange = useCallback(
    (key: string, value: unknown) => {
      onChange({ ...values, [key]: value });
    },
    [onChange, values],
  );

  // If it's a scalar at root, render a single FormField
  if (type !== "object") {
    return (
      <div className={className}>
        <FormField
          propSchema={schema}
          value={values}
          label=""
          path=""
          onChange={handleRootScalarChange}
          disabled={disabled}
          errors={errors}
        />
      </div>
    );
  }

  if (Object.keys(properties).length === 0) {
    return (
      <div
        className={cn(
          "py-4 text-center text-sm text-muted-foreground",
          className,
        )}
      >
        No configuration options available.
      </div>
    );
  }

  return (
    <div className={cn("space-y-6", className)}>
      {Object.entries(properties).map(([key, propSchema]) => (
        <SchemaPropertyField
          key={key}
          fieldKey={key}
          propSchema={propSchema}
          values={values}
          errors={errors}
          disabled={disabled}
          requiredFields={requiredFields}
          onFieldChange={handleFieldChange}
        />
      ))}
    </div>
  );
}
