/**
 * defineView's `board` block: a column per value of one field. Checked once, frozen, plain values.
 */
import { describe, expect, it } from "vitest";

import { boardChoices, boardProblems, defineView } from "../resource-view";
import type { ResourceContract } from "../schema/types";

type TaskRow = {
  id: string;
  title: string;
  stage: "todo" | "doing" | "done";
  priority: "low" | "high" | null;
  urgent: boolean;
  due_on: string | null;
  tags: string[];
};

const tasks = {
  name: "public.tasks",
  key: "id",
  labelField: "title",
  fields: [
    { name: "id", type: "string", hasDefault: true },
    { name: "title", type: "string" },
    { name: "stage", type: "string", enumValues: ["todo", "doing", "done"], hasDefault: true },
    { name: "priority", type: "string", enumValues: ["low", "high"], nullable: true },
    { name: "urgent", type: "boolean", hasDefault: true },
    { name: "due_on", type: "datetime", dbType: "date", nullable: true },
    { name: "tags", type: "string", array: true, enumValues: ["a", "b"] },
  ],
} as const satisfies ResourceContract<TaskRow>;

describe("defineView: board", () => {
  it("keeps a board block, frozen, that every platform reads", () => {
    const block = { field: "stage", columns: ["todo", "doing", "done"], cardFields: ["due_on"], limits: { doing: 3 } } as const;
    const view = defineView(tasks, { board: block });
    expect(view.definition.board).toEqual(block);
    expect(Object.isFrozen(view.definition.board)).toBe(true);
    expect(Object.isFrozen(view.definition.board!.columns)).toBe(true);
    expect(Object.isFrozen(view.definition.board!.limits)).toBe(true);
  });

  it("is a copy: changing the object passed in doesn't change the view", () => {
    const columns = ["todo", "doing"];
    const view = defineView(tasks, { board: { field: "stage", columns } });
    columns.push("done");
    expect(view.definition.board!.columns).toEqual(["todo", "doing"]);
  });

  it("takes an enum or a yes/no field", () => {
    expect(() => defineView(tasks, { board: { field: "priority" } })).not.toThrow();
    expect(() => defineView(tasks, { board: { field: "urgent" } })).not.toThrow();
  });

  it("names each mistake", () => {
    expect(() => defineView(tasks, { board: {} as never })).toThrow(/board\.field is required/);
    expect(() => defineView(tasks, { board: { field: "title" } })).toThrow(/has no fixed values/);
    expect(() => defineView(tasks, { board: { field: "tags" } })).toThrow(/has no fixed values/);
    expect(() => defineView(tasks, { board: { field: "nope" as never } })).toThrow(/isn't a field/);
    expect(() => defineView(tasks, { board: { field: "stage", columns: ["todo", "blocked"] } })).toThrow(/"blocked", which isn't a value of stage/);
    expect(() => defineView(tasks, { board: { field: "stage", columns: ["todo", "todo"] } })).toThrow(/twice/);
    expect(() => defineView(tasks, { board: { field: "stage", cardFields: ["owner" as never] } })).toThrow(/cardFields names "owner"/);
    expect(() => defineView(tasks, { board: { field: "stage", limits: { doing: 0 } } })).toThrow(/1 or more/);
    expect(() => defineView(tasks, { board: { field: "stage", limits: { doing: 2.5 } } })).toThrow(/whole number/);
    expect(() => defineView(tasks, { board: { field: "stage", columns: ["todo"], limits: { doing: 2 } } })).toThrow(/isn't one of the board's columns/);
    expect(() => defineView(tasks, { board: { field: "stage", wip: 2 } as never })).toThrow(/board\.wip isn't a board setting/);
    expect(() => defineView(tasks, { board: "stage" as never })).toThrow(/board isn't an object/);
  });

  it("checks a screen's override the same way", () => {
    expect(boardProblems(tasks.fields, { field: "stage", columns: ["done"] })).toEqual([]);
    expect(boardProblems(tasks.fields, { field: "stage", columns: [] })).toEqual(["board.columns isn't a list of values"]);
  });

  it("reads a field's values in the contract's order", () => {
    expect(boardChoices(tasks.fields[2])).toEqual(["todo", "doing", "done"]);
    expect(boardChoices(tasks.fields[4])).toEqual(["true", "false"]);
    expect(boardChoices(tasks.fields[1])).toBeUndefined();
    expect(boardChoices(undefined)).toBeUndefined();
  });
});

describe("view.column", () => {
  it("resolves one field as a preset would, and the same object each time", () => {
    const view = defineView(tasks, { fields: { stage: { display: "badge", labels: { todo: "To do" } } } });
    const stage = view.column("stage")!;
    expect(stage).toMatchObject({ key: "stage", display: "badge", labels: { todo: "To do" } });
    expect(stage.value({ stage: "todo" } as never)).toBe("todo");
    expect(view.column("stage")).toBe(stage);
    expect(view.columns().find((c) => c.key === "stage")).toBe(stage);
  });

  it("is undefined for a name that isn't a field, or one the viewer can't read", () => {
    const hidden = { ...tasks, fields: [...tasks.fields, { name: "secret", type: "string", permissions: { read: false } }] } as const;
    const view = defineView(hidden as never, {});
    expect(view.column("nope")).toBeUndefined();
    expect(view.column("secret")).toBeUndefined();
  });
});
