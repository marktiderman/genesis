/**
 * PageHeader on a narrow screen (docs/RESPONSIVE.md, rule 2). jsdom has no layout, so this checks the
 * classes that carry the promise: the title keeps priority and truncates beside the actions, and the
 * actions may take their own line and wrap within the header, never past its edge.
 */
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PageHeader } from "../PageHeader";

const classesOf = (el: Element | null) => (el?.getAttribute("class") ?? "").split(/\s+/);

describe("PageHeader wraps its actions instead of overflowing", () => {
  it("lets the row wrap, keeps a 10rem title beside the actions, and wraps the actions within the header", () => {
    const { container } = render(
      <PageHeader title="A long page title that has to give way" actions={<button type="button">One</button>} />,
    );
    const header = container.querySelector('[data-slot="page-header"]')!;
    expect(classesOf(header)).toContain("sm:flex-wrap");
    const title = header.firstElementChild!;
    expect(classesOf(title)).toEqual(expect.arrayContaining(["min-w-0", "sm:min-w-[min(10rem,100%)]", "sm:flex-1", "sm:basis-0"]));
    const actions = header.lastElementChild!;
    expect(classesOf(actions)).toEqual(expect.arrayContaining(["flex-wrap", "max-w-full", "shrink-0"]));
  });
});
