// @vitest-environment happy-dom
/**
 * @feat:sites-sections
 * The neutral sections read naturally for unrelated businesses: the team as a
 * law firm's partners, the timetable as a conference's talks. Nothing in
 * either section assumes one industry.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import "../sections/index";
import { getSection, type AnySectionDefinition, type SectionNode } from "../index";
import { testCtx } from "./fixtures";

function render(type: string, variant: string, props: Record<string, unknown>) {
  const def = getSection(type) as AnySectionDefinition;
  const parsed = def.schema.parse(props);
  const node: SectionNode = { id: type, type, v: def.version, variant, props: parsed as Record<string, unknown> };
  document.body.innerHTML = renderToStaticMarkup(<>{def.render({ props: parsed, variant, node, ctx: testCtx({ idPrefix: `gs-${type}` }) })}</>);
  return document.body;
}

describe("a law firm's team", () => {
  const props = {
    heading: "Our partners",
    members: [
      { name: "Ada Okafor", role: "Managing partner", credentials: "Called to the bar 2004, employment law", summary: "Advises employers on contracts and disputes.", bio: "Ada founded the firm in 2011.\n\nShe leads the employment practice." },
      { name: "Tom Reyes", role: "Partner", credentials: "Property and planning", profile: "/people/tom-reyes" },
    ],
  };

  it("shows each person's role, credentials and bio, with no wording of its own about the business", () => {
    const body = render("team", "cards", props);
    expect(body.querySelector("h2")?.textContent).toBe("Our partners");
    expect(body.textContent).toContain("Managing partner");
    expect(body.textContent).toContain("Called to the bar 2004, employment law");
    expect(body.textContent).toContain("She leads the employment practice.");
    expect(body.querySelector('a[href="/people/tom-reyes"]')?.textContent).toBe("Tom Reyes's page");
  });

  it("reads the same as a long-form list", () => {
    const body = render("team", "list", props);
    expect([...body.querySelectorAll("h3")].map((h) => h.textContent)).toEqual(["Ada Okafor", "Tom Reyes"]);
  });
});

describe("a conference's talks", () => {
  const props = {
    heading: "Programme",
    days: ["thu", "fri"],
    dayNames: { thu: "Day one", fri: "Day two" },
    types: [
      { id: "keynote", name: "Keynote", tone: "primary" },
      { id: "workshop", name: "Workshop", description: "Bring a laptop.", tone: "soft" },
    ],
    sessions: [
      { day: "thu", start: "09:30", end: "10:15", title: "Opening keynote", type: "keynote", host: "Priya Shah", location: "Main hall" },
      { day: "thu", start: "11:00", end: "12:30", title: "Designing for screen readers", type: "workshop", host: "Leo Marsh", location: "Room 2" },
      { day: "fri", start: "09:30", title: "Closing keynote", type: "keynote", host: "Sam Ito" },
    ],
  };

  it("lays the talks out by time and day, with speaker and room", () => {
    const body = render("schedule", "grid", props);
    const table = body.querySelector("table")!;
    expect(table.querySelector("caption")?.textContent).toBe("Programme: sessions by time and day");
    expect([...table.querySelectorAll('thead th[scope="col"]')].map((th) => th.textContent)).toEqual(["Time", "Day one", "Day two"]);
    expect(table.textContent).toContain("with Priya Shah · Main hall");
    expect(body.querySelector('[aria-label="Session types"]')?.textContent).toContain("Bring a laptop.");
    expect(body.querySelector("fieldset legend")?.textContent).toBe("Show the sessions on");
  });

  it("names what's on in its own words, and keeps the default for a label it leaves out", () => {
    const body = render("schedule", "grid", { ...props, labels: { items: "talks" } });
    expect(body.querySelector("caption")?.textContent).toBe("Programme: talks by time and day");
    expect(body.querySelector("fieldset legend")?.textContent).toBe("Show the talks on");
    expect(body.querySelector('[aria-label="Session types"]')).not.toBeNull();
  });

  it("reads day by day too", () => {
    const body = render("schedule", "agenda", props);
    expect(body.textContent).toContain("Designing for screen readers");
    expect(body.textContent).toContain("with Leo Marsh · Room 2");
  });
});
