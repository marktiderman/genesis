import type { Block, ContentBlock, FieldBlock, FormDefinition, Json, Operator, OptionsSource } from "./types";
import { calculatedFieldType } from "./calculated";
import { structuredFieldTypes } from "./structured";
import { photoFieldType } from "./photo";
import { isFiniteNumber, type PropsCheck } from "./props-check";
import type { AnswerSnapshot, OptionSnapshot } from "./options";

/** The JSON type a comparison literal must have to match an answer (`parseForm` warns otherwise). */
export type LiteralType = "string" | "number" | "boolean";

/**
 * A field kind, without any UI: the one definition the engine, `parseForm`, validation, the
 * server and snapshots all read, so a kind is described once instead of in a switch in each.
 * Renderers are registered separately per platform (`genesis-forms-react`), so a manifest runs
 * anywhere. Every hook is optional except where noted; a missing one means "nothing special".
 * `validate`, `checkProps`, `literal`, `snapshot` and `fromSnapshot` may throw (each fails safe,
 * as its doc says); `isEmpty`, `normalize` and `summarize` must not.
 */
export interface FieldTypeManifest {
  type: string;
  label: string;
  category: "text" | "choice" | "scale" | "date" | "media" | "advanced";
  /** `json: false` types must convert, so drafts and server replay never lose an answer. */
  value:
    | { json: true }
    | { json: false; serialize: (value: unknown) => Json; deserialize: (json: Json) => unknown };
  operators: Operator[];
  a11y: {
    semantics: "control" | "group";
    /** The HTML `autocomplete` token, such as `"email"` or `"tel"`. */
    autocomplete?: string;
    /** The HTML `inputmode` hint for on-screen keyboards, such as `"email"` or `"tel"`. */
    inputMode?: "text" | "email" | "tel" | "numeric" | "decimal" | "url" | "search";
  };
  /**
   * The props schema: `parseForm` calls it with the field's `props` (`{}` when it has none) and
   * reports what it finds as issues at `blocks[i].props.<path>`. A check that throws is reported
   * as one issue, never thrown.
   */
  checkProps?: PropsCheck;
  /**
   * The answer's shape. `choice`: the answer is one of `props.options` (`multiple: false`, a
   * text) or several (`multiple: true`, a list of texts), so the field takes `optionsFrom`,
   * `prefill`, `other` and filters, and its answers are snapshotted with their labels. Without
   * its own `validate` (or `summarize`) it gets the built-in one for its shape, so an answer is
   * always one of its options (or a typed "Other" when `props.other` allows it).
   */
  choice?: { multiple: boolean };
  /**
   * The JSON type a logic literal compared with this field must have, or a function of its props
   * (`undefined`: not known). `parseForm` warns about a literal that can never match.
   */
  literal?: LiteralType | ((props: Readonly<Record<string, unknown>>) => LiteralType | undefined);
  /** The empty-check: whether a value counts as no answer. Default: nothing, null, blank text or `[]`. */
  isEmpty?: (value: Json | undefined) => boolean;
  /**
   * The validator: an error message, or null when the (non-empty) value is valid. A validator
   * that throws refuses the answer (`VALIDATOR_FAILED_MESSAGE`) rather than throwing.
   */
  validate?: (value: Json, field: FieldBlock) => string | null;
  /** The display text: plain text for recall, exports and emails. */
  summarize?: (value: Json, field: FieldBlock) => string;
  /**
   * The form a (valid, non-empty) value is stored in, such as an email
   * without surrounding spaces. Applied by `engine.answers()` and the server.
   */
  normalize?: (value: Json, field: FieldBlock) => Json;
  /**
   * The snapshot of a (non-empty) answer as it was when stored, for `answerSnapshots`: the
   * labels it showed, so history keeps them when the source changes. Choice kinds have one
   * built in (for fields with `optionsFrom`); give another kind one here.
   */
  snapshot?: (value: Json, field: FieldBlock) => AnswerSnapshot | undefined;
  /**
   * The reverse of `snapshot`, for `answersFromSnapshots`: the answer to prefill from a stored
   * snapshot (or none), and the picks that no longer exist.
   */
  fromSnapshot?: (snapshot: unknown, field: FieldBlock) => { value?: Json; missing: OptionSnapshot[] };
  /** Valid example answers, used by `coverage()` and other test tools to explore a path. */
  samples?: (field: FieldBlock) => Json[];
}

/** The message an answer gets when its kind's validator throws. */
export const VALIDATOR_FAILED_MESSAGE = "This answer couldn't be checked.";

