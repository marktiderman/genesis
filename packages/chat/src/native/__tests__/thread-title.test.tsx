// @vitest-environment happy-dom
// @feat:chat
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatNativeProvider } from "../context";
import { chatThreadStackOptions } from "../stack-options";

afterEach(cleanup);

type TitleFn = (p: { tintColor?: string }) => ReactElement;

describe("useChatThreadStackOptions' title", () => {
  it("stays the bar's plain title when nothing more is asked for", () => {
    const opts = chatThreadStackOptions({ headerTitle: "Sam" }, "#fff");
    expect(opts.title).toBe("Sam");
    expect(opts.headerTitle).toBeUndefined();
  });

  it("draws an avatar, a subtitle and a button that opens the details, read as one", () => {
    const onPressTitle = vi.fn();
    const opts = chatThreadStackOptions({ headerTitle: "Sam", avatar: { name: "Sam Lee", src: null, id: "u2" }, subtitle: "Away until Monday", onPressTitle, titleHint: "Shows details" }, "#fff");
    expect(opts.title).toBe("Sam");
    render(<ChatNativeProvider>{(opts.headerTitle as TitleFn)({})}</ChatNativeProvider>);
    const title = screen.getByTestId("chat-thread-title");
    expect(title.getAttribute("role")).toBe("button");
    expect(title.getAttribute("aria-label")).toBe("Sam, Away until Monday");
    expect(screen.getByTestId("chat-thread-title-avatar").getAttribute("aria-hidden")).toBe("true");
    fireEvent.click(title);
    expect(onPressTitle).toHaveBeenCalled();
  });

  it("is a header, not a button, without onPressTitle; null hides the subtitle", () => {
    const opts = chatThreadStackOptions({ headerTitle: "Group", subtitle: null }, "#fff");
    render(<ChatNativeProvider>{(opts.headerTitle as TitleFn)({})}</ChatNativeProvider>);
    expect(screen.getByTestId("chat-thread-title").getAttribute("role")).toBe("header");
    expect(screen.queryByTestId("chat-thread-title-subtitle")).toBeNull();
  });

  it("takes {} and an id alone as avatar data (the initials), never as a child, and keeps an element as the app's own", () => {
    for (const avatar of [{}, { id: "u2" }]) {
      const opts = chatThreadStackOptions({ headerTitle: "Sam", avatar, subtitle: null }, "#fff");
      const { unmount } = render(<ChatNativeProvider>{(opts.headerTitle as TitleFn)({})}</ChatNativeProvider>);
      expect(screen.getByTestId("chat-thread-title-avatar").textContent).toBe("S");
      unmount();
    }
    const own = chatThreadStackOptions({ headerTitle: "Sam", avatar: <span data-testid="own" />, subtitle: null }, "#fff");
    render(<ChatNativeProvider>{(own.headerTitle as TitleFn)({})}</ChatNativeProvider>);
    expect(screen.getByTestId("own")).toBeTruthy();
  });
});
