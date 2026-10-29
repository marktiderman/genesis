// @vitest-environment happy-dom
// The form's schema is built with the app's own zod (a peer: ^3 or ^4). This file
// runs twice: as is (zod 4) and in the "zod-v3" project, where `zod` resolves to
// zod's v3 API, so both majors stay covered.
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import type { ResourceFormFieldDef } from "../../form-types";
import { GenesisProvider } from "../../provider/context";
import { useResourceForm } from "../use-resource-form";

const fields: ResourceFormFieldDef[] = [
  { key: "name", label: "Name", type: "text" },
  { key: "email", label: "Email", type: "email", required: false },
  { key: "site", label: "Site", type: "url", required: false },
  { key: "age", label: "Age", type: "number", min: 0, max: 130 },
  { key: "score", label: "Score", type: "number", required: false },
  { key: "active", label: "Active", type: "switch" },
  { key: "bio", label: "Bio", type: "textarea", required: false, maxLength: 5 },
  {
    key: "phones",
    label: "Phones",
    type: "array",
    arrayMin: 1,
    arrayFields: [
      { key: "number", label: "Number", type: "text" },
      { key: "ext", label: "Ext", type: "number", required: false },
    ],
  },
];

const valid = { name: "Ana", email: "", site: null, age: "42", score: null, active: true, bio: "hi", phones: [{ number: "555" }] };

const wrapper = ({ children }: { children: ReactNode }) => <GenesisProvider mock={{ datasets: { people: [] } }}>{children}</GenesisProvider>;

/** Validate `values` with the form's resolver; returns each field's message. */
async function validate(values: Record<string, unknown>, action: "create" | "edit" = "create", fieldDefs = fields) {
  const { result } = renderHook(() => useResourceForm({ resource: "people", action, id: "1", initialData: {}, fields: fieldDefs }), { wrapper });
  const form = result.current.form;
  for (const [key, value] of Object.entries(values)) form.setValue(key, value);
  let ok = false;
  await act(async () => {
    ok = await form.trigger();
  });
  const error = (path: string) => form.getFieldState(path).error;
  return { ok, message: (path: string) => error(path)?.message, has: (path: string) => error(path) !== undefined };
}

describe("useResourceForm's schema", () => {
  it("accepts a valid record (numbers coerced, optional fields empty or null)", async () => {
    const { ok } = await validate(valid);
    expect(ok).toBe(true);
  });

  it("reports each field's own message", async () => {
    const { ok, message } = await validate({ ...valid, name: "", email: "not-an-email", site: "nope", age: "abc", bio: "too long", phones: [] });
    expect(ok).toBe(false);
    expect(message("name")).toBe("Name is required");
    expect(message("email")).toBe("Invalid email address");
    expect(message("site")).toBe("Invalid URL");
    expect(message("age")).toBe("Must be a number");
    expect(message("bio")).toBe("Bio must be 5 characters or fewer");
    expect(message("phones")).toBe("Minimum 1 items required");
  });

  it("checks number bounds and each array item", async () => {
    const { has, message } = await validate({ ...valid, age: 200, phones: [{ number: "" }] });
    expect(has("age")).toBe(true);
    expect(message("phones.0.number")).toBe("Number is required");
  });

  it("doesn't check a field that is read-only on edit", async () => {
    const { ok } = await validate({}, "edit", [{ key: "slug", label: "Slug", type: "text", readOnlyOnEdit: true }]);
    expect(ok).toBe(true);
  });
});