// One registry per process, shared by every entry point (index, server,
// testing are bundled separately), so a plugin registered once is seen by all.
// The key names the manifest format: a copy of an older release in the same
// process (whose manifests lack `choice`, `checkProps` and `literal`) keeps its
// own registry instead of overwriting these built-ins or keeping its own.
const REGISTRY = Symbol.for("@marktiderman/genesis-forms/field-types@2");
const BUILT_IN = Symbol.for("@marktiderman/genesis-forms/built-in-field-types@2");
const globalScope = globalThis as typeof globalThis & {
  [REGISTRY]?: Map<string, FieldTypeManifest>;
  [BUILT_IN]?: Set<string>;
};
const registry: Map<string, FieldTypeManifest> = (globalScope[REGISTRY] ??= new Map());
const builtIn: Set<string> = (globalScope[BUILT_IN] ??= new Set());

export interface RegisterOptions {
  /**
   * Replace a built-in kind (`email`, `single-choice`…). Off by default: the registry is shared
   * by every form in the process, the server's checks included, so changing what a built-in
   * accepts must be deliberate.
   */
  replace?: boolean;
}

const freezeRecord = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? Object.freeze({ ...v }) : v);

/**
 * A frozen copy, so changing the object after registering it (or the one `getFieldType`
 * returns) changes nothing the engine or the server reads: `choice`, `a11y` and `value` are
 * frozen copies too, and `operators` hands out a fresh copy of the list on each read.
 */
function frozen<T extends object>(manifest: T): T {
  const copy = { ...manifest } as Record<string, unknown>;
  for (const key of ["choice", "a11y", "value"]) if (key in copy) copy[key] = freezeRecord(copy[key]);
  if (Array.isArray(copy.operators)) {
    const operators = Object.freeze([...(copy.operators as unknown[])]);
    Object.defineProperty(copy, "operators", { get: () => [...operators], enumerable: true });
  }
  return Object.freeze(copy) as T;
}

/**
 * Register a field kind, or replace one a host registered before (re-registering is allowed,
 * so hot reload works). Throws on a malformed manifest, and on a built-in kind's name unless
 * `{ replace: true }`. Registered kinds are frozen copies.
 */
export function registerFieldType(manifest: FieldTypeManifest, options: RegisterOptions = {}): void {
  if (!manifest || typeof manifest.type !== "string" || !manifest.type) {
    throw new Error("registerFieldType: a field type needs a `type`.");
  }
  const value = manifest.value as { json: boolean; serialize?: unknown; deserialize?: unknown } | undefined;
  if (
    value &&
    !value.json &&
    (typeof value.serialize !== "function" || typeof value.deserialize !== "function")
  ) {
    throw new Error(
      `registerFieldType: "${manifest.type}" stores a non-JSON value, so it must provide both serialize and deserialize.`,
    );
  }
  if (!value || !Array.isArray(manifest.operators)) {
    throw new Error(`registerFieldType: "${manifest.type}" needs a \`value\` and a list of \`operators\`.`);
  }
  if (manifest.choice !== undefined && typeof manifest.choice?.multiple !== "boolean") {
    throw new Error(`registerFieldType: "${manifest.type}" has a \`choice\` without \`multiple: true | false\`.`);
  }
  if (builtIn.has(manifest.type) && options.replace !== true) {
    throw new Error(
      `registerFieldType: "${manifest.type}" is a built-in field type; pass { replace: true } to replace it for every form in this process.`,
    );
  }
  registry.set(manifest.type, frozen(withChoiceDefaults(manifest)));
}

/** Built-ins: the first copy loaded wins, so a later entry point never undoes a host's `replace`. */
function registerBuiltIn(manifest: FieldTypeManifest): void {
  builtIn.add(manifest.type);
  if (!registry.has(manifest.type)) registry.set(manifest.type, frozen(manifest));
}

export function getFieldType(type: string): FieldTypeManifest | undefined {
  return registry.get(type);
}

export function listFieldTypes(): FieldTypeManifest[] {
  return [...registry.values()];
}

/** Whether `type` is one of the field kinds the package ships. */
export function isBuiltInFieldType(type: string): boolean {
  return builtIn.has(type);
}

/** A choice kind's answer shape (`FieldTypeManifest.choice`), or undefined for any other kind. */
export function choiceKind(type: string): { multiple: boolean } | undefined {
  return registry.get(type)?.choice;
}

