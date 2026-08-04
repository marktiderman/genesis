/**
 * Layout tier behaviour contract (FRAMEWORK.md step 7).
 *
 * These are structure assertions, not snapshots. A layout primitive's whole
 * job is the class string it emits and the element it emits it on, so that
 * is what is pinned here: swap `flex-col` for `flex-row` in `Stack` and
 * nothing in the type system or the build notices — this suite does.
 *
 * The `Split` block is the load-bearing one. Its stacking behaviour lives
 * entirely in responsive prefixes, which jsdom/happy-dom never evaluate, so
 * the only honest way to test it is to assert the prefixed classes are
 * present and correctly paired with the requested breakpoint.
 *
 * Uses built-in vitest matchers only — this package does not ship
 * @testing-library/jest-dom.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Stack } from "../stack";
import { Grid } from "../grid";
import { Split } from "../split";
import { Section } from "../section";
import { Container } from "../container";
import { GAP_CLASSES, spaceScale, type SpaceToken } from "../spacing";

// The REAL native definitions, read straight out of packages/ui-native.
//
// This import is the whole point of the parity block below. An earlier
// version compared the web scale against a second hard-coded web-side list,
// which cannot observe the other surface at all: native could rename,
// re-value or drop a token and both suites would stay green while `gap`
// silently diverged — a test named "parity" that converts an open question
// into false confidence.
//
// Reaching across the package boundary is safe HERE and only here: both
// native modules are import-free (no `react-native`, no NativeWind — pure
// TS token tables), this is a test file so it is excluded from the tsup
// entries and never ships, and `packages/ui` gains no dependency on
// `packages/ui-native` at build or runtime. If either native module ever
// grows a runtime import, the honest fix is to hoist the scale into
// `genesis-design-system`, which both already depend on.
import {
  spaceScale as nativeSpaceScale,
  spacingClass as nativeSpacingClass,
} from "../../../../../ui-native/src/components/layout/spacing";
import {
  alignClasses as nativeAlignClasses,
  justifyClasses as nativeJustifyClasses,
} from "../../../../../ui-native/src/components/layout/flex";

/** Every layout primitive tags its root so consumers/tests can find it. */
const slot = (container: HTMLElement, name: string) =>
  container.querySelector<HTMLElement>(`[data-slot="${name}"]`)!;

/** Read a CVA variant map off a rendered Stack, by probing every key. */
function classFor(prop: "align" | "justify", value: string): string {
  const { container, unmount } = render(
    // Cast: the point of these tests is to probe the union at runtime.
    <Stack {...({ [prop]: value } as Record<string, string>)} />
  );
  const classes = slot(container, "stack").className.split(/\s+/);
  unmount();
  const prefix = prop === "align" ? "items-" : "justify-";
  return classes.find((c) => c.startsWith(prefix)) ?? "";
}

describe("cross-surface parity with @marktiderman/genesis-ui-native", () => {
  it("takes its spacing steps from the native spaceScale, value for value", () => {
    // Reads native's own table. Change a token on the native side and this
    // fails — which is the only version of this assertion worth having.
    expect(spaceScale).toEqual(nativeSpaceScale);
  });

  it("resolves every step to the same class the native spacingClass() does", () => {
    // Equal scales but different class tables would still diverge: it is the
    // emitted utility, not the px number, that lays out the page.
    for (const token of Object.keys(nativeSpaceScale) as SpaceToken[]) {
      expect(GAP_CLASSES[token]).toBe(nativeSpacingClass("gap", token));
    }
  });

  it("keeps every gap class on the 4px grid its token declares", () => {
    // Native enforces this at call time inside `spacingClass()`; web resolves
    // the map directly in CVA, so the invariant is pinned here too. Guards
    // the case where BOTH surfaces drift together.
    for (const [token, px] of Object.entries(spaceScale) as Array<
      [SpaceToken, number]
    >) {
      expect(GAP_CLASSES[token]).toBe(`gap-${px / 4}`);
    }
  });

  it("accepts exactly the native FlexAlign vocabulary, and maps it identically", () => {
    // Web flexbox also has `baseline`; native's Yoga vocabulary does not, so
    // Stack does not offer it. Reach it through className if you need it.
    for (const [value, cls] of Object.entries(nativeAlignClasses)) {
      expect(classFor("align", value)).toBe(cls);
    }
    expect(classFor("align", "baseline")).toBe("");
  });

  it("accepts exactly the native FlexJustify vocabulary, and maps it identically", () => {
    // Likewise `space-evenly`: web-only, so not offered.
    for (const [value, cls] of Object.entries(nativeJustifyClasses)) {
      expect(classFor("justify", value)).toBe(cls);
    }
    expect(classFor("justify", "evenly")).toBe("");
  });
});

