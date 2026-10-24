/**
 * Option lists the host app fills in: what the builder offers as "Options:
 * From the app", and the stand-in options its preview and checks use.
 */
import { optionsSource, type ChoiceOption, type FieldBlock, type HostOptions } from "@marktiderman/genesis-forms";

/**
 * A list of options the host app fills in when the form opens, offered to
 * choice questions as "Options: From the app". Choosing it sets the field's
 * `props.optionsFrom` to `{ source: "host", key }`; the live form gets the
 * real list through `hostOptions` (`<Form hostOptions>`, `createForm`) and the
 * server checks answers against it (`validateSubmission`).
 *
 * @example
 * <FormBuilder hostOptions={[{ key: "coaches", label: "Coaches", description: "The practice's current coaches.",
 *   sample: [{ value: "c1", label: "Ada" }, { value: "c2", label: "Sam" }] }]} … />
 */
export interface HostOptionList {
  /** What `props.optionsFrom.key` names. Keep it stable: published forms store it. */
  key: string;
  /** The list's name for authors, such as "Coaches". */
  label: string;
  /** One line on what it lists, shown under the picker. */
  description?: string | undefined;
  /**
   * Stand-in options the builder's preview shows (and its checks try), with any description,
   * picture and attributes the real list has, so the preview looks like the live form. Default: none.
   */
  sample?: readonly ChoiceOption[] | undefined;
  /**
   * The attribute names the list's options carry (such as `["location"]`), offered as "Only show
   * options matching" (`props.optionsFrom.filter`). Default: the names found on `sample`.
   */
  attributes?: readonly string[] | undefined;
}

/** The attribute names a list offers for filtering: its `attributes`, else those on its sample options. */
export function hostListAttributes(list: HostOptionList | undefined): string[] {
  if (!list) return [];
  if (list.attributes) return [...list.attributes];
  const names = new Set<string>();
  for (const o of list.sample ?? []) for (const name of Object.keys(o.attributes ?? {})) names.add(name);
  return [...names];
}

/** The stand-in options, by key, from the host's lists: what the builder's preview fills in. */
export function sampleHostOptions(lists: readonly HostOptionList[] | undefined): HostOptions | undefined {
  if (!lists?.length) return undefined;
  const out: Record<string, readonly ChoiceOption[]> = {};
  for (const list of lists) out[list.key] = list.sample ?? [];
  return out;
}

/** The host's list a field takes its options from, or `undefined` (none, or a key the host doesn't offer). */
export function hostListOf(field: FieldBlock, lists: readonly HostOptionList[] | undefined): HostOptionList | undefined {
  const from = optionsSource(field);
  return from ? lists?.find((l) => l.key === from.key) : undefined;
}