/** Whether a block is a field of a choice kind: its answer is one or more of its options. */
export function isChoiceField(block: unknown): block is FieldBlock {
  return (
    !!block &&
    (block as FieldBlock).kind === "field" &&
    typeof (block as FieldBlock).type === "string" &&
    choiceKind((block as FieldBlock).type) !== undefined
  );
}

/** The JSON type a logic literal must have to match a field of `type` with these props, when known. */
export function literalType(type: string, props: Readonly<Record<string, unknown>>): LiteralType | undefined {
  const literal = registry.get(type)?.literal;
  if (typeof literal !== "function") return literal;
  try {
    return literal(props);
  } catch {
    // Not known: `parseForm` only warns from it, and never throws.
    return undefined;
  }
}

// ── Content kinds ────────────────────────────────────────────────────────────

/**
 * A content kind (a block that shows something and takes no answer): `heading` and `text` are
 * built in; a host registers others (a message screen, a media block) with
 * `registerContentType`, plus a renderer per platform.
 */
export interface ContentTypeManifest {
  type: string;
  label: string;
  /** The props schema, as for a field kind; the block's `props`, `{}` when it has none. */
  checkProps?: PropsCheck;
  /** The display text (recall, exports, a renderer with no special drawing). Default: `block.text`. */
  text?: (block: ContentBlock) => string;
}

const CONTENT_REGISTRY = Symbol.for("@marktiderman/genesis-forms/content-types@1");
const contentScope = globalThis as typeof globalThis & { [CONTENT_REGISTRY]?: Map<string, ContentTypeManifest> };
const contentRegistry: Map<string, ContentTypeManifest> = (contentScope[CONTENT_REGISTRY] ??= new Map());
const BUILT_IN_CONTENT: ReadonlySet<string> = new Set(["heading", "text"]);

/** Register a content kind. Throws on a malformed manifest or a built-in kind's name (unless `{ replace: true }`). */
export function registerContentType(manifest: ContentTypeManifest, options: RegisterOptions = {}): void {
  if (!manifest || typeof manifest.type !== "string" || !manifest.type) {
    throw new Error("registerContentType: a content type needs a `type`.");
  }
  if (BUILT_IN_CONTENT.has(manifest.type) && options.replace !== true) {
    throw new Error(
      `registerContentType: "${manifest.type}" is a built-in content type; pass { replace: true } to replace it for every form in this process.`,
    );
  }
  contentRegistry.set(manifest.type, frozen(manifest));
}

export function getContentType(type: string): ContentTypeManifest | undefined {
  return contentRegistry.get(type);
}

export function listContentTypes(): ContentTypeManifest[] {
  return [...contentRegistry.values()];
}

/** A content block's display text: its kind's `text`, or `block.text`. */
export function contentText(block: ContentBlock): string {
  const text = contentRegistry.get(block.type)?.text;
  return text ? text(block) : block.text;
}

for (const manifest of [
  { type: "heading", label: "Heading" },
  { type: "text", label: "Text" },
] satisfies ContentTypeManifest[]) {
  if (!contentRegistry.has(manifest.type)) contentRegistry.set(manifest.type, frozen(manifest));
}

