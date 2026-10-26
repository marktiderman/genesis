// @feat:cli-introspect
import postgres from "postgres";
import ts from "typescript";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CommentSettingsError,
  emitContracts,
  introspectOpenApi,
  introspectPostgres,
  parseColumnComment,
  parseTableComment,
  type IntrospectedTable,
} from "../src/introspect/index.js";

/** Type-check generated source on its own, as a consumer's compiler would. */
function compileErrors(source: string): string[] {
  const file = "resources.genesis.ts";
  const host = ts.createCompilerHost({ strict: true, noEmit: true, target: ts.ScriptTarget.ES2022 });
  const read = host.getSourceFile;
  host.getSourceFile = (name, version) =>
    name === file ? ts.createSourceFile(file, source, ts.ScriptTarget.ES2022, true) : read(name, version);
  const program = ts.createProgram([file], { strict: true, noEmit: true, target: ts.ScriptTarget.ES2022, types: [] }, host);
  return ts.getPreEmitDiagnostics(program).map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n"));
}

describe("@genesis comment settings", () => {
  it("splits the description from the settings", () => {
    expect(parseTableComment('People in a program. @genesis {"label": "Customers", "labelField": "name"}', "t")).toEqual({
      description: "People in a program.",
      settings: { label: "Customers", labelField: "name" },
    });
    expect(parseColumnComment("Just a note.", "c")).toEqual({ description: "Just a note." });
    expect(parseColumnComment(null, "c")).toEqual({});
  });

  it("refuses malformed or unknown settings, naming where", () => {
    expect(() => parseColumnComment("@genesis {nope", "public.customers.notes")).toThrow(/public\.customers\.notes/);
    expect(() => parseColumnComment('@genesis {"color": "red"}', "c")).toThrow(CommentSettingsError);
    expect(() => parseTableComment('@genesis {"label": 3}', "t")).toThrow(/must be a string/);
    expect(() => parseColumnComment('@genesis {"readonly": "yes"}', "c")).toThrow(/must be a boolean/);
  });

  it("reads the resource facts: noun, readonly and sensitive", () => {
    expect(parseTableComment('@genesis {"labelField": "name", "noun": "category", "nounPlural": "categories"}', "t").settings).toEqual({
      labelField: "name",
      noun: "category",
      nounPlural: "categories",
    });
    expect(parseColumnComment('Set by the server. @genesis {"readonly": true}', "c")).toEqual({
      description: "Set by the server.",
      settings: { readonly: true },
    });
    expect(parseColumnComment('@genesis {"sensitive": true, "label": "Coach notes"}', "c").settings).toEqual({
      sensitive: true,
      label: "Coach notes",
    });
  });
});

const OPENAPI = {
  swagger: "2.0",
  definitions: {
    customers: {
      description: 'People in a program. @genesis {"label": "Customers"}',
      required: ["id", "name", "status"],
      properties: {
        id: { format: "uuid", type: "string", default: "gen_random_uuid()", description: "Note:\nThis is a Primary Key.<pk/>" },
        name: { format: "text", type: "string" },
        status: { format: "public.customer_status", type: "string", enum: ["active", "paused"] },
        program_id: {
          format: "integer",
          type: "integer",
          description: 'The program. @genesis {"label": "Program"}\n\nNote:\nThis is a Foreign Key to `programs.id`.<fk table=\'programs\' column=\'id\'/>',
        },
        tags: { type: "array", items: { type: "string", format: "text" } },
        starts_at: { format: "timestamp with time zone", type: "string" },
      },
    },
    programs: { required: ["id"], properties: { id: { format: "integer", type: "integer", description: "Note:\nThis is a Primary Key.<pk/>" } } },
  },
};

describe("introspect from OpenAPI (PostgREST / Supabase)", () => {
  it("reads keys, links, enums, arrays and comment settings", () => {
    const [customers, programs] = introspectOpenApi(OPENAPI);
    expect(customers).toMatchObject({ name: "public.customers", key: ["id"], description: "People in a program.", settings: { label: "Customers" } });
    expect(programs!.key).toEqual(["id"]);
    const col = (n: string) => customers!.columns.find((c) => c.name === n)!;
    expect(col("id")).toMatchObject({ type: "string", dbType: "uuid", hasDefault: true, nullable: false });
    expect(col("id").description).toBeUndefined();
    expect(col("status")).toMatchObject({ enumValues: ["active", "paused"] });
    expect(col("program_id")).toMatchObject({
      type: "number",
      nullable: true,
      references: { resource: "public.programs", field: "id" },
      description: "The program.",
      settings: { label: "Program" },
    });
    expect(col("tags")).toMatchObject({ array: true, dbType: "text[]", type: "string" });
    expect(col("starts_at").type).toBe("datetime");
  });

  it("explains a document that isn't PostgREST's", () => {
    expect(() => introspectOpenApi({ openapi: "3.0.0" })).toThrow(/PostgREST/);
  });
});

