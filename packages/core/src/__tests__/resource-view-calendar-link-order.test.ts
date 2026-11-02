/**
 * defineView: a calendar's duration and phone layout, and a link picker's order.
 * - `durationField` is a number field, `durationUnit` one of three and needs the field;
 * - `phoneLayout` is a layout;
 * - `link.orderBy` is opt-in: `"view"` reads the linked view's `orderBy` (and needs a view), a
 *   field of its own needs no view, and the default stays the naming field.
 */
import { describe, expect, it } from "vitest";
import { defineView } from "../resource-view";
import type { ResourceContract } from "../schema/types";

const events = {
  name: "events",
  key: "id",
  fields: [
    { name: "id", type: "string", hasDefault: true },
    { name: "title", type: "string" },
    { name: "on", type: "datetime", dbType: "date" },
    { name: "minutes", type: "number", nullable: true },
  ],
} as const satisfies ResourceContract;

describe("defineView: calendar duration and phone layout", () => {
  it("keeps a duration field, its unit and a phone layout", () => {
    const view = defineView(events, { calendar: { field: "on", durationField: "minutes", durationUnit: "days", phoneLayout: "agenda" } });
    expect(view.definition.calendar).toEqual({ field: "on", durationField: "minutes", durationUnit: "days", phoneLayout: "agenda" });
  });

  it("refuses a duration that isn't a number field, an unknown unit or phone layout, and a unit with no field", () => {
    expect(() => defineView(events, { calendar: { field: "on", durationField: "title" } })).toThrow(/calendar\.durationField "title" isn't a number field/);
    expect(() => defineView(events, { calendar: { field: "on", durationField: "minutes", durationUnit: "weeks" as never } })).toThrow(
      /calendar\.durationUnit "weeks" isn't minutes, hours or days/,
    );
    expect(() => defineView(events, { calendar: { field: "on", durationUnit: "hours" } })).toThrow(/durationUnit needs a durationField/);
    expect(() => defineView(events, { calendar: { field: "on", phoneLayout: "year" as never } })).toThrow(/calendar\.phoneLayout "year"/);
  });
});

// @feat:resource-view-links
describe("links in forms: the picker's order", () => {
  const stages = {
    name: "stages",
    key: "id",
    fields: [
      { name: "id", type: "string" },
      { name: "name", type: "string" },
      { name: "position", type: "number" },
    ],
  } as const satisfies ResourceContract;
  const deals = {
    name: "deals",
    key: "id",
    fields: [
      { name: "id", type: "string", hasDefault: true },
      { name: "stage_id", type: "string", references: { resource: "stages", field: "id" } },
    ],
  } as const satisfies ResourceContract;
  const ordered = defineView(stages, { orderBy: { field: "position" } });
  const linkOf = (fields: Parameters<typeof defineView<typeof deals>>[1]) =>
    defineView(deals, fields).form("create").find((f) => f.field.name === "stage_id")!.link!;

  it("sorts by the naming field unless the link opts in", () => {
    expect(linkOf({ fields: { stage_id: { link: { view: ordered } } } }).orderBy).toBeUndefined();
  });

  it('uses the linked view\'s orderBy for "view", read when asked from a view given as a function', () => {
    expect(linkOf({ fields: { stage_id: { link: { view: ordered, orderBy: "view" } } } }).orderBy).toEqual({ field: "position", direction: "asc" });
    const desc = defineView(stages, { orderBy: { field: "position", direction: "desc" } });
    expect(linkOf({ fields: { stage_id: { link: { view: () => desc, orderBy: "view" } } } }).orderBy).toEqual({ field: "position", direction: "desc" });
    // A linked view with no order keeps the default.
    expect(linkOf({ fields: { stage_id: { link: { view: defineView(stages), orderBy: "view" } } } }).orderBy).toBeUndefined();
  });

  it("takes a field of its own, without a view", () => {
    expect(linkOf({ fields: { stage_id: { link: { orderBy: { field: "position" } } } } }).orderBy).toEqual({ field: "position", direction: "asc" });
  });

  it("refuses an order it can't send", () => {
    expect(() => defineView(deals, { fields: { stage_id: { link: { orderBy: "view" } } } })).toThrow(/orderBy "view" needs a view/);
    expect(() => defineView(deals, { fields: { stage_id: { link: { orderBy: { field: "position; drop" } } } } })).toThrow(/orderBy isn't "view" or \{ field, direction \}/);
    expect(() => defineView(deals, { fields: { stage_id: { link: { orderBy: { field: "position", direction: "up" as never } } } } })).toThrow(
      /orderBy\.direction is "asc" or "desc"/,
    );
  });
});
