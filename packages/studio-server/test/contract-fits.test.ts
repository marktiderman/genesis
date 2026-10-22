// The contract `genesis introspect` writes is accepted as-is by `contracts`.
import { expect, it } from "vitest";
import type { StudioHandlerOptions } from "../src/index";

// A trimmed copy of generated output (see packages/genesis-cli/src/introspect/emit.ts).
const contracts = {
  "public.customers": {
    name: "public.customers",
    key: "id",
    label: "Customer accounts",
    labelField: "name",
    description: "People in a program.",
    fields: [
      { name: "id", type: "string", dbType: "uuid", optional: true, hasDefault: true },
      { name: "tags", type: "string", dbType: "text[]", array: true, nullable: true, optional: true, label: "Tags", widget: "textarea" },
    ],
  },
} as const;

it("type-checks as the handler's contracts option", () => {
  const option: StudioHandlerOptions["contracts"] = contracts;
  expect(option?.["public.customers"]?.label).toBe("Customer accounts");
});