describe("Stack", () => {
  it("renders its children inside a flex column by default", () => {
    const { container } = render(
      <Stack>
        <span>one</span>
        <span>two</span>
      </Stack>
    );

    const root = slot(container, "stack");
    expect(root.className).toContain("flex");
    expect(root.className).toContain("flex-col");
    expect(root.className).toContain("gap-3"); // md === 12px
    expect(root.children.length).toBe(2);
    expect(root.textContent).toBe("onetwo");
  });

  it("maps direction, align, justify and wrap onto flex utilities", () => {
    const { container } = render(
      <Stack direction="row" align="center" justify="between" wrap>
        <span>x</span>
      </Stack>
    );

    const className = slot(container, "stack").className;
    expect(className).toContain("flex-row");
    expect(className).toContain("items-center");
    expect(className).toContain("justify-between");
    expect(className).toContain("flex-wrap");
  });

  it("emits nothing for the flexbox defaults it does not need to state", () => {
    // Defaulting align/justify/wrap would put the browser's own initial
    // values into the DOM on every Stack ever rendered, and beat a
    // consumer's own alignment classes for anyone not going through cn().
    const { container } = render(<Stack wrap={false} />);
    const className = slot(container, "stack").className;

    expect(className).not.toContain("items-");
    expect(className).not.toContain("justify-");
    expect(className).not.toContain("flex-nowrap");
  });

  it("takes gap from the shared scale, never a raw value", () => {
    const { container } = render(
      <>
        <Stack gap="none" testID="none" />
        <Stack gap="xs" testID="xs" />
        <Stack gap="3xl" testID="3xl" />
      </>
    );

    expect(screen.getByTestId("none").className).toContain("gap-0");
    expect(screen.getByTestId("xs").className).toContain("gap-1");
    expect(screen.getByTestId("3xl").className).toContain("gap-12");
    expect(container.querySelectorAll('[data-slot="stack"]').length).toBe(3);
  });

  it("merges className over the variant classes instead of appending a conflict", () => {
    const { container } = render(<Stack gap="md" className="gap-10" />);
    const className = slot(container, "stack").className;

    expect(className).toContain("gap-10");
    expect(className).not.toContain("gap-3");
  });

  it("forwards a ref to the rendered element and passes through DOM props", () => {
    let node: HTMLDivElement | null = null;
    render(
      <Stack ref={(el) => (node = el)} id="stack-root" role="list" testID="s" />
    );

    expect(node).toBe(screen.getByTestId("s"));
    expect(screen.getByTestId("s").getAttribute("id")).toBe("stack-root");
    expect(screen.getByRole("list")).toBe(screen.getByTestId("s"));
  });
});

