/**
 * Regenerate conformance/*.scenario.json from live engine runs.
 *
 *   pnpm --filter @marktiderman/genesis-forms conformance:build
 *
 * Each scenario is recorded with `recordScenario`, then checked with
 * `runScenario`. Review the diff before committing: a changed expectation is a
 * behaviour change for every consumer of the suite.
 */
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createForm, replay, type FormEngine } from "../src/engine";
import { validateSubmission } from "../src/server";
import { recordScenario, runScenario, type Scenario } from "../src/scenario";
import type { FormDefinition, FormEvent, Json } from "../src/types";
import { contactAnonymous, contactNamed } from "../src/__tests__/conformance-forms";
import { eventFeedback, monthlyCheckIn } from "../src/__tests__/sample-forms";

const out = join(dirname(fileURLToPath(import.meta.url)), "..", "conformance");
const context = { session: "Tuesday 6 PM workshop", owner: "Sam" };

function live(def: FormDefinition, hidden: Record<string, Json> = {}): FormEngine {
  return createForm(def, { hidden, clock: () => undefined });
}

/** Type into a text field one keystroke at a time, the way an input does. */
function type(engine: FormEngine, id: string, text: string) {
  for (let i = 1; i <= text.length; i++) engine.setValue(id, text.slice(0, i));
}

/** Re-check the server expectation as a completed response (a failed submit). */
function serverAsComplete(s: Scenario): Scenario {
  const result = validateSubmission(s.definition, { events: s.events, hidden: s.hidden }, { context: s.context, complete: true });
  if (result.ok) throw new Error(`${s.name}: expected the server to reject it`);
  s.expect.server = { ok: false, complete: true, errors: Object.keys(result.errors) };
  return s;
}

const scenarios: Scenario[] = [];
const add = (s: Scenario) => scenarios.push(s);
const def = eventFeedback.definition;
const pulse = monthlyCheckIn.definition;

{
  const e = live(def, context);
  e.setValue("overall", 5);
  e.next();
  e.setValue("went_well", ["hosting", "community"]);
  e.next();
  e.next(); // improve, left blank
  e.setValue("contact_me", false);
  e.submit();
  add(recordScenario(e, "event-feedback: happy path", {
    description: "Five stars, no follow-up wanted. Name and email stay hidden and are not required.",
    tags: ["event-feedback", "happy-path"],
  }));
}

{
  const e = live(def, context);
  e.setValue("overall", 2);
  e.next();
  type(e, "improve", "Music too loud");
  e.next();
  e.setValue("contact_me", false);
  e.submit();
  add(recordScenario(e, "event-feedback: low rating skips went_well", {
    description: "A rating under 4 jumps from overall to improve; went_well is off the path. Keystrokes in improve are compacted.",
    tags: ["event-feedback", "jump"],
  }));
}

{
  const e = live(def, context);
  e.setValue("overall", 5);
  e.setValue("contact_me", true);
  e.submit();
  add(serverAsComplete(recordScenario(e, "event-feedback: contact yes requires name and email", {
    description: "Answering Yes to contact_me reveals name and email, and both are required on submit and on the server.",
    tags: ["event-feedback", "show-hide", "validation"],
  })));
}

{
  const e = live(def, context);
  e.setValue("overall", 5);
  e.setValue("contact_me", true);
  type(e, "name", "Ada");
  type(e, "email", "ada@example.com");
  e.submit();
  add(recordScenario(e, "event-feedback: contact yes, completed", {
    description: "With name and email filled in, the follow-up request completes and both are stored.",
    tags: ["event-feedback", "show-hide"],
  }));
}

{
  const e = live(def, context);
  e.setValue("overall", 4);
  e.setValue("contact_me", true);
  e.setValue("name", "Ada");
  e.setValue("email", "ada@");
  e.submit();
  add(serverAsComplete(recordScenario(e, "event-feedback: invalid email rejected", {
    description: "A malformed email blocks submit on the client and is rejected by the server.",
    tags: ["event-feedback", "validation"],
  })));
}

{
  // The client claims a different owner; the server resolves its own.
  const e = live(def, { ...context, owner: "Mallory" });
  e.setValue("overall", 5);
  e.setValue("contact_me", false);
  e.submit();
  add(recordScenario(e, "event-feedback: server ignores a client-sent owner", {
    description: "owner is a server input. A value sent by the client is dropped and reported in ignored; the server's own value is stored.",
    tags: ["event-feedback", "server", "security"],
    hidden: { owner: "Mallory" },
    context,
  }));
}

