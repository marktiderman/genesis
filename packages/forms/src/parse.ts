import { CALCULATED_TYPE, MAX_CALCULATED_DECIMALS, MAX_FORM_FORMULA_LENGTH } from "./calculated";
import { isJson } from "./events";
import { getFieldType, isIsoDate } from "./fields";
import { parseFormula } from "./formula";
import { recallRefs } from "./recall";
import { MAX_TABLE_COLUMNS } from "./structured";
import type { Condition, FormDefinition, Operator } from "./types";

/** A value for a message. Never throws: parseForm accepts any input, including BigInts, cycles and deep nesting. */
function shown(v: unknown): string {
  let text: string | undefined;
  try {
    text = JSON.stringify(v);
  } catch {
    text = undefined;
  }
  text ??= typeof v === "bigint" ? `${v}n` : typeof v;
  return text.length > 60 ? `${text.slice(0, 57)}...` : text;
}

export interface FormIssue {
  path: string;
  message: string;
}

export type ParseResult =
  | { ok: true; form: FormDefinition; warnings: FormIssue[] }
  | { ok: false; issues: FormIssue[]; warnings: FormIssue[] };

const isObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);

/** The JSON type a comparison operand must have to match a built-in field type's value. */
const LITERAL_TYPE: Readonly<Record<string, "string" | "number" | "boolean">> = {
  "short-text": "string",
  "long-text": "string",
  email: "string",
  phone: "string",
  rating: "number",
  nps: "number",
  "single-choice": "string",
  "multi-choice": "string",
  "yes-no": "boolean",
  list: "string",
  dropdown: "string",
  number: "number",
  date: "string",
  consent: "boolean",
  // A calculated field holds a number unless its format says text; see `literalType`.
  calculated: "number",
};

/** Field types whose answer is one of `props.options`. */
const CHOICE_TYPES: ReadonlySet<string> = new Set(["single-choice", "multi-choice", "dropdown"]);

const ORDERING: ReadonlySet<string> = new Set<Operator>(["lt", "lte", "gt", "gte"]);

const OPERATORS: ReadonlySet<string> = new Set<Operator>([
  "eq",
  "neq",
  "lt",
  "lte",
  "gt",
  "gte",
  "in",
  "contains",
  "answered",
  "empty",
]);

/**
 * Names an id, key or hidden input may not take: they collide with
 * `Object.prototype` (`__proto__`, `constructor`, `toString`…) when used as a
 * record key.
 */
const RESERVED: ReadonlySet<string> = new Set(Object.getOwnPropertyNames(Object.prototype));

/** Deepest nesting of `all` / `any` / `not` a condition may have. */
const MAX_CONDITION_DEPTH = 32;

/**
 * Check a definition before it is stored or rendered: structure, the types of
 * text fields, unique ids and keys, known field types, references that
 * resolve, operators that fit the field type. Warnings flag things that work
 * but are probably mistakes. Never throws, whatever the input.
 */
