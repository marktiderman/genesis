import { fingerprint } from "./hash";
import { parseForm } from "./parse";
import type { PhotoFormat, PhotoRef } from "./photo";
import type {
  Condition,
  ContentBlock,
  Ending,
  FieldBlock,
  FormDefinition,
  FormLayout,
  FormSettings,
  HiddenInput,
  Json,
  LogicRule,
  Operator,
  OptionsSource,
  PageBreakBlock,
} from "./types";

// ── Field builders ───────────────────────────────────────────────────────────

/** A field block that remembers its key and value type, for answer inference. */
export type FieldSpec<K extends string = string, V = unknown> = FieldBlock & {
  readonly key: K;
  /** Type-level only. */
  readonly __value?: V;
};

export interface FieldOptions {
  label: string;
  description?: string | undefined;
  placeholder?: string | undefined;
  required?: boolean | undefined;
  /** Personal or secret data (see `isSensitive`). */
  sensitive?: boolean | undefined;
  /** Identifies the respondent (name, email, phone). Not asked when `settings.anonymous` is true. */
  identifying?: boolean | undefined;
  /** Defaults to the key. Set it before renaming a key on a live form, so answers stay linked. */
  id?: string | undefined;
}

export interface ChoiceFieldOptions<O extends string> extends FieldOptions {
  /** The options. Optional only with `optionsFrom`, whose options follow these. */
  options?: readonly { value: O; label?: string }[] | undefined;
  /**
   * Options the app showing the form supplies, by key (`OptionsSource`), such
   * as `{ source: "host", key: "coaches" }`; pass the lists as `hostOptions`
   * to `createForm` and `validateSubmission`.
   */
  optionsFrom?: OptionsSource | undefined;
}

function field<K extends string, V>(
  type: string,
  key: K,
  options: FieldOptions,
  props?: Record<string, Json>,
): FieldSpec<K, V> {
  const block: FieldBlock = {
    kind: "field",
    id: options.id ?? key,
    key,
    type,
    label: options.label,
  };
  if (options.description) block.description = options.description;
  if (options.placeholder) block.placeholder = options.placeholder;
  if (options.required) block.required = true;
  if (options.sensitive) block.sensitive = true;
  if (options.identifying) block.identifying = true;
  if (props && Object.keys(props).length) block.props = props;
  return block as FieldSpec<K, V>;
}

/** The props that are set, so an unset option never becomes `undefined` in the JSON. */
const props = (all: Record<string, Json | undefined>): Record<string, Json> =>
  Object.fromEntries(Object.entries(all).filter((e): e is [string, Json] => e[1] !== undefined));

const choiceProps = (o: ChoiceFieldOptions<string>): Record<string, Json> => {
  const out: Record<string, Json> = {};
  if (o.options || !o.optionsFrom) {
    out.options = (o.options ?? []).map((x): Json => (x.label ? { value: x.value, label: x.label } : { value: x.value }));
  }
  if (o.optionsFrom) out.optionsFrom = { source: o.optionsFrom.source, key: o.optionsFrom.key };
  return out;
};

interface HiddenOptions {
  source?: HiddenInput["source"] | undefined;
  sensitive?: boolean | undefined;
  /** Identifies the respondent. Not stored when `settings.anonymous` is true. */
  identifying?: boolean | undefined;
}

// Typed explicitly: the inferred `sensitive?: true | undefined` from the
// conditional spread breaks consumers with exactOptionalPropertyTypes on.
const hiddenSpec = <T extends HiddenInput["type"]>(
  type: T,
  o: HiddenOptions,
): { type: T; source: HiddenInput["source"]; sensitive?: true; identifying?: true } => ({
  type,
  source: o.source ?? "url",
  ...(o.sensitive ? { sensitive: true as const } : {}),
  ...(o.identifying ? { identifying: true as const } : {}),
});

