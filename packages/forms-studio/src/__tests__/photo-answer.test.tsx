// @feat:forms-studio
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { defineForm, f, type PhotoRef } from "@marktiderman/genesis-forms";
import { PhotoAnswer } from "../PhotoAnswer";
import { answerCell, answersByKey } from "../answers";

const jpeg: PhotoRef = { id: "a", name: "rower.jpg", type: "image/jpeg", size: 1000 };
const heic: PhotoRef = { id: "b", name: "IMG_1.HEIC", type: "image/heic", size: 2000 };
const gone: PhotoRef = { id: "c", name: "gone.png", type: "image/png", size: 3000 };

describe("PhotoAnswer", () => {
  it("shows each photo once its address resolves, opening full size in a new tab", async () => {
    const resolveUrl = vi.fn(async (ref: PhotoRef) => (ref.id === "c" ? null : `https://files.test/${ref.id}`));
    render(<PhotoAnswer photos={[jpeg, heic, gone]} resolveUrl={resolveUrl} />);
    expect(screen.getByLabelText("Loading rower.jpg")).toBeTruthy();

    const img = await screen.findByAltText("rower.jpg");
    expect(img.getAttribute("src")).toBe("https://files.test/a");
    expect(img.closest("a")?.getAttribute("target")).toBe("_blank");

    // HEIC most browsers can't draw: a tile with the name and an Open link.
    const open = await screen.findByRole("link", { name: /Open IMG_1.HEIC/ });
    expect(open.getAttribute("href")).toBe("https://files.test/b");
    expect(screen.getByText("Photo unavailable")).toBeTruthy();
    expect(resolveUrl).toHaveBeenCalledTimes(3);
  });

  it("falls back to a tile when the image won't load, and says so when resolving fails", async () => {
    render(<PhotoAnswer photos={[jpeg]} resolveUrl={async () => "https://files.test/a"} />);
    fireEvent.error(await screen.findByAltText("rower.jpg"));
    expect(screen.getByRole("link", { name: /Open rower.jpg/ })).toBeTruthy();

    render(<PhotoAnswer photos={[gone]} resolveUrl={() => Promise.reject(new Error("denied"))} />);
    await waitFor(() => expect(screen.getAllByText("Photo unavailable")).toHaveLength(1));
  });

  it("renders nothing without photos", () => {
    const { container } = render(<PhotoAnswer photos={[]} resolveUrl={async () => null} />);
    expect(container.innerHTML).toBe("");
  });

  it("lists photos by name in cells and CSVs", () => {
    const form = defineForm({ id: "f", title: "F", blocks: [f.photo("photo", { label: "Photo" })] });
    const field = form.definition.blocks[0]!;
    if (field.kind !== "field") throw new Error("field expected");
    expect(answerCell(field, [jpeg, heic])).toBe("rower.jpg, IMG_1.HEIC");
    expect(answersByKey(form.definition, { photo: [jpeg] })).toEqual({ photo: "rower.jpg" });
  });
});
