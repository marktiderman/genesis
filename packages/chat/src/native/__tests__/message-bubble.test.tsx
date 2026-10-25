// @vitest-environment happy-dom
// @feat:chat
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PendingMessage } from "../../core/types";
import { MessageBubble } from "../message-bubble";
import { invertedRows, type ThreadRow } from "../rows";

// The shared React Native shim has no useWindowDimensions; attachments size pictures by it.
vi.mock("react-native", async (original) => ({ ...(await original<object>()), useWindowDimensions: () => ({ width: 390, height: 844, scale: 3, fontScale: 1 }) }));

afterEach(cleanup);

const ME = "11111111-1111-4111-8111-111111111111";

function failedRow(files: PendingMessage["files"]): Extract<ThreadRow, { type: "message" }> {
  const pending: PendingMessage = {
    clientId: "c1",
    input: { conversationId: "conv", clientId: "c1", body: "" },
    senderId: ME,
    createdAt: "2026-10-25T10:00:00Z",
    status: "failed",
    error: "Attach the file again to send",
    files,
  };
  return invertedRows([{ type: "pending", pending }], { me: ME, group: false }).find((r) => r.type === "message") as Extract<ThreadRow, { type: "message" }>;
}

function show(row: Extract<ThreadRow, { type: "message" }>, handlers: Partial<Parameters<typeof MessageBubble>[0]> = {}) {
  render(<MessageBubble row={row} me={ME} urls={{}} group={false} reducedMotion testID="b" {...handlers} />);
}

describe("a failed message", () => {
  it("whose file was lost offers Attach again, not Retry, with the files it lost", () => {
    const onReattach = vi.fn();
    const files = [{ name: "photo.png", contentType: "image/png", kind: "image", lost: true }];
    show(failedRow(files), { onReattach, onRetry: vi.fn(), onDiscard: vi.fn() });
    expect(screen.getByTestId("b-failed").textContent).toBe("Attach the file again to send");
    expect(screen.queryByTestId("b-retry")).toBeNull();
    fireEvent.click(screen.getByTestId("b-reattach"));
    expect(onReattach).toHaveBeenCalledWith("c1", files);
    expect(screen.getByTestId("b-discard")).toBeTruthy();
  });

  it("whose files are all still there offers Retry", () => {
    const onRetry = vi.fn();
    show(failedRow([{ name: "photo.jpg", contentType: "image/jpeg", kind: "image" }]), { onRetry, onReattach: vi.fn() });
    expect(screen.queryByTestId("b-reattach")).toBeNull();
    fireEvent.click(screen.getByTestId("b-retry"));
    expect(onRetry).toHaveBeenCalledWith("c1");
  });

  it("draws a pending voice note from PendingMessage.files, with its duration", () => {
    show(failedRow([{ name: "voice.m4a", contentType: "audio/mp4", kind: "voice", meta: { durationMs: 9000, waveform: [10, 50] } }]));
    expect(screen.getByTestId("b-voice-0")).toBeTruthy();
  });
});
