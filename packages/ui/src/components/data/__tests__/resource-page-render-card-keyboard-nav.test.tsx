/**
 * ResourcePage — `renderCard` override, `gridCols` passthrough, and the
 * default-on `useKeyboardNavigation` wiring (genesis MASTER_PLAN item U7:
 * lets a consumer keep custom cards + j/k/Enter/⌫/x list navigation while
 * ResourcePage still owns data-fetching, filtering, and layout).
 */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { GenesisProvider } from "../../../provider";
import { ResourcePage, type ResourcePageProps } from "../ResourcePage";

interface Post {
  [key: string]: unknown;
  id: string;
  title: string;
}

const posts: Post[] = [
  { id: "1", title: "Hello" },
  { id: "2", title: "World" },
];

// Every test below shares the "posts" resource, and useViewPreference persists
// the active view mode to storage keyed by resource name — clear it between
// tests so an earlier test's grid/list/table pick can't leak into the next.
beforeEach(() => {
  localStorage.clear();
});

function renderPosts(extraProps: Partial<ResourcePageProps<Post>> = {}) {
  return render(
    <GenesisProvider mock={{ datasets: { posts } }}>
      <ResourcePage<Post>
        resource="posts"
        title="Posts"
        columns={["title"]}
        defaultView="grid"
        {...extraProps}
      />
    </GenesisProvider>,
  );
}

function pressKey(key: string, init: Record<string, unknown> = {}) {
  fireEvent.keyDown(document, { key, ...init });
}

/** Dispatches inside `act` and hands back the event, so a test can assert on
 *  `defaultPrevented` — i.e. whether the page swallowed the keystroke. */
function pressKeyReturningEvent(key: string): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
  });
  act(() => {
    document.dispatchEvent(event);
  });
  return event;
}

describe("ResourcePage — renderCard override", () => {
  it("uses the consumer's renderCard instead of the built-in card for every item", async () => {
    renderPosts({
      renderCard: (item, index) => (
        <div data-testid={`custom-card-${index}`}>Custom: {item.title}</div>
      ),
    });

    const card0 = await screen.findByTestId("custom-card-0");
    expect(card0.textContent).toContain("Custom: Hello");
    expect(screen.getByTestId("custom-card-1").textContent).toContain(
      "Custom: World",
    );
  });

  it("falls back to the built-in default card when renderCard is not given", async () => {
    renderPosts();
    expect(await screen.findByText("Hello")).toBeTruthy();
  });

  it("gives the custom card an `open` action that activates the row by pointer", async () => {
    // Regression: a custom card is rendered into a wrapper with no click
    // handler, so without `actions.open` it could only be opened by keyboard.
    renderPosts({
      renderCard: (item, _index, actions) => (
        <button type="button" onClick={actions.open}>
          open {item.title}
        </button>
      ),
    });

    fireEvent.click(await screen.findByText("open Hello"));

    expect(await screen.findByRole("dialog", { name: "Hello" })).toBeTruthy();
  });

  it("passes the resource actions through to the custom card alongside `open`", async () => {
    const seen: string[] = [];
    renderPosts({
      renderCard: (item, _index, actions) => {
        if (item.id === "1") {
          seen.push(
            ...["update", "remove", "refetch", "open"].filter(
              (k) => typeof (actions as Record<string, unknown>)[k] === "function",
            ),
          );
        }
        return <div>{item.title}</div>;
      },
    });

    await screen.findByText("Hello");
    expect(seen).toEqual(["update", "remove", "refetch", "open"]);
  });
});

describe("ResourcePage — gridCols", () => {
  it("passes gridCols through to the underlying DataGrid", async () => {
    const { container } = renderPosts({ gridCols: "grid-cols-5" });
    await screen.findByText("Hello");
    expect(container.querySelector(".grid-cols-5")).toBeTruthy();
  });

  it("falls back to DataGrid's own responsive default when gridCols is omitted", async () => {
    const { container } = renderPosts();
    await screen.findByText("Hello");
    // DataGrid's own default ramp — substring match sidesteps escaping the
    // colon in a `sm:` responsive class within a CSS selector.
    expect(container.querySelector('[class*="sm:grid-cols-2"]')).toBeTruthy();
  });
});

