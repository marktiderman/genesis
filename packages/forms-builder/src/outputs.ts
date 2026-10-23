/**
 * Field outputs: places outside the form a host lets an answer go, such as a
 * column of the respondent's record or a task list. The builder knows only
 * what a target sets on the field (`props[prop] = value`); the host reads
 * those props after a submit and does the work. The engine and `parseForm`
 * ignore props they don't know, so the form behaves the same either way.
 */
import { canonicalJson, type FieldBlock, type FormDefinition, type Json } from "@marktiderman/genesis-forms";

/**
 * One place a field's answer may also go, offered by the host in the
 * question inspector's "Saves to" section.
 *
 * @example
 * { id: "crm-email", label: "Email on their contact record", group: "Contact",
 *   types: ["email"], prop: "contact_field", value: "email" }
 */
export interface OutputTarget {
  /** Unique among the targets. */
  id: string;
  /** Plain language, as an author reads it: "Email on their contact record". */
  label: string;
  /** The heading it is listed under. Targets without one are listed first. */
  group?: string | undefined;
  /** A hint under the label. */
  description?: string | undefined;
  /** The field types it accepts. Default: every type. */
  types?: readonly string[] | undefined;
  /** The block prop it sets, e.g. `"contact_field"`. Targets with different props can be used together on one field. */
  prop: string;
  /** What it sets the prop to. */
  value: Json;
  /** Whether several questions of one form may use it. Default false: choosing it on one question moves it there. */
  multiple?: boolean | undefined;
}

const same = (a: Json | undefined, b: Json) => a !== undefined && canonicalJson(a) === canonicalJson(b);

/** The targets a field of `type` may use, in the host's order, each id once. */
export function outputsFor(outputs: readonly OutputTarget[] | undefined, type: string): OutputTarget[] {
  const seen = new Set<string>();
  return (outputs ?? []).filter((t) => {
    if (seen.has(t.id) || (t.types && !t.types.includes(type))) return false;
    seen.add(t.id);
    return true;
  });
}

/** Whether `field` uses `target`: its prop holds the target's value. */
export function usesOutput(field: FieldBlock, target: OutputTarget): boolean {
  return same(field.props?.[target.prop], target.value);
}

/** The targets `field` uses, among those that apply to its type. */
export function chosenOutputs(field: FieldBlock, outputs: readonly OutputTarget[] | undefined): OutputTarget[] {
  return outputsFor(outputs, field.type).filter((t) => usesOutput(field, t));
}

function patchProps(field: FieldBlock, edit: (props: Record<string, Json>) => void): FieldBlock {
  const props = { ...field.props };
  edit(props);
  const next: FieldBlock = { ...field };
  if (Object.keys(props).length) next.props = props;
  else delete next.props;
  return next;
}

/**
 * Turn a target on or off for one field. On sets `props[prop] = value`,
 * replacing another target with the same prop; unless the target is
 * `multiple`, it is also turned off on every other question that uses it.
 * Off removes the prop when it holds this target's value.
 */
export function setOutput(def: FormDefinition, fieldId: string, target: OutputTarget, on: boolean): FormDefinition {
  let changed = false;
  const blocks = def.blocks.map((b) => {
    if (b.kind !== "field") return b;
    if (b.id === fieldId) {
      if (on === usesOutput(b, target)) return b;
      changed = true;
      return patchProps(b, (p) => {
        if (on) p[target.prop] = target.value;
        else delete p[target.prop];
      });
    }
    if (on && !target.multiple && usesOutput(b, target)) {
      changed = true;
      return patchProps(b, (p) => void delete p[target.prop]);
    }
    return b;
  });
  return changed ? { ...def, blocks } : def;
}

/** "Nowhere else": remove every target this field uses (props holding another value are left alone). */
export function clearOutputs(def: FormDefinition, fieldId: string, outputs: readonly OutputTarget[] | undefined): FormDefinition {
  let out = def;
  const field = def.blocks.find((b): b is FieldBlock => b.kind === "field" && b.id === fieldId);
  if (!field) return def;
  for (const t of outputs ?? []) if (usesOutput(field, t)) out = setOutput(out, fieldId, t, false);
  return out;
}

/** Another question of the form that already uses `target`, for the "moves it here" hint. */
export function outputUsedBy(def: FormDefinition, fieldId: string, target: OutputTarget): FieldBlock | undefined {
  if (target.multiple) return undefined;
  return def.blocks.find((b): b is FieldBlock => b.kind === "field" && b.id !== fieldId && usesOutput(b, target));
}

/**
 * The props of `field`'s targets that still apply to `type`, to carry over a
 * change of type (which otherwise resets the props).
 */
export function outputPropsFor(field: FieldBlock, type: string, outputs: readonly OutputTarget[] | undefined): Record<string, Json> {
  const kept: Record<string, Json> = {};
  for (const t of chosenOutputs(field, outputs)) if (!t.types || t.types.includes(type)) kept[t.prop] = t.value;
  return kept;
}