describe("the emitted contract", () => {
  const tables = introspectOpenApi(OPENAPI);
  const source = emitContracts(tables, { source: "OpenAPI test" });

  it("compiles under strict TypeScript, with row types", () => {
    expect(compileErrors(source)).toEqual([]);
    expect(source).toContain("export type PublicCustomersRow = {");
    expect(source).toContain("} as const satisfies ResourceContract<PublicCustomersRow>;");
    expect(source).toContain('"public.customers": publicCustomers,');
    expect(source).toContain("export type PublicCustomersField = keyof PublicCustomersRow;");
    expect(source).toContain('  status: "active" | "paused";');
    expect(source).toContain("  program_id: number | null;");
    expect(source).toContain("  tags: string[] | null;");
    expect(source).toContain('label: "Program", description: "The program."');
  });

  it("is the same bytes on a re-run, whatever order the tables came in", () => {
    expect(emitContracts([...tables].reverse(), { source: "OpenAPI test" })).toBe(source);
  });

  it("emits the facts, and a contract that breaks ResourceContract fails to compile", () => {
    const t: IntrospectedTable = {
      name: "public.brands",
      schema: "public",
      table: "brands",
      key: ["id"],
      settings: { labelField: "name", noun: "brand" },
      columns: [
        { name: "id", dbType: "uuid", type: "string", array: false, nullable: false, hasDefault: true, generated: false },
        { name: "name", dbType: "text", type: "string", array: false, nullable: false, hasDefault: false, generated: false },
        {
          name: "status", dbType: "text", type: "string", array: false, nullable: false, hasDefault: true, generated: false,
          settings: { readonly: true },
        },
        {
          name: "notes", dbType: "text", type: "string", array: false, nullable: true, hasDefault: false, generated: false,
          settings: { sensitive: true, widget: "textarea" },
        },
      ],
    };
    const out = emitContracts([t], { source: "x" });
    expect(compileErrors(out)).toEqual([]);
    expect(out).toContain('  noun: "brand",');
    expect(out).toContain("readOnly: true");
    expect(out).toContain('widget: "textarea", sensitive: true');
    const bad = emitContracts(
      [{ ...t, columns: [{ ...t.columns[0]!, settings: { widget: "rainbow" } }] }],
      { source: "x" },
    );
    expect(compileErrors(bad).join("\n")).toMatch(/rainbow/);
  });

  it("quotes names that aren't identifiers", () => {
    const odd: IntrospectedTable = {
      name: "public.odd table",
      schema: "public",
      table: "odd table",
      key: ["a-b", "c"],
      columns: [
        { name: "a-b", dbType: "text", type: "string", array: false, nullable: false, hasDefault: false, generated: false },
        { name: "c", dbType: "jsonb", type: "json", array: false, nullable: true, hasDefault: false, generated: false },
      ],
    };
    const out = emitContracts([odd], { source: "x" });
    expect(compileErrors(out)).toEqual([]);
    expect(out).toContain('  "a-b": string;');
    expect(out).toContain('key: ["a-b", "c"]');
  });
});

const ADMIN_URL = process.env.GENESIS_TEST_DATABASE_URL ?? process.env.STUDIO_TEST_DATABASE_URL;
const DB = "genesis_cli_introspect_test";

describe.skipIf(!ADMIN_URL)("introspect from Postgres", () => {
  let sql: postgres.Sql;

  beforeAll(async () => {
    // A database of its own, so this never touches another package's fixtures.
    const admin = postgres(ADMIN_URL!, { max: 1, onnotice: () => {} });
    try {
      await admin.unsafe(`drop database if exists ${DB} with (force)`);
      await admin.unsafe(`create database ${DB}`);
    } finally {
      await admin.end();
    }
    const url = new URL(ADMIN_URL!);
    url.pathname = `/${DB}`;
    sql = postgres(url.toString(), { max: 1, onnotice: () => {} });
    await sql.unsafe(`
      create type public.customer_status as enum ('active', 'paused', 'done');
      create table public.programs (id int primary key, name text not null);
      create table public.customers (
        id uuid primary key default gen_random_uuid(),
        program_id int references public.programs (id),
        name text not null,
        status public.customer_status not null default 'active',
        tags text[],
        score numeric(5, 2),
        starts_on date,
        seq bigint generated always as identity,
        updated_at timestamptz(6) not null default now()
      );
      create table public.owner_customers (owner_id uuid, customer_id uuid references public.customers (id), primary key (owner_id, customer_id));
      comment on table public.customers is 'People in a program. @genesis {"label": "Customer accounts", "labelField": "name"}';
      comment on column public.customers.tags is 'Free-form tags. @genesis {"label": "Tags"}';
      create schema private;
      create table private.hidden (id int primary key);
    `);
  });
  afterAll(async () => {
    await sql?.end();
    const admin = postgres(ADMIN_URL!, { max: 1, onnotice: () => {} });
    await admin.unsafe(`drop database if exists ${DB} with (force)`).finally(() => admin.end());
  });

  it("reads tables, keys, types, links and comment settings from the catalog", async () => {
    const tables = await introspectPostgres(sql, ["public"]);
    expect(tables.map((t) => t.name)).toEqual(["public.customers", "public.owner_customers", "public.programs"]);
    const customers = tables[0]!;
    expect(customers).toMatchObject({ key: ["id"], description: "People in a program.", settings: { label: "Customer accounts", labelField: "name" } });
    const col = (n: string) => customers.columns.find((c) => c.name === n)!;
    expect(col("status")).toMatchObject({ dbType: "customer_status", enumValues: ["active", "paused", "done"], hasDefault: true, nullable: false });
    expect(col("program_id").references).toEqual({ resource: "public.programs", field: "id" });
    expect(col("tags")).toMatchObject({ array: true, type: "string", settings: { label: "Tags" }, description: "Free-form tags." });
    expect(col("score")).toMatchObject({ type: "number", dbType: "numeric(5,2)" });
    expect(col("starts_on")).toMatchObject({ type: "datetime", dbType: "date" });
    expect(col("seq")).toMatchObject({ generated: true, hasDefault: true });
    expect(tables[1]!.key).toEqual(["owner_id", "customer_id"]);
    expect(compileErrors(emitContracts(tables, { source: "Postgres (public)" }))).toEqual([]);
  });
});
