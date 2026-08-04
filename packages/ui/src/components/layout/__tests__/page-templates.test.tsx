/**
 * Page template behaviour contract (FRAMEWORK.md step 8, layout half).
 *
 * These four templates are assembly, so what is worth pinning is the
 * assembly: which regions exist, in what DOM order, which primitive backs
 * each one, and what a layout prop actually changes. A template that
 * silently stops rendering its sidebar, or renders the stat row below the
 * charts, still type-checks and still builds — this suite is the thing that
 * notices.
 *
 * Two assertions here are load-bearing rather than incidental:
 *   - `DetailPage`'s sidebar collapse. It lives entirely in responsive
 *     prefixes, which happy-dom never evaluates, so the honest test is that
 *     the prefixed classes are present, paired with the requested
 *     breakpoint, and that the UNPREFIXED grid classes are absent — an
 *     unprefixed `grid` would put the sidebar beside the content at every
 *     width, which is the bug.
 *   - `FormPage`'s action bar stickiness, for the same reason: `position:
 *     sticky` is a class, and nothing else in the toolchain reads it.
 *
 * Uses built-in vitest matchers only — this package does not ship
 * @testing-library/jest-dom.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DetailPage } from "../detail-page";
import { FormPage } from "../form-page";
import { DashboardPage } from "../dashboard-page";
import { SettingsPage } from "../settings-page";

/** Every template tags its regions so consumers/tests can find them. */
const slot = (container: HTMLElement, name: string) =>
  container.querySelector<HTMLElement>(`[data-slot="${name}"]`);

const slotOrThrow = (container: HTMLElement, name: string) => {
  const el = slot(container, name);
  if (!el) throw new Error(`no [data-slot="${name}"] in the rendered tree`);
  return el;
};