describe("ResourcePage — keyboard navigation (default-on)", () => {
  it("j focuses the next item and Enter opens its detail panel", async () => {
    renderPosts();
    await screen.findByText("Hello");
    expect(screen.queryByRole("dialog")).toBeNull();

    pressKey("j");
    pressKey("Enter");

    expect(await screen.findByRole("dialog", { name: "Hello" })).toBeTruthy();
  });

  it("Backspace closes an open detail view and is a no-op when nothing is open", async () => {
    renderPosts();
    await screen.findByText("Hello");

    // No-op when nothing is open — must not throw or otherwise misbehave.
    pressKey("Backspace");
    expect(screen.queryByRole("dialog")).toBeNull();

    pressKey("j");
    pressKey("Enter");
    expect(await screen.findByRole("dialog", { name: "Hello" })).toBeTruthy();

    pressKey("Backspace");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("x toggles the focused item's selection when bulkActions are configured", async () => {
    renderPosts({
      bulkActions: [{ label: "Delete", onAction: () => {} }],
    });
    await screen.findByText("Hello");

    expect(screen.queryByText(/selected/)).toBeNull();

    pressKey("j");
    pressKey("x");

    expect(await screen.findByText("1 selected")).toBeTruthy();
  });

  it("does not engage while table view is active (index can't map onto DataTable's own sort/pagination)", async () => {
    renderPosts({ defaultView: "table" });
    await screen.findByText("Hello");

    pressKey("j");
    pressKey("Enter");

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("keyboardNavigation={false} opts out of j/Enter/Backspace handling entirely", async () => {
    renderPosts({ keyboardNavigation: false });
    await screen.findByText("Hello");

    pressKey("j");
    pressKey("Enter");

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("does not drive the list behind an open detail panel", async () => {
    // Regression: the view is still grid while the panel is open, so cursor
    // keys stayed live — j/k moved the hidden list and Enter re-opened the
    // row instead of activating the focused control in the panel.
    renderPosts();
    await screen.findByText("Hello");

    pressKey("j");
    pressKey("Enter");
    expect(await screen.findByRole("dialog", { name: "Hello" })).toBeTruthy();

    // Move the cursor + re-activate: must not swap the panel to "World".
    pressKey("j");
    pressKey("Enter");

    expect(screen.getByRole("dialog", { name: "Hello" })).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: "World" })).toBeNull();
  });

  it("does not toggle bulk selection behind an open detail panel", async () => {
    renderPosts({
      bulkActions: [{ label: "Delete", onAction: () => {} }],
    });
    await screen.findByText("Hello");

    pressKey("j");
    pressKey("Enter");
    expect(await screen.findByRole("dialog", { name: "Hello" })).toBeTruthy();

    pressKey("x");
    expect(screen.queryByText(/selected/)).toBeNull();
  });

  it("ignores Ctrl/Cmd-modified keys so app shortcuts survive the upgrade", async () => {
    renderPosts();
    await screen.findByText("Hello");

    // A consumer page's Cmd+K palette / Ctrl+X cut must still reach the app.
    pressKey("k", { metaKey: true });
    pressKey("j", { ctrlKey: true });
    pressKey("Enter", { metaKey: true });

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("leaves Backspace to the browser when there is no open detail to close", async () => {
    renderPosts();
    await screen.findByText("Hello");

    expect(pressKeyReturningEvent("Backspace").defaultPrevented).toBe(false);
  });

  it("still intercepts Backspace while a detail panel is open", async () => {
    renderPosts();
    await screen.findByText("Hello");

    pressKey("j");
    pressKey("Enter");
    expect(await screen.findByRole("dialog", { name: "Hello" })).toBeTruthy();

    expect(pressKeyReturningEvent("Backspace").defaultPrevented).toBe(true);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it('leaves Backspace alone for detail="none", which never opens a detail', async () => {
    renderPosts({ detail: "none" });
    await screen.findByText("Hello");

    expect(pressKeyReturningEvent("Backspace").defaultPrevented).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Default card / list row are reachable by Tab, not just by pointer and cursor
// ---------------------------------------------------------------------------

describe("ResourcePage — default row activation (CMT-366-004)", () => {
  it("exposes the default card as a focusable button-role row", async () => {
    renderPosts();
    await screen.findByText("Hello");

    const card = screen.getByRole("button", { name: "Hello" });
    expect(card.getAttribute("tabindex")).toBe("0");
    expect(screen.getAllByTestId("resource-card")).toHaveLength(2);
  });

  it("opens the detail on Enter and Space when the card itself has focus", async () => {
    renderPosts();
    await screen.findByText("Hello");

    const card = screen.getByRole("button", { name: "Hello" });
    card.focus();
    fireEvent.keyDown(card, { key: "Enter" });

    expect(await screen.findByRole("dialog", { name: "Hello" })).toBeTruthy();

    // Space is the other activation key a role="button" owes its users.
    pressKey("Backspace");
    const second = screen.getByRole("button", { name: "World" });
    second.focus();
    fireEvent.keyDown(second, { key: " " });

    expect(await screen.findByRole("dialog", { name: "World" })).toBeTruthy();
  });

  it("does not let the list cursor double-fire against a focused card", async () => {
    // The Tab path and the j/k path both listen for Enter. The hook's
    // ownsItsKeys guard covers role="button", so the focused card wins and
    // the cursor's own row is not opened as well.
    renderPosts();
    await screen.findByText("Hello");

    pressKey("j"); // cursor -> "Hello"
    const second = screen.getByRole("button", { name: "World" });
    second.focus();
    fireEvent.keyDown(second, { key: "Enter" });

    expect(await screen.findByRole("dialog", { name: "World" })).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: "Hello" })).toBeNull();
  });

  it("gives the default list row the same treatment", async () => {
    renderPosts({ defaultView: "list" });
    await screen.findByText("Hello");

    const row = screen.getByRole("button", { name: "Hello" });
    expect(row.getAttribute("tabindex")).toBe("0");
    expect(screen.getAllByTestId("resource-list-row")).toHaveLength(2);

    row.focus();
    fireEvent.keyDown(row, { key: "Enter" });
    expect(await screen.findByRole("dialog", { name: "Hello" })).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Multi-column grids (CMT-366-002) — end to end through gridCols
// ---------------------------------------------------------------------------

describe("ResourcePage — keyboard navigation follows a multi-column grid", () => {
  const nine: Post[] = Array.from({ length: 9 }, (_, i) => ({
    id: String(i + 1),
    title: `Post ${i + 1}`,
  }));

  /**
   * Tailwind class names carry no CSS in the test DOM, so stand in the rule
   * `grid-cols-3` would generate. The hook measures the *resolved* track list
   * off the live container, exactly as it does in a browser — which is the
   * only thing that can be right across a responsive `sm:`/`lg:` ramp.
   */
  function withGridCss(): HTMLStyleElement {
    const style = document.createElement("style");
    style.textContent =
      ".grid-cols-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; }";
    document.head.appendChild(style);
    return style;
  }

  /** A 9-item ResourcePage in a 3-up grid — three full rows to step through. */
  function renderNine() {
    return render(
      <GenesisProvider mock={{ datasets: { posts: nine } }}>
        <ResourcePage<Post>
          resource="posts"
          title="Posts"
          columns={["title"]}
          defaultView="grid"
          gridCols="grid-cols-3"
        />
      </GenesisProvider>,
    );
  }

  it("moves ArrowDown a row down, not one card to the right", async () => {
    const style = withGridCss();
    renderNine();
    await screen.findByText("Post 1");

    pressKey("ArrowDown"); // -> index 0
    pressKey("ArrowDown"); // -> index 3, the card directly below
    pressKey("Enter");

    expect(await screen.findByRole("dialog", { name: "Post 4" })).toBeTruthy();

    document.head.removeChild(style);
  });

  it("moves ArrowRight one card along the row", async () => {
    const style = withGridCss();
    renderNine();
    await screen.findByText("Post 1");

    pressKey("ArrowDown"); // -> index 0
    pressKey("ArrowRight"); // -> index 1
    pressKey("Enter");

    expect(await screen.findByRole("dialog", { name: "Post 2" })).toBeTruthy();

    document.head.removeChild(style);
  });
});

// ---------------------------------------------------------------------------
// R2 — a default-on hook must not take page scrolling away
// ---------------------------------------------------------------------------

describe("ResourcePage — arrow keys still scroll the page", () => {
  it("leaves ArrowDown/ArrowUp alone on an empty resource", async () => {
    render(
      <GenesisProvider mock={{ datasets: { posts: [] } }}>
        <ResourcePage<Post>
          resource="posts"
          title="Posts"
          columns={["title"]}
          defaultView="grid"
        />
      </GenesisProvider>,
    );
    // Only a "the empty state has rendered" gate before the real assertions
    // below -- but it reads EmptyState's DEFAULT copy, so it moves whenever
    // that default moves. It did: the /data EmptyState convergence changed the
    // default from "No items found" to "No results found", deliberately (see
    // the note in components/data/EmptyState.tsx). This is the only test that
    // leans on the default; the empty-state tests all pass `message` explicitly.
    await screen.findByText("No results found");

    expect(pressKeyReturningEvent("ArrowDown").defaultPrevented).toBe(false);
    expect(pressKeyReturningEvent("ArrowUp").defaultPrevented).toBe(false);
  });

  it("leaves ArrowDown alone once the cursor is on the last item", async () => {
    renderPosts();
    await screen.findByText("Hello");

    expect(pressKeyReturningEvent("ArrowDown").defaultPrevented).toBe(true);
    expect(pressKeyReturningEvent("ArrowDown").defaultPrevented).toBe(true);
    // Nothing left to move to — the page gets its scroll back.
    expect(pressKeyReturningEvent("ArrowDown").defaultPrevented).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Interaction with #364's DetailPanel layouts (Radix Dialog / Sheet)
// ---------------------------------------------------------------------------

describe("ResourcePage — keyboard nav vs. the Radix detail shells", () => {
  it('suspends the cursor behind detail="modal" (DetailPanel dialog layout)', async () => {
    // #364 moved detail="modal" onto DetailPanel's Radix Dialog. #366's
    // overlay suspension was only ever exercised against the panel, so pin
    // the modal path too: neither PR could have caught this alone.
    renderPosts({ detail: "modal" });
    await screen.findByText("Hello");

    pressKey("j");
    pressKey("Enter");
    expect(await screen.findByRole("dialog", { name: "Hello" })).toBeTruthy();

    pressKey("j");
    pressKey("Enter");
    expect(screen.getByRole("dialog", { name: "Hello" })).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: "World" })).toBeNull();
  });

  it("leaves Escape to Radix, which still dismisses the dialog", async () => {
    renderPosts({ detail: "modal" });
    await screen.findByText("Hello");

    pressKey("j");
    pressKey("Enter");
    expect(await screen.findByRole("dialog", { name: "Hello" })).toBeTruthy();

    // Radix's DismissableLayer owns Escape. The hook must not consume it
    // (see the hook suite's defaultPrevented assertion) — end to end, the
    // dialog still closes itself and the focus trap unwinds.
    pressKey("Escape");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("closes the modal with Backspace and hands the list back", async () => {
    renderPosts({ detail: "modal" });
    await screen.findByText("Hello");

    pressKey("j");
    pressKey("Enter");
    expect(await screen.findByRole("dialog", { name: "Hello" })).toBeTruthy();

    pressKey("Backspace");
    expect(screen.queryByRole("dialog")).toBeNull();

    // Cursor is live again now that nothing covers the list.
    pressKey("j");
    pressKey("Enter");
    expect(await screen.findByRole("dialog", { name: "World" })).toBeTruthy();
  });

  it("does not steal Backspace from a composite control inside the panel", async () => {
    // A Radix Select's listbox, a tree, a canvas editor — all use Backspace
    // themselves; repurposing it as "close the panel" loses the key.
    renderPosts({
      detail: "panel",
      renderDetail: () => (
        <div role="listbox" aria-label="Tags">
          <div role="option" aria-selected="false" tabIndex={-1} data-testid="opt">
            Tag
          </div>
        </div>
      ),
    });
    await screen.findByText("Hello");

    pressKey("j");
    pressKey("Enter");
    expect(await screen.findByRole("dialog", { name: "Hello" })).toBeTruthy();

    const option = screen.getByTestId("opt");
    const event = new KeyboardEvent("keydown", {
      key: "Backspace",
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      option.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(false);
    expect(screen.getByRole("dialog", { name: "Hello" })).toBeTruthy();
  });
});
