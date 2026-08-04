/**
 * Tabs — the WAI-ARIA tabs pattern, now supplied by Radix.
 *
 * What the hand-rolled version was: a React context and a row of plain
 * `<button>`s. Selection worked; everything a keyboard or screen-reader user
 * needs did not. There were no `tablist`/`tab`/`tabpanel` roles, no
 * `aria-selected`, no `aria-controls`/`aria-labelledby` pairing, every trigger
 * was its own tab stop, and Arrow/Home/End did nothing.
 *
 * These tests are deliberately about that gap rather than about markup for its
 * own sake — each one fails against the pre-Radix implementation.
 *
 * Note on timing: Radix's roving-focus group moves focus inside a `setTimeout`,
 * so every arrow-key assertion has to be awaited.
 */
import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../tabs";

function renderTabs(props?: { onValueChange?: (value: string) => void }) {
  return render(
    <Tabs defaultValue="account" {...props}>
      <TabsList>
        <TabsTrigger value="account">Account</TabsTrigger>
        <TabsTrigger value="password">Password</TabsTrigger>
        <TabsTrigger value="team">Team</TabsTrigger>
      </TabsList>
      <TabsContent value="account">Account panel</TabsContent>
      <TabsContent value="password">Password panel</TabsContent>
      <TabsContent value="team">Team panel</TabsContent>
    </Tabs>
  );
}

function tabs() {
  return screen.getAllByRole("tab");
}

function focus(el: HTMLElement) {
  act(() => {
    el.focus();
  });
}

describe("Tabs — keyboard navigation", () => {
  it("moves to the next trigger on ArrowRight", async () => {
    renderTabs();
    const [account, password] = tabs();

    focus(account);
    fireEvent.keyDown(account, { key: "ArrowRight" });

    await waitFor(() => expect(document.activeElement).toBe(password));
  });

  it("moves back on ArrowLeft", async () => {
    renderTabs();
    const [account, password] = tabs();

    focus(password);
    fireEvent.keyDown(password, { key: "ArrowLeft" });

    await waitFor(() => expect(document.activeElement).toBe(account));
  });

  it("jumps to the first and last trigger on Home / End", async () => {
    renderTabs();
    const [account, password, team] = tabs();

    focus(password);
    fireEvent.keyDown(password, { key: "End" });
    await waitFor(() => expect(document.activeElement).toBe(team));

    fireEvent.keyDown(team, { key: "Home" });
    await waitFor(() => expect(document.activeElement).toBe(account));
  });

  it("wraps around at the end of the tablist", async () => {
    renderTabs();
    const [account, , team] = tabs();

    focus(team);
    fireEvent.keyDown(team, { key: "ArrowRight" });

    await waitFor(() => expect(document.activeElement).toBe(account));
  });

  it("selects the tab arrowed onto (automatic activation)", async () => {
    const onValueChange = vi.fn();
    renderTabs({ onValueChange });
    const [account, password] = tabs();

    focus(account);
    fireEvent.keyDown(account, { key: "ArrowRight" });

    await waitFor(() => expect(password.getAttribute("aria-selected")).toBe("true"));
    expect(onValueChange).toHaveBeenCalledWith("password");
    expect(screen.getByText("Password panel")).toBeTruthy();
  });

  it("is a single tab stop — only the active trigger is tabbable", () => {
    renderTabs();
    const [account, password, team] = tabs();

    // Roving tabindex: Tab reaches the tablist once, arrows move within it.
    // The pre-Radix version made every trigger its own tab stop.
    expect(account.getAttribute("tabindex")).toBe("-1");
    expect(password.getAttribute("tabindex")).toBe("-1");
    expect(team.getAttribute("tabindex")).toBe("-1");
    expect(screen.getByRole("tablist").getAttribute("tabindex")).toBe("0");

    focus(account);
    expect(account.getAttribute("tabindex")).toBe("0");
    expect(password.getAttribute("tabindex")).toBe("-1");
  });

  it("skips a disabled trigger", async () => {
    render(
      <Tabs defaultValue="active">
        <TabsList>
          <TabsTrigger value="active">Active</TabsTrigger>
          <TabsTrigger value="locked" disabled>
            Locked
          </TabsTrigger>
          <TabsTrigger value="other">Other</TabsTrigger>
        </TabsList>
        <TabsContent value="active">Active panel</TabsContent>
        <TabsContent value="other">Other panel</TabsContent>
      </Tabs>
    );
    const [active, , other] = tabs();

    focus(active);
    fireEvent.keyDown(active, { key: "ArrowRight" });

    await waitFor(() => expect(document.activeElement).toBe(other));
  });
});

