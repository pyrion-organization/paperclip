export interface JsonSchemaNode {
  type?: string | string[];
  title?: string;
  description?: string;
  default?: unknown;
  enum?: unknown[];
  const?: unknown;
  format?: string;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  multipleOf?: number;
  properties?: Record<string, JsonSchemaNode>;
  required?: string[];
  additionalProperties?: boolean | JsonSchemaNode;
  items?: JsonSchemaNode;
  minItems?: number;
  maxItems?: number;
  readOnly?: boolean;
  writeOnly?: boolean;
  [key: string]: unknown;
}

export function resolveType(schema: JsonSchemaNode): string {
  if (schema.enum) return "enum";
  if (schema.const !== undefined) return "const";
  if (schema.format === "secret-ref") return "secret-ref";
  if (Array.isArray(schema.type)) {
    return schema.type.find((t) => t !== "null") ?? "string";
  }
  return schema.type ?? "string";
}

export function labelFromKey(key: string, schema: JsonSchemaNode): string {
  if (schema.title) return schema.title;
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function getDefaultForSchema(schema: JsonSchemaNode): unknown {
  if (schema.default !== undefined) return schema.default;

  const type = resolveType(schema);
  switch (type) {
    case "string":
    case "secret-ref":
      return "";
    case "number":
    case "integer":
      return schema.minimum ?? 0;
    case "boolean":
      return false;
    case "enum":
      return schema.enum?.[0] ?? "";
    case "const":
      return schema.const;
    case "array":
      return [];
    case "object": {
      if (!schema.properties) return {};
      const obj: Record<string, unknown> = {};
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        obj[key] = getDefaultForSchema(propSchema);
      }
      return obj;
    }
    default:
      return "";
  }
}

function validateField(
  value: unknown,
  schema: JsonSchemaNode,
  isRequired: boolean,
): string | null {
  const type = resolveType(schema);

  if (isRequired && (value === undefined || value === null || value === "")) {
    return "This field is required";
  }

  if (value === undefined || value === null || value === "") return null;

  if (type === "const") {
    return JSON.stringify(value) === JSON.stringify(schema.const)
      ? null
      : `Must equal ${JSON.stringify(schema.const)}`;
  }

  if (type === "string" || type === "secret-ref") {
    const str = String(value);
    if (schema.minLength != null && str.length < schema.minLength) {
      return `Must be at least ${schema.minLength} characters`;
    }
    if (schema.maxLength != null && str.length > schema.maxLength) {
      return `Must be at most ${schema.maxLength} characters`;
    }
    if (schema.pattern) {
      const MAX_PATTERN_LENGTH = 512;
      if (schema.pattern.length <= MAX_PATTERN_LENGTH) {
        try {
          const re = new RegExp(schema.pattern);
          if (!re.test(str)) {
            return `Must match pattern: ${schema.pattern}`;
          }
        } catch {
          // Invalid regex in schema, skip validation for this constraint.
        }
      }
    }
  }

  if (type === "number" || type === "integer") {
    const num = Number(value);
    if (isNaN(num)) return "Must be a valid number";
    if (schema.minimum != null && num < schema.minimum) {
      return `Must be at least ${schema.minimum}`;
    }
    if (schema.maximum != null && num > schema.maximum) {
      return `Must be at most ${schema.maximum}`;
    }
    if (schema.exclusiveMinimum != null && num <= schema.exclusiveMinimum) {
      return `Must be greater than ${schema.exclusiveMinimum}`;
    }
    if (schema.exclusiveMaximum != null && num >= schema.exclusiveMaximum) {
      return `Must be less than ${schema.exclusiveMaximum}`;
    }
    if (type === "integer" && !Number.isInteger(num)) {
      return "Must be a whole number";
    }
    if (schema.multipleOf != null && num % schema.multipleOf !== 0) {
      return `Must be a multiple of ${schema.multipleOf}`;
    }
  }

  if (type === "array") {
    const arr = value as unknown[];
    if (schema.minItems != null && arr.length < schema.minItems) {
      return `Must have at least ${schema.minItems} items`;
    }
    if (schema.maxItems != null && arr.length > schema.maxItems) {
      return `Must have at most ${schema.maxItems} items`;
    }
  }

  return null;
}

export function validateJsonSchemaForm(
  schema: JsonSchemaNode,
  values: Record<string, unknown>,
  path: string[] = [],
): Record<string, string> {
  const errors: Record<string, string> = {};
  const properties = schema.properties ?? {};
  const requiredFields = new Set(schema.required ?? []);

  for (const [key, propSchema] of Object.entries(properties)) {
    const fieldPath = [...path, key];
    const errorKey = `/${fieldPath.join("/")}`;
    const value = values[key];
    const isRequired = requiredFields.has(key);
    const type = resolveType(propSchema);

    const fieldErr = validateField(value, propSchema, isRequired);
    if (fieldErr) {
      errors[errorKey] = fieldErr;
    }

    if (type === "object" && propSchema.properties && typeof value === "object" && value !== null) {
      Object.assign(
        errors,
        validateJsonSchemaForm(propSchema, value as Record<string, unknown>, fieldPath),
      );
    }

    if (type === "array" && propSchema.items && Array.isArray(value)) {
      const itemSchema = propSchema.items;
      const isObjectItem = resolveType(itemSchema) === "object";

      value.forEach((item, index) => {
        const itemPath = [...fieldPath, String(index)];
        const itemErrorKey = `/${itemPath.join("/")}`;

        if (isObjectItem) {
          Object.assign(
            errors,
            validateJsonSchemaForm(
              itemSchema,
              item as Record<string, unknown>,
              itemPath,
            ),
          );
        } else {
          const itemErr = validateField(item, itemSchema, false);
          if (itemErr) {
            errors[itemErrorKey] = itemErr;
          }
        }
      });
    }
  }

  return errors;
}

export function getDefaultValues(schema: JsonSchemaNode): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const properties = schema.properties ?? {};

  for (const [key, propSchema] of Object.entries(properties)) {
    const def = getDefaultForSchema(propSchema);
    if (def !== undefined) {
      result[key] = def;
    }
  }

  return result;
}