export function isEmptyValue(value: Json | undefined, field?: FieldBlock): boolean {
  const manifest = field ? registry.get(field.type) : undefined;
  if (manifest?.isEmpty) return manifest.isEmpty(value);
  if (value === undefined || value === null) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

/** A value in its stored form (see `FieldTypeManifest.normalize`). */
export function normalizeValue(value: Json, field: FieldBlock): Json {
  const manifest = registry.get(field.type);
  return manifest?.normalize ? manifest.normalize(value, field) : value;
}

/** Whether a block holds personal or secret data: `sensitive: true`, or the `props.sensitive: true` alias. */
export function isSensitive(block: Block): boolean {
  return block.kind === "field" && (block.sensitive === true || block.props?.sensitive === true);
}

export function summarizeValue(value: Json | undefined, field: FieldBlock): string {
  if (isEmptyValue(value, field)) return "";
  const manifest = registry.get(field.type);
  if (manifest?.summarize) return manifest.summarize(value as Json, field);
  if (Array.isArray(value)) return value.join(", ");
  return String(value);
}

// ── Built-in types (R1) ──────────────────────────────────────────────────────

export interface ChoiceOption {
  value: string;
  label?: string;
  /** A muted line under the label, such as a location's address. At most `OPTION_LIMITS.description` characters. */
  description?: string;
  /** A small picture beside the label: an `https://` URL, at most `OPTION_LIMITS.image` characters. */
  image?: string;
  /**
   * Facts about the option for filtering and recall, such as `{ location: ["riverside", "hilltop"] }`
   * for a coach who works at two locations (see `props.optionsFrom.filter`). Names and values are
   * text; a value is one text or a list of them.
   */
  attributes?: Record<string, string | string[]>;
}

/** Bounds on an option's extra details. A longer or malformed detail is dropped when options are read. */
export const OPTION_LIMITS = {
  /** Characters in a description. */
  description: 500,
  /** Characters in an image URL. */
  image: 2048,
  /** Attributes on one option. */
  attributes: 20,
  /** Characters in an attribute's name. */
  attributeName: 64,
  /** Characters in one attribute value. */
  attributeValue: 200,
  /** Values in one attribute's list. */
  attributeItems: 50,
} as const;

/**
 * Whether `url` is an `https://` link with a host and no spaces or control characters, within
 * `OPTION_LIMITS.image`. A pattern rather than `new URL`, so it behaves the same in React Native.
 */
export function isHttpsUrl(url: unknown): url is string {
  return (
    typeof url === "string" &&
    url.length <= OPTION_LIMITS.image &&
    /^https:\/\/[^\s/?#@\\]+(?:[/?#][^\s]*)?$/i.test(url) &&
    // No control characters anywhere (a line break would end a CSV row or an HTML attribute).
    ![...url].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)
  );
}

/** A well-formed attribute name: text, not blank, not an `Object.prototype` name, within the limit. */
function attributeName(name: string): boolean {
  return name.trim() !== "" && name.length <= OPTION_LIMITS.attributeName && !(name in Object.prototype);
}

/** The attributes of a raw option that are well formed, or undefined when none are. */
function readAttributes(raw: unknown): Record<string, string | string[]> | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const out: Record<string, string | string[]> = {};
  let count = 0;
  for (const name of Object.keys(raw)) {
    if (count >= OPTION_LIMITS.attributes) break;
    if (!attributeName(name)) continue;
    const v = (raw as Record<string, unknown>)[name];
    const fits = (x: unknown): x is string => typeof x === "string" && x.length <= OPTION_LIMITS.attributeValue;
    if (fits(v)) out[name] = v;
    else if (Array.isArray(v) && v.length <= OPTION_LIMITS.attributeItems && v.every(fits)) out[name] = [...v];
    else continue;
    count++;
  }
  return count ? out : undefined;
}

/**
 * An option from untrusted JSON (a definition, the host's list): its string `value`, and its
 * `label`, `description`, `image` and `attributes` when each is well formed and within
 * `OPTION_LIMITS`; anything else is left out. Null when there is no string value.
 */
export function readOption(raw: unknown): ChoiceOption | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.value !== "string") return null;
  const out: ChoiceOption = { value: o.value };
  if (typeof o.label === "string") out.label = o.label;
  if (typeof o.description === "string" && o.description.trim() && o.description.length <= OPTION_LIMITS.description) {
    out.description = o.description;
  }
  if (isHttpsUrl(o.image)) out.image = o.image;
  const attributes = readAttributes(o.attributes);
  if (attributes) out.attributes = attributes;
  return out;
}

/** An option as JSON, with only the details it has. */
export function optionJson(option: ChoiceOption): Json {
  const out: Record<string, Json> = { value: option.value };
  if (option.label !== undefined) out.label = option.label;
  if (option.description !== undefined) out.description = option.description;
  if (option.image !== undefined) out.image = option.image;
  if (option.attributes !== undefined) out.attributes = { ...option.attributes } as Record<string, Json>;
  return out;
}

/** The longest answer an "Other" option takes. */
export const OTHER_MAX_LENGTH = 200;

/**
 * A choice question's "Other" option (`props.other: true` or `{ label }`): the respondent types
 * their own answer, stored as the answer's value itself (single choice, dropdown) or as one more
 * item (multiple choice). Null when the question has none.
 */
export function otherOption(field: FieldBlock): { label: string } | null {
  const other = field.props?.other;
  if (other === true) return { label: "Other" };
  if (other && typeof other === "object" && !Array.isArray(other)) {
    const label = typeof other.label === "string" && other.label.trim() ? other.label.trim() : "Other";
    return { label };
  }
  return null;
}

/** Whether a value is a typed "Other" answer: text that isn't one of the question's options. */
export function isOtherValue(field: FieldBlock, value: unknown): value is string {
  return (
    otherOption(field) !== null &&
    typeof value === "string" &&
    !choiceOptions(field).some((o) => o.value === value)
  );
}