export const f = {
  shortText: <K extends string>(key: K, o: FieldOptions & { maxLength?: number | undefined }) =>
    field<K, string>("short-text", key, o, o.maxLength ? { maxLength: o.maxLength } : undefined),
  longText: <K extends string>(key: K, o: FieldOptions & { maxLength?: number | undefined }) =>
    field<K, string>("long-text", key, o, o.maxLength ? { maxLength: o.maxLength } : undefined),
  email: <K extends string>(key: K, o: FieldOptions) => field<K, string>("email", key, o),
  phone: <K extends string>(key: K, o: FieldOptions) => field<K, string>("phone", key, o),
  /**
   * A 1-to-`max` scale. `lowLabel` and `highLabel` are optional words under
   * its ends ("Poor", "Great"); `display: "stars"` draws stars instead of numbers.
   */
  rating: <K extends string>(
    key: K,
    o: FieldOptions & {
      max?: number | undefined;
      lowLabel?: string | undefined;
      highLabel?: string | undefined;
      display?: "numbers" | "stars" | undefined;
    },
  ) =>
    field<K, number>(
      "rating",
      key,
      o,
      props({ max: o.max ?? 5, lowLabel: o.lowLabel || undefined, highLabel: o.highLabel || undefined, display: o.display }),
    ),
  /** A 0-to-10 Net Promoter Score. The end labels default to "Not likely" and "Very likely" in the renderer. */
  nps: <K extends string>(key: K, o: FieldOptions & { lowLabel?: string | undefined; highLabel?: string | undefined }) =>
    field<K, number>("nps", key, o, props({ lowLabel: o.lowLabel || undefined, highLabel: o.highLabel || undefined })),
  singleChoice: <K extends string, O extends string>(key: K, o: ChoiceFieldOptions<O>) =>
    field<K, O>("single-choice", key, o, choiceProps(o)),
  multiChoice: <K extends string, O extends string>(key: K, o: ChoiceFieldOptions<O>) =>
    field<K, O[]>("multi-choice", key, o, choiceProps(o)),
  yesNo: <K extends string>(key: K, o: FieldOptions) => field<K, boolean>("yes-no", key, o),
  /** One option from a compact menu: for a long list (a country, a class), where single choice would be a wall of buttons. */
  dropdown: <K extends string, O extends string>(key: K, o: ChoiceFieldOptions<O>) =>
    field<K, O>("dropdown", key, o, choiceProps(o)),
  /** A number, optionally between `min` and `max` and on a `step` (from `min`, else 0): `step: 1` for whole numbers. */
  number: <K extends string>(
    key: K,
    o: FieldOptions & { min?: number | undefined; max?: number | undefined; step?: number | undefined },
  ) => field<K, number>("number", key, o, props({ min: o.min, max: o.max, step: o.step })),
  /** A calendar day, stored as `YYYY-MM-DD`, optionally between `min` and `max` (also `YYYY-MM-DD`). */
  date: <K extends string>(key: K, o: FieldOptions & { min?: string | undefined; max?: string | undefined }) =>
    field<K, string>("date", key, o, props({ min: o.min, max: o.max })),
  /**
   * A single checkbox to agree to something. `text` is the checkbox's own
   * words ("I agree to the terms"); the renderer defaults to "I agree".
   * Checked stores `true`; unchecked is unanswered, so `required` means it must be checked.
   */
  consent: <K extends string>(key: K, o: FieldOptions & { text?: string | undefined }) =>
    field<K, true>("consent", key, o, props({ text: o.text || undefined })),
  /** Several short answers, one per line: goals, action items, three things that went well. */
  list: <K extends string>(
    key: K,
    o: FieldOptions & {
      min?: number | undefined;
      max?: number | undefined;
      itemMaxLength?: number | undefined;
      itemPlaceholder?: string | undefined;
    },
  ) =>
    field<K, string[]>(
      "list",
      key,
      o,
      props({ min: o.min, max: o.max, itemMaxLength: o.itemMaxLength, placeholder: o.itemPlaceholder }),
    ),
  /**
   * A value worked out from other answers and shown read-only, such as a
   * total or a score: `formula` names answers by key (`hours * rate`,
   * `sum(plan.cost)`). Stored with the answers; never required.
   */
  calculated: <K extends string>(
    key: K,
    o: Omit<FieldOptions, "required" | "placeholder"> & {
      formula: string;
      format?: "number" | "percent" | "text" | undefined;
      decimals?: number | undefined;
    },
  ) => field<K, number | string | boolean>("calculated", key, o, props({ formula: o.formula, format: o.format, decimals: o.decimals })),
  /**
   * A small table each answer fills row by row, one answer per column: an
   * action plan (What / Who / By when), pros and cons.
   */
  table: <K extends string, C extends string>(
    key: K,
    o: FieldOptions & {
      columns: readonly { key: C; label: string; long?: boolean | undefined }[];
      minRows?: number | undefined;
      maxRows?: number | undefined;
    },
  ) =>
    field<K, Partial<Record<C, string>>[]>("table", key, o, {
      columns: o.columns.map((c): Json => (c.long ? { key: c.key, label: c.label, long: true } : { key: c.key, label: c.label })),
      ...props({ minRows: o.minRows, maxRows: o.maxRows }),
    }),
  /**
   * Notes pinned to times in a video or audio (lecture notes, a recorded call
   * review): `at` is seconds from its start.
   */
  mediaNotes: <K extends string>(
    key: K,
    o: FieldOptions & { maxNotes?: number | undefined; textMaxLength?: number | undefined },
  ) =>
    field<K, { at: number; text: string }[]>(
      "media-notes",
      key,
      o,
      props({ maxNotes: o.maxNotes, textMaxLength: o.textMaxLength }),
    ),
  /**
   * Highlight passages of a text and note on each (annotating an article, a
   * policy or a contract): `text` here, or supplied by the host app.
   */
  textHighlights: <K extends string>(
    key: K,
    o: FieldOptions & { text?: string | undefined; maxHighlights?: number | undefined },
  ) =>
    field<K, { start: number; end: number; quote: string; note: string }[]>(
      "text-highlights",
      key,
      o,
      props({ text: o.text, maxHighlights: o.maxHighlights }),
    ),
  /**
   * Up to a few photos (a picture of broken equipment). The answer holds the
   * references the host's upload returned, never the bytes; `formats` from
   * jpeg, png, heic and webp (default all four).
   */
  photo: <K extends string>(
    key: K,
    o: FieldOptions & {
      maxFiles?: number | undefined;
      maxSizeMb?: number | undefined;
      formats?: readonly PhotoFormat[] | undefined;
    },
  ) =>
    field<K, PhotoRef[]>(
      "photo",
      key,
      o,
      props({ maxFiles: o.maxFiles, maxSizeMb: o.maxSizeMb, formats: o.formats ? [...o.formats] : undefined }),
    ),
  /** Any registered field type, including plugins. */
  custom: <K extends string, V = Json>(type: string, key: K, o: FieldOptions & { props?: Record<string, Json> }) =>
    field<K, V>(type, key, o, o.props),

  heading: (id: string, text: string): ContentBlock => ({ kind: "content", id, type: "heading", text }),
  text: (id: string, text: string): ContentBlock => ({ kind: "content", id, type: "text", text }),
  pageBreak: (id: string, title?: string): PageBreakBlock =>
    title ? { kind: "page-break", id, title } : { kind: "page-break", id },

  hidden: {
    string: (o: HiddenOptions = {}) => hiddenSpec("string" as const, o),
    number: (o: HiddenOptions = {}) => hiddenSpec("number" as const, o),
    boolean: (o: HiddenOptions = {}) => hiddenSpec("boolean" as const, o),
  },
};

