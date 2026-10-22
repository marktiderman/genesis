/**
 * `/data` exports the undo and write-error toasts ResourceForm and
 * ResourcePage use, so a direct `useResource({ mutationMode: "undoable" })`
 * caller gets the same undo UI (review low 8 on #106).
 */
import { describe, expect, it, vi } from "vitest";

const toastMock = vi.hoisted(() => Object.assign(vi.fn(), { error: vi.fn() }));
vi.mock("../../ui/sonner", () => ({ toast: toastMock, Toaster: () => null }));

import { showUndoToast, showWriteErrorToast } from "../index";

describe("undo toasts on /data", () => {
  it("showUndoToast offers an Undo for as long as the write waits", async () => {
    const undo = vi.fn(async () => true);
    showUndoToast({ resource: "tasks", kind: "delete", id: "t1", strategy: "delay", delayMs: 3000, undo, commit: () => {} });
    expect(toastMock).toHaveBeenCalledWith("Deleted.", expect.objectContaining({ duration: 3000 }));
    const options = toastMock.mock.calls[0]![1] as { action: { label: string; onClick: () => void } };
    expect(options.action.label).toBe("Undo");
    options.action.onClick();
    expect(undo).toHaveBeenCalledTimes(1);
  });

  it("showWriteErrorToast shows the error's message", () => {
    showWriteErrorToast(new Error("Title is already in use."));
    expect(toastMock.error).toHaveBeenCalledWith("Title is already in use.");
  });
});
