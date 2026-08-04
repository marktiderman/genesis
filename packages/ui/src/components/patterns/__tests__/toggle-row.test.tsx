/**
 * ToggleRow / SettingsRow accessibility + automation-selector contract.
 *
 * These assertions exist because nothing they cover would fail a typecheck or
 * a build: a testID landing on the wrong node, or a description no screen
 * reader ever associates with the control, both compile and render perfectly.
 * Reviewers (PR #369) flagged exactly those, so they are pinned to the
 * rendered DOM here.
 *
 * Uses built-in vitest matchers only — this package does not ship
 * @testing-library/jest-dom.
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ToggleRow } from "../toggle-row";
import { SettingsRow } from "../settings-row";

describe("ToggleRow", () => {
  it("puts testID on the switch — the node automation must click — not the row", () => {
    render(
      <ToggleRow
        label="Email notifications"
        description="A daily summary every morning."
        testID="notify-switch"
      />
    );

    // The selected node must BE the control, not a wrapper containing it.
    expect(screen.getByTestId("notify-switch")).toBe(screen.getByRole("switch"));
  });

  it("keeps the row addressable separately via rowTestID", () => {
    render(<ToggleRow label="Email" testID="ctl" rowTestID="row" />);

    const row = screen.getByTestId("row");
    const control = screen.getByRole("switch");

    expect(row.getAttribute("data-slot")).toBe("settings-row");
    expect(row).not.toBe(control);
    expect(row.contains(control)).toBe(true);
  });

  it("associates the description with the switch via aria-describedby", () => {
    render(
      <ToggleRow
        label="Push notifications"
        description="This will notify all team members."
      />
    );

    const describedBy = screen.getByRole("switch").getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();

    // The referenced id must resolve to the real description text — a dangling
    // aria-describedby is worse than none at all.
    const description = document.getElementById(describedBy!);
    expect(description).not.toBeNull();
    expect(description!.textContent).toBe("This will notify all team members.");
  });

  it("omits aria-describedby when there is no description to point at", () => {
    render(<ToggleRow label="Standalone" />);
    expect(screen.getByRole("switch").hasAttribute("aria-describedby")).toBe(false);
  });

  it("wires the label to the switch so the accessible name is the label", () => {
    render(<ToggleRow label="Do not disturb" description="Silence alerts." />);

    // Resolves only if the htmlFor/id pair associates label with control.
    const control = screen.getByRole("switch", { name: "Do not disturb" });

    const label = document.querySelector("label");
    expect(label).not.toBeNull();
    expect(label!.getAttribute("for")).toBe(control.getAttribute("id"));
  });

  it("reports toggles through onCheckedChange", () => {
    const onCheckedChange = vi.fn();
    render(<ToggleRow label="Marketing emails" onCheckedChange={onCheckedChange} />);

    fireEvent.click(screen.getByRole("switch"));
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it("gives each instance distinct ids so rows in a list don't collide", () => {
    render(
      <>
        <ToggleRow label="First" description="One." testID="a" />
        <ToggleRow label="Second" description="Two." testID="b" />
      </>
    );

    const a = screen.getByTestId("a");
    const b = screen.getByTestId("b");

    expect(a.getAttribute("id")).not.toBe(b.getAttribute("id"));
    expect(a.getAttribute("aria-describedby")).not.toBe(
      b.getAttribute("aria-describedby")
    );
  });

  it("honors an explicit id instead of the generated one", () => {
    render(<ToggleRow label="Pinned" id="my-switch" testID="ctl" />);
    expect(screen.getByTestId("ctl").getAttribute("id")).toBe("my-switch");
  });

  it("disables the control when disabled", () => {
    render(<ToggleRow label="Beta features" disabled testID="ctl" />);
    expect(screen.getByTestId("ctl").hasAttribute("disabled")).toBe(true);
  });
});

describe("SettingsRow", () => {
  it("exposes descriptionId so a consumer-supplied control can describe itself", () => {
    // A button names itself from its content, so it takes no htmlFor — only
    // the description wiring, which is the prop under test here.
    render(
      <SettingsRow
        label="Password"
        description="Last changed 3 months ago."
        descriptionId="pw-desc"
      >
        <button aria-describedby="pw-desc" type="button">
          Change
        </button>
      </SettingsRow>
    );

    const description = document.getElementById("pw-desc");
    expect(description).not.toBeNull();
    expect(description!.textContent).toBe("Last changed 3 months ago.");
    expect(
      screen.getByRole("button", { name: "Change" }).getAttribute("aria-describedby")
    ).toBe("pw-desc");
  });

  it("wires htmlFor to a labelable control so the label names it", () => {
    render(
      <SettingsRow label="Display name" htmlFor="dn">
        <input id="dn" />
      </SettingsRow>
    );
    expect(screen.getByRole("textbox", { name: "Display name" })).toBeTruthy();
  });

  it("renders no description node when none is supplied", () => {
    const { container } = render(<SettingsRow label="Bare" />);
    expect(container.querySelector("p")).toBeNull();
  });
});

describe("SettingsRow — label element depends on htmlFor", () => {
  it("renders a real <label for> when htmlFor is supplied", () => {
    const { container } = render(
      <SettingsRow label="Display name" htmlFor="dn">
        <input id="dn" />
      </SettingsRow>
    );

    const label = container.querySelector("label");
    expect(label).not.toBeNull();
    expect(label!.getAttribute("for")).toBe("dn");
  });

  it("renders a span, NOT a label, when there is nothing to associate with", () => {
    // A <label> with no `for` and no nested control labels nothing — it looks
    // right and is an a11y no-op. Badge/Button rows hit this branch.
    const { container } = render(
      <SettingsRow label="Plan">
        <span>Pro</span>
      </SettingsRow>
    );

    expect(container.querySelector("label")).toBeNull();

    const text = container.querySelector('[data-slot="settings-row-label"]');
    expect(text).not.toBeNull();
    expect(text!.tagName).toBe("SPAN");
    expect(text!.textContent).toBe("Plan");
  });

  it("never emits a label element without a for attribute", () => {
    // The invariant behind both branches above, stated directly.
    const { container } = render(
      <>
        <SettingsRow label="With control" htmlFor="x">
          <input id="x" />
        </SettingsRow>
        <SettingsRow label="Badge row">
          <span>Pro</span>
        </SettingsRow>
        <SettingsRow label="No children at all" />
      </>
    );

    for (const label of Array.from(container.querySelectorAll("label"))) {
      expect(label.getAttribute("for")).toBeTruthy();
    }
  });

  it("keeps ToggleRow on the label path, since it always supplies htmlFor", () => {
    const { container } = render(<ToggleRow label="Email notifications" />);

    const label = container.querySelector("label");
    expect(label).not.toBeNull();
    expect(label!.getAttribute("for")).toBe(
      screen.getByRole("switch").getAttribute("id")
    );
  });
});