const typedOther = (field: FieldBlock, value: unknown) =>
  isOtherValue(field, value) && value.trim() !== "" && value.length <= OTHER_MAX_LENGTH;

export function choiceOptions(field: FieldBlock): ChoiceOption[] {
  const raw = field.props?.options;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((o) => {
    const option = readOption(o);
    return option ? [option] : [];
  });
}

/**
 * Option lists the app showing a form supplies, by key (`OptionsSource.key`):
 * `{ coaches: [{ value: "8c1…", label: "Ada Lovelace" }] }`.
 */
export type HostOptions = Readonly<Record<string, readonly ChoiceOption[]>>;

/**
 * A choice field's `props.optionsFrom`, when it is a well-formed `{ source: "host", key }`, with its
 * `filter` when that is well formed too (`{ attribute, field }`, both non-empty text).
 */
export function optionsSource(field: FieldBlock): OptionsSource | undefined {
  const raw = field.props?.optionsFrom;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  if (raw.source !== "host" || typeof raw.key !== "string" || !raw.key) return undefined;
  const out: OptionsSource = { source: "host", key: raw.key };
  const filter = raw.filter;
  if (
    filter &&
    typeof filter === "object" &&
    !Array.isArray(filter) &&
    typeof filter.attribute === "string" &&
    filter.attribute &&
    typeof filter.field === "string" &&
    filter.field
  ) {
    out.filter = { attribute: filter.attribute, field: filter.field };
  }
  return out;
}

/** The host's list for `key`, as options: string values only, each value once, labels when they are text. */
function hostList(hostOptions: HostOptions | undefined, key: string): ChoiceOption[] {
  if (!hostOptions || !Object.prototype.hasOwnProperty.call(hostOptions, key)) return [];
  const list = hostOptions[key];
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const out: ChoiceOption[] = [];
  for (const o of list as unknown[]) {
    const option = readOption(o);
    if (!option || !option.value || seen.has(option.value)) continue;
    seen.add(option.value);
    out.push(option);
  }
  return out;
}

/**
 * The definition with each `optionsFrom: { source: "host" }` field's options
 * filled in from `hostOptions`: its own `props.options` first, then the host's
 * list for its key (a value the field already has is not added twice). A key
 * the host does not supply adds nothing, so the field offers its own options
 * only. `createForm` and `validateSubmission` call it with their `hostOptions`,
 * so a respondent sees, and a submit accepts, exactly these. Returns
 * `definition` itself when no field takes options from the host.
 */
export function withHostOptions(definition: FormDefinition, hostOptions: HostOptions | undefined): FormDefinition {
  let changed = false;
  const blocks = definition.blocks.map((block) => {
    if (block.kind !== "field") return block;
    const from = optionsSource(block);
    if (!from) return block;
    const own = choiceOptions(block);
    const taken = new Set(own.map((o) => o.value));
    const added = hostList(hostOptions, from.key).filter((o) => !taken.has(o.value));
    if (!added.length) return block;
    changed = true;
    const options = [...own, ...added].map(optionJson);
    return { ...block, props: { ...block.props, options } };
  });
  return changed ? { ...definition, blocks } : definition;
}

function optionLabel(field: FieldBlock, value: string): string {
  const option = choiceOptions(field).find((o) => o.value === value);
  return option?.label ?? value;
}

function intRange(field: FieldBlock, min: number, maxDefault: number) {
  const max = typeof field.props?.max === "number" ? field.props.max : maxDefault;
  return { min, max };
}

const numberOps: Operator[] = ["eq", "neq", "lt", "lte", "gt", "gte", "in", "answered", "empty"];
const textOps: Operator[] = ["eq", "neq", "contains", "answered", "empty"];

function maxLength(field: FieldBlock, fallback: number): number {
  return typeof field.props?.maxLength === "number" ? field.props.maxLength : fallback;
}

function textValidate(fallback: number) {
  return (value: Json, field: FieldBlock) => {
    if (typeof value !== "string") return "Enter text.";
    const limit = maxLength(field, fallback);
    return value.length > limit ? `Keep it under ${limit} characters.` : null;
  };
}

/** The longest address SMTP allows (RFC 5321). */
const MAX_EMAIL_LENGTH = 254;

/**
 * `local@domain.tld`: no spaces, exactly one `@`, and a dot inside the domain.
 * A linear scan rather than a regex, so a hostile value cannot backtrack.
 */
