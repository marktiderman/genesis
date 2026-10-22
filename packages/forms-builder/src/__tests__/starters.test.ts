import { describe, expect, it } from "vitest";
import { getFieldType, parseForm, type FieldBlock } from "@marktiderman/genesis-forms";
import { analyze } from "../analyze";
import { getTemplate, STARTER_TEMPLATES, TEMPLATES } from "../index";

// "class" as a word only: the layout mode "classic" is fine.
const BANNED = /coach|client|practice|\bclass(es)?\b|smac|kalm|scripture|worksheet|\bgym\b|member|workout/i;

describe("STARTER_TEMPLATES", () => {
  it("are opt-in: not among the built-in TEMPLATES", () => {
    for (const t of STARTER_TEMPLATES) expect(getTemplate(t.id), t.id).toBeUndefined();
    expect(TEMPLATES).toHaveLength(1);
    expect(getTemplate("action-plan", STARTER_TEMPLATES)?.name).toBe("Action plan");
  });

  it("have unique ids and short descriptions", () => {
    expect(new Set(STARTER_TEMPLATES.map((t) => t.id)).size).toBe(STARTER_TEMPLATES.length);
    for (const t of STARTER_TEMPLATES) expect(t.description.length, t.id).toBeLessThan(120);
  });

  it.each(STARTER_TEMPLATES.map((t) => [t.id, t] as const))("%s is valid, publishable and neutral", (_id, t) => {
    const def = t.create();
    const parsed = parseForm(def);
    expect(parsed.ok, JSON.stringify(parsed)).toBe(true);
    expect(analyze(def).canPublish).toBe(true);
    for (const b of def.blocks) if (b.kind === "field") expect(getFieldType(b.type), b.type).toBeTruthy();
    expect(JSON.stringify(def)).not.toMatch(BANNED);
    expect(`${t.name} ${t.description}`).not.toMatch(BANNED);
  });

  it("show each structured type in use", () => {
    const types = new Set(STARTER_TEMPLATES.flatMap((t) => t.create().blocks.filter((b): b is FieldBlock => b.kind === "field").map((b) => b.type)));
    for (const type of ["list", "table", "media-notes", "text-highlights", "nps", "rating", "long-text"]) expect(types, type).toContain(type);
  });

  it("marks contact details identifying", () => {
    const def = getTemplate("customer-feedback", STARTER_TEMPLATES)!.create();
    const email = def.blocks.find((b) => b.kind === "field" && b.key === "email") as FieldBlock;
    expect(email.identifying).toBe(true);
  });
});
