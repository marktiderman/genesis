/**
 * Lists and forms on a phone (docs/RESOURCE-VIEW.md, "Phones"). The list layouts are opt-in; the
 * keyboards and the search box are small defaults:
 * - a screen's `mode` can pick per screen size, and an app-wide `phoneMode` sets the phone
 *   default for every full-page list that doesn't say; `phoneMode={null}` turns it off below;
 *   an embedded list never gets it (it has no view switch), and nothing turns into a calendar;
 * - form inputs get the keyboard their type asks for, never a type's autofill token, and a number's
 *   decimal keypad only when it can't be negative;
 * - a field is `tel` only when the contract says so (`widget: "tel"`), never by its name;
 * - table cells clip only with `clipCells`;
 * - the list search shows a search keyboard and is named.
 */
import { render, renderHook, screen } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useForm } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";
import { defineResource, GenesisProvider, type DataProvider } from "@marktiderman/genesis-core";
import { defineView } from "@marktiderman/genesis-core/resource-view";
import { ResourceViewDefaultsProvider, useResourceViewProps, type ResourceViewDefaults } from "../resource-view";
import { DataTable } from "../DataTable";
import { ResourceFormFieldRenderer, type ResourceFormFieldDef } from "../ResourceFormField";
import { DataFilters } from "../DataFilters";

type Person = { id: string; name: string; email: string; phone: string | null; mobile: string | null };

const people = defineResource<Person>()({
  name: "people",
  key: "id",
  labelField: "name",
  fields: [
    { name: "id", type: "string", hasDefault: true },
    { name: "name", type: "string" },
    { name: "email", type: "string", widget: "email" },
    { name: "phone", type: "string", nullable: true, widget: "tel" },
    // Named like a phone number, declared as nothing: stays a text field.
    { name: "mobile", type: "string", nullable: true },
  ],
});

const view = defineView(people, {
  columns: { default: ["name", "email", "phone"] },
  form: ["name", "email", "phone", "mobile"],
});

const signUpView = defineView(people, {
  fields: { email: { autoComplete: "email" }, phone: { autoComplete: "tel" } },
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

function wrap(defaults?: ResourceViewDefaults, inner?: ResourceViewDefaults) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <GenesisProvider provider={provider()} queryClient={queryClient}>
      <ResourceViewDefaultsProvider {...defaults}>
        <ResourceViewDefaultsProvider {...inner}>{children}</ResourceViewDefaultsProvider>
      </ResourceViewDefaultsProvider>
    </GenesisProvider>
  );
}

describe("ResourceView phone default", () => {
  it("leaves the table default alone without a provider", () => {
    const { result } = renderHook(() => useResourceViewProps({ view }), { wrapper: wrap() });
    expect(result.current.defaultView).toBeUndefined();
  });

  it("opens in cards on a phone and a table on a desktop with phoneMode", () => {
    const { result } = renderHook(() => useResourceViewProps({ view }), { wrapper: wrap({ phoneMode: "grid" }) });
    expect(result.current.defaultView).toEqual({ mobile: "grid", desktop: "table" });
  });

  it("lets the screen's mode win over the app's phone default", () => {
    const { result } = renderHook(() => useResourceViewProps({ view, mode: "table" }), {
      wrapper: wrap({ phoneMode: "grid" }),
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
      wrapper: wrap({ phoneMode: "grid" }),
    });
    expect(result.current.defaultView).toBe("list");
  });

  it("keeps an embedded list a table: it has no view switch to leave cards", () => {
    const { result } = renderHook(() => useResourceViewProps({ view, layout: "embedded" }), {
      wrapper: wrap({ phoneMode: "grid" }),
    });
    expect(result.current.defaultView).toBeUndefined();
  });

  it("turns an outer phone default off with phoneMode={null}", () => {
    const { result } = renderHook(() => useResourceViewProps({ view }), {
      wrapper: wrap({ phoneMode: "grid" }, { phoneMode: null }),
    });
    expect(result.current.defaultView).toBeUndefined();
  });

  it("inherits the outer phone default when the inner provider doesn't say", () => {
    const { result } = renderHook(() => useResourceViewProps({ view }), {
      wrapper: wrap({ phoneMode: "list" }, { clipCells: true }),
    });
    expect(result.current.defaultView).toEqual({ mobile: "list", desktop: "table" });
  });
});

