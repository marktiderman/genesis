// @feat:chat
/**
 * A fetch handler for a cron job or a database webhook: requires
 * `Authorization: Bearer <secret>` (compared in constant time), runs the
 * runner once and answers its counts as JSON.
 */
import { safeEqual } from "./crypto";
import type { ChatRunner } from "./runner";

export interface ChatRunnerHandlerOptions {
  runner: Pick<ChatRunner, "run">;
  /** At least 32 characters. */
  secret: string;
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export function chatRunnerHandler(options: ChatRunnerHandlerOptions): (request: Request) => Promise<Response> {
  return async (request) => {
    // Misconfigured: refuse everyone rather than accept a guessable secret.
    if (!options.secret || options.secret.length < 32) return json(500, { error: "runner secret missing or under 32 characters" });
    if (request.method !== "POST" && request.method !== "GET") return json(405, { error: "method not allowed" });
    const match = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") ?? "");
    if (!match || !(await safeEqual(match[1]!, options.secret))) return json(401, { error: "unauthorized" });
    try {
      return json(200, await options.runner.run());
    } catch (e) {
      return json(500, { error: e instanceof Error ? e.message.slice(0, 200) : "run failed" });
    }
  };
}
