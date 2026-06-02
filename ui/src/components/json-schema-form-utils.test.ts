import { describe, expect, it } from "vitest";
import {
  getDefaultForSchema,
  validateJsonSchemaForm,
  type JsonSchemaNode,
} from "./json-schema-form-utils";

describe("json-schema-form-utils const fields", () => {
  it("defaults const fields to their declared const value", () => {
    expect(getDefaultForSchema({ const: "acpx_local" })).toBe("acpx_local");
    expect(getDefaultForSchema({ const: 3 })).toBe(3);
  });

  it("validates submitted const fields against the declared const value", () => {
    const schema: JsonSchemaNode = {
      type: "object",
      properties: {
        adapterType: { const: "acpx_local" },
      },
      required: ["adapterType"],
    };

    expect(validateJsonSchemaForm(schema, { adapterType: "acpx_local" })).toEqual({});
    expect(validateJsonSchemaForm(schema, { adapterType: "codex_local" })).toEqual({
      "/adapterType": "Must equal \"acpx_local\"",
    });
  });
});
