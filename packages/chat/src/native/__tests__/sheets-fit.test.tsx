// @vitest-environment happy-dom
// @feat:chat
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { Platform } from "react-native";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChatMessage } from "../../core/types";
import { ChatNativeProvider } from "../context";
import { ChatEmojiPickerSheet } from "../emoji-picker";
import { MessageActionsSheet } from "../message-actions-sheet";

vi.mock("react-native", async (original) => ({ ...(await original<object>()), useWindowDimensions: () => ({ width: 390, height: 844, scale: 3, fontScale: 1 }) }));

const os = Platform.OS;
afterEach(() => {
  cleanup();
  Platform.OS = os;
});

const message = {
  id: "m1", conversationId: "conv", seq: 1, clientId: "c1", senderId: "u2", senderRole: "member", kind: "text", body: "hi", mentions: [], replyToId: null,
  threadRootId: null, threadCount: 0, threadLastAt: null, topic: null, visibility: "everyone", silent: false, meta: {}, createdAt: "2026-10-25T10:00:00Z",
  editedAt: null, deletedAt: null, attachments: [], reactions: [],
} as unknown as ChatMessage;

describe("in-thread sheets on iOS", () => {
  it("fit their content (a bottom panel with a grabber over a scrim), not the full page sheet", async () => {
    Platform.OS = "ios";
    render(
      <ChatNativeProvider>
        <MessageActionsSheet
          message={message}
          context={{ me: "u1", role: "member", canPost: true, pinned: false, canPin: false, canCopy: true }}
          onClose={vi.fn()}
          onReact={vi.fn()}
          onAction={vi.fn()}
          testID="actions"
        />
        <ChatEmojiPickerSheet open onClose={vi.fn()} onSelect={vi.fn()} testID="emoji" />
      </ChatNativeProvider>,
    );
    // Only the panel that fits its content has a scrim (the backdrop); the page sheet has none.
    await waitFor(() => expect(screen.getByTestId("actions-backdrop")).toBeTruthy());
    expect(screen.getByTestId("emoji-backdrop")).toBeTruthy();
  });
});