// ── Rule builder ─────────────────────────────────────────────────────────────

/**
 * Resolves a field key to its id. `"target"` (a show/hide target or a jump
 * destination) also accepts the id of a content block.
 */
export type KeyResolver = (key: string, as?: "field" | "target") => string;

/** A rule written with field keys; `defineForm` resolves keys to ids. */
export interface RuleSpec {
  readonly __rule: true;
  build(resolve: KeyResolver, id: string): LogicRule;
}

type Effects = {
  /** Show a field (by key) or a content block (by id). */
  show(targetKey: string): RuleSpec;
  /** Hide a field (by key) or a content block (by id). */
  hide(targetKey: string): RuleSpec;
  /** Jump from this field to a later field or content block, or to an ending. */
  jumpTo(target: string | { ending: string }): RuleSpec;
};

function effects(fromKey: string | null, condition: (resolve: KeyResolver) => Condition): Effects {
  const spec = (make: (resolve: KeyResolver, id: string) => LogicRule): RuleSpec => ({
    __rule: true,
    build: make,
  });
  return {
    show: (target) => spec((r, id) => ({ id, when: condition(r), effect: "show", target: r(target, "target") })),
    hide: (target) => spec((r, id) => ({ id, when: condition(r), effect: "hide", target: r(target, "target") })),
    jumpTo: (target) =>
      spec((r, id) => {
        if (!fromKey) throw new Error("jumpTo needs a starting field: use when(key)…");
        return {
          id,
          when: condition(r),
          effect: "jump",
          from: r(fromKey),
          to: typeof target === "string" ? r(target, "target") : target,
        };
      }),
  };
}

const compare =
  (key: string, op: Operator, value?: Json) =>
  (r: KeyResolver): Condition =>
    value === undefined ? { op, left: { field: r(key) } } : { op, left: { field: r(key) }, right: { value } };

/** Start a rule on a field: `when("overall").lessThan(4).jumpTo("improve")`. */
export function when(key: string) {
  const on = (op: Operator, value?: Json) => effects(key, compare(key, op, value));
  return {
    is: (value: Json) => on("eq", value),
    isNot: (value: Json) => on("neq", value),
    lessThan: (n: number) => on("lt", n),
    atMost: (n: number) => on("lte", n),
    greaterThan: (n: number) => on("gt", n),
    atLeast: (n: number) => on("gte", n),
    isOneOf: (values: Json[]) => on("in", values),
    includes: (value: Json) => on("contains", value),
    isAnswered: () => on("answered"),
    isEmpty: () => on("empty"),
  };
}

/** A rule from a raw condition (keys inside `{ field }` operands are resolved). */
when.condition = (condition: Condition, from?: string) =>
  effects(from ?? null, (r) => resolveCondition(condition, r));

