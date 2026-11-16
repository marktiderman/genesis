/**
 * A list answers to its own width (docs/RESPONSIVE.md, rule 4), end to end: ResourceView measures
 * its frame (no box of its own), and with the app's narrow default its ResourcePage draws rows in a
 * narrow frame and a table in a wide one, on the same (desktop) viewport.
 */
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineResource } from "@marktiderman/genesis-core";
import { defineView } from "@marktiderman/genesis-core/resource-view";
import { GenesisProvider } from "../../../provider";
import { ResourceView, ResourceViewDefaultsProvider } from "../resource-view";

type Person = { id: string; name: string; email: string };

const people = defineResource<Person>()({
  name: "people",
  key: "id",
  labelField: "name",
  fields: [
    { name: "id", type: "string", hasDefault: true },
    { name: "name", type: "string" },
    { name: "email", type: "string" },
  ],
});
const view = defineView(people, { columns: { default: ["name", "email"] } });

let width = 0;
// Every observer on the page (tables and pagers use their own too), fired together on a resize.
const observers: (() => void)[] = [];
const observed = () => observers.forEach((fire) => fire());
class FakeResizeObserver {
  constructor(cb: (entries: { target: Element }[]) => void) {
    observers.push(() => this.el && cb([{ target: this.el }]));
  }
  el: Element | undefined;
  observe(el: Element) {
    this.el = el;
  }
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  observers.length = 0;
  localStorage.clear();
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  // The frame (display: contents) has no box: it measures 0, so only measuring the list's own root
  // inside it can switch the list.
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(function (this: HTMLElement) {
    return this.getAttribute("data-slot") === "resource-view-frame" ? 0 : width;
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function renderList() {
  return render(
    <GenesisProvider mock={{ datasets: { people: [{ id: "1", name: "Ada Lovelace", email: "ada@acme.example" }] } }}>
      <ResourceViewDefaultsProvider phoneMode="list">
        <ResourceView view={view} layout="embedded" />
      </ResourceViewDefaultsProvider>
    </GenesisProvider>,
  );
}

describe("ResourceView in a narrow frame", () => {
  it("adds no box: the frame is display: contents, inline", () => {
    width = 1000;
    const { container } = renderList();
    expect((container.querySelector('[data-slot="resource-view-frame"]') as HTMLElement).style.display).toBe("contents");
  });

  it("draws rows in a 360px frame on a desktop viewport", async () => {
    width = 360;
    const { container } = renderList();
    await waitFor(() => expect(screen.getAllByTestId("resource-list-row").length).toBe(1));
    expect(container.querySelector("table")).toBeNull();
  });

  it("draws a table in a wide frame, and turns to rows when the frame narrows", async () => {
    width = 1000;
    const { container } = renderList();
    await waitFor(() => expect(container.querySelector("table")).not.toBeNull());
    width = 360;
    act(() => observed());
    await waitFor(() => expect(screen.getAllByTestId("resource-list-row").length).toBe(1));
  });
});
