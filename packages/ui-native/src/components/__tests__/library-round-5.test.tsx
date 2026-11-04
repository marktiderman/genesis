/** The round-5 additions: alert slots, progress colours, rating touch/tone, NativeChoiceCard. */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NativeBanner, NativeInlineAlert } from "../inline-alert";
import { NativeProgress } from "../progress";
import { NativeRating } from "../rating";
import { NativeChoiceCard } from "../choice-card";

const style = (el: HTMLElement) => JSON.parse(el.dataset.style ?? "{}") as Record<string, unknown>;

describe("NativeInlineAlert / NativeBanner slots", () => {
  it("renders children and actions under the description", () => {
    const onRetry = vi.fn();
    render(
      <NativeInlineAlert
        testID="alert"
        variant="destructive"
        title="Fix 2 answers"
        description="Before you send"
        actions={<button onClick={onRetry}>Review</button>}
      >
        <span>Email</span>
      </NativeInlineAlert>,
    );
    expect(screen.getByTestId("alert-content").textContent).toBe("Email");
    fireEvent.click(screen.getByText("Review"));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("alert-actions")).toBeTruthy();
  });

  it("draws no slot wrappers when they are empty", () => {
    render(<NativeBanner testID="banner" title="Offline" />);
    expect(screen.queryByTestId("banner-content")).toBeNull();
    expect(screen.queryByTestId("banner-actions")).toBeNull();
  });

  it("the banner takes the same slots", () => {
    render(<NativeBanner testID="banner" title="Offline" actions={<span>Retry</span>} />);
    expect(screen.getByTestId("banner-actions").textContent).toBe("Retry");
  });
});

describe("NativeProgress colours", () => {
  it("takes the fill and track as colour values", () => {
    render(<NativeProgress testID="p" value={40} indicatorColor="red" trackColor="blue" />);
    const track = screen.getByTestId("p");
    expect(style(track).backgroundColor).toBe("blue");
    const fill = track.firstElementChild as HTMLElement;
    expect(style(fill)).toEqual({ width: "40%", backgroundColor: "red" });
  });

  it("leaves the classes alone without them", () => {
    render(<NativeProgress testID="p" value={10} />);
    const track = screen.getByTestId("p");
    expect(track.dataset.style).toBeUndefined();
    expect(style(track.firstElementChild as HTMLElement)).toEqual({ width: "10%" });
  });
});

describe("NativeRating touch, tone, clearable, disabled", () => {
  it("touch gives each star a 44pt target", () => {
    render(<NativeRating value={2} onChange={() => undefined} size="touch" testID="r" />);
    expect(screen.getByTestId("r-star-1").className).toContain("h-11 w-11");
  });

  it("clearable={false} keeps the chosen star when it is pressed again", () => {
    const onChange = vi.fn();
    render(<NativeRating value={3} onChange={onChange} clearable={false} testID="r" />);
    fireEvent.click(screen.getByTestId("r-star-3"));
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("r-star-4"));
    expect(onChange).toHaveBeenCalledWith(4);
  });

  it("disabled stars can't be pressed", () => {
    const onChange = vi.fn();
    render(<NativeRating value={1} onChange={onChange} disabled testID="r" />);
    fireEvent.click(screen.getByTestId("r-star-4"));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("tone=primary still renders every star", () => {
    render(<NativeRating value={2} tone="primary" testID="r" />);
    expect(screen.getByTestId("r-star-5")).toBeTruthy();
  });
});

describe("NativeChoiceCard", () => {
  it("is one radio named by title and description", () => {
    const onPress = vi.fn();
    render(<NativeChoiceCard testID="c" title="Weekly" description="Every Monday" selected={false} onPress={onPress} />);
    const card = screen.getByTestId("c");
    expect(card.getAttribute("role")).toBe("radio");
    expect(card.getAttribute("aria-label")).toBe("Weekly, Every Monday");
    fireEvent.click(card);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("is a checkbox with multiple, and shows the selected state", () => {
    render(<NativeChoiceCard testID="c" title="Photos" selected multiple onPress={() => undefined} />);
    const card = screen.getByTestId("c");
    expect(card.getAttribute("role")).toBe("checkbox");
    expect(card.className).toContain("border-primary");
    expect(screen.getByTestId("c-indicator").textContent).toBe("✓");
  });

  it("renders media and marks an invalid answer", () => {
    render(
      <NativeChoiceCard testID="c" title="Red" selected={false} invalid media={<span>img</span>} onPress={() => undefined} />,
    );
    expect(screen.getByTestId("c-media").textContent).toBe("img");
    expect(screen.getByTestId("c").className).toContain("border-destructive");
  });

  it("does not fire when disabled", () => {
    const onPress = vi.fn();
    render(<NativeChoiceCard testID="c" title="Red" selected={false} disabled onPress={onPress} />);
    fireEvent.click(screen.getByTestId("c"));
    expect(onPress).not.toHaveBeenCalled();
  });
});