describe("Tabs — ARIA wiring", () => {
  it("gives the list, triggers and panels their roles", () => {
    renderTabs();
    expect(screen.getByRole("tablist")).toBeTruthy();
    expect(tabs()).toHaveLength(3);
    expect(screen.getAllByRole("tabpanel")).toHaveLength(1);
  });

  it("pairs each trigger with the panel it controls", () => {
    renderTabs();
    const [account] = tabs();
    const panel = screen.getByRole("tabpanel");

    expect(account.getAttribute("aria-controls")).toBe(panel.getAttribute("id"));
    expect(panel.getAttribute("aria-labelledby")).toBe(account.getAttribute("id"));
  });

  it("announces which tab is selected", () => {
    renderTabs();
    const [account, password] = tabs();
    expect(account.getAttribute("aria-selected")).toBe("true");
    expect(password.getAttribute("aria-selected")).toBe("false");
  });
});

describe("Tabs — selection", () => {
  it("shows the defaultValue panel and only that panel", () => {
    renderTabs();
    expect(screen.getByText("Account panel")).toBeTruthy();
    expect(screen.queryByText("Password panel")).toBeNull();
  });

  it("switches panels on pointer activation", () => {
    renderTabs();
    // Radix selects on `mousedown`, not `click`, so the panel is already
    // swapped by the time the button releases. A synthetic `fireEvent.click`
    // no longer selects on its own — see the changeset note.
    fireEvent.mouseDown(tabs()[1], { button: 0 });
    expect(screen.getByText("Password panel")).toBeTruthy();
    expect(screen.queryByText("Account panel")).toBeNull();
  });

  it("switches panels on Enter and Space", () => {
    renderTabs();
    const [, password, team] = tabs();

    fireEvent.keyDown(password, { key: "Enter" });
    expect(screen.getByText("Password panel")).toBeTruthy();

    fireEvent.keyDown(team, { key: " " });
    expect(screen.getByText("Team panel")).toBeTruthy();
  });

  it("honours a controlled value + onValueChange", () => {
    const onValueChange = vi.fn();
    render(
      <Tabs defaultValue="account" value="team" onValueChange={onValueChange}>
        <TabsList>
          <TabsTrigger value="account">Account</TabsTrigger>
          <TabsTrigger value="team">Team</TabsTrigger>
        </TabsList>
        <TabsContent value="account">Account panel</TabsContent>
        <TabsContent value="team">Team panel</TabsContent>
      </Tabs>
    );

    expect(screen.getByText("Team panel")).toBeTruthy();
    fireEvent.mouseDown(tabs()[0], { button: 0 });
    // Controlled: the parent decides, so the panel does not move on its own.
    expect(onValueChange).toHaveBeenCalledWith("account");
    expect(screen.getByText("Team panel")).toBeTruthy();
  });
});

describe("Tabs — styling contract", () => {
  it("keeps the caller className and the active styling", () => {
    renderTabs();
    const [account, password] = tabs();

    // Active styling is now keyed off data-state rather than a JS boolean, so
    // the same utilities ship on every trigger and the attribute decides.
    expect(account.getAttribute("data-state")).toBe("active");
    expect(password.getAttribute("data-state")).toBe("inactive");
    const classes = account.className.split(/\s+/);
    expect(classes).toContain("data-[state=active]:bg-background");
    expect(classes).toContain("rounded-sm");
  });

  it("merges className on the root, list and content", () => {
    render(
      <Tabs defaultValue="a" className="root-extra">
        <TabsList className="list-extra">
          <TabsTrigger value="a" className="trigger-extra">
            A
          </TabsTrigger>
        </TabsList>
        <TabsContent value="a" className="content-extra">
          Panel A
        </TabsContent>
      </Tabs>
    );

    expect(screen.getByRole("tablist").classList.contains("list-extra")).toBe(true);
    expect(screen.getByRole("tablist").classList.contains("bg-muted")).toBe(true);
    expect(screen.getByRole("tab").classList.contains("trigger-extra")).toBe(true);
    const panel = screen.getByRole("tabpanel");
    expect(panel.classList.contains("content-extra")).toBe(true);
    expect(panel.classList.contains("mt-2")).toBe(true);
    expect(
      panel.closest(".root-extra")?.classList.contains("w-full")
    ).toBe(true);
  });
});
