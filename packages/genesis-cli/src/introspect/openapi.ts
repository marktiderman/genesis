// Introspect from a PostgREST OpenAPI document — what a Supabase project
// serves at `/rest/v1/`. PostgREST writes each column's Postgres type as the
// property's `format`, and marks keys and links inside the description:
// `<pk/>` and `<fk table='programs' column='id'/>`. Table and column
// comments arrive as descriptions, so `@genesis` settings work here too.

import { parseColumnComment, parseTableComment } from "./comments.js";
import { qualifiedName, storageTypeOf, type IntrospectedColumn, type IntrospectedTable } from "./model.js";

interface OpenApiProperty {
  type?: string;
  format?: string;
  description?: string;
  enum?: unknown[];
  default?: unknown;
  items?: { type?: string; format?: string };
}

interface OpenApiDefinition {
  description?: string;
  required?: string[];
  properties?: Record<string, OpenApiProperty>;
}

export interface OpenApiDocument {
  swagger?: string;
  openapi?: string;
  definitions?: Record<string, OpenApiDefinition>;
  components?: { schemas?: Record<string, OpenApiDefinition> };
}

const PK = /<pk\/>/;
const FK = /<fk table='([^']+)' column='([^']+)'\/>/;
/** PostgREST's own notes, around the column comment. */
const NOTES = /\s*Note:\s*This is a (?:Primary|Foreign) Key[^<]*<(?:pk|fk)[^>]*\/>/g;

function clean(description: string | undefined): string | undefined {
  if (!description) return undefined;
  return description.replace(NOTES, "").trim() || undefined;
}

/**
 * Tables from the document, all in `schema` (PostgREST serves one schema
 * per document; a Supabase project's is `public`).
 */
export function introspectOpenApi(doc: OpenApiDocument, schema = "public"): IntrospectedTable[] {
  const definitions = doc.definitions ?? doc.components?.schemas;
  if (!definitions) throw new Error("This OpenAPI document has no definitions. Is it a PostgREST (Supabase /rest/v1/) spec?");
  return Object.keys(definitions)
    .sort()
    .map((tableName) => {
      const def = definitions[tableName]!;
      const name = qualifiedName(schema, tableName);
      const required = new Set(def.required ?? []);
      const key: string[] = [];
      const columns: IntrospectedColumn[] = Object.entries(def.properties ?? {}).map(([column, prop]) => {
        if (PK.test(prop.description ?? "")) key.push(column);
        const fk = FK.exec(prop.description ?? "");
        const isArray = prop.type === "array";
        const format = (isArray ? prop.items?.format : prop.format) ?? prop.type ?? "text";
        const dbType = isArray ? `${format}[]` : format;
        const comment = parseColumnComment(clean(prop.description), `${name}.${column}`);
        return {
          name: column,
          dbType,
          type: storageTypeOf(format),
          array: isArray,
          // PostgREST lists NOT NULL columns without a default as required;
          // the rest may be null or are filled by the database.
          nullable: !required.has(column),
          hasDefault: prop.default !== undefined,
          generated: false,
          ...(prop.enum ? { enumValues: prop.enum.map(String) } : {}),
          ...(fk ? { references: { resource: qualifiedName(schema, fk[1]!), field: fk[2]! } } : {}),
          ...(comment.description ? { description: comment.description } : {}),
          ...(comment.settings ? { settings: comment.settings } : {}),
        };
      });
      const comment = parseTableComment(def.description, name);
      return {
        name,
        schema,
        table: tableName,
        key,
        columns,
        ...(comment.description ? { description: comment.description } : {}),
        ...(comment.settings ? { settings: comment.settings } : {}),
      };
    });
}
