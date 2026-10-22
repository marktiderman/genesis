/**
 * ResourceForm — what a real screen had to work around.
 *
 * (a) a failed save was written to `errors.root` and never rendered: Save
 *     stopped spinning and nothing said why;
 * (b) labels were not tied to their controls, so `getByLabelText` (and a
 *     screen reader) found no input;
 * (c) no `maxLength`;
 * (d) every field got an automatic "Enter name" placeholder restating its
 *     label;
 * (e) `prefillFromUrl` was on with no way to turn it off from the component.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GenesisProvider, createMockProvider } from "../../../provider";
import { ResourceForm, type ResourceFormProps } from "../ResourceForm";
import type { ResourceFormFieldDef } from "../ResourceFormField";

const fields: ResourceFormFieldDef[] = [
  { key: "name", label: "Name", type: "text", maxLength: 5 },
  { key: "notes", label: "Notes", type: "textarea", required: false, description: "Shown to staff" },
  { key: "active", label: "Active", type: "switch" },
  { key: "tier", label: "Tier", type: "select", options: [{ value: "a", label: "A" }] },
];

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState(null, "", "/");
});

function renderForm(
  extra: Partial<ResourceFormProps> = {},
  provider = createMockProvider({ things: [] }),
) {
  return render(
    <GenesisProvider provider={provider}>
      <ResourceForm
        resource="things"
        action="create"
        open
        onOpenChange={() => {}}
        fields={fields}
        {...extra}
      />
    </GenesisProvider>,
  );
}

describe("ResourceForm — labels", () => {
  it("ties every label to its control", async () => {
    renderForm();
    expect((await screen.findByLabelText(/Name/)).tagName).toBe("INPUT");
    expect(screen.getByLabelText(/Notes/).tagName).toBe("TEXTAREA");
    expect(screen.getByLabelText(/Active/).getAttribute("role")).toBe("switch");
    expect(screen.getByLabelText(/Tier/).getAttribute("role")).toBe("combobox");
  });

  it("describes a control by its description and, once invalid, its error", async () => {
    renderForm();
    const notes = await screen.findByLabelText(/Notes/);
    const descId = notes.getAttribute("aria-describedby");
    expect(document.getElementById(descId!)?.textContent).toBe("Shown to staff");

    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    const name = screen.getByLabelText(/Name/);
    await waitFor(() => expect(name.getAttribute("aria-invalid")).toBe("true"));
    const ids = name.getAttribute("aria-describedby")!.split(" ");
    expect(ids.map((id) => document.getElementById(id)?.textContent)).toEqual([
      "Name is required",
    ]);
  });

  it("mints distinct ids for two forms with the same field keys", async () => {
    render(
      <GenesisProvider provider={createMockProvider({ things: [] })}>
        <ResourceForm resource="things" action="create" open onOpenChange={() => {}} fields={fields} layout="page" />
        <ResourceForm resource="things" action="create" open onOpenChange={() => {}} fields={fields} layout="page" />
      </GenesisProvider>,
    );
    const inputs = await screen.findAllByLabelText(/Name/);
    expect(inputs).toHaveLength(2);
    expect(inputs[0]!.id).not.toBe(inputs[1]!.id);
  });
});

describe("ResourceForm — the save error", () => {
  it("renders the provider's failure as an alert", async () => {
    const provider = createMockProvider({ things: [] });
    vi.spyOn(provider, "create").mockRejectedValue(new Error("Name already taken"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    renderForm({ fields: [{ key: "name", label: "Name" }] }, provider);

    fireEvent.change(await screen.findByLabelText(/Name/), { target: { value: "Ann" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    const alert = await screen.findByTestId("resource-form-error");
    expect(alert.getAttribute("role")).toBe("alert");
    expect(alert.textContent).toContain("Name already taken");
  });
});

describe("ResourceForm — maxLength", () => {
  it("caps the input and validates on save", async () => {
    const provider = createMockProvider({ things: [] });
    const create = vi.spyOn(provider, "create");
    renderForm({}, provider);
    const name = await screen.findByLabelText(/Name/);
    expect(name.getAttribute("maxlength")).toBe("5");

    // A value set programmatically past the cap still fails validation.
    fireEvent.change(name, { target: { value: "Too long" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(
      await screen.findByText("Name must be 5 characters or fewer"),
    ).toBeTruthy();
    expect(create).not.toHaveBeenCalled();
  });
});

describe("ResourceForm — placeholders", () => {
  it("adds no automatic placeholder by default", async () => {
    renderForm();
    expect((await screen.findByLabelText(/Name/)).getAttribute("placeholder")).toBeNull();
    expect(screen.getByLabelText(/Notes/).getAttribute("placeholder")).toBeNull();
  });

  it("keeps a field's own placeholder", async () => {
    renderForm({ fields: [{ key: "name", label: "Name", placeholder: "e.g. Northside" }] });
    expect((await screen.findByLabelText(/Name/)).getAttribute("placeholder")).toBe("e.g. Northside");
  });

  it("generates them with autoPlaceholder", async () => {
    renderForm({ autoPlaceholder: true });
    expect((await screen.findByLabelText(/Name/)).getAttribute("placeholder")).toBe("Enter name");
  });
});

describe("ResourceForm — prefillFromUrl", () => {
  it("pre-fills a create form from the URL by default", async () => {
    window.history.replaceState(null, "", "/?name=Ann");
    renderForm();
    expect(((await screen.findByLabelText(/Name/)) as HTMLInputElement).value).toBe("Ann");
  });

  it("can be turned off", async () => {
    window.history.replaceState(null, "", "/?name=Ann");
    renderForm({ prefillFromUrl: false });
    expect(((await screen.findByLabelText(/Name/)) as HTMLInputElement).value).toBe("");
  });
});
