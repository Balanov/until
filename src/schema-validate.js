/**
 * Dependency-free JSON Schema validation for the subset UNTIL uses.
 *
 * The provider is asked to emit `json_schema`-constrained output, but a provider
 * that silently ignores `response_format` must not be able to smuggle an invalid
 * contract into the kernel. Every parsed model response is validated locally
 * before it reaches an agent.
 */

const TYPE_CHECKS = {
  string: (value) => typeof value === "string",
  number: (value) => typeof value === "number" && Number.isFinite(value),
  integer: (value) => Number.isInteger(value),
  boolean: (value) => typeof value === "boolean",
  object: (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value),
  array: (value) => Array.isArray(value),
  null: (value) => value === null,
};

function typeOf(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (Number.isInteger(value)) return "integer";
  return typeof value;
}

function checkValue(value, schema, path, errors) {
  if (!schema || typeof schema !== "object") return;

  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((type) => (TYPE_CHECKS[type] ?? (() => false))(value))) {
      errors.push({ path, message: `expected ${types.join(" or ")}, got ${typeOf(value)}` });
      return;
    }
  }

  if ("const" in schema && value !== schema.const) {
    errors.push({ path, message: `expected ${JSON.stringify(schema.const)}` });
  }

  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
    errors.push({ path, message: `expected one of ${JSON.stringify(schema.enum)}` });
  }

  if (typeof value === "string") {
    if (Number.isInteger(schema.minLength) && value.length < schema.minLength) {
      errors.push({ path, message: `shorter than ${schema.minLength} characters` });
    }
    if (Number.isInteger(schema.maxLength) && value.length > schema.maxLength) {
      errors.push({ path, message: `longer than ${schema.maxLength} characters` });
    }
  }

  if (typeof value === "number") {
    if (typeof schema.minimum === "number" && value < schema.minimum) {
      errors.push({ path, message: `below minimum ${schema.minimum}` });
    }
    if (typeof schema.maximum === "number" && value > schema.maximum) {
      errors.push({ path, message: `above maximum ${schema.maximum}` });
    }
  }

  if (Array.isArray(value)) {
    if (Number.isInteger(schema.minItems) && value.length < schema.minItems) {
      errors.push({ path, message: `fewer than ${schema.minItems} items` });
    }
    if (Number.isInteger(schema.maxItems) && value.length > schema.maxItems) {
      errors.push({ path, message: `more than ${schema.maxItems} items` });
    }
    if (schema.uniqueItems === true) {
      const seen = new Set(value.map((item) => JSON.stringify(item)));
      if (seen.size !== value.length) errors.push({ path, message: "items are not unique" });
    }
    if (schema.items) value.forEach((item, index) => checkValue(item, schema.items, `${path}[${index}]`, errors));
  }

  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const key of schema.required ?? []) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) {
        errors.push({ path: `${path}.${key}`, message: "is required" });
      }
    }
    const properties = schema.properties ?? {};
    for (const [key, child] of Object.entries(value)) {
      if (properties[key]) {
        checkValue(child, properties[key], `${path}.${key}`, errors);
        continue;
      }
      if (schema.additionalProperties === false) {
        errors.push({ path: `${path}.${key}`, message: "is not an allowed property" });
      }
    }
  }
}

export function validateSchema(value, schema) {
  const errors = [];
  checkValue(value, schema, "$", errors);
  return { valid: errors.length === 0, errors };
}

export function assertValidSchema(value, schema, label = "Model response") {
  const result = validateSchema(value, schema);
  if (!result.valid) {
    const summary = result.errors.slice(0, 5).map((item) => `${item.path} ${item.message}`).join("; ");
    throw new Error(`${label} does not match the required schema: ${summary}`);
  }
  return value;
}
