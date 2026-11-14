// @feat:custom-views
/** groupRows: a view's rows under headers, the same on every platform (a custom view's groups). */
import { describe, expect, it } from "vitest";

import { defineView, groupRows } from "../resource-view";
import { defineResource } from "../schema/types";

type Note = { id: string; title: string; status: "draft" | "done" | null };

const notes = defineResource<Note>()({
  name: "public.notes",
  key: "id",
  labelField: "title",
  fields: [
    { name: "id", type: "string", hasDefault: true },
    { name: "title", type: "string" },
    { name: "status", type: "string", enumValues: ["draft", "done"], nullable: true },
  ],
});

describe("groupRows", () => {
  const view = defineView(notes, { groupBy: "status" });
  const row = (id: string, status: Note["status"]): Note => ({ id, title: id, status });

  it("groups by the view's groupBy in first-seen order, empty values together", () => {
    const groups = groupRows(view, [row("a", "done"), row("b", null), row("c", "draft"), row("d", "done")]);
    expect(groups.map((g) => [g.key, g.label, g.rows.map((r) => r.id)])).toEqual([
      ["done", "Done", ["a", "d"]],
      ["", "No status", ["b"]],
      ["draft", "Draft", ["c"]],
    ]);
  });

  it("takes another field and words for the empty group, and is one group without a field", () => {
    expect(groupRows(view, [row("a", null)], { emptyLabel: "Unsorted" })[0]?.label).toBe("Unsorted");
    expect(groupRows(defineView(notes), [row("a", "done"), row("b", null)]).map((g) => g.rows.length)).toEqual([2]);
    expect(groupRows(defineView(notes), [])).toEqual([]);
  });
});
