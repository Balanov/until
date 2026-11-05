const text = (minLength = 1, maxLength = 4000) => ({ type: "string", minLength, maxLength });

export function researchSchema(signals) {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      statement: text(5),
      mechanism: text(5),
      evidenceIds: {
        type: "array",
        minItems: 1,
        uniqueItems: true,
        items: { type: "string", enum: signals.map((signal) => signal.id) },
      },
      score: { type: "number", minimum: 0, maximum: 1 },
    },
    required: ["statement", "mechanism", "evidenceIds", "score"],
  };
}

export function specSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      title: text(3, 500),
      summary: text(5, 6000),
      risk: { type: "string", enum: ["low", "high"] },
      checks: {
        type: "array", minItems: 1, maxItems: 20,
        items: {
          type: "object",
          properties: {
            type: { type: "string", enum: ["file_exists", "sha256", "json_field", "contains", "command_profile"] },
            field: text(1, 200), equals: {}, path: text(1, 4096), text: text(1, 10000),
            hash: text(64, 64), profile: text(1, 100), expect: { type: "object" },
          },
          required: ["type"],
        },
      },
    },
    required: ["title", "summary", "checks", "risk"],
  };
}

function constrain(schema, segments, value) {
  if (!segments.length || segments.some((key) => ["__proto__", "prototype", "constructor"].includes(key))) {
    throw new Error("Acceptance check contains an unsafe JSON field");
  }
  let current = schema;
  for (let index = 0; index < segments.length; index += 1) {
    const key = segments[index];
    current.properties ??= {};
    if (index === segments.length - 1) {
      current.properties[key] = { const: value };
    } else {
      current.properties[key] ??= { type: "object" };
      current = current.properties[key];
    }
    current.required = [...new Set([...(current.required ?? []), key])];
  }
}

export function withAcceptance(schema, checks = [], prefix = "") {
  for (const check of checks) {
    if (check.type !== "json_field" || !check.field.startsWith(prefix)) continue;
    const field = check.field.slice(prefix.length);
    if (field) constrain(schema, field.split("."), check.equals);
  }
  return schema;
}

export function implementationSchema(checks) {
  return withAcceptance({ type: "object" }, checks, "implementation.");
}

export function directSchema(goal, signals) {
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      statement: text(5), mechanism: text(5),
      evidenceIds: { type: "array", minItems: 1, uniqueItems: true, items: { type: "string", enum: signals.map((signal) => signal.id) } },
      title: text(3, 500), summary: text(5, 6000), risk: { type: "string", enum: ["low", "high"] },
      goalId: { const: goal.id }, status: { const: "implemented" }, implementation: { type: "object" },
    },
    required: ["statement", "mechanism", "evidenceIds", "title", "summary", "risk", "goalId", "status", "implementation"],
  };
  return withAcceptance(schema, goal.policy?.acceptance ?? []);
}