{
  // Hand-written log: an answer to a field that does not exist, a field later
  // jumped over, and a field hidden by logic. None of them may be stored.
  const events: FormEvent[] = [
    { type: "answer", field: "overall", value: 5 },
    { type: "answer", field: "went_well", value: ["content"] },
    { type: "answer", field: "bogus", value: "drop me" },
    { type: "answer", field: "name", value: "Not asked" },
    { type: "answer", field: "overall", value: 3 },
    { type: "answer", field: "contact_me", value: false },
    { type: "submit" },
  ];
  const s = recordScenario(replay(def, events, { hidden: context }), "event-feedback: server drops unknown and hidden answers", {
    description: "The server replays the log: unknown fields are ignored, and answers to fields jumped over or hidden by logic are not stored.",
    tags: ["event-feedback", "server", "security"],
  });
  s.events = events;
  const result = validateSubmission(def, { events }, { context });
  if (!result.ok) throw new Error("expected the server to accept it");
  s.expect.server = { ok: true, answers: result.submission.answers, context: result.submission.context, ignored: result.submission.ignored };
  add(s);
}

{
  const e = live(def, context);
  e.setValue("overall", 2);
  e.next(); // jumps to improve
  e.back(); // back to overall, not to went_well
  e.setValue("overall", 5);
  e.next(); // went_well is back on the path
  add(recordScenario(e, "event-feedback: back after a jump", {
    description: "Back from a jump target returns to the block the jump came from; raising the rating puts went_well back on the path.",
    tags: ["event-feedback", "jump", "navigation"],
  }));
}

{
  const e = live(pulse);
  e.setValue("recommend", 9);
  e.next();
  e.submit();
  add(recordScenario(e, "monthly-check-in: promoter ending via jump", {
    description: "NPS 9 or more jumps straight to the promoter ending; why and frequency are never asked.",
    tags: ["monthly-check-in", "jump", "ending"],
  }));
}

{
  const e = live(pulse);
  e.setValue("recommend", 8);
  e.next();
  type(e, "why", "Busy month");
  e.next();
  e.setValue("frequency", "5-8");
  e.submit();
  add(recordScenario(e, "monthly-check-in: default ending", {
    description: "NPS 8 is one under the jump's boundary: every question is asked and the default ending is reached.",
    tags: ["monthly-check-in", "ending"],
  }));
}

{
  const e = live(contactNamed.definition);
  e.setValue("overall", 4);
  e.setValue("name", "Ada");
  e.setValue("email", " ada@example.com ");
  e.setValue("phone", "+1 (555) 010-0199");
  e.submit();
  add(recordScenario(e, "contact-details: named form asks for identifying fields", {
    description: "With settings.anonymous false, name, email and phone are asked, validated and stored (email and phone trimmed).",
    tags: ["contact-details", "identifying"],
  }));
}

{
  // Hand-written log: a tampered client answers the identifying fields anyway.
  const anon = contactAnonymous.definition;
  const events: FormEvent[] = [
    { type: "answer", field: "overall", value: 5 },
    { type: "answer", field: "name", value: "Ada" },
    { type: "answer", field: "email", value: "ada@example.com" },
    { type: "answer", field: "phone", value: "+1 555 010 0199" },
    { type: "submit" },
  ];
  const s = recordScenario(replay(anon, events), "contact-details: anonymous form skips identifying fields", {
    description: "With settings.anonymous true, identifying fields are off the path and not required; the server drops client-sent values for them and lists them in ignored.",
    tags: ["contact-details", "identifying", "anonymous", "server", "security"],
  });
  s.events = events;
  const result = validateSubmission(anon, { events });
  if (!result.ok) throw new Error("expected the server to accept it");
  s.expect.server = { ok: true, answers: result.submission.answers, context: result.submission.context, ignored: result.submission.ignored };
  add(s);
}

const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
mkdirSync(out, { recursive: true });
for (const file of readdirSync(out)) if (file.endsWith(".scenario.json")) rmSync(join(out, file));
for (const s of scenarios) {
  const result = runScenario(s);
  if (!result.pass) throw new Error(`${s.name} does not pass:\n${result.failures.join("\n")}`);
  writeFileSync(join(out, `${slug(s.name)}.scenario.json`), `${JSON.stringify(s, null, 2)}\n`);
}
console.log(`Wrote ${scenarios.length} scenarios to ${out}`);