export function parseForm(input: unknown): ParseResult {
  const issues: FormIssue[] = [];
  const warnings: FormIssue[] = [];
  const fail = () => ({ ok: false as const, issues, warnings });
  const issue = (path: string, message: string) => void issues.push({ path, message });

  /** A required string (non-empty with `nonEmpty`). */
  const text = (v: unknown, path: string, nonEmpty = false) => {
    if (typeof v !== "string" || (nonEmpty && !v)) issue(path, nonEmpty ? "Required." : "Required text.");
  };
  /** An optional string. */
  const optionalText = (v: unknown, path: string) => {
    if (v !== undefined && typeof v !== "string") issue(path, "Must be text.");
  };
  const optionalBoolean = (v: unknown, path: string) => {
    if (v !== undefined && typeof v !== "boolean") issue(path, "Must be true or false.");
  };
  /** An identifier: a non-empty string that is not an `Object.prototype` name. */
  const name = (v: unknown, path: string, what: string): v is string => {
    if (typeof v !== "string" || !v) {
      issue(path, `${what} must be a non-empty string.`);
      return false;
    }
    if (RESERVED.has(v)) {
      issue(path, `"${v}" is reserved and cannot be used as ${what.toLowerCase()}.`);
      return false;
    }
    return true;
  };

  /** An optional whole number of at least `floor`. */
  const optionalInt = (v: unknown, path: string, floor: number) => {
    if (v !== undefined && !(isInt(v) && v >= floor)) issue(path, `Must be a whole number of ${floor} or more.`);
  };
  /** `low` may not exceed `high` when both are whole numbers. */
  const ordered = (low: unknown, high: unknown, path: string, what: string) => {
    if (isInt(low) && isInt(high) && low > high) issue(path, `Can't be more than the ${what}.`);
  };
  /** The props of the structured types (list, table, media-notes, text-highlights). */
  const structuredProps = (type: string, props: Record<string, unknown>, path: string) => {
    if (type === "list") {
      optionalInt(props.min, `${path}.min`, 0);
      optionalInt(props.max, `${path}.max`, 1);
      optionalInt(props.itemMaxLength, `${path}.itemMaxLength`, 1);
      optionalText(props.placeholder, `${path}.placeholder`);
      ordered(props.min, props.max ?? 10, `${path}.min`, "most items");
    } else if (type === "table") {
      const columns = props.columns;
      if (!Array.isArray(columns) || columns.length < 1 || columns.length > MAX_TABLE_COLUMNS) {
        issue(`${path}.columns`, `Must be a list of 1 to ${MAX_TABLE_COLUMNS} columns.`);
      } else {
        const seen = new Set<string>();
        columns.forEach((c, j) => {
          const at = `${path}.columns[${j}]`;
          if (!isObject(c)) return issue(at, "Each column needs a key and a label.");
          if (name(c.key, `${at}.key`, "A column key")) {
            if (seen.has(c.key)) issue(`${at}.key`, `Duplicate column key "${c.key}".`);
            seen.add(c.key);
          }
          text(c.label, `${at}.label`);
          optionalBoolean(c.long, `${at}.long`);
        });
      }
      optionalInt(props.minRows, `${path}.minRows`, 0);
      optionalInt(props.maxRows, `${path}.maxRows`, 1);
      ordered(props.minRows, props.maxRows ?? 3, `${path}.minRows`, "most rows");
    } else if (type === "media-notes") {
      optionalInt(props.maxNotes, `${path}.maxNotes`, 1);
      optionalInt(props.textMaxLength, `${path}.textMaxLength`, 1);
    } else if (type === "text-highlights") {
      optionalText(props.text, `${path}.text`);
      optionalInt(props.maxHighlights, `${path}.maxHighlights`, 1);
    } else if (type === CALCULATED_TYPE) {
      // The formula itself is checked once every key is known, below.
      if (props.format !== undefined && props.format !== "number" && props.format !== "percent" && props.format !== "text") {
        issue(`${path}.format`, "Must be number, percent or text.");
      }
      if (props.decimals !== undefined && !(isInt(props.decimals) && props.decimals >= 0 && props.decimals <= MAX_CALCULATED_DECIMALS)) {
        issue(`${path}.decimals`, `Must be a whole number from 0 to ${MAX_CALCULATED_DECIMALS}.`);
      }
    }
  };

  const isFiniteNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
  /** The props of the scale, number, date and consent types. */
  const fieldProps = (type: string, props: Record<string, unknown>, path: string) => {
    if (type === "rating" || type === "nps") {
      optionalText(props.lowLabel, `${path}.lowLabel`);
      optionalText(props.highLabel, `${path}.highLabel`);
    }
    if (type === "rating" && props.display !== undefined && props.display !== "numbers" && props.display !== "stars") {
      issue(`${path}.display`, "Must be numbers or stars.");
    }
    if (type === "number") {
      for (const k of ["min", "max", "step"] as const) {
        if (props[k] !== undefined && !isFiniteNumber(props[k])) issue(`${path}.${k}`, "Must be a number.");
      }
      if (isFiniteNumber(props.step) && props.step <= 0) issue(`${path}.step`, "Must be above 0.");
      if (isFiniteNumber(props.min) && isFiniteNumber(props.max) && props.min > props.max) {
        issue(`${path}.min`, "Can't be more than the largest number.");
      }
    }
    if (type === "date") {
      for (const k of ["min", "max"] as const) {
        if (props[k] !== undefined && !(typeof props[k] === "string" && isIsoDate(props[k]))) {
          issue(`${path}.${k}`, "Must be a date like 2026-10-22.");
        }
      }
      if (typeof props.min === "string" && typeof props.max === "string" && isIsoDate(props.min) && isIsoDate(props.max) && props.min > props.max) {
        issue(`${path}.min`, "Can't be after the latest date.");
      }
    }
    if (type === "consent") optionalText(props.text, `${path}.text`);
  };

  if (!isObject(input)) {
    issue("", "A form definition must be an object.");
    return fail();
  }
  if (input.schemaVersion !== 1) issue("schemaVersion", "Unsupported schemaVersion; expected 1.");
  text(input.id, "id", true);
  text(input.title, "title");
  optionalText(input.description, "description");
  // Settings change privacy behaviour (anonymous, clearHiddenValues), so a
  // mistyped one is an issue, not a silent default.
  if (input.layout !== undefined) {
    if (!isObject(input.layout)) issue("layout", "Must be an object.");
    else if (input.layout.mode !== "focus" && input.layout.mode !== "classic") {
      issue("layout.mode", "Must be focus or classic.");
    }
  }
  if (input.settings !== undefined) {
    if (!isObject(input.settings)) issue("settings", "Must be an object.");
    else {
      optionalBoolean(input.settings.anonymous, "settings.anonymous");
      optionalBoolean(input.settings.clearHiddenValues, "settings.clearHiddenValues");
      optionalBoolean(input.settings.saveProgress, "settings.saveProgress");
    }
  }
  if (input.meta !== undefined && (!isObject(input.meta) || !isJson(input.meta))) {
    issue("meta", "Must be a JSON object.");
  }
  if (!Array.isArray(input.blocks)) {
    issue("blocks", "Must be an array.");
    return fail();
  }

  const ids = new Set<string>();
  const pageBreaks = new Set<string>();
  const keys = new Map<string, string>();
  const fieldTypes = new Map<string, string>();
  const order = new Map<string, number>();
  /** Column keys of table fields, for formulas. */
  const tableColumnKeys = new Map<string, Set<string>>();
  /** Option values of fields with `props.options`, for the operand check. */
  const choices = new Map<string, Set<string>>();
  /** Calculated fields that don't hold a number: `format: "text"` holds text, no format can hold either. */
  const calculatedLiteral = new Map<string, "string" | undefined>();

  input.blocks.forEach((block: unknown, i) => {
    const path = `blocks[${i}]`;
    if (!isObject(block) || typeof block.id !== "string" || !block.id) {
      issue(path, "Every block needs a string id.");
      return;
    }
    if (!name(block.id, `${path}.id`, "A block id")) return;
    if (ids.has(block.id)) issue(`${path}.id`, `Duplicate id "${block.id}".`);
    ids.add(block.id);
    if (block.kind === "page-break") pageBreaks.add(block.id);
    order.set(block.id, i);
    if (block.kind === "field") {
      text(block.label, `${path}.label`);
      optionalText(block.description, `${path}.description`);
      optionalText(block.placeholder, `${path}.placeholder`);
      optionalBoolean(block.required, `${path}.required`);
      optionalBoolean(block.sensitive, `${path}.sensitive`);
      optionalBoolean(block.identifying, `${path}.identifying`);
      const validKey = name(block.key, `${path}.key`, "A field key");
      if (typeof block.type !== "string" || !getFieldType(block.type)) {
        issue(`${path}.type`, `Unknown field type "${String(block.type)}".`);
      }
      if (block.props !== undefined) {
        if (!isObject(block.props) || !isJson(block.props)) issue(`${path}.props`, "Must be a JSON object.");
        else if (block.props.options !== undefined) {
          const options = block.props.options;
          if (!Array.isArray(options)) issue(`${path}.props.options`, "Must be an array.");
          else {
            options.forEach((o, j) => {
              const at = `${path}.props.options[${j}]`;
              if (!isObject(o) || typeof o.value !== "string") issue(at, "Each option needs a string value.");
              else optionalText(o.label, `${at}.label`);
            });
            choices.set(
              block.id,
              new Set(options.flatMap((o) => (isObject(o) && typeof o.value === "string" ? [o.value] : []))),
            );
          }
        }
        // Renderers draw one button per point, so the scale is bounded.
        const { max, maxLength } = isObject(block.props) ? block.props : {};
        if (block.type === "rating" && max !== undefined && !(isInt(max) && max >= 2 && max <= 10)) {
          issue(`${path}.props.max`, "Must be a whole number from 2 to 10.");
        }
        if (maxLength !== undefined && !(isInt(maxLength) && maxLength > 0)) {
          issue(`${path}.props.maxLength`, "Must be a whole number above 0.");
        }
      }
      // Checked with or without props: a table with no columns would block every submission.
      if (typeof block.type === "string" && (block.props === undefined || isObject(block.props))) {
        structuredProps(block.type, block.props ?? {}, `${path}.props`);
        fieldProps(block.type, block.props ?? {}, `${path}.props`);
      }
      if (validKey) {
        if (keys.has(block.key as string)) issue(`${path}.key`, `Duplicate key "${String(block.key)}".`);
        keys.set(block.key as string, block.id);
      }
      fieldTypes.set(block.id, typeof block.type === "string" ? block.type : "");
      if (block.type === CALCULATED_TYPE) {
        const format = isObject(block.props) ? block.props.format : undefined;
        if (format === "text") calculatedLiteral.set(block.id, "string");
        else if (format !== "number" && format !== "percent") calculatedLiteral.set(block.id, undefined);
      }
      if (block.type === "table" && isObject(block.props) && Array.isArray(block.props.columns)) {
        tableColumnKeys.set(
          block.id,
          new Set(block.props.columns.flatMap((c) => (isObject(c) && typeof c.key === "string" ? [c.key] : []))),
        );
      }
    } else if (block.kind === "content") {
      if (block.type !== "heading" && block.type !== "text") issue(`${path}.type`, "Must be heading or text.");
      text(block.text, `${path}.text`);
    } else if (block.kind === "page-break") {
      optionalText(block.title, `${path}.title`);
    } else {
      issue(`${path}.kind`, "Unknown block kind.");
    }
  });

  // Calculated fields: the formula parses, and every answer it names is a
  // question of this form (a table by one of its columns), and a calculated
  // one only when it comes earlier, so values never go round in a circle.
  // The formulas are worked out again on each step that changes an answer
  // they read, so all of them together are capped too.
  let formulaChars = 0;
  input.blocks.forEach((block: unknown, i) => {
    if (!isObject(block) || block.kind !== "field" || block.type !== CALCULATED_TYPE) return;
    const path = `blocks[${i}].props.formula`;
    const source = isObject(block.props) && typeof block.props.formula === "string" ? block.props.formula : "";
    formulaChars += source.length;
    if (formulaChars > MAX_FORM_FORMULA_LENGTH && formulaChars - source.length <= MAX_FORM_FORMULA_LENGTH) {
      issue(path, `The form's formulas together are over ${MAX_FORM_FORMULA_LENGTH} characters; shorten some, or work part out once in an earlier calculated field.`);
    }
    if (block.required === true) {
      warnings.push({ path: `blocks[${i}].required`, message: "A calculated field is worked out, not answered, so it is never required." });
    }
    const formula = isObject(block.props) ? block.props.formula : undefined;
    if (typeof formula !== "string" || !formula.trim()) return issue(path, "A calculated field needs a formula.");
    const parsed = parseFormula(formula);
    if (!parsed.ok) return issue(path, `${parsed.message} (at character ${parsed.at + 1})`);
    const reported = new Set<string>();
    for (const ref of parsed.refs) {
      const name = ref.column === undefined ? ref.key : `${ref.key}.${ref.column}`;
      if (reported.has(name)) continue;
      reported.add(name);
      const target = keys.get(ref.key);
      const targetType = target === undefined ? undefined : fieldTypes.get(target);
      const at = target === undefined ? undefined : order.get(target);
      if (target === undefined || targetType === undefined) issue(path, `The formula uses "${ref.key}", which is not the answer name of a question in this form.`);
      else if (target === block.id) issue(path, "The formula uses this field's own value.");
      else if (targetType === CALCULATED_TYPE && (at ?? 0) > i) {
        issue(path, `The formula uses "${ref.key}", a calculated field that comes after this one; move it earlier.`);
      } else if (targetType === "table") {
        const columns = tableColumnKeys.get(target);
        if (ref.column === undefined) issue(path, `"${ref.key}" is a table: name one of its columns, like ${ref.key}.${[...(columns ?? [])][0] ?? "column"}.`);
        else if (columns && !columns.has(ref.column)) issue(path, `The table "${ref.key}" has no column "${ref.column}".`);
      } else if (ref.column !== undefined) issue(path, `"${ref.key}" is not a table, so it has no column "${ref.column}".`);
      else if (targetType === "media-notes" || targetType === "text-highlights") {
        warnings.push({ path, message: `"${ref.key}" holds notes, not numbers; the formula reads it as blank.` });
      }
    }
  });

  const hiddenNames = new Set<string>();
  const hiddenTypes = new Map<string, string>();
  if (input.hidden !== undefined && !Array.isArray(input.hidden)) issue("hidden", "Must be an array.");
  (Array.isArray(input.hidden) ? input.hidden : []).forEach((h: unknown, i) => {
    if (!isObject(h) || typeof h.name !== "string" || !h.name) {
      issue(`hidden[${i}]`, "Each hidden input needs a name.");
      return;
    }
    if (!name(h.name, `hidden[${i}].name`, "A hidden input name")) return;
    if (hiddenNames.has(h.name)) issue(`hidden[${i}].name`, `Duplicate hidden input "${h.name}".`);
    if (typeof h.source !== "string" || !["url", "host", "server"].includes(h.source)) {
      issue(`hidden[${i}].source`, "Must be url, host or server.");
    }
    if (typeof h.type !== "string" || !["string", "number", "boolean"].includes(h.type)) {
      issue(`hidden[${i}].type`, "Must be string, number or boolean.");
    }
    optionalBoolean(h.sensitive, `hidden[${i}].sensitive`);
    optionalBoolean(h.identifying, `hidden[${i}].identifying`);
    hiddenNames.add(h.name);
    if (typeof h.type === "string") hiddenTypes.set(h.name, h.type);
  });

  const endingIds = new Set<string>();
  if (input.endings !== undefined && !Array.isArray(input.endings)) issue("endings", "Must be an array.");
  (Array.isArray(input.endings) ? input.endings : []).forEach((e: unknown, i) => {
    const path = `endings[${i}]`;
    if (!isObject(e)) {
      issue(path, "Each ending must be an object with an id and a title.");
      return;
    }
    text(e.title, `${path}.title`);
    optionalText(e.description, `${path}.description`);
    if (!name(e.id, `${path}.id`, "An ending id")) return;
    if (endingIds.has(e.id)) issue(`${path}.id`, `Duplicate ending id "${e.id}".`);
    endingIds.add(e.id);
  });

  /** Field ids a condition reads, for the order check. */
  const checkOperand = (o: unknown, path: string, reads: string[]) => {
    if (o === undefined) return;
    if (!isObject(o)) return issue(path, "An operand must be an object.");
    if ("field" in o) {
      if (typeof o.field !== "string" || !fieldTypes.has(o.field)) return issue(path, `No field "${String(o.field)}".`);
      reads.push(o.field);
    } else if ("hidden" in o) {
      if (typeof o.hidden !== "string" || !hiddenNames.has(o.hidden)) {
        issue(path, `No hidden input "${String(o.hidden)}".`);
      }
    } else if (!("value" in o) || !isJson(o.value)) {
      issue(path, "An operand needs a `field`, a `hidden` input or a JSON `value`.");
    }
  };
  const checkCondition = (c: unknown, path: string, reads: string[], depth = 0): void => {
    if (!isObject(c)) return issue(path, "A condition must be an object.");
    if (depth > MAX_CONDITION_DEPTH) return issue(path, "The condition is nested too deeply.");
    if ("all" in c || "any" in c) {
      const group = "all" in c ? "all" : "any";
      const list = c[group];
      if (!Array.isArray(list)) return issue(path, `\`${group}\` must be an array.`);
      return list.forEach((x, i) => checkCondition(x, `${path}.${group}[${i}]`, reads, depth + 1));
    }
    if ("not" in c) return checkCondition(c.not, `${path}.not`, reads, depth + 1);
    if (typeof c.op !== "string" || !isObject(c.left)) {
      return issue(path, "A comparison needs an `op` and a `left` operand.");
    }
    if (!OPERATORS.has(c.op)) issue(`${path}.op`, `Unknown operator "${c.op}".`);
    checkOperand(c.left, `${path}.left`, reads);
    checkOperand(c.right, `${path}.right`, reads);
    if (typeof c.left.field === "string") {
      const manifest = getFieldType(fieldTypes.get(c.left.field) ?? "");
      if (manifest && OPERATORS.has(c.op) && !manifest.operators.includes(c.op as Operator)) {
        // Already wrong; a literal warning on top would only repeat it.
        return issue(`${path}.op`, `"${c.op}" does not apply to a ${manifest.type} field.`);
      }
    }
    checkLiterals(c.op, c.left, c.right, path);
  };
  /** Warn when a literal `value` can never match what the left side holds: wrong type, or not an option. */
  const checkLiterals = (op: string, left: Record<string, unknown>, right: unknown, path: string) => {
    if (op === "answered" || op === "empty" || !OPERATORS.has(op)) return;
    const literal = isObject(right) && "value" in right;
    // A `field` or `hidden` operand on the right is only known when the form runs.
    if (right !== undefined && !literal) return;
    let what = "the left side";
    let type: string | undefined;
    let options: Set<string> | undefined;
    if (typeof left.field === "string" && fieldTypes.has(left.field)) {
      const fieldType = fieldTypes.get(left.field)!;
      what = `"${keyOf(left.field)}"`;
      type = calculatedLiteral.has(left.field) ? calculatedLiteral.get(left.field) : LITERAL_TYPE[fieldType];
      if (CHOICE_TYPES.has(fieldType)) options = choices.get(left.field);
    } else if (typeof left.hidden === "string" && hiddenTypes.has(left.hidden)) {
      what = `hidden input "${left.hidden}"`;
      type = hiddenTypes.get(left.hidden);
    }
    const outcome = op === "neq" ? "always true" : "never true";
    let values: unknown[];
    if (op === "in") {
      if (!literal || !Array.isArray(right.value)) {
        return void warnings.push({ path: `${path}.right`, message: "`in` needs a list of values; it never matches." });
      }
      values = right.value;
    } else if (!literal) return;
    else values = [right.value];
    if (ORDERING.has(op)) {
      if (type !== undefined && type !== "number") {
        return void warnings.push({ path: `${path}.op`, message: `"${op}" compares numbers, but ${what} holds a ${type}; it is never true.` });
      }
      type = "number";
    }
    for (const v of values) {
      const message =
        type !== undefined && typeof v !== type
          ? `${what} holds a ${type}, but ${shown(v)} is not one; this comparison is ${outcome}.`
          : options && typeof v === "string" && !options.has(v)
            ? `${shown(v)} is not an option of ${what}; this comparison is ${outcome}.`
            : null;
      if (message) warnings.push({ path: `${path}.right`, message });
    }
  };
  const keyOf = (id: string) => [...keys].find(([, v]) => v === id)?.[0] ?? id;

  const ruleIds = new Set<string>();
  if (input.logic !== undefined && !Array.isArray(input.logic)) issue("logic", "Must be an array.");
  (Array.isArray(input.logic) ? input.logic : []).forEach((rule: unknown, i) => {
    const path = `logic[${i}]`;
    if (!isObject(rule) || typeof rule.id !== "string" || !isObject(rule.when)) {
      issue(path, "Each rule needs an id and a `when` condition.");
      return;
    }
    if (ruleIds.has(rule.id)) issue(`${path}.id`, `Duplicate rule id "${rule.id}".`);
    ruleIds.add(rule.id);
    const reads: string[] = [];
    checkCondition(rule.when, `${path}.when`, reads);

    // The block whose position the condition is read at, for the order check.
    let at: string | undefined;
    let inclusive = false;
    if (rule.effect === "jump") {
      if (typeof rule.from !== "string" || !ids.has(rule.from)) {
        issue(`${path}.from`, `No block "${String(rule.from)}".`);
      } else if (pageBreaks.has(rule.from)) {
        issue(`${path}.from`, "A jump can't start at a page break; use the block before it.");
      } else {
        at = rule.from;
        inclusive = true;
      }
      if (isObject(rule.to)) {
        if (typeof rule.to.ending !== "string" || !endingIds.has(rule.to.ending)) {
          issue(`${path}.to`, `No ending "${String(rule.to.ending)}".`);
        }
      } else if (typeof rule.to !== "string" || !ids.has(rule.to)) {
        issue(`${path}.to`, `No block "${String(rule.to)}".`);
      } else if (pageBreaks.has(rule.to)) {
        issue(`${path}.to`, "A jump can't land on a page break; jump to the first block after it.");
      } else if (at !== undefined && (order.get(rule.to) ?? 0) <= (order.get(at) ?? 0)) {
        warnings.push({ path: `${path}.to`, message: "Jumps only go forward; this one is ignored." });
      }
    } else if (rule.effect === "show" || rule.effect === "hide") {
      if (typeof rule.target !== "string" || !ids.has(rule.target)) {
        issue(`${path}.target`, `No block "${String(rule.target)}".`);
      } else at = rule.target;
    } else {
      issue(`${path}.effect`, "Must be show, hide or jump.");
    }

    // Logic reads only the answers on the path before the block it applies to.
    if (at !== undefined) {
      const limit = order.get(at) ?? 0;
      for (const field of new Set(reads)) {
        const p = order.get(field) ?? 0;
        if (p > limit || (p === limit && !inclusive)) {
          warnings.push({
            path: `${path}.when`,
            message: `Reads "${keyOf(field)}", which does not come before "${keyOf(at)}"; it always reads as unanswered.`,
          });
        }
      }
    }
  });

  input.blocks.forEach((block: unknown, i) => {
    if (!isObject(block)) return;
    const raw =
      block.kind === "field" ? [block.label, block.description] : block.kind === "content" ? [block.text] : [];
    const texts = raw.filter((t): t is string => typeof t === "string");
    for (const t of texts) {
      for (const ref of recallRefs(t)) {
        if (ref.kind === "hidden" && !hiddenNames.has(ref.name)) {
          issue(`blocks[${i}]`, `Recalls unknown hidden input "${ref.name}".`);
        }
        if (ref.kind === "field") {
          const target = keys.get(ref.name);
          if (!target) issue(`blocks[${i}]`, `Recalls unknown field "${ref.name}".`);
          else if ((order.get(target) ?? 0) >= i) {
            warnings.push({ path: `blocks[${i}]`, message: `Recalls "${ref.name}", which comes later.` });
          }
        }
      }
    }
  });

  // Endings and the introduction recall too. Only warnings: a stale token here shows as
  // its fallback text, and earlier releases accepted these definitions.
  const extra: [string, unknown][] = [["description", input.description]];
  (Array.isArray(input.endings) ? input.endings : []).forEach((e: unknown, i) => {
    if (isObject(e)) extra.push([`endings[${i}]`, e.title], [`endings[${i}]`, e.description]);
  });
  for (const [path, t] of extra) {
    if (typeof t !== "string") continue;
    for (const ref of recallRefs(t)) {
      if (ref.kind === "hidden" ? !hiddenNames.has(ref.name) : !keys.has(ref.name)) {
        warnings.push({ path, message: `Recalls unknown ${ref.kind === "hidden" ? "hidden input" : "field"} "${ref.name}"; it shows its fallback text.` });
      }
    }
  }

  return issues.length ? fail() : { ok: true, form: input as unknown as FormDefinition, warnings };
}