describe("Grid", () => {
  it("defaults to a three-up card ramp", () => {
    const { container } = render(
      <Grid>
        <span>a</span>
      </Grid>
    );

    const className = slot(container, "grid").className;
    expect(className).toContain("grid");
    expect(className).toContain("grid-cols-1");
    expect(className).toContain("sm:grid-cols-2");
    expect(className).toContain("lg:grid-cols-3");
  });

  it("ramps every column count down to a usable mobile layout", () => {
    render(
      <>
        <Grid cols={2} testID="two" />
        <Grid cols={4} testID="four" />
        <Grid cols={6} testID="six" />
      </>
    );

    expect(screen.getByTestId("two").className).toContain("grid-cols-1");
    expect(screen.getByTestId("two").className).toContain("sm:grid-cols-2");

    expect(screen.getByTestId("four").className).toContain("grid-cols-1");
    expect(screen.getByTestId("four").className).toContain("lg:grid-cols-4");

    // Six-up is a tile row: it bottoms out at two, not one.
    expect(screen.getByTestId("six").className).toContain("grid-cols-2");
    expect(screen.getByTestId("six").className).toContain("lg:grid-cols-6");
  });

  it("shares the Stack gap vocabulary", () => {
    render(<Grid gap="lg" testID="g" />);
    expect(screen.getByTestId("g").className).toContain("gap-4"); // lg === 16px
  });

  it("forwards a ref and merges className", () => {
    let node: HTMLDivElement | null = null;
    render(<Grid ref={(el) => (node = el)} className="mt-8" testID="g" />);

    expect(node).toBe(screen.getByTestId("g"));
    expect(screen.getByTestId("g").className).toContain("mt-8");
  });
});

describe("Split", () => {
  it("renders both slots in master-then-detail order", () => {
    const { container } = render(
      <Split start={<span>master</span>} end={<span>detail</span>} />
    );

    const root = slot(container, "split");
    expect(root.children.length).toBe(2);
    expect(root.children[0].getAttribute("data-slot")).toBe("split-start");
    expect(root.children[1].getAttribute("data-slot")).toBe("split-end");
    expect(root.textContent).toBe("masterdetail");
  });

  it("stacks below the breakpoint and becomes a grid at it", () => {
    // The stacking IS the component. Below `at` the root is a plain flex
    // column, so the two panes sit one above the other in source order and
    // the col-span classes are inert; at `at` and up it flips to a
    // twelve-column grid and the spans take over.
    const { container } = render(
      <Split start={<span>m</span>} end={<span>d</span>} />
    );

    const root = slot(container, "split");
    expect(root.className).toContain("flex");
    expect(root.className).toContain("flex-col");
    expect(root.className).toContain("md:grid");
    expect(root.className).toContain("md:grid-cols-12");

    // Unprefixed grid classes would defeat the stacking entirely.
    expect(root.className.split(/\s+/)).not.toContain("grid");
    expect(root.className.split(/\s+/)).not.toContain("grid-cols-12");
  });

  it("moves every responsive class to the requested breakpoint", () => {
    const { container } = render(
      <Split at="xl" start={<span>m</span>} end={<span>d</span>} />
    );

    const root = slot(container, "split");
    expect(root.className).toContain("xl:grid-cols-12");
    expect(root.className).not.toContain("md:grid");
    expect(slot(container, "split-start").className).toContain("xl:col-span-4");
    expect(slot(container, "split-end").className).toContain("xl:col-span-8");
  });

  it("divides the twelve-column track according to ratio, with the panes always summing to twelve", () => {
    const cases: Array<["1/3" | "1/2" | "2/3", string, string]> = [
      ["1/3", "md:col-span-4", "md:col-span-8"],
      ["1/2", "md:col-span-6", "md:col-span-6"],
      ["2/3", "md:col-span-8", "md:col-span-4"],
    ];

    for (const [ratio, startSpan, endSpan] of cases) {
      const { container, unmount } = render(
        <Split ratio={ratio} start={<span>m</span>} end={<span>d</span>} />
      );

      expect(slot(container, "split-start").className).toContain(startSpan);
      expect(slot(container, "split-end").className).toContain(endSpan);
      unmount();
    }
  });

  it("gives both panes min-w-0 so overflowing content cannot blow out the track", () => {
    const { container } = render(
      <Split start={<span>m</span>} end={<span>d</span>} />
    );

    expect(slot(container, "split-start").className).toContain("min-w-0");
    expect(slot(container, "split-end").className).toContain("min-w-0");
  });

  it("forwards a ref and its gap comes from the shared scale", () => {
    let node: HTMLDivElement | null = null;
    render(
      <Split
        ref={(el) => (node = el)}
        gap="xl"
        testID="sp"
        start={<span>m</span>}
        end={<span>d</span>}
      />
    );

    expect(node).toBe(screen.getByTestId("sp"));
    expect(screen.getByTestId("sp").className).toContain("gap-6"); // xl === 24px
  });
});

