import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createForm, defineForm, f, type FieldBlock, type FormEngine, type PhotoRef } from "@marktiderman/genesis-forms";
import { Form, photoAccept, photoFileProblem, UploadContext, UPLOAD_WAIT_MESSAGE } from "../index";

const form = defineForm({
  id: "equipment",
  title: "Equipment",
  layout: { mode: "classic" },
  blocks: [f.photo("photo", { label: "Add a photo (optional)", maxFiles: 2, maxSizeMb: 1 })],
});
const field = form.definition.blocks[0] as FieldBlock;

const file = (name: string, type: string, size = 1000) => new File([new Uint8Array(size)], name, { type });
const refFor = (file: File, id = "u1"): PhotoRef => ({ id, name: file.name, type: file.type || "image/heic", size: file.size });

function renderForm(props: Partial<React.ComponentProps<typeof Form>> = {}) {
  const engine: FormEngine = createForm(form.definition);
  const utils = render(<Form form={form} engine={engine} {...props} />);
  const input = () => utils.container.querySelector<HTMLInputElement>('input[type="file"]:not([capture])')!;
  const pick = (...files: File[]) => fireEvent.change(input(), { target: { files } });
  return { engine, pick, input, ...utils };
}

const photoValue = (engine: FormEngine) => engine.getState().values["photo"];

describe("photo renderer", () => {
  it("says photos can't be added without a host that stores them", () => {
    renderForm();
    const group = screen.getByRole("group", { name: "Add a photo (optional)" });
    expect(within(group).getByText("Photos can't be added here.")).toBeTruthy();
    expect(within(group).getByRole("button", { name: /Choose a photo/ })).toHaveProperty("disabled", true);
  });

  it("uploads a picked photo through the host, shows it, and removes it", async () => {
    const onUpload = vi.fn(async (f: File) => refFor(f));
    const { engine, pick, input } = renderForm({ onUpload });
    expect(input().getAttribute("accept")).toBe("image/jpeg,image/png,image/heic,image/heif,image/webp,.heic,.heif");
    expect(input().multiple).toBe(true);
    const photo = file("rower.jpg", "image/jpeg");
    await act(async () => {
      pick(photo);
    });
    expect(onUpload).toHaveBeenCalledWith(photo, expect.objectContaining({ key: "photo" }));
    expect(photoValue(engine)).toEqual([{ id: "u1", name: "rower.jpg", type: "image/jpeg", size: 1000 }]);
    const group = screen.getByRole("group", { name: "Add a photo (optional)" });
    // A thumbnail where the browser can preview it, else a tile with its name.
    expect(within(group).queryByAltText("rower.jpg") ?? within(group).queryByText("rower.jpg")).toBeTruthy();
    expect(within(group).getByRole("button", { name: /Add another photo/ })).toBeTruthy();
    fireEvent.click(within(group).getByRole("button", { name: "Remove rower.jpg" }));
    expect(photoValue(engine)).toBeUndefined();
  });

  it("checks type, size and count before uploading", async () => {
    const onUpload = vi.fn(async (f: File) => refFor(f, f.name));
    const { engine, pick } = renderForm({ onUpload });
    await act(async () => {
      pick(file("doc.pdf", "application/pdf"));
    });
    expect(screen.getByRole("alert").textContent).toBe("Use a JPEG, PNG, HEIC or WebP photo.");
    await act(async () => {
      pick(file("huge.jpg", "image/jpeg", 2 * 1024 * 1024));
    });
    expect(screen.getByRole("alert").textContent).toBe("Each photo must be 1 MB or smaller.");
    expect(onUpload).not.toHaveBeenCalled();
    await act(async () => {
      pick(file("a.jpg", "image/jpeg"), file("b.HEIC", ""), file("c.jpg", "image/jpeg"));
    });
    expect(onUpload).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("alert").textContent).toBe("Add at most 2 photos.");
    expect((photoValue(engine) as PhotoRef[]).map((r) => r.id)).toEqual(["a.jpg", "b.HEIC"]);
  });

  it("shows a failed upload under the field and keeps nothing", async () => {
    const { engine, pick } = renderForm({ onUpload: async () => Promise.reject(new Error("offline")) });
    await act(async () => {
      pick(file("rower.jpg", "image/jpeg"));
    });
    expect(screen.getByRole("alert").textContent).toBe("“rower.jpg” didn't upload. Try again.");
    expect(photoValue(engine)).toBeUndefined();
  });

  it("doesn't send while a photo is still uploading", async () => {
    let finish: (ref: PhotoRef) => void = () => {};
    const onUpload = vi.fn((f: File) => new Promise<PhotoRef>((resolve) => (finish = () => resolve(refFor(f)))));
    const onSubmit = vi.fn();
    const { pick, container } = renderForm({ onUpload, onSubmit });
    await act(async () => {
      pick(file("rower.jpg", "image/jpeg"));
    });
    expect(screen.getByRole("listitem", { name: "Uploading rower.jpg" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(container.querySelector("[data-gf-live]")?.textContent).toBe(UPLOAD_WAIT_MESSAGE);
    await act(async () => {
      finish({ id: "u1", name: "rower.jpg", type: "image/jpeg", size: 1000 });
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
  });

  it("uses an UploadContext a host provides above the form", async () => {
    const upload = vi.fn(async (f: File) => refFor(f));
    const engine = createForm(form.definition);
    const { container } = render(
      <UploadContext.Provider value={{ upload }}>
        <Form form={form} engine={engine} />
      </UploadContext.Provider>,
    );
    const input = container.querySelector<HTMLInputElement>('input[type="file"]:not([capture])')!;
    await act(async () => {
      fireEvent.change(input, { target: { files: [file("a.png", "image/png")] } });
    });
    expect(upload).toHaveBeenCalledTimes(1);
    expect(photoValue(engine)).toEqual([{ id: "u1", name: "a.png", type: "image/png", size: 1000 }]);
  });

  it("exposes its checks for hosts", () => {
    expect(photoFileProblem(field, { name: "IMG_1.heic", type: "", size: 10 })).toBeNull();
    expect(photoFileProblem(field, { name: "a.gif", type: "image/gif", size: 10 })).toBe("Use a JPEG, PNG, HEIC or WebP photo.");
    expect(photoAccept({ ...field, props: { formats: ["jpeg"] } })).toBe("image/jpeg");
  });
});
