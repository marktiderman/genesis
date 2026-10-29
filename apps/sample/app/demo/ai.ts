/**
 * The assistant's AI task, answered in the browser. In an app, `useAiStream`
 * posts to the server's `/api/ai` (genesis-ai's `createAiHandler`), which
 * loads the data as the caller, checks consent and budgets, and calls the
 * model. Here a canned `fetch` answers in the same stream format, so the
 * screen is the real one and nothing leaves the browser.
 */
import type { Client } from "./seed";

export function cannedSummary(client: Client | undefined, bookings: number): string {
  if (!client) return "Pick a client to summarise.";
  return [
    `${client.name} is ${client.status === "active" ? "an active" : `a ${client.status}`} client on the ${client.plan} plan, `,
    `with us since ${client.joined_on}. `,
    `They have ${bookings} booking${bookings === 1 ? "" : "s"} on record. `,
    client.notes ? `Note: ${client.notes} ` : "",
    client.status === "paused" ? "Suggested next step: a check-in to see whether they'd like to resume." : "Suggested next step: confirm their next booking.",
    "\n\n(Demo answer, written in the browser: no model was called.)",
  ].join("");
}

/** A `fetch` that streams `text` back the way genesis-ai's handler does. */
export function cannedAiFetch(text: () => string): typeof fetch {
  return async (_input, init) => {
    const encoder = new TextEncoder();
    const words = text().split(/(\s+)/);
    const signal = init?.signal;
    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        for (const word of words) {
          if (signal?.aborted) break;
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "text", text: word })}\n\n`));
          await new Promise((r) => setTimeout(r, 25));
        }
        const result = { ok: true, output: { text: words.join("") }, model: "demo", taskVersion: 1, usageId: "demo", labelled: true };
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done", result })}\n\n`));
        controller.close();
      },
    });
    return new Response(body, { headers: { "content-type": "text/event-stream" } });
  };
}
