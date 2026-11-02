// @feat:native-components
/**
 * A phone number on the native form sheet, as on the web: `tel` only when the contract declares
 * `widget: "tel"` (never from a column's name), the phone keypad, and autofill only when the view
 * field asks for it.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { defineResource, GenesisProvider, type DataProvider } from "@marktiderman/genesis-core";
import { defineView } from "@marktiderman/genesis-core/resource-view";
import { formFieldsFor, NativeResourceView } from "..";

type Person = { id: string; name: string; phone: string | null; mobile: string | null };

const people = defineResource<Person>()({
  name: "people",
  key: "id",
  labelField: "name",
  fields: [
    { name: "id", type: "string", hasDefault: true },
    { name: "name", type: "string" },
    { name: "phone", type: "string", nullable: true, widget: "tel" },
    // Named like a phone number, declared as nothing: stays text.
    { name: "mobile", type: "string", nullable: true },
  ],
});

const view = defineView(people, { form: ["name", "phone", "mobile"] });
const signUpView = defineView(people, { fields: { phone: { autoComplete: "tel", enterKeyHint: "next" } }, form: ["name", "phone"] });

function provider(): DataProvider {
  return {
    getList: vi.fn(async () => ({ data: [], total: 0 })) as DataProvider["getList"],
    getOne: vi.fn(async () => ({ data: undefined })) as unknown as DataProvider["getOne"],
    getMany: vi.fn(async () => ({ data: [] })),
    create: vi.fn(async (_r, { data }) => ({ data })) as DataProvider["create"],
    update: vi.fn(async (_r, { data }) => ({ data })) as DataProvider["update"],
    deleteOne: vi.fn(async (_r, { id }) => ({ data: { id } })),
  };
}

/** Opens the create sheet and hands back a lookup for its inputs. */
async function createSheet(v: typeof view | typeof signUpView) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrap = ({ children }: { children: ReactNode }) => (
    <GenesisProvider provider={provider()} queryClient={queryClient}>
      {children}
    </GenesisProvider>
  );
  render(<NativeResourceView view={v} />, { wrapper: Wrap });
  fireEvent.click(await screen.findByTestId("native-resource-view-create"));
  await screen.findByTestId("native-resource-view-form-field-name");
  return (key: string) => screen.getByTestId(`native-resource-view-form-field-${key}`).querySelector("input")!;
}

describe("native tel fields", () => {
  it("is a tel kind only when the contract declares widget: tel", () => {
    const fields = formFieldsFor(view, "create");
    expect(fields.find((f) => f.key === "phone")?.kind).toBe("tel");
    expect(fields.find((f) => f.key === "mobile")?.kind).toBe("text");
  });

  it("shows the phone keypad, and asks for no autofill unless the view field does", async () => {
    const input = await createSheet(view);
    expect(input("phone").getAttribute("data-keyboard-type")).toBe("phone-pad");
    expect(input("phone").hasAttribute("data-autocomplete")).toBe(false);
    expect(input("mobile").getAttribute("data-keyboard-type")).toBe("default");
  });

  it("passes the view field's autoComplete and enterKeyHint through", async () => {
    expect(formFieldsFor(signUpView, "create").find((f) => f.key === "phone")?.autoComplete).toBe("tel");
    const input = await createSheet(signUpView);
    expect(input("phone").getAttribute("data-autocomplete")).toBe("tel");
    expect(input("phone").getAttribute("data-enter-key-hint")).toBe("next");
    expect(input("name").hasAttribute("data-autocomplete")).toBe(false);
  });
});