describe("ResourceView form field types", () => {
  it("makes a field tel only when the contract declares widget: tel", () => {
    const { result } = renderHook(() => useResourceViewProps({ view }), { wrapper: wrap() });
    const fields = result.current.formFields ?? [];
    expect(fields.find((f) => f.key === "phone")?.type).toBe("tel");
    expect(fields.find((f) => f.key === "mobile")?.type).toBe("text");
    expect(fields.find((f) => f.key === "email")?.type).toBe("email");
    expect(fields.find((f) => f.key === "name")?.type).toBe("text");
  });

  it("asks for no autofill unless the view says", () => {
    const plain = renderHook(() => useResourceViewProps({ view }), { wrapper: wrap() });
    expect((plain.result.current.formFields ?? []).every((f) => f.autoComplete === undefined)).toBe(true);
    const own = renderHook(() => useResourceViewProps({ view: signUpView }), { wrapper: wrap() });
    const fields = own.result.current.formFields ?? [];
    expect(fields.find((f) => f.key === "email")?.autoComplete).toBe("email");
    expect(fields.find((f) => f.key === "phone")?.autoComplete).toBe("tel");
  });
});

describe("Table cell clipping", () => {
  const rows = [{ id: "1", name: "Ada", email: "ada@example.com" }];
  const columns = [
    { key: "name", header: "Name" },
    { key: "email", header: "Email" },
  ];
  const cellOf = () => screen.getByText("ada@example.com").closest("td")!;

  it("only keeps a cell's content inside its column by default, with no ellipsis", () => {
    render(<DataTable items={rows} columns={columns} getKey={(r) => r.id} />);
    // Overflow is hidden for every cell (a fix: text was drawn over the next column).
    expect(cellOf().className).toMatch(/overflow-hidden/);
    expect(cellOf().className).not.toMatch(/text-ellipsis/);
  });

  it("clips on one line with an ellipsis with clipCells", () => {
    render(<DataTable items={rows} columns={columns} getKey={(r) => r.id} clipCells />);
    expect(cellOf().className).toMatch(/overflow-hidden/);
    expect(cellOf().className).toMatch(/text-ellipsis/);
    expect(cellOf().className).toMatch(/whitespace-nowrap/);
  });

  it("passes the provider's clipCells to the table, under the screen's own table props", () => {
    const app = renderHook(() => useResourceViewProps({ view }), { wrapper: wrap({ clipCells: true }) });
    expect(app.result.current.slotProps?.table?.clipCells).toBe(true);
    const screenWins = renderHook(() => useResourceViewProps({ view, slotProps: { table: { clipCells: false } } }), {
      wrapper: wrap({ clipCells: true }),
    });
    expect(screenWins.result.current.slotProps?.table?.clipCells).toBe(false);
    const none = renderHook(() => useResourceViewProps({ view }), { wrapper: wrap() });
    expect(none.result.current.slotProps).toBeUndefined();
  });
});

function Field({ field }: { field: ResourceFormFieldDef }) {
  const form = useForm<Record<string, unknown>>();
  return <ResourceFormFieldRenderer field={field} control={form.control} action="create" />;
}

describe("Form inputs on a phone", () => {
  it.each([
    ["email", "email"],
    ["tel", "tel"],
    ["url", "url"],
  ] as const)("a %s field asks for the %s keyboard and no autofill", (type, inputMode) => {
    render(<Field field={{ key: "f", label: "Field", type }} />);
    const input = screen.getByLabelText("Field");
    expect(input.getAttribute("inputmode")).toBe(inputMode);
    expect(input.getAttribute("autocomplete")).toBeNull();
  });

  it.each([
    ["no min", undefined, null],
    ["min 0", 0, "decimal"],
    ["a negative min", -10, null],
  ] as const)("a number with %s gets inputmode %s", (_name, min, inputMode) => {
    render(<Field field={{ key: "f", label: "Amount", type: "number", ...(min !== undefined ? { min } : {}) }} />);
    expect(screen.getByLabelText("Amount").getAttribute("inputmode")).toBe(inputMode);
  });

  it("uses a number's own inputMode over the min rule", () => {
    render(<Field field={{ key: "f", label: "Count", type: "number", min: 0, inputMode: "numeric" }} />);
    expect(screen.getByLabelText("Count").getAttribute("inputmode")).toBe("numeric");
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
