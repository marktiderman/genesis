/**
 * Viewer-aware guards: `can`, action `can` and `when` get the viewer (id, scope, roles) as their
 * last argument. No viewer means no one, so a guard that needs it refuses with its reason.
 */
import { describe, expect, expectTypeOf, it } from "vitest";

import { defineView, NO_VIEWER, type Viewer } from "../resource-view";
import type { ResourceContract } from "../schema/types";

// Apps fill the roles by module augmentation; this one only exists inside core's own tests.
declare module "../viewer" {
  interface GenesisViewerRoles {
    teamRoles?: readonly ("owner" | "editor" | "reader")[];
  }
}

type NoteRow = { id: string; title: string; owner_id: string; private_note: string | null };

const notes = {
  name: "public.notes",
  key: "id",
  fields: [
    { name: "id", type: "string", hasDefault: true },
    { name: "title", type: "string" },
    { name: "owner_id", type: "string" },
    { name: "private_note", type: "string", nullable: true },
  ],
} as const satisfies ResourceContract<NoteRow>;

const row: NoteRow = { id: "n1", title: "Plan", owner_id: "ann", private_note: "mine" };

const editor = (v: Viewer) => v.roles?.teamRoles?.some((r) => r === "owner" || r === "editor") ?? false;

const view = defineView<typeof notes, NoteRow>(notes, {
  fields: { private_note: { when: (r, v) => r.owner_id === v.id } },
  columns: { default: ["title", "private_note"] },
  can: {
    create: (v) => (editor(v) ? true : "Only editors add notes."),
    update: (r, v) => (r.owner_id === v.id ? true : "Only its owner edits a note."),
    delete: (r, v) => (editor(v) && r.owner_id === v.id ? true : "Only an editor who owns it deletes a note."),
  },
  actions: [{ name: "share", label: "Share", can: (r, v) => (r.owner_id === v.id ? true : "Only its owner shares a note.") }],
});

const ann: Viewer = { id: "ann", scope: { practiceId: "p1" }, roles: { teamRoles: ["editor"] } };
const bob: Viewer = { id: "bob", scope: { practiceId: "p1" }, roles: { teamRoles: ["reader"] } };

describe("viewer-aware guards", () => {
  it("refuse one viewer and allow another", () => {
    expect(view.can("create", bob)).toBe("Only editors add notes.");
    expect(view.can("create", ann)).toBe(true);
    expect(view.can("update", row, bob)).toBe("Only its owner edits a note.");
    expect(view.can("update", row, ann)).toBe(true);
    expect(view.can("delete", row, bob)).toBe("Only an editor who owns it deletes a note.");
    expect(view.can("delete", row, ann)).toBe(true);
    expect(view.canAction("share", row, bob)).toBe("Only its owner shares a note.");
    expect(view.canAction("share", row, ann)).toBe(true);
  });

  it("hand `when` the viewer", () => {
    const when = view.columns().find((c) => c.key === "private_note")!.when!;
    expect(when(row, ann)).toBe(true);
    expect(when(row, bob)).toBe(false);
  });

  it("fail closed with the guard's reason when there is no viewer", () => {
    expect(NO_VIEWER).toEqual({ id: null, scope: {} });
    expect(Object.isFrozen(NO_VIEWER)).toBe(true);
    expect(view.can("create")).toBe("Only editors add notes.");
    expect(view.can("update", row)).toBe("Only its owner edits a note.");
    expect(view.canAction("share", row)).toBe("Only its owner shares a note.");
    expect(view.columns().find((c) => c.key === "private_note")!.when!(row, NO_VIEWER)).toBe(false);
  });

  it("fail closed while the roles are unknown", () => {
    expect(view.can("create", { id: "ann", scope: {} })).toBe("Only editors add notes.");
  });

  it("still take one-argument guards", () => {
    const old = defineView<typeof notes, NoteRow>(notes, {
      can: { create: () => true, delete: (r) => (r.title === "Plan" ? "The plan stays." : true) },
      actions: [{ name: "pin", label: "Pin", can: (r) => (r.title ? true : "Untitled notes can't be pinned.") }],
    });
    expect(old.can("create")).toBe(true);
    expect(old.can("delete", row)).toBe("The plan stays.");
    expect(old.can("delete", row, ann)).toBe("The plan stays.");
    expect(old.canAction("pin", { ...row, title: "" })).toBe("Untitled notes can't be pinned.");
    expect(old.canAction("pin", row, bob)).toBe(true);
  });

  it("refuse a row passed to create from plain JavaScript, rather than read it as the viewer", () => {
    const loose = view.can as unknown as (action: string, a?: unknown, b?: unknown) => unknown;
    expect(() => loose("create", row, ann)).toThrow(/takes no row/);
  });

  it("a column's `when` called without a viewer answers for no one", () => {
    const privateNote = view.columns().find((c) => c.key === "private_note");
    expect(privateNote?.when?.(row)).toBe(false);
    expect(privateNote?.when?.(row, ann)).toBe(true);
  });

  it("types the viewer and the augmented roles", () => {
    expectTypeOf(view.canAction).parameter(2).toEqualTypeOf<Viewer | undefined>();
    expectTypeOf<NonNullable<Viewer["roles"]>["teamRoles"]>().toEqualTypeOf<readonly ("owner" | "editor" | "reader")[] | undefined>();
  });
});
