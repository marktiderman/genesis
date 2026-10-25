/**
 * The Slack destination: one message per submission to a Slack incoming
 * webhook (the channel is the webhook's). The message is a heading (the
 * form's title), each answer as "label: value" in form order, and a footer
 * with a link back to the app when one is given. Every value is escaped, so
 * text a respondent typed can't mention `@channel` or make a link.
 *
 * The webhook URL is itself the credential, so it is usually kept out of
 * config: pass `url` to look it up. It must be a Slack incoming webhook
 * (`https://hooks.slack.com/services/…`); redirects are not followed.
 */
import type { FormDefinition } from "../types";
import { checkHookHost, parseHookUrl, type ResolveHost } from "./hook-url";
import { responseRow, type RowOptions } from "./row";
import {
  configString,
  deliveryFailure,
  DeliveryError,
  discard,
  httpError,
  resolveOption,
  timedFetch,
  type DeliveryOptions,
  type DeliveryResult,
  type DeliverySubmission,
  type Destination,
  type DestinationConfig,
  type HttpDeps,
  type OptionResolver,
} from "./types";

/** Longest answer shown in full; longer ones are cut (the app has the rest). */
export const SLACK_VALUE_LIMIT = 1500;

/** Text for Slack's mrkdwn: `&`, `<` and `>` escaped, which is all Slack asks. */
export function escapeSlack(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const cut = (text: string) => (text.length > SLACK_VALUE_LIMIT ? `${text.slice(0, SLACK_VALUE_LIMIT)}…` : text);

export interface SlackMessageOptions {
  /** The heading, as plain text (it is escaped). Default `New response: <title>`, or `Updated response: …` for an update. */
  heading?: string | undefined;
  /** An update of a submission delivered before. */
  update?: boolean | undefined;
  /** Lines shown before the answers, as `[label, value]` plain text (a location, a session). */
  lines?: readonly (readonly [string, string])[] | undefined;
  /** A link back to the response in the app: http(s) only. */
  link?: { url: string; text?: string | undefined } | null | undefined;
  /** Sensitive fields: `"mask"` (default), `"omit"` or `"include"`. A channel is usually wider than an inbox. */
  sensitive?: RowOptions["sensitive"];
  /** Field keys left out (contact details, say). */
  omit?: readonly string[] | undefined;
}

/** The message Slack gets for one submission: `{ text }` in Slack mrkdwn. */
export function slackMessage(
  submission: DeliverySubmission,
  definition: FormDefinition,
  options: SlackMessageOptions = {},
): { text: string } {
  const title = definition.title || definition.id;
  const heading = options.heading ?? `${options.update ? "Updated response" : "New response"}: ${title}`;
  const lines = [`*${escapeSlack(heading)}*`];
  for (const [label, value] of options.lines ?? []) {
    if (value.trim()) lines.push(`*${escapeSlack(label)}*: ${escapeSlack(cut(value))}`);
  }
  const { row, labels } = responseRow(submission, definition, { sensitive: options.sensitive ?? "mask" });
  const omit = new Set(options.omit ?? []);
  let answered = 0;
  for (const [key, label] of Object.entries(labels)) {
    const text = String(row[key] ?? "");
    if (!text || omit.has(key)) continue;
    answered++;
    lines.push(`*${escapeSlack(label || key)}*: ${escapeSlack(cut(text))}`);
  }
  if (!answered) lines.push("_No answers._");
  const when = submission.submittedAt ? ` · ${escapeSlack(submission.submittedAt)}` : "";
  const link = options.link;
  lines.push(
    link && /^https?:\/\//i.test(link.url)
      ? `<${link.url.replace(/[<>|]/g, "")}|${escapeSlack(link.text ?? "Open the response").replace(/[|]/g, "")}>${when}`
      : `Response ${escapeSlack(submission.id)}${when}`,
  );
  return { text: lines.join("\n") };
}

export interface SlackMessageInput {
  submission: DeliverySubmission;
  definition: FormDefinition;
  config: DestinationConfig;
  /** `DeliveryOptions.update`. */
  update: boolean;
  destinationId?: string | undefined;
}

export interface SlackDestinationOptions extends HttpDeps {
  /**
   * The incoming webhook URL, when it is not `config.url`. Gets the config
   * and `{ destinationId }`.
   */
  url?: OptionResolver<string> | undefined;
  /** Resolves the host before every request; the delivery is refused unless every address is public. */
  resolveHost?: ResolveHost | undefined;
  /** The message's options per delivery (heading, extra lines, a link back). */
  message?: ((input: SlackMessageInput) => SlackMessageOptions | Promise<SlackMessageOptions>) | undefined;
}

export function slackDestination(options: SlackDestinationOptions = {}): Destination {
  return {
    kind: "slack",
    async deliver(submission, definition, config, deliveryOptions: DeliveryOptions = {}): Promise<DeliveryResult> {
      try {
        const context = { destinationId: deliveryOptions.destinationId };
        const raw = options.url
          ? await resolveOption("The Slack webhook url", options.url, config, context)
          : configString(config, "url");
        if (typeof raw !== "string" || !raw.trim()) throw new DeliveryError("The Slack destination has no url");
        const url = parseHookUrl(raw, "slack");
        if (options.resolveHost) await checkHookHost(url, options.resolveHost);
        const update = deliveryOptions.update === true;
        const messageOptions = options.message
          ? await resolveOption(
              "The Slack message",
              () => options.message!({ submission, definition, config, update, destinationId: deliveryOptions.destinationId }),
              config,
            )
          : {};
        const body = JSON.stringify(slackMessage(submission, definition, { update, ...messageOptions }));
        const response = await timedFetch(
          options,
          url.toString(),
          {
            method: "POST",
            redirect: "manual",
            headers: { "content-type": "application/json", "user-agent": "genesis-forms-slack/1" },
            body,
          },
          deliveryOptions.signal,
        );
        discard(response);
        if (response.status >= 200 && response.status < 300) return { ok: true };
        if (response.status === 0 || (response.status >= 300 && response.status < 400)) {
          throw new DeliveryError(`Slack answered ${response.status || "a redirect"}: redirects are not followed`, {
            ...(response.status ? { status: response.status } : {}),
          });
        }
        throw httpError("Slack", response);
      } catch (error) {
        return deliveryFailure(error);
      }
    },
  };
}