export function isEmailAddress(value: string): boolean {
  if (value.length > MAX_EMAIL_LENGTH || /\s/.test(value)) return false;
  const at = value.indexOf("@");
  if (at < 1 || value.indexOf("@", at + 1) !== -1) return false;
  const domain = value.slice(at + 1);
  // A dot with at least one character on each side.
  return domain.slice(1, -1).includes(".");
}

/** Longest phone number accepted, separators included. */
const MAX_PHONE_LENGTH = 32;

/**
 * Digits with optional separators (spaces, `-`, `(`, `)`, `.`) and an
 * optional leading `+`; 7 to 15 digits (E.164 allows at most 15). One linear scan.
 */
function isPhoneNumber(value: string): boolean {
  if (value.length > MAX_PHONE_LENGTH) return false;
  let digits = 0;
  for (let i = 0; i < value.length; i++) {
    const c = value[i]!;
    if (c >= "0" && c <= "9") digits++;
    else if (c === "+") {
      if (i !== 0) return false;
    } else if (c !== " " && c !== "-" && c !== "(" && c !== ")" && c !== ".") return false;
  }
  return digits >= 7 && digits <= 15;
}

/** A single choice's or dropdown's check: one of the options, or a typed "Other" answer. */
const oneOptionValidate = (value: Json, field: FieldBlock): string | null =>
  typeof value === "string" && (choiceOptions(field).some((o) => o.value === value) || typedOther(field, value))
    ? null
    : "Choose one of the options.";
const oneOptionSummary = (value: Json, field: FieldBlock) => optionLabel(field, String(value));

/** A multiple choice's check. */
const optionsValidate = (value: Json, field: FieldBlock): string | null => {
  const allowed = new Set(choiceOptions(field).map((o) => o.value));
  // Each option at most once, plus at most one typed "Other" answer, so a value is never
  // longer than the option list and one.
  const others = Array.isArray(value) ? value.filter((v) => typeof v === "string" && !allowed.has(v)) : [];
  return Array.isArray(value) &&
    new Set(value).size === value.length &&
    value.every((v) => typeof v === "string") &&
    (others.length === 0 || (others.length === 1 && typedOther(field, others[0])))
    ? null
    : "Choose from the options.";
};
const optionsSummary = (value: Json, field: FieldBlock) =>
  Array.isArray(value) ? value.map((v) => optionLabel(field, String(v))).join(", ") : String(value);

/**
 * A choice kind registered without its own `validate` or `summarize` gets the built-in ones for
 * its answer shape, so its answers are always checked against its options.
 */
function withChoiceDefaults(manifest: FieldTypeManifest): FieldTypeManifest {
  if (!manifest.choice || (manifest.validate && manifest.summarize)) return manifest;
  const multiple = manifest.choice.multiple;
  return {
    ...manifest,
    validate: manifest.validate ?? (multiple ? optionsValidate : oneOptionValidate),
    summarize: manifest.summarize ?? (multiple ? optionsSummary : oneOptionSummary),
  };
}

/** A rating's or NPS's words under the ends of the scale. */
const scaleProps: PropsCheck = (props, check) => {
  check.optionalText(props.lowLabel, "lowLabel");
  check.optionalText(props.highLabel, "highLabel");
};