function resolveCondition(c: Condition, r: KeyResolver): Condition {
  if ("all" in c) return { all: c.all.map((x) => resolveCondition(x, r)) };
  if ("any" in c) return { any: c.any.map((x) => resolveCondition(x, r)) };
  if ("not" in c) return { not: resolveCondition(c.not, r) };
  const fix = (o: typeof c.left) => ("field" in o ? { field: r(o.field) } : o);
  return c.right ? { op: c.op, left: fix(c.left), right: fix(c.right) } : { op: c.op, left: fix(c.left) };
}

// ── defineForm ───────────────────────────────────────────────────────────────

type HiddenSpec = {
  type: HiddenInput["type"];
  source: HiddenInput["source"];
  sensitive?: boolean | undefined;
  identifying?: boolean | undefined;
};
type HiddenValue<T extends HiddenSpec["type"]> = T extends "number" ? number : T extends "boolean" ? boolean : string;

type AnyBlock = FieldSpec<string, unknown> | ContentBlock | PageBreakBlock;

export type AnswersOf<B extends readonly AnyBlock[]> = {
  [E in B[number] as E extends FieldSpec<infer K, unknown> ? K : never]?: E extends FieldSpec<string, infer V>
    ? V
    : never;
};

export interface FormInput<B extends readonly AnyBlock[], H extends Record<string, HiddenSpec>> {
  id: string;
  title: string;
  description?: string;
  layout?: FormLayout;
  /** Authoring sugar: a map of name → spec. Normalized to the canonical array. */
  hidden?: H;
  blocks: B;
  logic?: RuleSpec[];
  endings?: Ending[];
  settings?: FormSettings;
  meta?: Record<string, Json>;
}

export interface Form<A = Record<string, unknown>, H = Record<string, unknown>> {
  readonly definition: FormDefinition;
  /** The canonical JSON, identical to what a builder would produce. */
  toJSON(): FormDefinition;
  /** Content fingerprint of the canonical JSON. */
  hash(): string;
  /** Type-level only: the answers, keyed by field key. */
  readonly $answers: A;
  /** Type-level only: the hidden inputs. */
  readonly $hidden: H;
}

/**
 * Define a form in code. The result's `definition` is the same canonical JSON
 * a builder or `parseForm` produces; answer types are inferred from the blocks.
 */
export function defineForm<
  const B extends readonly AnyBlock[],
  H extends Record<string, HiddenSpec> = Record<never, HiddenSpec>,
>(input: FormInput<B, H>): Form<AnswersOf<B>, { [K in keyof H]?: HiddenValue<H[K]["type"]> }> {
  const keyToId = new Map<string, string>();
  const contentIds = new Set<string>();
  for (const block of input.blocks) {
    if (block.kind === "field") keyToId.set(block.key, block.id);
    else contentIds.add(block.id);
  }
  const resolve: KeyResolver = (key, as = "field") => {
    const id = keyToId.get(key) ?? (as === "target" && contentIds.has(key) ? key : undefined);
    if (!id) {
      const what = as === "target" ? "field key or content block id" : "field with key";
      throw new Error(`defineForm "${input.id}": no ${what} "${key}".`);
    }
    return id;
  };

  const definition: FormDefinition = {
    schemaVersion: 1,
    id: input.id,
    title: input.title,
    blocks: input.blocks.map((b) => ({ ...b }) as FieldBlock | ContentBlock | PageBreakBlock),
  };
  if (input.description) definition.description = input.description;
  if (input.layout) definition.layout = input.layout;
  if (input.hidden && Object.keys(input.hidden).length) {
    definition.hidden = Object.entries(input.hidden).map(([name, spec]) => ({
      name,
      type: spec.type,
      source: spec.source,
      ...(spec.sensitive ? { sensitive: true } : {}),
      ...(spec.identifying ? { identifying: true } : {}),
    }));
  }
  if (input.logic?.length) definition.logic = input.logic.map((rule, i) => rule.build(resolve, `r${i + 1}`));
  if (input.endings?.length) definition.endings = input.endings;
  if (input.settings) definition.settings = input.settings;
  if (input.meta) definition.meta = input.meta;

  const frozen = JSON.parse(JSON.stringify(definition)) as FormDefinition;
  const parsed = parseForm(frozen);
  if (!parsed.ok) {
    const list = parsed.issues.map((i) => `  - ${i.path ? `${i.path}: ` : ""}${i.message}`).join("\n");
    throw new Error(`defineForm "${input.id}" is not a valid form:\n${list}`);
  }
  return {
    definition: frozen,
    toJSON: () => JSON.parse(JSON.stringify(frozen)) as FormDefinition,
    hash: () => fingerprint(frozen),
    $answers: undefined as never,
    $hidden: undefined as never,
  };
}
