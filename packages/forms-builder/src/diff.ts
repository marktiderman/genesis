/**
 * What changed between two versions of a form, and which changes break the
 * answers already collected. A published version is immutable, so the
 * builder shows this before publishing a new one.
 */
import { choiceOptions, fingerprint, type Block, type FieldBlock, type FormDefinition } from "@marktiderman/genesis-forms";

export type ChangeKind =
  | "field-added"
  | "field-removed"
  | "field-type-changed"
  | "field-key-changed"
  | "field-label-changed"
  | "field-required-changed"
  | "option-added"
  | "option-removed"
  | "option-label-changed"
  | "block-added"
  | "block-removed"
  | "block-moved"
  | "logic-changed"
  | "ending-added"
  | "ending-removed"
  | "hidden-added"
  | "hidden-removed"
  | "hidden-changed"
  | "settings-changed"
  | "title-changed"
  | "text-changed";

export interface Change {
  kind: ChangeKind;
  /**
   * The change makes earlier answers mean something else or orphans them:
   * a removed or retyped field, a removed option, a renamed key (exports and
   * recall use keys). Everything else is safe.
   */
  breaking: boolean;
  /** The block, ending or hidden input it is about. */
  ref?: string;
  /** A plain-English line for the publish dialog. */
  message: string;
}

const fields = (def: FormDefinition) =>
  new Map(def.blocks.filter((b): b is FieldBlock => b.kind === "field").map((b) => [b.id, b]));

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

const blockName = (b: Block) =>
  b.kind === "field" ? `"${b.label || b.key}"` : b.kind === "content" ? `${b.type} "${b.text.slice(0, 40)}"` : "page break";

export function diffDefinitions(before: FormDefinition, after: FormDefinition): Change[] {
  const out: Change[] = [];
  const push = (kind: ChangeKind, breaking: boolean, message: string, ref?: string) =>
    out.push(ref === undefined ? { kind, breaking, message } : { kind, breaking, message, ref });

  if (before.title !== after.title) push("title-changed", false, `Title changed to "${after.title}".`);

  const a = fields(before);
  const b = fields(after);
  for (const [id, old] of a) {
    const next = b.get(id);
    if (!next) {
      push("field-removed", true, `Removed ${blockName(old)}. Its earlier answers stay stored but no longer show up in new exports.`, id);
      continue;
    }
    if (old.type !== next.type) {
      push("field-type-changed", true, `${blockName(next)} changed from ${old.type} to ${next.type}; earlier answers may not fit the new type.`, id);
    }
    if (old.key !== next.key) {
      push("field-key-changed", true, `${blockName(next)} is now exported as "${next.key}" instead of "${old.key}".`, id);
    }
    if (old.label !== next.label) push("field-label-changed", false, `Question reworded: "${old.label}" → "${next.label}".`, id);
    if (!!old.required !== !!next.required) {
      push("field-required-changed", false, `${blockName(next)} is now ${next.required ? "required" : "optional"}.`, id);
    }
    if (old.type === next.type) {
      const oldOptions = new Map(choiceOptions(old).map((o) => [o.value, o.label]));
      const newOptions = new Map(choiceOptions(next).map((o) => [o.value, o.label]));
      for (const [value, label] of oldOptions) {
        if (!newOptions.has(value)) {
          push("option-removed", true, `Removed option "${label ?? value}" from ${blockName(next)}; earlier answers that chose it keep the old value.`, id);
        } else if ((newOptions.get(value) ?? value) !== (label ?? value)) {
          push("option-label-changed", false, `Option "${label ?? value}" in ${blockName(next)} is now "${newOptions.get(value) ?? value}".`, id);
        }
      }
      for (const [value, label] of newOptions) {
        if (!oldOptions.has(value)) push("option-added", false, `Added option "${label ?? value}" to ${blockName(next)}.`, id);
      }
    }
  }
  for (const [id, next] of b) if (!a.has(id)) push("field-added", false, `Added ${blockName(next)}.`, id);

  const oldOther = new Map(before.blocks.filter((x) => x.kind !== "field").map((x) => [x.id, x]));
  const newOther = new Map(after.blocks.filter((x) => x.kind !== "field").map((x) => [x.id, x]));
  for (const [id, x] of oldOther) if (!newOther.has(id)) push("block-removed", false, `Removed ${blockName(x)}.`, id);
  for (const [id, x] of newOther) if (!oldOther.has(id)) push("block-added", false, `Added ${blockName(x)}.`, id);

  const kept = (def: FormDefinition, other: FormDefinition) => {
    const ids = new Set(other.blocks.map((x) => x.id));
    return def.blocks.filter((x) => ids.has(x.id)).map((x) => x.id);
  };
  if (!same(kept(before, after), kept(after, before))) push("block-moved", false, "Questions were reordered.");

  if (!same(before.logic, after.logic)) {
    const n = after.logic?.length ?? 0;
    push("logic-changed", false, `Logic changed (${n} rule${n === 1 ? "" : "s"} now).`);
  }

  const oldEndings = new Set((before.endings ?? []).map((e) => e.id));
  const newEndings = new Set((after.endings ?? []).map((e) => e.id));
  for (const e of after.endings ?? []) if (!oldEndings.has(e.id)) push("ending-added", false, `Added ending "${e.title}".`, e.id);
  for (const e of before.endings ?? []) if (!newEndings.has(e.id)) push("ending-removed", false, `Removed ending "${e.title}".`, e.id);

  const oldHidden = new Map((before.hidden ?? []).map((h) => [h.name, h]));
  const newHidden = new Map((after.hidden ?? []).map((h) => [h.name, h]));
  for (const [name, h] of newHidden) {
    const old = oldHidden.get(name);
    if (!old) push("hidden-added", false, `Added hidden input "${name}".`, name);
    else if (!same(old, h)) push("hidden-changed", old.type !== h.type, `Hidden input "${name}" changed.`, name);
  }
  for (const name of oldHidden.keys()) if (!newHidden.has(name)) push("hidden-removed", true, `Removed hidden input "${name}".`, name);

  if (!same(before.settings, after.settings) || !same(before.layout, after.layout)) {
    const anonymous = !!before.settings?.anonymous !== !!after.settings?.anonymous;
    push(
      "settings-changed",
      false,
      anonymous
        ? after.settings?.anonymous
          ? "Responses become anonymous: name, email and phone are no longer asked or stored."
          : "Responses are no longer anonymous: identifying questions are asked again."
        : "Settings changed.",
    );
  }
  // Descriptions, placeholders, content text, ending wording, props…
  if (!out.length && fingerprint(before) !== fingerprint(after)) push("text-changed", false, "Wording or details changed.");
  return out;
}

/** True when the two definitions are the same form, byte for byte once canonicalized. */
export const isUnchanged = (before: FormDefinition, after: FormDefinition) => fingerprint(before) === fingerprint(after);
