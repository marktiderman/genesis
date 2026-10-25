/**
 * Sending by answer: a destination's `config.when`, a form `Condition`,
 * decides which submissions it gets. It is evaluated with the engine's own
 * `evaluate` against the submission's answers (by field id), its hidden
 * inputs and its context (trusted server inputs, read as hidden inputs and
 * winning over a hidden input of the same name). `createDeliveryRunner`
 * applies it before calling a destination; a submission that does not match
 * is recorded as filtered, not sent and not failed.
 */
import { evaluate, own } from "../logic";
import type { Condition, FieldBlock, FormDefinition, Json } from "../types";
import { DeliveryError, type DeliverySubmission, type DestinationConfig } from "./types";

const OPERATORS: ReadonlySet<string> = new Set(["eq", "neq", "lt", "lte", "gt", "gte", "in", "contains", "answered", "empty"]);
/** How deep `all` / `any` / `not` may nest in a stored condition. */
export const MAX_CONDITION_DEPTH = 10;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function isOperand(v: unknown): boolean {
  if (!isObject(v)) return false;
  const keys = Object.keys(v);
  if (keys.length !== 1) return false;
  if (keys[0] === "field" || keys[0] === "hidden") return typeof v[keys[0]] === "string";
  return keys[0] === "value";
}

/** Whether a stored value has a `Condition`'s shape, nested at most `MAX_CONDITION_DEPTH` deep. */
export function isCondition(v: unknown, depth = 0): v is Condition {
  if (!isObject(v) || depth > MAX_CONDITION_DEPTH) return false;
  if ("all" in v) return Array.isArray(v["all"]) && v["all"].every((c) => isCondition(c, depth + 1));
  if ("any" in v) return Array.isArray(v["any"]) && v["any"].every((c) => isCondition(c, depth + 1));
  if ("not" in v) return isCondition(v["not"], depth + 1);
  return (
    typeof v["op"] === "string" &&
    OPERATORS.has(v["op"]) &&
    isOperand(v["left"]) &&
    (v["right"] === undefined || isOperand(v["right"]))
  );
}

/**
 * The destination's condition (`config.when`), or null when it has none. One
 * that can't be read throws a permanent `DeliveryError` rather than meaning
 * "send everything" or "send nothing".
 */
export function conditionOf(config: DestinationConfig): Condition | null {
  const when = config["when"];
  if (when === undefined || when === null) return null;
  if (!isCondition(when)) throw new DeliveryError("The destination's condition can't be read");
  return when;
}

/**
 * Whether a submission matches its destination's condition (true when there
 * is none). Throws a `DeliveryError` when the condition can't be read.
 */
export function passesCondition(
  submission: Pick<DeliverySubmission, "answers" | "hidden" | "context">,
  definition: FormDefinition,
  config: DestinationConfig,
): boolean {
  const condition = conditionOf(config);
  if (!condition) return true;
  const fields = new Map<string, FieldBlock>();
  for (const block of definition.blocks) if (block.kind === "field") fields.set(block.id, block as FieldBlock);
  // No prototype, so a hidden input named __proto__ is just a name.
  const hidden = Object.create(null) as Record<string, Json>;
  for (const source of [submission.hidden, submission.context]) {
    for (const name of Object.keys(source ?? {})) {
      const value = own(source!, name);
      if (value !== undefined) hidden[name] = value;
    }
  }
  return evaluate(condition, { values: submission.answers, hidden, fields });
}