describe("DetailPage", () => {
  it("renders title, subtitle, breadcrumb and actions in the header", () => {
    const { container } = render(
      <DetailPage
        title="Ada Lovelace"
        subtitle="Principal engineer"
        breadcrumb={<span>People /</span>}
        actions={<button type="button">Edit</button>}
      >
        <p>body</p>
      </DetailPage>
    );

    const header = slotOrThrow(container, "detail-page-header");
    expect(header.tagName).toBe("HEADER");
    expect(slotOrThrow(container, "detail-page-title").tagName).toBe("H1");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "Ada Lovelace"
    );
    expect(slotOrThrow(container, "detail-page-subtitle").textContent).toBe(
      "Principal engineer"
    );
    expect(slotOrThrow(container, "detail-page-breadcrumb").textContent).toBe(
      "People /"
    );
    expect(slotOrThrow(container, "detail-page-actions").textContent).toBe(
      "Edit"
    );
  });

  it("omits the optional header regions entirely when they are not passed", () => {
    // Rendering an empty <div> for an absent slot leaves a gap-producing
    // flex child behind, which is why these are conditional rather than
    // always-rendered-but-empty.
    const { container } = render(<DetailPage title="Bare">body</DetailPage>);

    expect(slot(container, "detail-page-subtitle")).toBe(null);
    expect(slot(container, "detail-page-breadcrumb")).toBe(null);
    expect(slot(container, "detail-page-actions")).toBe(null);
  });

  it("puts the sidebar in a Split, content first, metadata second", () => {
    const { container } = render(
      <DetailPage title="Ada" sidebar={<dl>meta</dl>}>
        <p>body</p>
      </DetailPage>
    );

    const split = slotOrThrow(container, "split");
    expect(split.children[0].getAttribute("data-slot")).toBe("split-start");
    expect(split.children[1].getAttribute("data-slot")).toBe("split-end");

    // Content leads in the DOM, so a screen reader and a phone both get the
    // record before its provenance.
    expect(
      slotOrThrow(container, "split-start").querySelector(
        '[data-slot="detail-page-content"]'
      )
    ).not.toBe(null);

    const sidebar = slotOrThrow(container, "detail-page-sidebar");
    expect(sidebar.tagName).toBe("ASIDE");
    expect(sidebar.closest('[data-slot="split-end"]')).not.toBe(null);
  });

  it("collapses the sidebar below its breakpoint and only there", () => {
    const { container } = render(
      <DetailPage title="Ada" sidebar={<dl>meta</dl>}>
        body
      </DetailPage>
    );

    const split = slotOrThrow(container, "split");
    // Default breakpoint is lg: stacked below it, side by side at and above.
    expect(split.className).toContain("flex-col");
    expect(split.className).toContain("lg:grid");
    expect(split.className).toContain("lg:grid-cols-12");

    // Unprefixed grid classes would put the sidebar beside the content at
    // every width, which is exactly the collapse this template promises.
    expect(split.className.split(/\s+/)).not.toContain("grid");
    expect(split.className.split(/\s+/)).not.toContain("grid-cols-12");

    // 2/3 ratio: eight tracks of content, four of metadata.
    expect(slotOrThrow(container, "split-start").className).toContain(
      "lg:col-span-8"
    );
    expect(slotOrThrow(container, "split-end").className).toContain(
      "lg:col-span-4"
    );
  });

  it("moves the collapse to the requested breakpoint", () => {
    const { container } = render(
      <DetailPage title="Ada" sidebarAt="sm" sidebar={<dl>meta</dl>}>
        body
      </DetailPage>
    );

    const split = slotOrThrow(container, "split");
    expect(split.className).toContain("sm:grid-cols-12");
    expect(split.className).not.toContain("lg:grid");
    expect(slotOrThrow(container, "split-start").className).toContain(
      "sm:col-span-8"
    );
  });

  it("skips the Split entirely when there is no sidebar", () => {
    // An empty four-track column is worse than no column: it eats a third of
    // the width and shows nothing.
    const { container } = render(<DetailPage title="Ada">body</DetailPage>);

    expect(slot(container, "split")).toBe(null);
    expect(slotOrThrow(container, "detail-page-content").textContent).toBe(
      "body"
    );
  });

  it("forwards a ref and merges className onto the root", () => {
    let node: HTMLDivElement | null = null;
    const { container } = render(
      <DetailPage
        ref={(el) => {
          node = el;
        }}
        className="pb-24"
        testID="detail"
        title="Ada"
      >
        body
      </DetailPage>
    );

    expect(node).toBe(screen.getByTestId("detail"));
    expect(slotOrThrow(container, "detail-page").className).toContain("pb-24");
    expect(slotOrThrow(container, "detail-page").className).toContain(
      "flex-col"
    );
  });
});

