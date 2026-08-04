/**
 * PasswordToggleField — behavior a hand-rolled `useState` toggle gets wrong.
 *
 * Four properties, each of which the naive five-line version misses and none
 * of which a typecheck sees:
 *
 *   1. the input's `type` flips between `password` and `text`,
 *   2. the toggle carries a state-dependent accessible name, so a screen reader
 *      user is told which action the button performs *now*,
 *   3. `aria-controls` points at the input the button governs, and
 *   4. submitting the form resets visibility — otherwise a shoulder-surfable
 *      password stays on screen after the user is done with it.
 *
 * (4) is the one nobody writes by hand and the reason this wraps Radix.
 *
 * NOTE: this primitive is exported from an `unstable_` Radix namespace. If a
 * future Radix release changes the API, these tests are the thing that says so
 * out loud instead of the change reaching consumers silently.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  PasswordToggleField,
  PasswordToggleFieldInput,
  PasswordToggleFieldSlot,
  PasswordToggleFieldToggle,
} from "../password-toggle-field";

function renderField(props: Record<string, unknown> = {}) {
  return render(
    <PasswordToggleField {...props}>
      <PasswordToggleFieldInput testID="pw" placeholder="Password" />
      <PasswordToggleFieldToggle testID="toggle">
        <PasswordToggleFieldSlot
          visible={<span data-testid="icon-visible">hide</span>}
          hidden={<span data-testid="icon-hidden">show</span>}
        />
      </PasswordToggleFieldToggle>
    </PasswordToggleField>
  );
}

describe("PasswordToggleField", () => {
  it("starts masked and reveals on toggle", () => {
    renderField();

    const input = screen.getByTestId("pw");
    expect(input.getAttribute("type")).toBe("password");

    fireEvent.click(screen.getByTestId("toggle"));
    expect(input.getAttribute("type")).toBe("text");

    fireEvent.click(screen.getByTestId("toggle"));
    expect(input.getAttribute("type")).toBe("password");
  });

  it("swaps the slot content with the visibility state", () => {
    renderField();

    expect(screen.getByTestId("icon-hidden")).toBeTruthy();
    expect(screen.queryByTestId("icon-visible")).toBeNull();

    fireEvent.click(screen.getByTestId("toggle"));

    expect(screen.getByTestId("icon-visible")).toBeTruthy();
    expect(screen.queryByTestId("icon-hidden")).toBeNull();
  });

  it("points the toggle at the input it controls", () => {
    renderField();

    const controls = screen.getByTestId("toggle").getAttribute("aria-controls");
    expect(controls).toBeTruthy();
    expect(document.getElementById(controls!)).toBe(screen.getByTestId("pw"));
  });

  it("gives the toggle a state-dependent accessible name", () => {
    // The button's own content here is an icon with no text, so Radix has to
    // supply the name — and update it when the state changes.
    render(
      <PasswordToggleField>
        <PasswordToggleFieldInput testID="pw" />
        <PasswordToggleFieldToggle testID="toggle">
          <PasswordToggleFieldSlot
            visible={<svg aria-hidden="true" />}
            hidden={<svg aria-hidden="true" />}
          />
        </PasswordToggleFieldToggle>
      </PasswordToggleField>
    );

    expect(screen.getByRole("button", { name: "Show password" })).toBeTruthy();

    fireEvent.click(screen.getByTestId("toggle"));

    expect(screen.getByRole("button", { name: "Hide password" })).toBeTruthy();
  });

  it("reports visibility changes to the caller", () => {
    const onVisibilityChange = vi.fn();
    renderField({ onVisibilityChange });

    fireEvent.click(screen.getByTestId("toggle"));
    expect(onVisibilityChange).toHaveBeenCalledWith(true);
  });

  it("honors a controlled `visible` prop", () => {
    renderField({ visible: true });
    expect(screen.getByTestId("pw").getAttribute("type")).toBe("text");
  });

  it("re-masks the field when its form is submitted", () => {
    render(
      <form onSubmit={(e) => e.preventDefault()}>
        <PasswordToggleField>
          <PasswordToggleFieldInput testID="pw" />
          <PasswordToggleFieldToggle testID="toggle">
            <PasswordToggleFieldSlot visible={<span>hide</span>} hidden={<span>show</span>} />
          </PasswordToggleFieldToggle>
        </PasswordToggleField>
        <button type="submit">Sign in</button>
      </form>
    );

    fireEvent.click(screen.getByTestId("toggle"));
    expect(screen.getByTestId("pw").getAttribute("type")).toBe("text");

    fireEvent.submit(screen.getByRole("button", { name: "Sign in" }).closest("form")!);

    // The password must not survive the submit still legible on screen.
    expect(screen.getByTestId("pw").getAttribute("type")).toBe("password");
  });

  // Radix's own root is a context provider with no DOM node, and the toggle is
  // positioned `absolute`. Without a positioned wrapper the button resolves
  // against whatever positioned ancestor the consumer's page happens to have —
  // or the initial containing block — and lands nowhere near the field. The
  // assertions below are on the COMPUTED position with a real stylesheet
  // installed, not on class names: a class assertion would pass even if the
  // wrapper were removed, because the toggle's own `absolute` class never
  // changes. What matters is that a positioned ancestor exists.
  describe("containing block", () => {
    function withPositionCss() {
      const style = document.createElement("style");
      style.textContent =
        ".relative { position: relative; } .absolute { position: absolute; }";
      document.head.appendChild(style);
      return () => style.remove();
    }

    it("wraps the field in a positioned box so the toggle stays inside it", () => {
      const cleanup = withPositionCss();
      try {
        renderField({ testID: "field" });

        const wrapper = screen.getByTestId("field");
        const toggle = screen.getByTestId("toggle");

        expect(getComputedStyle(toggle).position).toBe("absolute");
        expect(getComputedStyle(wrapper).position).toBe("relative");
        expect(wrapper.contains(toggle)).toBe(true);
      } finally {
        cleanup();
      }
    });

    // happy-dom reports `""`, not `"static"`, for an element no rule targets,
    // so a naive `position !== "static"` walk matches the very first ancestor
    // and the assertion holds whether or not the wrapper is positioned —
    // vacuously green. Normalising here is what makes the walk mean something.
    function positionOf(el: HTMLElement) {
      return getComputedStyle(el).position || "static";
    }

    it("makes that wrapper the toggle's nearest positioned ancestor", () => {
      const cleanup = withPositionCss();
      try {
        renderField({ testID: "field" });

        const wrapper = screen.getByTestId("field");
        // Walk up from the toggle; the first positioned ancestor must be the
        // wrapper, not some outer element or the document body.
        let node: HTMLElement | null = screen.getByTestId("toggle")
          .parentElement;
        let nearestPositioned: HTMLElement | null = null;
        while (node && node !== document.documentElement) {
          if (positionOf(node) !== "static") {
            nearestPositioned = node;
            break;
          }
          node = node.parentElement;
        }

        expect(nearestPositioned).toBe(wrapper);
      } finally {
        cleanup();
      }
    });

    it("keeps the input inside the same box, so the two are laid out together", () => {
      renderField({ testID: "field" });
      const wrapper = screen.getByTestId("field");
      expect(wrapper.contains(screen.getByTestId("pw"))).toBe(true);
    });
  });

  it("defaults autoComplete to current-password so managers behave", () => {
    renderField();
    expect(screen.getByTestId("pw").getAttribute("autocomplete")).toBe(
      "current-password"
    );
  });

  it("lets a signup form ask for a new password instead", () => {
    render(
      <PasswordToggleField>
        <PasswordToggleFieldInput testID="pw" autoComplete="new-password" />
      </PasswordToggleField>
    );
    expect(screen.getByTestId("pw").getAttribute("autocomplete")).toBe(
      "new-password"
    );
  });
});
