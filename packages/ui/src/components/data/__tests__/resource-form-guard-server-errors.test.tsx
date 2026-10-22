/**
 * ResourceForm — phase 2 of the data layer:
 *
 * (a) field-level server errors: a `DataWriteError` with `fields` puts each
 *     message on its input (aria-invalid, described by the message), plus a
 *     summary alert;
 * (b) `warnWhenUnsaved`: closing a dirty form asks first, the tab's
 *     `beforeunload` is held, and a saved form is no longer dirty;
 * (c) `mutationMode="undoable"`: the form closes at once and an Undo toast
 *     is shown; Undo means the save is never sent.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DataWriteError, toDataWriteError } from "@marktiderman/genesis-core/provider";

import { GenesisProvider, createMockProvider } from "../../../provider";
import { ResourceForm, type ResourceFormProps } from "../ResourceForm";
import type { ResourceFormFieldDef } from "../ResourceFormField";

const toastMock = vi.hoisted(() => {
  const fn = vi.fn() as ReturnType<typeof vi.fn> & { error: ReturnType<typeof vi.fn> };
  fn.error = vi.fn();
  return fn;
});
vi.mock("../../ui/sonner", () => ({ toast: toastMock, Toaster: () => null }));

const fields: ResourceFormFieldDef[] = [
  { key: "name", label: "Name", type: "text" },
  { key: "email", label: "Email", type: "email" },
];

beforeEach(() => {
  localStorage.clear();
  toastMock.mockClear();
  toastMock.error.mockClear();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** happy-dom has no window.confirm; stub one. */
function stubConfirm(answer: boolean) {
  const confirm = vi.fn((_message?: string) => answer);
  vi.stubGlobal("confirm", confirm);
  return confirm;
}

function renderForm(extra: Partial<ResourceFormProps> = {}, provider = createMockProvider({ people: [] }, { delay: 0 })) {
  const onOpenChange = vi.fn();
  const utils = render(
    <GenesisProvider provider={provider}>
      <ResourceForm
        resource="people"
        action="create"
        open
        onOpenChange={onOpenChange}
        fields={fields}
        prefillFromUrl={false}
        {...extra}
      />
    </GenesisProvider>,
  );
  return { ...utils, onOpenChange, provider };
}

async function fillAndSubmit() {
  fireEvent.change(await screen.findByLabelText(/Name/), { target: { value: "Ann" } });
  fireEvent.change(screen.getByLabelText(/Email/), { target: { value: "ann@example.com" } });
  fireEvent.click(screen.getByRole("button", { name: "Create" }));
}

describe("ResourceForm — field-level server errors", () => {
  it("puts each mapped message on its field, with a summary alert", async () => {
    const provider = createMockProvider({ people: [] }, { delay: 0 });
    // What the Supabase provider throws for a unique violation on `email`.
    vi.spyOn(provider, "create").mockRejectedValue(
      toDataWriteError({
        code: "23505",
        message: 'duplicate key value violates unique constraint "people_email_key"',
        details: "Key (email)=(ann@example.com) already exists.",
      }),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});
    renderForm({}, provider);
    await fillAndSubmit();

    const alert = await screen.findByTestId("resource-form-error");
    expect(alert.textContent).toContain("Email is already in use.");
    expect(alert.textContent).not.toContain("people_email_key");

    const email = screen.getByLabelText(/Email/);
    await waitFor(() => expect(email.getAttribute("aria-invalid")).toBe("true"));
    const described = email
      .getAttribute("aria-describedby")!
      .split(" ")
      .map((id) => document.getElementById(id)?.textContent);
    expect(described).toContain("This value is already in use.");
    expect(screen.getByLabelText(/Name/).getAttribute("aria-invalid")).not.toBe("true");
  });

  it("keeps a field the form does not show in the summary only", async () => {
    const provider = createMockProvider({ people: [] }, { delay: 0 });
    vi.spyOn(provider, "create").mockRejectedValue(
      new DataWriteError("invalid", "Org is required.", { fields: { org_id: "This field is required." } }),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});
    renderForm({}, provider);
    await fillAndSubmit();
    expect((await screen.findByTestId("resource-form-error")).textContent).toContain("Org is required.");
    expect(screen.queryByText("This field is required.")).toBeNull();
  });
});

describe("ResourceForm — warnWhenUnsaved", () => {
  it("asks before Cancel closes a dirty form, and stays open on No", async () => {
    const confirm = stubConfirm(false);
    const { onOpenChange } = renderForm({ warnWhenUnsaved: true });
    fireEvent.change(await screen.findByLabelText(/Name/), { target: { value: "Ann" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(confirm).toHaveBeenCalledWith("You have unsaved changes. Leave without saving?");
    expect(onOpenChange).not.toHaveBeenCalled();

    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("does not ask when the form is clean, or when the option is off", async () => {
    const confirm = stubConfirm(false);
    const first = renderForm({ warnWhenUnsaved: true });
    await screen.findByLabelText(/Name/);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(first.onOpenChange).toHaveBeenCalledWith(false);
    first.unmount();

    const second = renderForm();
    fireEvent.change(await screen.findByLabelText(/Name/), { target: { value: "Ann" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(second.onOpenChange).toHaveBeenCalledWith(false);
    expect(confirm).not.toHaveBeenCalled();
  });

  it("holds beforeunload while dirty, and reports dirtiness to onDirtyChange", async () => {
    const onDirtyChange = vi.fn();
    renderForm({ warnWhenUnsaved: { message: "Discard?" }, onDirtyChange });
    const clean = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(clean);
    expect(clean.defaultPrevented).toBe(false);

    fireEvent.change(await screen.findByLabelText(/Name/), { target: { value: "Ann" } });
    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(true, expect.any(Function)));
    const dirty = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(dirty);
    expect(dirty.defaultPrevented).toBe(true);

    const confirm = stubConfirm(true);
    const confirmLeave = onDirtyChange.mock.lastCall![1] as () => boolean;
    expect(confirmLeave()).toBe(true);
    expect(confirm).toHaveBeenCalledWith("Discard?");
  });

  it("is clean once the save succeeds", async () => {
    const onDirtyChange = vi.fn();
    const { onOpenChange } = renderForm({ warnWhenUnsaved: true, onDirtyChange });
    await fillAndSubmit();
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(false, expect.any(Function)));
    const after = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(after);
    expect(after.defaultPrevented).toBe(false);
  });
});

describe("ResourceForm — mutationMode", () => {
  it("undoable: closes at once, shows an Undo toast, and Undo cancels the save", async () => {
    const { onOpenChange, provider } = renderForm({ mutationMode: "undoable", undoDelayMs: 60_000 });
    const create = vi.spyOn(provider, "create");
    await fillAndSubmit();
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(toastMock).toHaveBeenCalledTimes(1);
    const [message, options] = toastMock.mock.calls[0]!;
    expect(message).toBe("Created.");
    expect(options).toMatchObject({ duration: 60_000, action: { label: "Undo" } });
    options.action.onClick();
    // Long after the delay would have run out, nothing was sent.
    await new Promise((r) => setTimeout(r, 10));
    expect(create).not.toHaveBeenCalled();
  });

  it("optimistic: a failed save after closing is toasted", async () => {
    const provider = createMockProvider({ people: [] }, { delay: 0 });
    vi.spyOn(provider, "create").mockRejectedValue(new DataWriteError("forbidden", "You can't add people."));
    const { onOpenChange } = renderForm({ mutationMode: "optimistic" }, provider);
    await fillAndSubmit();
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith("You can't add people."));
  });
});
