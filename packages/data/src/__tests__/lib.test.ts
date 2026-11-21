import { describe, expect, it } from "vitest";
import { csvField, toCsv } from "../lib/csv";
import { formatFilters, formatSorts, operatorsFor, parseFilters, parseSorts } from "../lib/query-state";
import { formSchema, fromFormValue, toFormValues } from "../lib/form-schema";
import type { FieldSchema } from "@marktiderman/genesis-core/schema";

describe("CSV", () => {
  it("quotes commas, quotes and line breaks", () => {
    expect(csvField('say "hi", ok')).toBe('"say ""hi"", ok"');
    expect(csvField("a\nb")).toBe('"a\nb"');
    expect(csvField(null)).toBe("");
    expect(csvField({ a: 1 })).toBe('"{""a"":1}"');
  });

  it("neutralises cells a spreadsheet would run as a formula", () => {
    expect(csvField("=HYPERLINK(\"x\")")).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvField("+1")).toBe("'+1");
    expect(csvField("@sum")).toBe("'@sum");
    expect(csvField("-2+3+cmd|' /C calc'!A0")).toMatch(/^"?'-2/);
  });

  it("leaves plain negative numbers as numbers", () => {
    expect(csvField(-5)).toBe("-5");
    expect(csvField("-12.50")).toBe("-12.50");
    expect(csvField("-1.5e3")).toBe("-1.5e3");
  });

  it("writes a header from the fields and one line per row", () => {
    const fields = [{ name: "a" }, { name: "b" }] as FieldSchema[];
    expect(toCsv(fields, [{ a: 1, b: "x" }])).toBe("a,b\r\n1,x\r\n");
  });
});

describe("URL state", () => {
  it("round-trips several sorts", () => {
    const sorts = parseSorts("status:asc,name:desc");
    expect(sorts).toEqual([
      { field: "status", order: "asc" },
      { field: "name", order: "desc" },
    ]);
    expect(formatSorts(sorts)).toBe("status:asc,name:desc");
    expect(formatSorts([])).toBeUndefined();
  });

  it("round-trips filters and ignores a malformed value", () => {
    const raw = formatFilters([
      { field: "status", operator: "eq", value: "active" },
      { field: "notes", operator: "is_null" },
    ]);
    expect(parseFilters(raw)).toEqual([
      { field: "status", operator: "eq", value: "active" },
      { field: "notes", operator: "is_null" },
    ]);
    expect(parseFilters("{not json")).toEqual([]);
    expect(parseFilters('[["x"]]')).toEqual([]);
  });

  it("offers operators that fit the field", () => {
    expect(operatorsFor({ name: "n", type: "number" })).toContain("gt");
    expect(operatorsFor({ name: "s", type: "string" })).toContain("contains");
    expect(operatorsFor({ name: "e", type: "string", enumValues: ["a"] })).not.toContain("contains");
  });
});

describe("form schema", () => {
  const fields: FieldSchema[] = [
    { name: "name", type: "string", nullable: false },
    { name: "age", type: "number", nullable: true },
    { name: "status", type: "string", enumValues: ["a", "b"], nullable: false, hasDefault: true },
    { name: "meta", type: "json", nullable: true },
    { name: "active", type: "boolean", nullable: false, hasDefault: true },
  ];

  it("requires NOT NULL fields without a default on a new row", () => {
    const result = formSchema(fields, "create").safeParse({ name: "", age: "", status: "", meta: "", active: false });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.path[0])).toEqual(["name"]);
  });

  it("checks numbers, enum labels and JSON", () => {
    const result = formSchema(fields, "edit").safeParse({ name: "x", age: "abc", status: "z", meta: "{", active: true });
    expect(result.error?.issues.map((i) => i.path[0]).sort()).toEqual(["age", "meta", "status"]);
  });

  it("turns form values back into values to save", () => {
    expect(toFormValues(fields, { name: "x", age: null, active: true, meta: { a: 1 } })).toMatchObject({ name: "x", age: "", active: true, meta: '{"a":1}' });
    expect(fromFormValue(fields[1]!, "")).toBeNull();
    expect(fromFormValue(fields[0]!, "")).toBe("");
    expect(fromFormValue(fields[4]!, false)).toBe(false);
  });
});
