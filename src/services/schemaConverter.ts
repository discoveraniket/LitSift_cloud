/**
 * Schema Conversion Utility
 * Converts @google/genai Type schemas into standard OpenAI-compatible JSON Schema.
 */

const TYPE_MAP: Record<string, string> = {
  OBJECT: 'object',
  STRING: 'string',
  ARRAY: 'array',
  NUMBER: 'number',
  INTEGER: 'integer',
  BOOLEAN: 'boolean',
  // In case lowercase or standard types are already used:
  object: 'object',
  string: 'string',
  array: 'array',
  number: 'number',
  integer: 'integer',
  boolean: 'boolean',
};

/**
 * Recursively converts a Gemini Type schema into standard JSON Schema.
 */
export function convertGeminiSchemaToJsonSchema(schema: any): any {
  if (!schema || typeof schema !== 'object') {
    return schema;
  }

  const result: Record<string, any> = {};

  // Convert Type
  if (schema.type) {
    const rawType = String(schema.type);
    result.type = TYPE_MAP[rawType] || rawType.toLowerCase();
  }

  // Pass through description
  if (schema.description) {
    result.description = schema.description;
  }

  // Pass through enum
  if (Array.isArray(schema.enum)) {
    result.enum = schema.enum;
  }

  // Convert Properties recursively
  if (schema.properties && typeof schema.properties === 'object') {
    result.properties = {};
    for (const [key, propSchema] of Object.entries(schema.properties)) {
      result.properties[key] = convertGeminiSchemaToJsonSchema(propSchema);
    }
  }

  // Convert Array Items recursively
  if (schema.items) {
    result.items = convertGeminiSchemaToJsonSchema(schema.items);
  }

  // Required properties
  if (Array.isArray(schema.required)) {
    result.required = schema.required;
  }

  return result;
}

/**
 * Converts LitSift AgentToolSpecs or Gemini functionDeclarations into standard OpenAI tools array for /v1/chat/completions.
 */
export function convertToolsToOpenAiFormat(tools: any[]): any[] {
  const flattened: Array<{ name: string; description: string; parameters: any }> = [];
  for (const item of tools) {
    if (item && Array.isArray(item.functionDeclarations)) {
      flattened.push(...item.functionDeclarations);
    } else if (item && item.name) {
      flattened.push(item);
    }
  }

  return flattened.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: convertGeminiSchemaToJsonSchema(tool.parameters),
    },
  }));
}

/**
 * Prepares response_format payload for LM Studio structured outputs.
 */
export function createStructuredResponseFormat(name: string, geminiSchema: any) {
  const jsonSchema = convertGeminiSchemaToJsonSchema(geminiSchema);

  return {
    type: 'json_schema',
    json_schema: {
      name,
      strict: true,
      schema: jsonSchema,
    },
  };
}
