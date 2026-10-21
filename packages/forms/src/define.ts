import { fingerprint } from "./hash";
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
  description?: string;
  placeholder?: string;
  required?: boolean;
  /** Defaults to the key. Set it before renaming a key on a live form, so answers stay linked. */
  id?: string;
}

export interface ChoiceFieldOptions<O extends string> extends FieldOptions {
  options: readonly { value: O; label?: string }[];
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
  if (props && Object.keys(props).length) block.props = props;
  return block as FieldSpec<K, V>;
}

const choiceProps = (options: readonly { value: string; label?: string }[]): Record<string, Json> => ({
  options: options.map((o): Json => (o.label ? { value: o.value, label: o.label } : { value: o.value })),
});

export const f = {
  shortText: <K extends string>(key: K, o: FieldOptions & { maxLength?: number }) =>
    field<K, string>("short-text", key, o, o.maxLength ? { maxLength: o.maxLength } : undefined),
  longText: <K extends string>(key: K, o: FieldOptions & { maxLength?: number }) =>
    field<K, string>("long-text", key, o, o.maxLength ? { maxLength: o.maxLength } : undefined),
  email: <K extends string>(key: K, o: FieldOptions) => field<K, string>("email", key, o),
  rating: <K extends string>(key: K, o: FieldOptions & { max?: number }) =>
    field<K, number>("rating", key, o, { max: o.max ?? 5 }),
  nps: <K extends string>(key: K, o: FieldOptions) => field<K, number>("nps", key, o),
  singleChoice: <K extends string, O extends string>(key: K, o: ChoiceFieldOptions<O>) =>
    field<K, O>("single-choice", key, o, choiceProps(o.options)),
  multiChoice: <K extends string, O extends string>(key: K, o: ChoiceFieldOptions<O>) =>
    field<K, O[]>("multi-choice", key, o, choiceProps(o.options)),
  yesNo: <K extends string>(key: K, o: FieldOptions) => field<K, boolean>("yes-no", key, o),
  /** Any registered field type, including plugins. */
  custom: <K extends string, V = Json>(type: string, key: K, o: FieldOptions & { props?: Record<string, Json> }) =>
    field<K, V>(type, key, o, o.props),

  heading: (id: string, text: string): ContentBlock => ({ kind: "content", id, type: "heading", text }),
  text: (id: string, text: string): ContentBlock => ({ kind: "content", id, type: "text", text }),
  pageBreak: (id: string, title?: string): PageBreakBlock =>
    title ? { kind: "page-break", id, title } : { kind: "page-break", id },

  hidden: {
    string: (o: { source?: HiddenInput["source"] } = {}) => ({ type: "string" as const, source: o.source ?? "url" }),
    number: (o: { source?: HiddenInput["source"] } = {}) => ({ type: "number" as const, source: o.source ?? "url" }),
    boolean: (o: { source?: HiddenInput["source"] } = {}) => ({ type: "boolean" as const, source: o.source ?? "url" }),
  },
};

// ── Rule builder ─────────────────────────────────────────────────────────────

/** A rule written with field keys; `defineForm` resolves keys to ids. */
export interface RuleSpec {
  readonly __rule: true;
  build(resolve: (key: string) => string, id: string): LogicRule;
}

type Effects = {
  show(targetKey: string): RuleSpec;
  hide(targetKey: string): RuleSpec;
  /** Jump from this field to a later field, or to an ending. */
  jumpTo(target: string | { ending: string }): RuleSpec;
};

function effects(fromKey: string | null, condition: (resolve: (key: string) => string) => Condition): Effects {
  const spec = (make: (resolve: (key: string) => string, id: string) => LogicRule): RuleSpec => ({
    __rule: true,
    build: make,
  });
  return {
    show: (target) => spec((r, id) => ({ id, when: condition(r), effect: "show", target: r(target) })),
    hide: (target) => spec((r, id) => ({ id, when: condition(r), effect: "hide", target: r(target) })),
    jumpTo: (target) =>
      spec((r, id) => {
        if (!fromKey) throw new Error("jumpTo needs a starting field: use when(key)…");
        return {
          id,
          when: condition(r),
          effect: "jump",
          from: r(fromKey),
          to: typeof target === "string" ? r(target) : target,
        };
      }),
  };
}

const compare =
  (key: string, op: Operator, value?: Json) =>
  (r: (key: string) => string): Condition =>
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

function resolveCondition(c: Condition, r: (key: string) => string): Condition {
  if ("all" in c) return { all: c.all.map((x) => resolveCondition(x, r)) };
  if ("any" in c) return { any: c.any.map((x) => resolveCondition(x, r)) };
  if ("not" in c) return { not: resolveCondition(c.not, r) };
  const fix = (o: typeof c.left) => ("field" in o ? { field: r(o.field) } : o);
  return c.right ? { op: c.op, left: fix(c.left), right: fix(c.right) } : { op: c.op, left: fix(c.left) };
}

// ── defineForm ───────────────────────────────────────────────────────────────

type HiddenSpec = { type: HiddenInput["type"]; source: HiddenInput["source"] };
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
  for (const block of input.blocks) {
    if (block.kind === "field") keyToId.set(block.key, block.id);
  }
  const resolve = (key: string) => {
    const id = keyToId.get(key);
    if (!id) throw new Error(`defineForm "${input.id}": no field with key "${key}".`);
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
    }));
  }
  if (input.logic?.length) definition.logic = input.logic.map((rule, i) => rule.build(resolve, `r${i + 1}`));
  if (input.endings?.length) definition.endings = input.endings;
  if (input.settings) definition.settings = input.settings;
  if (input.meta) definition.meta = input.meta;

  const frozen = JSON.parse(JSON.stringify(definition)) as FormDefinition;
  return {
    definition: frozen,
    toJSON: () => JSON.parse(JSON.stringify(frozen)) as FormDefinition,
    hash: () => fingerprint(frozen),
    $answers: undefined as never,
    $hidden: undefined as never,
  };
}