const builtins: FieldTypeManifest[] = [
  {
    type: "short-text",
    label: "Short text",
    category: "text",
    value: { json: true },
    operators: textOps,
    a11y: { semantics: "control" },
    literal: "string",
    validate: textValidate(500),
  },
  {
    type: "long-text",
    label: "Long text",
    category: "text",
    value: { json: true },
    operators: textOps,
    a11y: { semantics: "control" },
    literal: "string",
    validate: textValidate(5000),
  },
  {
    type: "email",
    label: "Email",
    category: "text",
    value: { json: true },
    operators: textOps,
    a11y: { semantics: "control", autocomplete: "email", inputMode: "email" },
    literal: "string",
    validate: (value) =>
      typeof value === "string" && isEmailAddress(value.trim())
        ? null
        : "Enter an email address like name@example.com.",
    normalize: (value) => (typeof value === "string" ? value.trim() : value),
  },
  {
    type: "phone",
    label: "Phone",
    category: "text",
    value: { json: true },
    operators: ["eq", "neq", "answered", "empty"],
    a11y: { semantics: "control", autocomplete: "tel", inputMode: "tel" },
    literal: "string",
    validate: (value) =>
      typeof value === "string" && isPhoneNumber(value.trim())
        ? null
        : "Enter a phone number with 7 to 15 digits.",
    normalize: (value) => (typeof value === "string" ? value.trim() : value),
    summarize: (value) => String(value),
  },
  {
    type: "rating",
    label: "Rating",
    category: "scale",
    value: { json: true },
    operators: numberOps,
    a11y: { semantics: "group" },
    literal: "number",
    checkProps: (props, check) => {
      scaleProps(props, check);
      if (props.display !== undefined && props.display !== "numbers" && props.display !== "stars") {
        check.issue("display", "Must be numbers or stars.");
      }
    },
    validate: (value, field) => {
      const { min, max } = intRange(field, 1, 5);
      return Number.isInteger(value) && (value as number) >= min && (value as number) <= max
        ? null
        : `Choose a rating from ${min} to ${max}.`;
    },
    summarize: (value, field) => {
      const { max } = intRange(field, 1, 5);
      const end = scaleEndLabel(field, value as number, 1, max);
      return end ? `${value}/${max} (${end})` : `${value}/${max}`;
    },
  },
  {
    type: "nps",
    label: "Net Promoter Score",
    category: "scale",
    value: { json: true },
    operators: numberOps,
    a11y: { semantics: "group" },
    literal: "number",
    checkProps: scaleProps,
    validate: (value) =>
      Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 10
        ? null
        : "Choose a score from 0 to 10.",
    summarize: (value, field) => {
      const end = scaleEndLabel(field, value as number, 0, 10);
      return end ? `${value}/10 (${end})` : `${value}/10`;
    },
  },
  {
    type: "single-choice",
    label: "Single choice",
    category: "choice",
    value: { json: true },
    operators: ["eq", "neq", "in", "answered", "empty"],
    a11y: { semantics: "group" },
    literal: "string",
    choice: { multiple: false },
    validate: oneOptionValidate,
    summarize: oneOptionSummary,
  },
  {
    type: "multi-choice",
    label: "Multiple choice",
    category: "choice",
    value: { json: true },
    operators: ["contains", "answered", "empty"],
    a11y: { semantics: "group" },
    literal: "string",
    choice: { multiple: true },
    validate: optionsValidate,
    summarize: optionsSummary,
  },
  {
    type: "yes-no",
    label: "Yes / no",
    category: "choice",
    value: { json: true },
    operators: ["eq", "neq", "answered", "empty"],
    a11y: { semantics: "group" },
    literal: "boolean",
    validate: (value) => (typeof value === "boolean" ? null : "Choose yes or no."),
    summarize: (value) => (value ? "Yes" : "No"),
  },
  {
    type: "dropdown",
    label: "Dropdown",
    category: "choice",
    value: { json: true },
    operators: ["eq", "neq", "in", "answered", "empty"],
    a11y: { semantics: "control" },
    literal: "string",
    choice: { multiple: false },
    validate: oneOptionValidate,
    summarize: oneOptionSummary,
  },
  {
    type: "number",
    label: "Number",
    category: "text",
    value: { json: true },
    operators: numberOps,
    a11y: { semantics: "control", inputMode: "decimal" },
    literal: "number",
    checkProps: (props, check) => {
      for (const k of ["min", "max", "step"] as const) {
        if (props[k] !== undefined && !isFiniteNumber(props[k])) check.issue(k, "Must be a number.");
      }
      if (isFiniteNumber(props.step) && props.step <= 0) check.issue("step", "Must be above 0.");
      if (isFiniteNumber(props.min) && isFiniteNumber(props.max) && props.min > props.max) {
        check.issue("min", "Can't be more than the largest number.");
      }
    },
    validate: (value, field) => {
      if (typeof value !== "number" || !Number.isFinite(value)) return "Enter a number.";
      const { min, max, step } = numberLimits(field);
      if (min !== undefined && max !== undefined && (value < min || value > max)) {
        return `Enter a number from ${min} to ${max}.`;
      }
      if (min !== undefined && value < min) return `Enter ${min} or more.`;
      if (max !== undefined && value > max) return `Enter ${max} or less.`;
      if (step !== undefined && !onStep(value, min ?? 0, step)) {
        return step === 1 && Number.isInteger(min ?? 0)
          ? "Enter a whole number."
          : `Enter a number in steps of ${step}.`;
      }
      return null;
    },
    summarize: (value) => String(value),
    samples: (field) => {
      const { min, max } = numberLimits(field);
      return [min, max, 0, 1].filter((v): v is number => v !== undefined);
    },
  },
  {
    type: "date",
    label: "Date",
    category: "date",
    value: { json: true },
    operators: ["eq", "neq", "answered", "empty"],
    a11y: { semantics: "control" },
    literal: "string",
    checkProps: (props, check) => {
      for (const k of ["min", "max"] as const) {
        if (props[k] !== undefined && !(typeof props[k] === "string" && isIsoDate(props[k]))) {
          check.issue(k, "Must be a date like 2026-10-22.");
        }
      }
      if (typeof props.min === "string" && typeof props.max === "string" && isIsoDate(props.min) && isIsoDate(props.max) && props.min > props.max) {
        check.issue("min", "Can't be after the latest date.");
      }
    },
    validate: (value, field) => {
      if (typeof value !== "string" || !isIsoDate(value.trim())) return "Enter a date like 2026-10-22.";
      const date = value.trim();
      const { min, max } = dateLimits(field);
      if (min && max && (date < min || date > max)) return `Choose a date from ${min} to ${max}.`;
      if (min && date < min) return `Choose ${min} or later.`;
      if (max && date > max) return `Choose ${max} or earlier.`;
      return null;
    },
    normalize: (value) => (typeof value === "string" ? value.trim() : value),
    samples: (field) => {
      const { min, max } = dateLimits(field);
      return [min ?? max ?? "2000-01-01"];
    },
  },
  {
    type: "consent",
    label: "Consent checkbox",
    category: "choice",
    value: { json: true },
    operators: ["answered", "empty"],
    a11y: { semantics: "group" },
    literal: "boolean",
    checkProps: (props, check) => check.optionalText(props.text, "text"),
    // Unchecked is unanswered, so a required consent must be checked.
    isEmpty: (value) => value === undefined || value === null || value === false,
    validate: (value) => (value === true ? null : "Check the box to agree."),
    summarize: () => "Agreed",
    samples: () => [true],
  },
];

