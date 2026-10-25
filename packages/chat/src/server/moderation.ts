// @feat:chat
/**
 * OpenAI's moderation endpoint behind `Moderator`
 * (https://developers.openai.com/api/docs/guides/moderation):
 *
 *   POST https://api.openai.com/v1/moderations
 *   { model: "omni-moderation-latest", input: [{ type: "text", text }, { type: "image_url", image_url: { url } }] }
 *
 * Each result has `flagged`, `categories`, `category_scores` (0 to 1) and
 * `category_applied_input_types`. A message's text goes with its first photo;
 * further photos go one request each (the guide doesn't say how many images one
 * request takes), and the highest score per category wins.
 *
 * Mapping: any category at or over its `hide` threshold → `hidden`; else any at
 * or over `flag` (or OpenAI's own `flagged`, unless `trustFlagged: false`) →
 * `flagged`; else `clean`. The reason names the categories and scores, never
 * the text.
 */
import type { ModerateInput, ModerationVerdict, Moderator } from "./types";

export const OPENAI_MODERATIONS_URL = "https://api.openai.com/v1/moderations";

/** The categories omni-moderation scores (text and images, or text only where noted in OpenAI's guide). */
export const OPENAI_MODERATION_CATEGORIES = [
  "sexual",
  "sexual/minors",
  "harassment",
  "harassment/threatening",
  "hate",
  "hate/threatening",
  "illicit",
  "illicit/violent",
  "self-harm",
  "self-harm/intent",
  "self-harm/instructions",
  "violence",
  "violence/graphic",
] as const;

export interface ModerationThresholds {
  /** At or over: a report for observers (default 0.5). */
  flag?: number | undefined;
  /** At or over: the message is hidden from members and reported (default 0.9). */
  hide?: number | undefined;
}

export interface OpenAiModeratorOptions {
  apiKey: string;
  /** Default `omni-moderation-latest`. */
  model?: string | undefined;
  /** Defaults for every category. */
  thresholds?: ModerationThresholds | undefined;
  /**
   * Per category, over the defaults. Default: `sexual/minors` hides at 0.5 and
   * flags at 0.2; `self-harm/intent` and `self-harm/instructions` flag at 0.3
   * (a coach should see them) and hide at 0.95.
   */
  categories?: Record<string, ModerationThresholds> | undefined;
  /** Count OpenAI's own `flagged` as at least `flagged` (default true). */
  trustFlagged?: boolean | undefined;
  /** Text sent per request (default 10 000 characters, a message's maximum). */
  maxTextChars?: number | undefined;
  fetch?: typeof fetch | undefined;
  timeoutMs?: number | undefined;
}

const DEFAULT_CATEGORIES: Record<string, ModerationThresholds> = {
  "sexual/minors": { flag: 0.2, hide: 0.5 },
  "self-harm/intent": { flag: 0.3, hide: 0.95 },
  "self-harm/instructions": { flag: 0.3, hide: 0.95 },
};

interface OpenAiModerationResult {
  flagged?: boolean;
  category_scores?: Record<string, number>;
}

type Input = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };

/** Maps category scores to a verdict with the given thresholds (exported for tests and other providers). */
export function moderationVerdict(
  scores: Record<string, number>,
  options: { thresholds?: ModerationThresholds | undefined; categories?: Record<string, ModerationThresholds> | undefined; flagged?: boolean } = {},
): ModerationVerdict {
  const flagAt = options.thresholds?.flag ?? 0.5;
  const hideAt = options.thresholds?.hide ?? 0.9;
  const per = { ...DEFAULT_CATEGORIES, ...(options.categories ?? {}) };
  const hidden: string[] = [];
  const flagged: string[] = [];
  for (const [category, raw] of Object.entries(scores)) {
    const score = Number(raw);
    if (!Number.isFinite(score)) continue;
    const t = per[category];
    const label = `${category} ${score.toFixed(2)}`;
    if (score >= (t?.hide ?? hideAt)) hidden.push(label);
    else if (score >= (t?.flag ?? flagAt)) flagged.push(label);
  }
  if (hidden.length > 0) return { result: "hidden", reason: `Automatic moderation: ${[...hidden, ...flagged].join(", ")}` };
  if (flagged.length > 0) return { result: "flagged", reason: `Automatic moderation: ${flagged.join(", ")}` };
  if (options.flagged) return { result: "flagged", reason: "Automatic moderation: flagged by the provider" };
  return { result: "clean" };
}

export function openAiModerator(options: OpenAiModeratorOptions): Moderator {
  const fetchFn = options.fetch ?? fetch;
  const model = options.model ?? "omni-moderation-latest";
  const maxText = options.maxTextChars ?? 10_000;

  async function call(input: Input[]): Promise<OpenAiModerationResult[]> {
    const response = await fetchFn(OPENAI_MODERATIONS_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${options.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ model, input }),
      signal: AbortSignal.timeout(options.timeoutMs ?? 15_000),
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      throw new Error(`OpenAI moderation answered HTTP ${response.status}`);
    }
    const body = (await response.json()) as { results?: OpenAiModerationResult[] };
    if (!Array.isArray(body.results)) throw new Error("OpenAI moderation answered without results");
    return body.results;
  }

  return {
    name: "openai",
    async moderate({ text, imageUrls }: ModerateInput): Promise<ModerationVerdict> {
      const requests: Input[][] = [];
      const first: Input[] = [];
      const trimmed = text.trim().slice(0, maxText);
      if (trimmed) first.push({ type: "text", text: trimmed });
      const [firstImage, ...rest] = imageUrls;
      if (firstImage) first.push({ type: "image_url", image_url: { url: firstImage } });
      if (first.length > 0) requests.push(first);
      for (const url of rest) requests.push([{ type: "image_url", image_url: { url } }]);
      if (requests.length === 0) return { result: "clean" };

      const scores: Record<string, number> = {};
      let flagged = false;
      for (const results of await Promise.all(requests.map(call))) {
        for (const result of results) {
          if (result.flagged) flagged = true;
          for (const [category, score] of Object.entries(result.category_scores ?? {})) {
            if (typeof score === "number") scores[category] = Math.max(scores[category] ?? 0, score);
          }
        }
      }
      return moderationVerdict(scores, {
        thresholds: options.thresholds,
        categories: options.categories,
        flagged: flagged && options.trustFlagged !== false,
      });
    },
  };
}