describe("FormPage", () => {
  it("renders a real form element and forwards submit", () => {
    // The point of being a <form>: a plain type="submit" in `actions`
    // submits it, with no `form=` attribute wiring at the call site.
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
    const { container } = render(
      <FormPage
        title="New engagement"
        onSubmit={onSubmit}
        actions={<button type="submit">Save</button>}
      >
        <input name="x" />
      </FormPage>
    );

    const form = slotOrThrow(container, "form-page");
    expect(form.tagName).toBe("FORM");

    screen.getByText("Save").click();
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("sticks the action bar to the bottom of the scroll container", () => {
    const { container } = render(
      <FormPage title="New engagement" actions={<button type="submit">Save</button>}>
        fields
      </FormPage>
    );

    const bar = slotOrThrow(container, "form-page-actions");
    const classes = bar.className.split(/\s+/);
    expect(classes).toContain("sticky");
    expect(classes).toContain("bottom-0");
    // Without a stacking context the bar renders under the fields it
    // overlaps, and without a background it renders on top of them.
    expect(classes).toContain("z-10");
    expect(classes).toContain("bg-background");
    expect(classes).toContain("border-t");
    expect(bar.textContent).toBe("Save");
  });

  it("renders no action bar at all when there are no actions", () => {
    // An empty sticky strip is a border floating over the content.
    const { container } = render(<FormPage title="Read only">fields</FormPage>);
    expect(slot(container, "form-page-actions")).toBe(null);
  });

  it("announces the validation summary and puts it above the fields", () => {
    const { container } = render(
      <FormPage title="New engagement" errors={<span>Fix 2 fields.</span>}>
        <input name="x" />
      </FormPage>
    );

    const summary = slotOrThrow(container, "form-page-errors");
    // role="alert" comes from Alert — a summary a screen reader never hears
    // is decoration.
    expect(summary.getAttribute("role")).toBe("alert");
    expect(summary.textContent).toContain("Fix 2 fields.");

    const body = slotOrThrow(container, "form-page-body");
    expect(
      summary.compareDocumentPosition(body) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it("omits the summary region when there are no errors", () => {
    const { container } = render(<FormPage title="Clean">fields</FormPage>);
    expect(slot(container, "form-page-errors")).toBe(null);
  });

  it("titles the page with a single h1 and forwards a ref to the form", () => {
    let node: HTMLFormElement | null = null;
    render(
      <FormPage
        ref={(el) => {
          node = el;
        }}
        testID="form"
        title="New engagement"
        description="Both parties are notified."
      >
        fields
      </FormPage>
    );

    expect(node).toBe(screen.getByTestId("form"));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "New engagement"
    );
    expect(screen.getByText("Both parties are notified.")).toBeDefined();
  });
});

describe("DashboardPage", () => {
  it("lays the stat row out in a Grid above the free-form region", () => {
    const { container } = render(
      <DashboardPage title="This quarter" stats={<div>tile</div>}>
        <section>chart</section>
      </DashboardPage>
    );

    const grid = slotOrThrow(container, "grid");
    const body = slotOrThrow(container, "dashboard-page-body");
    expect(grid.textContent).toBe("tile");
    expect(body.textContent).toBe("chart");
    expect(
      grid.compareDocumentPosition(body) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it("defaults the stat row to four across and ramps it down for small screens", () => {
    const { container } = render(
      <DashboardPage title="Q" stats={<div>tile</div>}>
        body
      </DashboardPage>
    );

    const grid = slotOrThrow(container, "grid");
    expect(grid.className).toContain("grid-cols-1");
    expect(grid.className).toContain("sm:grid-cols-2");
    expect(grid.className).toContain("lg:grid-cols-4");
  });

  it("takes the tile count from statColumns", () => {
    const { container } = render(
      <DashboardPage title="Q" statColumns={6} stats={<div>tile</div>}>
        body
      </DashboardPage>
    );

    const grid = slotOrThrow(container, "grid");
    expect(grid.className).toContain("lg:grid-cols-6");
    // Six-up is Grid's tile ramp: two across on a phone, not one.
    expect(grid.className).toContain("grid-cols-2");
  });

  it("renders no grid when there are no stats", () => {
    const { container } = render(
      <DashboardPage title="Q">
        <section>chart</section>
      </DashboardPage>
    );

    expect(slot(container, "grid")).toBe(null);
    expect(slotOrThrow(container, "dashboard-page-body").textContent).toBe(
      "chart"
    );
  });

  it("renders the header with a single h1 and forwards a ref", () => {
    let node: HTMLDivElement | null = null;
    const { container } = render(
      <DashboardPage
        ref={(el) => {
          node = el;
        }}
        testID="dash"
        title="This quarter"
        subtitle="1 Apr – 30 Jun"
        actions={<button type="button">Export</button>}
      >
        body
      </DashboardPage>
    );

    expect(node).toBe(screen.getByTestId("dash"));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "This quarter"
    );
    expect(slotOrThrow(container, "dashboard-page-subtitle").textContent).toBe(
      "1 Apr – 30 Jun"
    );
    expect(slotOrThrow(container, "dashboard-page-actions").textContent).toBe(
      "Export"
    );
  });
});

const SECTIONS = [
  { id: "profile", title: "Profile", content: <p>profile rows</p> },
  {
    id: "notifications",
    title: "Notifications",
    description: "How and when we contact you.",
    content: <p>notification rows</p>,
  },
];

describe("SettingsPage", () => {
  it("renders one landmark section per entry, anchored by its id", () => {
    const { container } = render(
      <SettingsPage title="Settings" sections={SECTIONS} />
    );

    const sections = container.querySelectorAll('[data-slot="section"]');
    expect(sections.length).toBe(2);
    expect(sections[0].id).toBe("profile");
    expect(sections[1].id).toBe("notifications");

    // Section names each region by its own heading; that association is what
    // makes the rail's promise ("jump to Notifications") true for a screen
    // reader too.
    for (const section of Array.from(sections)) {
      const labelledBy = section.getAttribute("aria-labelledby");
      expect(labelledBy).toBeTruthy();
      expect(section.querySelector(`#${labelledBy}`)).not.toBe(null);
    }
    expect(screen.getByText("How and when we contact you.")).toBeDefined();
  });

  it("builds the nav rail from the same section list, linking to the fragments", () => {
    const { container } = render(
      <SettingsPage title="Settings" sections={SECTIONS} />
    );

    const nav = slotOrThrow(container, "settings-page-nav");
    expect(nav.tagName).toBe("NAV");
    expect(nav.getAttribute("aria-label")).toBe("Settings sections");

    const links = Array.from(nav.querySelectorAll("a"));
    expect(links.map((a) => a.getAttribute("href"))).toEqual([
      "#profile",
      "#notifications",
    ]);
    // One `title` per entry drives the rail and the heading, so the two
    // cannot disagree.
    expect(links.map((a) => a.textContent)).toEqual([
      "Profile",
      "Notifications",
    ]);
  });

  it("sticks the rail without a breakpoint prefix, which is right in both modes", () => {
    // Side by side the rail is a stretched grid item and sticks for the
    // length of the sections; stacked, its pane is exactly its own height so
    // sticky has nothing to travel. One class, correct twice.
    const { container } = render(
      <SettingsPage title="Settings" sections={SECTIONS} />
    );

    const classes = slotOrThrow(container, "settings-page-nav").className.split(
      /\s+/
    );
    expect(classes).toContain("sticky");
    expect(classes).toContain("top-6");
  });

  it("puts the rail beside the sections above the breakpoint and stacks below it", () => {
    const { container } = render(
      <SettingsPage title="Settings" navAt="lg" sections={SECTIONS} />
    );

    const split = slotOrThrow(container, "split");
    expect(split.className).toContain("flex-col");
    expect(split.className).toContain("lg:grid-cols-12");
    expect(split.className.split(/\s+/)).not.toContain("grid");
    // 1/3 ratio: a narrow rail, wide panels.
    expect(slotOrThrow(container, "split-start").className).toContain(
      "lg:col-span-4"
    );
    expect(slotOrThrow(container, "split-end").className).toContain(
      "lg:col-span-8"
    );
  });

  it("drops the rail for a single section instead of linking to where you already are", () => {
    const { container } = render(
      <SettingsPage title="Settings" sections={[SECTIONS[0]]} />
    );

    expect(slot(container, "settings-page-nav")).toBe(null);
    expect(slot(container, "split")).toBe(null);
    // The section itself still renders, full width.
    expect(container.querySelectorAll('[data-slot="section"]').length).toBe(1);
    expect(slotOrThrow(container, "settings-page-sections").textContent).toBe(
      "Profileprofile rows"
    );
  });

  it("renders the page header with a single h1 and forwards a ref", () => {
    let node: HTMLDivElement | null = null;
    const { container } = render(
      <SettingsPage
        ref={(el) => {
          node = el;
        }}
        testID="settings"
        title="Workspace settings"
        description="Applies to everyone."
        actions={<button type="button">Save all</button>}
        sections={SECTIONS}
      />
    );

    expect(node).toBe(screen.getByTestId("settings"));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "Workspace settings"
    );
    expect(slotOrThrow(container, "settings-page-description").textContent).toBe(
      "Applies to everyone."
    );
    expect(slotOrThrow(container, "settings-page-actions").textContent).toBe(
      "Save all"
    );
  });
});