describe("Section", () => {
  it("names the region with its own heading via aria-labelledby", () => {
    // An unnamed <section> is not exposed as a region at all, so this
    // association is the difference between semantic markup and markup that
    // only looks semantic.
    render(<Section title="Team members">body</Section>);

    const region = screen.getByRole("region", { name: "Team members" });
    const heading = screen.getByRole("heading", { name: "Team members" });

    expect(region.tagName).toBe("SECTION");
    expect(region.getAttribute("aria-labelledby")).toBe(heading.getAttribute("id"));
  });

  it("renders a level-2 heading by default and honours an explicit level", () => {
    const { unmount } = render(<Section title="Default">body</Section>);
    expect(screen.getByRole("heading", { level: 2, name: "Default" })).toBeTruthy();
    unmount();

    render(<Section title="Nested" level={4}>body</Section>);
    const nested = screen.getByRole("heading", { level: 4, name: "Nested" });
    expect(nested.tagName).toBe("H4");
    expect(nested.className).toContain("text-base");
  });

  it("gives sibling sections distinct heading ids so the labels don't cross", () => {
    render(
      <>
        <Section title="First">a</Section>
        <Section title="Second">b</Section>
      </>
    );

    const first = screen.getByRole("region", { name: "First" });
    const second = screen.getByRole("region", { name: "Second" });
    expect(first.getAttribute("aria-labelledby")).not.toBe(
      second.getAttribute("aria-labelledby")
    );
  });

  it("renders description and actions only when supplied", () => {
    const { container: bare } = render(<Section title="Bare">body</Section>);
    expect(bare.querySelector('[data-slot="section-description"]')).toBeNull();
    expect(bare.querySelector('[data-slot="section-actions"]')).toBeNull();

    const { container: full } = render(
      <Section
        title="Full"
        description="Everyone with access."
        actions={<button type="button">Invite</button>}
      >
        body
      </Section>
    );

    expect(
      full.querySelector('[data-slot="section-description"]')!.textContent
    ).toBe("Everyone with access.");
    expect(
      full.querySelector('[data-slot="section-actions"]')!.textContent
    ).toBe("Invite");
  });

  it("keeps block content in the description where it was put", () => {
    // `description` is a ReactNode, so a <ul> or a composed component with a
    // block root is legal input. A <p> wrapper is not: the parser hoists the
    // block out of the paragraph, so the served HTML and the client render
    // disagree and SSR consumers hydration-mismatch. Assert the block is
    // still INSIDE the description node, and that no <p> wraps it.
    const { container } = render(
      <Section
        title="Plans"
        description={
          <ul>
            <li>Free</li>
            <li>Pro</li>
          </ul>
        }
      >
        body
      </Section>
    );

    const description = container.querySelector<HTMLElement>(
      '[data-slot="section-description"]'
    )!;
    expect(description.tagName).not.toBe("P");
    const list = container.querySelector("ul")!;
    expect(description.contains(list)).toBe(true);
    expect(list.querySelectorAll("li").length).toBe(2);
    // Nothing in the header may be a paragraph wrapping that list.
    for (const p of Array.from(container.querySelectorAll("p"))) {
      expect(p.querySelector("ul")).toBeNull();
    }
  });

  it("renders content after the header block", () => {
    const { container } = render(
      <Section title="Overview">
        <p>content</p>
      </Section>
    );

    const root = slot(container, "section");
    expect(root.children.length).toBe(2);
    expect(root.children[1].textContent).toBe("content");
  });

  it("does not leak the ReactNode title into a native title attribute", () => {
    // HTMLAttributes declares `title?: string`; SectionProps omits it before
    // widening to ReactNode, so the element must not sprout a browser
    // tooltip repeating its own heading.
    const { container } = render(<Section title={<em>Rich</em>}>body</Section>);
    const root = slot(container, "section");

    expect(root.hasAttribute("title")).toBe(false);
    expect(container.querySelector("em")!.textContent).toBe("Rich");
  });

  it("forwards a ref and lets headingClassName reach the heading", () => {
    let node: HTMLElement | null = null;
    render(
      <Section
        ref={(el) => (node = el)}
        title="Styled"
        headingClassName="text-3xl"
        testID="sec"
      >
        body
      </Section>
    );

    expect(node).toBe(screen.getByTestId("sec"));
    const heading = screen.getByRole("heading", { name: "Styled" });
    expect(heading.className).toContain("text-3xl");
    // twMerge drops the variant's own size in favour of the override.
    expect(heading.className).not.toContain("text-xl");
  });
});

