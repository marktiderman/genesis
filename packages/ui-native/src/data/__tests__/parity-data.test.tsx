// @feat:native-components
/**
 * The data-layer twins: repeating groups, file and link fields and a wizard on the phone's form,
 * a custom view's states, and a record in a peek.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { Alert, Text } from "react-native";
import { useForm } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";
import { defineResource, GenesisProvider, ViewerScope, type DataProvider, type ResourceFormFieldDef } from "@marktiderman/genesis-core";
import { defineRecordView, defineView } from "@marktiderman/genesis-core/resource-view";
import { GenesisModulesProvider, type NativePickedFile } from "../../native-modules";
import { NativeCustomView } from "../NativeCustomView";
import { NativeFieldArrayRenderer, NativeFileUploadField, NativeRelationField, NativeWizardForm } from "../NativeFormFields";
import { NativeRecordPeek } from "../NativeRecordPeek";
import { NativeResourceFormFieldRenderer } from "../NativeResourceFormField";

type Person = { id: string; full_name: string };
const people = defineResource<Person>()({
  name: "people",
  key: "id",
  labelField: "full_name",
  fields: [
    { name: "id", type: "string" },
    { name: "full_name", type: "string" },
  ],
});
const peopleView = defineView(people);
const PEOPLE: Person[] = [
  { id: "ada", full_name: "Ada Lovelace" },
  { id: "grace", full_name: "Grace Hopper" },
];

function wrap(rows: Person[] = PEOPLE, over: Partial<DataProvider> = {}) {
  const provider: DataProvider = {
    getList: vi.fn(async () => ({ data: rows, total: rows.length })) as DataProvider["getList"],
    getOne: vi.fn(async (_r, { id }) => ({ data: rows.find((p) => p.id === id) ?? rows[0] })) as DataProvider["getOne"],
    getMany: vi.fn(async () => ({ data: rows })) as DataProvider["getMany"],
    create: vi.fn(),
    update: vi.fn(),
    deleteOne: vi.fn(),
    ...over,
  };
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <GenesisProvider provider={provider} queryClient={queryClient}>
      <ViewerScope viewer="u1" timeZone="UTC">
        {children}
      </ViewerScope>
    </GenesisProvider>
  );
}

describe("NativeFieldArrayRenderer", () => {
  const field: ResourceFormFieldDef = { key: "contacts", label: "Contacts", type: "array", arrayMax: 2, arrayFields: [{ key: "name", label: "Name" }] };
  function Form() {
    const form = useForm<Record<string, unknown>>({ defaultValues: { contacts: [] } });
    return <NativeFieldArrayRenderer field={field} control={form.control} action="create" />;
  }
  it("adds items up to arrayMax and removes them", () => {
    render(<Form />);
    const add = screen.getByTestId("field-array-contacts-add");
    expect(add.textContent).toBe("Add Contact");
    fireEvent.click(add);
    fireEvent.click(add);
    expect(screen.getByTestId("field-array-contacts-1")).toBeTruthy();
    expect(screen.getByTestId("field-array-contacts-add").getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(screen.getByTestId("field-array-contacts-0-remove"));
    expect(screen.queryByTestId("field-array-contacts-1")).toBeNull();
  });
  it("takes the Remove button's visible word from labels", () => {
    function Translated() {
      const form = useForm<Record<string, unknown>>({ defaultValues: { contacts: [{ name: "" }] } });
      return <NativeFieldArrayRenderer field={field} control={form.control} action="create" labels={{ removeButton: "Entfernen", remove: "Eintrag {n} entfernen" }} />;
    }
    render(<Translated />);
    const remove = screen.getByTestId("field-array-contacts-0-remove");
    expect(remove.textContent).toBe("Entfernen");
    expect(remove.getAttribute("aria-label")).toBe("Eintrag 1 entfernen");
  });
});

describe("NativeFileUploadField", () => {
  const field: ResourceFormFieldDef = { key: "photo", label: "Photo", type: "image", multiple: true, maxSize: 1000 };
  function Field() {
    const [value, setValue] = useState<NativePickedFile | NativePickedFile[] | null>(null);
    return <NativeFileUploadField field={field} value={value} onChange={setValue} />;
  }
  it("picks through GenesisModules.filePicker, keeps good files and says why others were refused", async () => {
    const filePicker = vi.fn(async () => [
      { uri: "file://a.jpg", name: "a.jpg", type: "image/jpeg", size: 512 },
      { uri: "file://b.pdf", name: "b.pdf", type: "application/pdf", size: 10 },
      { uri: "file://c.jpg", name: "c.jpg", type: "image/jpeg", size: 5000 },
    ]);
    render(
      <GenesisModulesProvider modules={{ filePicker }}>
        <Field />
      </GenesisModulesProvider>,
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId("file-upload-photo-choose"));
    });
    expect(filePicker).toHaveBeenCalledWith({ multiple: true, accept: "image/*" });
    expect(screen.getByTestId("file-upload-photo-file-0").textContent).toContain("512 B");
    expect(screen.queryByTestId("file-upload-photo-file-1")).toBeNull();
    expect(screen.getByText('"b.pdf" is not an accepted file type')).toBeTruthy();
    expect(screen.getByText('"c.jpg" exceeds 1000 B limit')).toBeTruthy();
    fireEvent.click(screen.getByTestId("file-upload-photo-remove-0"));
    expect(screen.queryByTestId("file-upload-photo-file-0")).toBeNull();
  })
  it("says so when the picker rejects (a permission denied), and opens one picker at a time", async () => {
    let reject!: (e: Error) => void;
    const filePicker = vi.fn(
      () =>
        new Promise<NativePickedFile[]>((_, no) => {
          reject = no;
        }),
    );
    render(
      <GenesisModulesProvider modules={{ filePicker }}>
        <Field />
      </GenesisModulesProvider>,
    );
    const choose = screen.getByTestId("file-upload-photo-choose");
    fireEvent.click(choose);
    fireEvent.click(choose);
    expect(filePicker).toHaveBeenCalledTimes(1);
    await act(async () => {
      reject(Object.assign(new Error("User denied access"), { code: "E_NO_PERMISSIONS" }));
    });
    expect(screen.getByRole("alert").textContent).toBe("Couldn't open the picker. Check that the app may use your photos and files, then try again.");
    // The button is back for another try.
    filePicker.mockImplementationOnce(async () => []);
    await act(async () => {
      fireEvent.click(screen.getByTestId("file-upload-photo-choose"));
    });
    expect(filePicker).toHaveBeenCalledTimes(2);
  });
});

describe("NativeRelationField", () => {
  it("lists the linked rows through the provider and stores the picked key as text", async () => {
    const onChange = vi.fn();
    const field: ResourceFormFieldDef = { key: "owner_id", label: "Owner", type: "relation", required: true, relation: { resource: "people", labelField: "full_name" } };
    render(<NativeRelationField field={field} value="" onChange={onChange} />, { wrapper: wrap() });
    fireEvent.click(screen.getByTestId("relation-owner_id-trigger"));
    fireEvent.click(await screen.findByTestId("relation-owner_id-option-grace"));
    expect(onChange).toHaveBeenCalledWith("grace");
  });
});

describe("NativeResourceFormFieldRenderer", () => {
  const fields: ResourceFormFieldDef[] = [
    { key: "contacts", label: "Contacts", type: "array", arrayFields: [{ key: "name", label: "Name" }] },
    { key: "doc", label: "Document", type: "file" },
    { key: "photo", label: "Photo", type: "image" },
    { key: "owner_id", label: "Owner", type: "relation", relation: { resource: "people", labelField: "full_name" } },
  ];
  let values: Record<string, unknown> = {};
  function Form() {
    const form = useForm<Record<string, unknown>>({ defaultValues: { contacts: [], doc: null, photo: null, owner_id: "" } });
    values = form.watch();
    return (
      <>
        {fields.map((f) => (
          <NativeResourceFormFieldRenderer key={f.key} field={f} control={form.control} action="create" />
        ))}
      </>
    );
  }

  it("draws array, file, image and relation fields with their pieces, writing to the form", async () => {
    const filePicker = vi.fn(async ({ accept }: { accept?: string }) => [
      accept === "image/*" ? { uri: "file://p.jpg", name: "p.jpg", type: "image/jpeg", size: 9 } : { uri: "file://d.pdf", name: "d.pdf", type: "application/pdf", size: 4 },
    ]);
    const Wrapper = wrap();
    render(
      <Wrapper>
        <GenesisModulesProvider modules={{ filePicker }}>
          <Form />
        </GenesisModulesProvider>
      </Wrapper>,
    );
    // Array: one card per item.
    fireEvent.click(screen.getByTestId("field-array-contacts-add"));
    expect(screen.getByTestId("field-array-contacts-0")).toBeTruthy();
    // File and image: the picker, asked for the field's types.
    await act(async () => {
      fireEvent.click(screen.getByTestId("file-upload-doc-choose"));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("file-upload-photo-choose"));
    });
    expect(filePicker).toHaveBeenCalledWith({ multiple: false, accept: undefined });
    expect(filePicker).toHaveBeenCalledWith({ multiple: false, accept: "image/*" });
    expect(screen.getByTestId("file-upload-doc-file-0").textContent).toContain("d.pdf");
    expect(screen.getByTestId("file-upload-photo-file-0").textContent).toContain("p.jpg");
    // Relation: the linked rows through the provider.
    fireEvent.click(screen.getByTestId("relation-owner_id-trigger"));
    fireEvent.click(await screen.findByTestId("relation-owner_id-option-ada"));
    await act(async () => {});
    expect(values).toMatchObject({
      contacts: [{ name: "" }],
      doc: { name: "d.pdf" },
      photo: { name: "p.jpg" },
      owner_id: "ada",
    });
  });
});

describe("NativeWizardForm", () => {
  it("validates a step before moving on, then submits on the last", async () => {
    const onSubmit = vi.fn(async () => {});
    function Wizard() {
      const form = useForm<Record<string, unknown>>({ defaultValues: { a: "x", b: "" } });
      return (
        <NativeWizardForm
          steps={[
            { id: "one", title: "First", fields: ["a"] },
            { id: "two", title: "Second", fields: ["b"] },
          ]}
          form={form}
          fields={[{ key: "a", label: "A" }, { key: "b", label: "B" }]}
          onSubmit={onSubmit}
          isSaving={false}
          action="create"
        />
      );
    }
    render(<Wizard />);
    expect(screen.getByText("Step 1 of 2")).toBeTruthy();
    expect(screen.getByTestId("wizard-form-back").getAttribute("aria-disabled")).toBe("true");
    await act(async () => {
      fireEvent.click(screen.getByTestId("wizard-form-next"));
    });
    expect(await screen.findByText("Second")).toBeTruthy();
    expect(screen.getByTestId("wizard-form-next").textContent).toBe("Create");
    await act(async () => {
      fireEvent.click(screen.getByTestId("wizard-form-next"));
    });
    expect(onSubmit).toHaveBeenCalled();
  });
});

describe("NativeCustomView", () => {
  it("draws loading, then hands the rows to the app", async () => {
    render(
      <NativeCustomView view={peopleView}>
        {({ rows, status }) => <Text testID="mine">{`${status}:${rows.map((r) => r.full_name).join(",")}`}</Text>}
      </NativeCustomView>,
      { wrapper: wrap() },
    );
    expect(screen.getByTestId("custom-view-loading")).toBeTruthy();
    expect((await screen.findByTestId("mine")).textContent).toBe("ready:Ada Lovelace,Grace Hopper");
  });

  it("draws the view's empty state, and an error with a retry", async () => {
    const { unmount } = render(<NativeCustomView view={peopleView}>{() => <Text>never</Text>}</NativeCustomView>, { wrapper: wrap([]) });
    expect(await screen.findByTestId("custom-view-empty")).toBeTruthy();
    unmount();
    render(<NativeCustomView view={peopleView}>{() => <Text>never</Text>}</NativeCustomView>, {
      wrapper: wrap(PEOPLE, { getList: vi.fn(async () => Promise.reject(new Error("offline"))) as DataProvider["getList"] }),
    });
    expect(await screen.findByTestId("custom-view-retry")).toBeTruthy();
  });
});

describe("NativeRecordPeek", () => {
  const recordView = defineRecordView(peopleView, { sections: [{ id: "about", label: "About" }] });
  it("draws the record in a sheet with its title, and forwards Edit and a confirmed Delete", async () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    const onClose = vi.fn();
    const alert = vi.spyOn(Alert, "alert").mockImplementation(() => {});
    render(<NativeRecordPeek view={recordView} row={PEOPLE[0]!} open onClose={onClose} onEdit={onEdit} onDelete={onDelete} />, { wrapper: wrap() });
    const peek = await screen.findByTestId("record-peek-page");
    expect(peek).toBeTruthy();
    expect(screen.getAllByText("Ada Lovelace").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByTestId("record-peek-edit"));
    expect(onEdit).toHaveBeenCalledWith(PEOPLE[0]);
    fireEvent.click(screen.getByTestId("record-peek-delete"));
    const buttons = alert.mock.calls[0]![2] as { text: string; onPress?: () => void }[];
    await act(async () => {
      buttons.find((b) => b.text === "Delete")!.onPress!();
    });
    expect(onDelete).toHaveBeenCalledWith(PEOPLE[0]);
    expect(onClose).toHaveBeenCalled();
    alert.mockRestore();
  });

  it("with confirmDelete={false}, calls a handler that confirms on its own at once, as the web's RecordPeek", async () => {
    const onDelete = vi.fn();
    const alert = vi.spyOn(Alert, "alert").mockImplementation(() => {});
    render(<NativeRecordPeek view={recordView} row={PEOPLE[0]!} open onClose={() => undefined} onDelete={onDelete} confirmDelete={false} />, { wrapper: wrap() });
    await screen.findByTestId("record-peek-page");
    await act(async () => {
      fireEvent.click(screen.getByTestId("record-peek-delete"));
    });
    expect(alert).not.toHaveBeenCalled();
    expect(onDelete).toHaveBeenCalledWith(PEOPLE[0]);
    alert.mockRestore();
  });

  it("with confirmDelete={false}, leaves closing to the handler: a cancelled confirm keeps the peek open", async () => {
    // The handler opens its own confirm and returns at once; the person then cancels.
    const onDelete = vi.fn(() => undefined);
    const onClose = vi.fn();
    render(<NativeRecordPeek view={recordView} row={PEOPLE[0]!} open onClose={onClose} onDelete={onDelete} confirmDelete={false} />, { wrapper: wrap() });
    await screen.findByTestId("record-peek-page");
    await act(async () => {
      fireEvent.click(screen.getByTestId("record-peek-delete"));
    });
    expect(onDelete).toHaveBeenCalledWith(PEOPLE[0]);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("hides what the screen's can turns off and explains what the view's guard refuses", async () => {
    const guarded = defineRecordView(
      defineView(people, { can: { delete: () => "Only owners delete people." } }),
      { sections: [{ id: "about", label: "About" }] },
    );
    const onDelete = vi.fn();
    const alert = vi.spyOn(Alert, "alert").mockImplementation(() => {});
    render(
      <NativeRecordPeek
        view={guarded}
        row={PEOPLE[0]!}
        open
        onClose={() => {}}
        onEdit={() => {}}
        onDelete={onDelete}
        can={(action) => action !== "update"}
      />,
      { wrapper: wrap() },
    );
    await screen.findByTestId("record-peek-page");
    expect(screen.queryByTestId("record-peek-edit")).toBeNull();
    fireEvent.click(screen.getByTestId("record-peek-delete"));
    // The guard's reason, not a confirm: no second step offers to delete.
    expect(alert).toHaveBeenCalledTimes(1);
    expect(alert.mock.calls[0]![1]).toBe("Only owners delete people.");
    expect(alert.mock.calls[0]![2]).toBeUndefined();
    expect(onDelete).not.toHaveBeenCalled();
    alert.mockRestore();
  });

  it("confirms once in the bin's words, and keeps the sheet open with the refusal when the delete fails", async () => {
    const onClose = vi.fn();
    const refused = Object.assign(new Error("You can't delete Ada."), { name: "DataWriteError" });
    const onDelete = vi.fn(async () => {
      throw refused;
    });
    const alert = vi.spyOn(Alert, "alert").mockImplementation(() => {});
    const capabilities = vi.fn(async () => ({ softDelete: true })) as unknown as DataProvider["capabilities"];
    render(<NativeRecordPeek view={recordView} row={PEOPLE[0]!} open onClose={onClose} onDelete={onDelete} />, {
      wrapper: wrap(PEOPLE, { capabilities }),
    });
    await screen.findByTestId("record-peek-page");
    await act(async () => {});
    expect(screen.getByTestId("record-peek-delete").textContent).toBe("Move to Bin");
    fireEvent.click(screen.getByTestId("record-peek-delete"));
    expect(alert.mock.calls[0]![0]).toBe("Move “Ada Lovelace” to the bin?");
    expect(alert.mock.calls[0]![1]).toBe("You can restore it from the bin.");
    const buttons = alert.mock.calls[0]![2] as { text: string; onPress?: () => void }[];
    await act(async () => {
      buttons.find((b) => b.text === "Move to Bin")!.onPress!();
    });
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalledTimes(2);
    expect(alert.mock.calls[1]![1]).toBe("You can't delete Ada.");
    alert.mockRestore();
  });
});
