/**
 * Button — `asChild` composition + disabled semantics.
 *
 * The regression this locks out: `disabled` is a BUTTON-ONLY attribute.
 * When `asChild` composes Button onto an <a> / router Link, forwarding
 * `disabled` to that child does nothing — anchors don't match `:disabled`
 * and don't block activation — so a Button you explicitly disabled would
 * still navigate, and would also silently lose its disabled styling.
 * Button therefore applies ARIA disabled semantics in `asChild` mode.
 */
import { describe, expect, it, vi } from "vitest";
import { createRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { Button } from "../button";

describe("Button — default (<button>) mode", () => {
  it("renders a real button that carries the native disabled attribute", () => {
    render(
      <Button disabled testID="btn">
        Save
      </Button>
    );
    const btn = screen.getByTestId("btn");
    expect(btn.tagName).toBe("BUTTON");
    expect(btn).toHaveProperty("disabled", true);
  });

  it("defaults type to `button` so it can't submit a wrapping form", () => {
    render(<Button testID="btn">Save</Button>);
    expect(screen.getByTestId("btn")).toHaveProperty("type", "button");
  });

  it("marks itself busy and disabled while loading", () => {
    render(
      <Button loading testID="btn">
        Saving
      </Button>
    );
    const btn = screen.getByTestId("btn");
    expect(btn.getAttribute("aria-busy")).toBe("true");
    expect(btn).toHaveProperty("disabled", true);
  });
});

describe("Button — asChild mode", () => {
  it("renders the child element itself, not a wrapping button", () => {
    render(
      <Button asChild testID="link">
        <a href="/somewhere">Go</a>
      </Button>
    );
    const el = screen.getByTestId("link");
    expect(el.tagName).toBe("A");
    // Button's styling landed on the anchor.
    expect(el.className).toContain("inline-flex");
    expect(document.querySelector("button")).toBeNull();
  });

  it("forwards a ref to the child element", () => {
    const ref = createRef<HTMLElement>();
    render(
      <Button asChild ref={ref}>
        <a href="/somewhere">Go</a>
      </Button>
    );
    expect(ref.current).toBeInstanceOf(HTMLAnchorElement);
  });

  it("stays interactive when not disabled", () => {
    const onClick = vi.fn();
    render(
      <Button asChild testID="link" onClick={onClick}>
        <a href="/somewhere">Go</a>
      </Button>
    );
    fireEvent.click(screen.getByTestId("link"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  describe("when disabled", () => {
    it("announces the state via aria-disabled instead of the inert `disabled` attribute", () => {
      render(
        <Button asChild disabled testID="link">
          <a href="/somewhere">Go</a>
        </Button>
      );
      const el = screen.getByTestId("link");
      expect(el.getAttribute("aria-disabled")).toBe("true");
      // `disabled` on an anchor would be meaningless dead weight.
      expect(el.hasAttribute("disabled")).toBe(false);
    });

    it("keeps the disabled styling that `disabled:` utilities can't provide here", () => {
      render(
        <Button asChild disabled testID="link">
          <a href="/somewhere">Go</a>
        </Button>
      );
      // Assert on whole class tokens, NOT a substring match: the cva base
      // already ships `disabled:pointer-events-none` / `disabled:opacity-50`
      // (which never apply to an anchor), and those would satisfy a naive
      // `toContain` even when the unprefixed utilities are missing.
      const classes = screen.getByTestId("link").className.split(/\s+/);
      expect(classes).toContain("pointer-events-none");
      expect(classes).toContain("opacity-50");
    });

    it("does not apply the inert styling when enabled", () => {
      render(
        <Button asChild testID="link">
          <a href="/somewhere">Go</a>
        </Button>
      );
      const classes = screen.getByTestId("link").className.split(/\s+/);
      expect(classes).not.toContain("pointer-events-none");
      expect(classes).not.toContain("opacity-50");
    });

    it("blocks click activation (the anchor must not navigate)", () => {
      const onClick = vi.fn();
      render(
        <Button asChild disabled testID="link" onClick={onClick}>
          <a href="/somewhere">Go</a>
        </Button>
      );
      // fireEvent returns false when the default action was prevented —
      // i.e. the browser would not follow the href.
      const notPrevented = fireEvent.click(screen.getByTestId("link"));
      expect(notPrevented).toBe(false);
      expect(onClick).not.toHaveBeenCalled();
    });

    it("blocks keyboard activation (Enter on an anchor, Space on role=button)", () => {
      const onKeyDown = vi.fn();
      render(
        <Button asChild disabled testID="link" onKeyDown={onKeyDown}>
          <a href="/somewhere">Go</a>
        </Button>
      );
      const el = screen.getByTestId("link");
      expect(fireEvent.keyDown(el, { key: "Enter" })).toBe(false);
      expect(fireEvent.keyDown(el, { key: " " })).toBe(false);
      expect(onKeyDown).not.toHaveBeenCalled();
    });

    it("still forwards unrelated keys to the consumer's handler", () => {
      const onKeyDown = vi.fn();
      render(
        <Button asChild disabled testID="link" onKeyDown={onKeyDown}>
          <a href="/somewhere">Go</a>
        </Button>
      );
      fireEvent.keyDown(screen.getByTestId("link"), { key: "Tab" });
      expect(onKeyDown).toHaveBeenCalledTimes(1);
    });
  });

  it("treats `loading` as inert too, so an in-flight link can't be re-activated", () => {
    const onClick = vi.fn();
    render(
      <Button asChild loading testID="link" onClick={onClick}>
        <a href="/somewhere">Go</a>
      </Button>
    );
    const el = screen.getByTestId("link");
    expect(el.getAttribute("aria-disabled")).toBe("true");
    expect(el.getAttribute("aria-busy")).toBe("true");
    expect(fireEvent.click(el)).toBe(false);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("does not inject button chrome (spinner / icons) into the child", () => {
    render(
      <Button
        asChild
        loading
        startIcon={<span data-testid="start" />}
        endIcon={<span data-testid="end" />}
        testID="link"
      >
        <a href="/somewhere">Go</a>
      </Button>
    );
    expect(screen.getByTestId("link").textContent).toBe("Go");
    expect(screen.queryByTestId("start")).toBeNull();
    expect(screen.queryByTestId("end")).toBeNull();
  });
});