describe("Container", () => {
  it("centers at the application width with responsive gutters by default", () => {
    const { container } = render(<Container>page</Container>);
    const className = slot(container, "container").className;

    expect(className).toContain("mx-auto");
    expect(className).toContain("w-full");
    expect(className).toContain("max-w-7xl");
    expect(className).toContain("px-4");
    expect(className).toContain("sm:px-6");
    expect(className).toContain("lg:px-8");
  });

  it("offers a short list of named widths", () => {
    render(
      <>
        <Container size="sm" testID="sm" />
        <Container size="md" testID="md" />
        <Container size="full" testID="full" />
        <Container size="prose" testID="prose" />
      </>
    );

    expect(screen.getByTestId("sm").className).toContain("max-w-3xl");
    expect(screen.getByTestId("md").className).toContain("max-w-5xl");
    expect(screen.getByTestId("full").className).toContain("max-w-none");
    expect(screen.getByTestId("prose").className).toContain("max-w-prose");
  });

  it("drops every responsive padding step when gutter is false", () => {
    // This is why `gutter` is a prop: a `className="px-0"` override would
    // only cancel the base step and leave sm:/lg: standing.
    render(<Container gutter={false} testID="flush" />);
    const className = screen.getByTestId("flush").className;

    expect(className).toContain("px-0");
    expect(className).not.toContain("sm:px-6");
    expect(className).not.toContain("lg:px-8");
  });

  it("forwards a ref and merges className", () => {
    let node: HTMLDivElement | null = null;
    render(<Container ref={(el) => (node = el)} className="py-10" testID="c" />);

    expect(node).toBe(screen.getByTestId("c"));
    expect(screen.getByTestId("c").className).toContain("py-10");
  });
});

describe("layout tier composition", () => {
  it("nests without any of the five knowing what the others are", () => {
    // The admission test from FRAMEWORK.md, rendered: page structure all the
    // way down, and not one of these components knows what a "person" is.
    const { container } = render(
      <Container size="md">
        <Section title="Workspace" description="Two panes.">
          <Split
            at="lg"
            ratio="1/2"
            start={
              <Stack gap="sm">
                <span>a</span>
                <span>b</span>
              </Stack>
            }
            end={
              <Grid cols={2}>
                <span>c</span>
                <span>d</span>
              </Grid>
            }
          />
        </Section>
      </Container>
    );

    expect(slot(container, "container").className).toContain("max-w-5xl");
    expect(screen.getByRole("region", { name: "Workspace" })).toBeTruthy();
    expect(slot(container, "split").className).toContain("lg:grid-cols-12");
    expect(slot(container, "split-start").className).toContain("lg:col-span-6");
    expect(slot(container, "stack").className).toContain("gap-2"); // sm === 8px
    expect(slot(container, "grid").className).toContain("sm:grid-cols-2");
  });
});