/** The optional words under the ends of a rating or NPS scale ("Poor", "Great"). */
export function scaleLabels(field: FieldBlock): { low?: string; high?: string } {
  const out: { low?: string; high?: string } = {};
  const low = field.props?.lowLabel;
  const high = field.props?.highLabel;
  if (typeof low === "string" && low.trim()) out.low = low.trim();
  if (typeof high === "string" && high.trim()) out.high = high.trim();
  return out;
}

/** How a rating is drawn: `"numbers"` (default) or `"stars"`. */
export function ratingDisplay(field: FieldBlock): "numbers" | "stars" {
  return field.props?.display === "stars" ? "stars" : "numbers";
}

function scaleEndLabel(field: FieldBlock, value: number, min: number, max: number): string | undefined {
  const { low, high } = scaleLabels(field);
  return value === min ? low : value === max ? high : undefined;
}

const finite = (v: Json | undefined): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? v : undefined;

/** A `number` field's limits: `min`, `max` and `step` (each optional; `step` is above 0). */
export function numberLimits(field: FieldBlock): { min?: number; max?: number; step?: number } {
  const out: { min?: number; max?: number; step?: number } = {};
  const min = finite(field.props?.min);
  const max = finite(field.props?.max);
  const step = finite(field.props?.step);
  if (min !== undefined) out.min = min;
  if (max !== undefined) out.max = max;
  if (step !== undefined && step > 0) out.step = step;
  return out;
}

/** Whether `value` is `base` plus a whole number of `step`s, allowing for floating-point error. */
function onStep(value: number, base: number, step: number): boolean {
  const n = (value - base) / step;
  return Math.abs(n - Math.round(n)) < 1e-9 * Math.max(1, Math.abs(n));
}

/** `YYYY-MM-DD`, a real calendar day (no 2026-02-30), years 0001 to 9999. */
export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number) as [number, number, number];
  if (y < 1 || m < 1 || m > 12 || d < 1) return false;
  const days = [31, y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return d <= days[m - 1]!;
}

/** A `date` field's earliest and latest days (`YYYY-MM-DD`), when set. */
export function dateLimits(field: FieldBlock): { min?: string; max?: string } {
  const out: { min?: string; max?: string } = {};
  const min = field.props?.min;
  const max = field.props?.max;
  if (typeof min === "string" && isIsoDate(min)) out.min = min;
  if (typeof max === "string" && isIsoDate(max)) out.max = max;
  return out;
}

for (const manifest of [...builtins, ...structuredFieldTypes, calculatedFieldType, photoFieldType]) registerBuiltIn(manifest);
