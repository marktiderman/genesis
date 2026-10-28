// P0 spike for genesis-ai (docs/AI.md, "P0 result"): what does AI SDK 7 + @ai-sdk/anthropic
// actually send and return? A mock fetch records every request and answers like the Messages API,
// so no key or network is needed. The repo doesn't depend on these packages yet, so run it from a
// scratch folder:
//   npm i ai@7 @ai-sdk/anthropic@4 zod@4 && node ai-sdk-p0.mjs
//   deno run -A ai-sdk-p0.mjs   (or with npm: specifiers, as Supabase Edge Functions import)
import { generateText, streamText, Output } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { z } from "zod";

const calls = [];
let next = null; // the canned response for the next call

const json = (body) => new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
const message = (over = {}) => ({
  id: "msg_1", type: "message", role: "assistant", model: "claude-sonnet-5-5",
  content: [{ type: "text", text: "Hello." }], stop_reason: "end_turn", stop_sequence: null,
  usage: { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 60, cache_creation_input_tokens: 30 },
  ...over,
});
const sse = (events) => new Response(
  new ReadableStream({ start(c) { for (const e of events) c.enqueue(new TextEncoder().encode(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`)); c.close(); } }),
  { headers: { "content-type": "text/event-stream" } },
);

async function mockFetch(url, init) {
  const headers = Object.fromEntries(new Headers(init.headers).entries());
  calls.push({ url: String(url), headers, body: JSON.parse(init.body) });
  return next();
}

const anthropic = createAnthropic({
  apiKey: "test",
  fetch: mockFetch,
  headers: { "anthropic-version": "2026-10-21" }, // chat's pinned version
});
const model = anthropic("claude-sonnet-5-5");
const results = [];
const check = (name, ok, detail) => results.push({ name, ok: !!ok, detail });
const last = () => calls[calls.length - 1];

// 1. Effort, refusal fallbacks and the API version pass through; no sampling parameters.
next = () => json(message());
const r1 = await generateText({
  model, system: "You summarise.", prompt: "Recap this.", maxOutputTokens: 4000,
  providerOptions: { anthropic: { effort: "low", fallbacks: "default" } },
});
const b1 = last().body, h1 = last().headers;
check("1a anthropic-version header is 2026-10-21", h1["anthropic-version"] === "2026-10-21", h1["anthropic-version"]);
check("1b output_config.effort = low", b1.output_config?.effort === "low", JSON.stringify(b1.output_config));
check("1c fallbacks = default", b1.fallbacks === "default", JSON.stringify(b1.fallbacks));
check("1d server-side-fallback beta header added", /server-side-fallback-2026-07-01/.test(h1["anthropic-beta"] ?? ""), h1["anthropic-beta"]);
check("2  no temperature/top_p/top_k sent", !("temperature" in b1) && !("top_p" in b1) && !("top_k" in b1), Object.keys(b1).join(","));
check("1e text returned", r1.text === "Hello.", r1.text);

// 3. Structured output: output_config.format, never a forced tool_choice.
next = () => json(message({ content: [{ type: "text", text: JSON.stringify({ text: "A recap." }) }] }));
const r3 = await generateText({
  model, prompt: "Recap.",
  output: Output.object({ schema: z.object({ text: z.string().min(1) }) }),
  providerOptions: { anthropic: { structuredOutputMode: "outputFormat" } },
});
const b3 = last().body;
check("3a output_config.format used", !!b3.output_config?.format, JSON.stringify(b3.output_config)?.slice(0, 160));
check("3b no forced tool_choice", !b3.tool_choice || b3.tool_choice.type === "auto", JSON.stringify(b3.tool_choice));
check("3c object parsed", r3.output?.text === "A recap.", JSON.stringify(r3.output));

// 3d. Default structured-output mode ("auto") on Sonnet 5.5 — does it pick outputFormat?
next = () => json(message({ content: [{ type: "text", text: JSON.stringify({ text: "x" }) }] }));
await generateText({ model, prompt: "x", output: Output.object({ schema: z.object({ text: z.string() }) }) });
const b3d = last().body;
check("3d default mode avoids forced tool_choice", !b3d.tool_choice || b3d.tool_choice.type === "auto",
  `tool_choice=${JSON.stringify(b3d.tool_choice)} format=${!!b3d.output_config?.format}`);

// 4. Usage, including cache tokens.
const u = r1.usage;
check("4a input/output tokens", u.inputTokens > 0 && u.outputTokens === 20, JSON.stringify(u));
check("4b cache read tokens surfaced", JSON.stringify(u).includes("60") || JSON.stringify(r1.providerMetadata).includes("60"),
  JSON.stringify({ usage: u, meta: r1.providerMetadata?.anthropic?.usage ?? r1.providerMetadata }).slice(0, 400));

// 4c. Refusal: how does it surface?
next = () => json(message({ content: [], stop_reason: "refusal", stop_details: { type: "refusal", category: "cyber", explanation: "x" } }));
let refusal;
try { const r = await generateText({ model, prompt: "x" }); refusal = { finishReason: r.finishReason, raw: r.rawFinishReason, text: r.text }; }
catch (e) { refusal = { threw: e.name + ": " + e.message }; }
check("4c refusal is distinguishable", JSON.stringify(refusal).includes("refusal") || refusal.finishReason === "content-filter", JSON.stringify(refusal));

// 5. Streaming parses the SSE event stream.
next = () => sse([
  { type: "message_start", message: message({ content: [], stop_reason: null, usage: { input_tokens: 50, output_tokens: 1 } }) },
  { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
  { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Hel" } },
  { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "lo." } },
  { type: "content_block_stop", index: 0 },
  { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 7 } },
  { type: "message_stop" },
]);
const s = streamText({ model, prompt: "x", providerOptions: { anthropic: { effort: "low" } } });
let streamed = "";
for await (const t of s.textStream) streamed += t;
check("5a stream text assembled", streamed === "Hello.", streamed);
check("5b stream request has stream:true and effort", last().body.stream === true && last().body.output_config?.effort === "low", JSON.stringify(last().body.output_config));
check("5c stream usage", (await s.usage).outputTokens === 7, JSON.stringify(await s.usage));

const runtime = typeof Deno !== "undefined" ? `deno ${Deno.version.deno}` : `node ${process.version}`;
console.log(`runtime: ${runtime}`);
for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.ok ? "" : `  -> ${r.detail}`}`);
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} passed`);
if (process.env.SPIKE_VERBOSE) console.log(JSON.stringify(calls.map((c) => ({ headers: c.headers, body: c.body })), null, 1));
