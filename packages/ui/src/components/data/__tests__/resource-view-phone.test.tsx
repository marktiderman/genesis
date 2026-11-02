/**
 * Lists and forms on a phone (docs/MOBILE.md):
 * - a screen's `mode` can pick per screen size, and an app-wide `phoneMode` sets the phone
 *   default for every list that doesn't say; neither ever turns a list into a calendar;
 * - form inputs get the keyboard and autofill their type asks for, or their own;
 * - a text field named like a phone number becomes a `tel` field;
 * - the list search shows a search keyboard and is named.
 */
import { render, renderHook, screen } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useForm } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";
import { defineResource, GenesisProvider, type DataProvider } from "@marktiderman/genesis-core";
import { defineView } from "@marktiderman/genesis-core/resource-view";
import { ResourceViewDefaultsProvider, useResourceViewProps } from "../resource-view";
import { ResourceFormFieldRenderer, type ResourceFormFieldDef } from "../ResourceFormField";
import { DataFilters } from "../DataFilters";

type Person = { id: string; name: string; email: string; phone: string | null };

const people = defineResource<Person>()({
  name: "people",
  key: "id",
  labelField: "name",
  fields: [
    { name: "id", type: "string", hasDefault: true },
    { name: "name", type: "string" },
    { name: "email", type: "string", widget: "email" },
    { name: "phone", type: "string", nullable: true },
  ],
});

const view = defineView(people, {
  columns: { default: ["name", "email", "phone"] },
  form: ["name", "email", "phone"],
});

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

function wrap(phoneMode?: "grid" | "list") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <GenesisProvider provider={provider()} queryClient={queryClient}>
      {phoneMode ? (
        <ResourceViewDefaultsProvider phoneMode={phoneMode}>{children}</ResourceViewDefaultsProvider>
      ) : (
        children
      )}
    </GenesisProvider>
  );
}

describe("ResourceView phone default", () => {
  it("leaves the table default alone without a provider", () => {
    const { result } = renderHook(() => useResourceViewProps({ view }), { wrapper: wrap() });
    expect(result.current.defaultView).toBeUndefined();
  });

  it("opens in cards on a phone and a table on a desktop with phoneMode", () => {
    const { result } = renderHook(() => useResourceViewProps({ view }), { wrapper: wrap("grid") });
    expect(result.current.defaultView).toEqual({ mobile: "grid", desktop: "table" });
  });

  it("lets the screen's mode win over the app's phone default", () => {
    const { result } = renderHook(() => useResourceViewProps({ view, mode: "table" }), {
      wrapper: wrap("grid"),
    });
    expect(result.current.defaultView).toBe("table");
  });

  it("takes a per-screen-size mode", () => {
    const { result } = renderHook(
      () => useResourceViewProps({ view, mode: { mobile: "list", desktop: "grid" } }),
      { wrapper: wrap() },
    );
    expect(result.current.defaultView).toEqual({ mobile: "list", desktop: "grid" });
  });

  it("keeps a compact list in rows", () => {
    const { result } = renderHook(() => useResourceViewProps({ view, layout: "compact" }), {
      wrapper: wrap("grid"),
    });
    expect(result.current.defaultView).toBe("list");
  });

  it("makes a text field named like a phone number a tel field", () => {
    const { result } = renderHook(() => useResourceViewProps({ view }), { wrapper: wrap() });
    const fields = result.current.formFields ?? [];
    expect(fields.find((f) => f.key === "phone")?.type).toBe("tel");
    expect(fields.find((f) => f.key === "email")?.type).toBe("email");
    expect(fields.find((f) => f.key === "name")?.type).toBe("text");
  });
});

function Field({ field }: { field: ResourceFormFieldDef }) {
  const form = useForm<Record<string, unknown>>();
  return <ResourceFormFieldRenderer field={field} control={form.control} action="create" />;
}

describe("Form inputs on a phone", () => {
  it.each([
    ["email", "email", "email"],
    ["tel", "tel", "tel"],
    ["url", "url", null],
    ["number", "decimal", null],
  ] as const)("a %s field asks for the %s keyboard", (type, inputMode, autoComplete) => {
    render(<Field field={{ key: "f", label: "Field", type }} />);
    const input = screen.getByLabelText("Field");
    expect(input.getAttribute("inputmode")).toBe(inputMode);
    expect(input.getAttribute("autocomplete")).toBe(autoComplete);
  });

  it("uses the field's own hints over its type's", () => {
    render(
      <Field
        field={{ key: "f", label: "Code", type: "text", inputMode: "numeric", autoComplete: "one-time-code", enterKeyHint: "done" }}
      />,
    );
    const input = screen.getByLabelText("Code");
    expect(input.getAttribute("inputmode")).toBe("numeric");
    expect(input.getAttribute("autocomplete")).toBe("one-time-code");
    expect(input.getAttribute("enterkeyhint")).toBe("done");
  });

  it("renders a tel field as type=tel", () => {
    render(<Field field={{ key: "f", label: "Phone", type: "tel" }} />);
    expect(screen.getByLabelText("Phone").getAttribute("type")).toBe("tel");
  });
});

describe("List search on a phone", () => {
  it("shows a search keyboard, is named, and offers no autofill", () => {
    render(
      <DataFilters
        search=""
        onSearchChange={() => {}}
        searchPlaceholder="Search people"
        sort="name"
        onSortChange={() => {}}
        sortOptions={[{ value: "name", label: "Name" }]}
      />,
    );
    const input = screen.getByRole("textbox", { name: "Search people" });
    expect(input.getAttribute("inputmode")).toBe("search");
    expect(input.getAttribute("enterkeyhint")).toBe("search");
    expect(input.getAttribute("autocomplete")).toBe("off");
  });
});
