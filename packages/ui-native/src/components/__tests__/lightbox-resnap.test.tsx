/** NativeLightbox re-snaps to the current page when the width changes (rotation). */
import { act, render, screen } from "@testing-library/react";
import { forwardRef, useImperativeHandle } from "react";
import { describe, expect, it, vi } from "vitest";
import { NativeLightbox } from "../lightbox";

const scrollToIndex = vi.fn();
const listProps: { current: Record<string, unknown> } = { current: {} };

vi.mock("react-native", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const Original = actual.FlatList as React.ComponentType<Record<string, unknown>>;
  const FlatList = forwardRef<{ scrollToIndex: typeof scrollToIndex }, Record<string, unknown>>((props, ref) => {
    useImperativeHandle(ref, () => ({ scrollToIndex }));
    listProps.current = props;
    return <Original {...props} />;
  });
  return { ...actual, FlatList };
});

const items = [
  { id: "a", src: "https://example.test/a.jpg" },
  { id: "b", src: "https://example.test/b.jpg" },
];

describe("NativeLightbox rotation", () => {
  it("scrolls back to the current page, unanimated, when the width changes", () => {
    render(<NativeLightbox open onOpenChange={() => undefined} items={items} index={1} onIndexChange={() => undefined} testID="lb" />);
    expect(scrollToIndex).toHaveBeenLastCalledWith({ index: 1, animated: true });
    scrollToIndex.mockClear();
    act(() => {
      screen.getByTestId("lb-content").dispatchEvent(new CustomEvent("layout", { detail: { width: 812, height: 375 } }));
    });
    expect(scrollToIndex).toHaveBeenCalledWith({ index: 1, animated: false });
  });

  it("scrolls back when a swipe's page isn't taken by the parent", () => {
    vi.useFakeTimers();
    const onIndexChange = vi.fn();
    render(<NativeLightbox open onOpenChange={() => undefined} items={items} index={0} onIndexChange={onIndexChange} testID="lb" />);
    scrollToIndex.mockClear();
    act(() => {
      (listProps.current.onMomentumScrollEnd as (e: unknown) => void)({ nativeEvent: { contentOffset: { x: 9999, y: 0 } } });
    });
    expect(onIndexChange).toHaveBeenCalledWith(1);
    act(() => vi.runAllTimers());
    expect(scrollToIndex).toHaveBeenCalledWith(expect.objectContaining({ index: 0 }));
    vi.useRealTimers();
  });
});
