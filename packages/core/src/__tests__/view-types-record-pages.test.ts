// @feat:record-pages
/**
 * ADR 0021's core half: how a record opens (declared on the view), the document record page
 * template, the field's `control` hint (with `widget` still read), and groupRows for custom views.
 */
import { describe, expect, it } from "vitest";

import { defineRecordView, defineView, RECORD_OPEN_MODES, ViewDefinitionError, type AnyRecordView } from "../resource-view";
import { defineResource, fieldControl } from "../schema/types";

type Note = { id: string; title: string; status: "draft" | "done" | null; cover: string | null; emoji: string | null; body: string | null; words: number };

const notes = defineResource<Note>()({
  name: "public.notes",
  key: "id",
  labelField: "title",
  fields: [
    { name: "id", type: "string", hasDefault: true },
    { name: "title", type: "string" },
    { name: "status", type: "string", enumValues: ["draft", "done"], nullable: true },
    { name: "cover", type: "string", control: "url", nullable: true },
    { name: "emoji", type: "string", nullable: true },
    { name: "body", type: "string", widget: "textarea", nullable: true },
    { name: "words", type: "number" },
  ],
});

describe("open on the view", () => {
  it("takes the three modes and refuses anything else", () => {
    for (const open of RECORD_OPEN_MODES) expect(defineView(notes, { open }).definition.open).toBe(open);
    expect(() => defineView(notes, { open: "panel" as never })).toThrow(/open is "side-peek", "center-peek", "page"/);
  });

  it("names its record view lazily, as a function", () => {
    // The thunk names its return type: the record view is defined from this view, so TypeScript
    // can't infer one from the other.
    const view = defineView(notes, { open: "center-peek", recordView: (): AnyRecordView => record });
    const record = defineRecordView(view, { sections: [{ id: "about", label: "About" }] });
    expect(view.definition.recordView?.()).toBe(record);
    expect(() => defineView(notes, { recordView: record as never })).toThrow(ViewDefinitionError);
  });
});

describe("the document template", () => {
  const view = defineView(notes);

  it("is standard by default, and a document may have no sections", () => {
    expect(defineRecordView(view, { sections: [{ id: "a", label: "A" }] }).template).toBe("standard");
    const doc = defineRecordView(view, { template: "document", sections: [], document: { cover: "cover", icon: "emoji", body: "body", properties: ["status", "words"] } });
    expect(doc.template).toBe("document");
    expect(doc.document).toEqual({ cover: "cover", icon: "emoji", body: "body", properties: ["status", "words"] });
    expect(Object.isFrozen(doc.document)).toBe(true);
  });

  it("checks its fields", () => {
    const bad = () =>
      defineRecordView(view, { template: "document", sections: [], document: { cover: "nope", body: "words", properties: ["missing"] } as never });
    expect(bad).toThrow(/document.cover names "nope"/);
    expect(bad).toThrow(/document.body "words" is a number, not a text field/);
    expect(bad).toThrow(/document.properties names "missing"/);
    expect(() => defineRecordView(view, { sections: [{ id: "a", label: "A" }], document: { body: "body" } })).toThrow(/template isn't "document"/);
    expect(() => defineRecordView(view, { template: "page" as never, sections: [] })).toThrow(/template is "standard" or "document"/);
  });
});

describe("a field's control hint", () => {
  it("reads control, then the deprecated widget", () => {
    expect(fieldControl({ control: "url" })).toBe("url");
    expect(fieldControl({ widget: "textarea" })).toBe("textarea");
    expect(fieldControl({ control: "date", widget: "text" })).toBe("date");
    expect(fieldControl(undefined)).toBeUndefined();
  });

  it("drives the display either way", () => {
    const view = defineView(notes);
    expect(view.display("cover")).toBe("url");
    expect(view.display("body")).toBe("longText");
  });
});
