/**
 * Coaching templates that used to ship in `templates.ts`, kept as test
 * fixtures: real forms with logic, contact fields and endings.
 */
import type { FormDefinition } from "@marktiderman/genesis-forms";
import { newId } from "../ops";
import { BLANK_TEMPLATE, type FormTemplate } from "../templates";

const contact = [
  { kind: "field", id: "q_name", key: "name", type: "short-text", label: "Your name", identifying: true },
  { kind: "field", id: "q_email", key: "email", type: "email", label: "Email", identifying: true },
  { kind: "field", id: "q_phone", key: "phone", type: "phone", label: "Phone", identifying: true },
] as const satisfies FormDefinition["blocks"];

export const COACHING_TEMPLATES: readonly FormTemplate[] = [
  {
    id: "after-class",
    name: "After-class feedback",
    description: "A 1–5 rating, what went well, and a follow-up request when the rating is low.",
    create: () => ({
      schemaVersion: 1,
      id: newId("form"),
      title: "How was class?",
      layout: { mode: "focus" },
      blocks: [
        { kind: "field", id: "q_rating", key: "rating", type: "rating", label: "How was class today?", required: true, props: { max: 5 } },
        { kind: "field", id: "q_better", key: "better", type: "long-text", label: "What could we do better?" },
        { kind: "field", id: "q_highlight", key: "highlight", type: "long-text", label: "What did you enjoy most?" },
        { kind: "field", id: "q_follow_up", key: "follow_up", type: "yes-no", label: "Would you like someone to follow up with you?" },
        ...contact,
      ],
      logic: [
        { id: "r_better", effect: "show", target: "q_better", when: { op: "lte", left: { field: "q_rating" }, right: { value: 3 } } },
        { id: "r_highlight", effect: "show", target: "q_highlight", when: { op: "gte", left: { field: "q_rating" }, right: { value: 4 } } },
      ],
      endings: [{ id: "default", title: "Thanks — see you next class!" }],
    }),
  },
  {
    id: "monthly-pulse",
    name: "Monthly pulse",
    description: "Net Promoter Score with a reason, plus one open question.",
    create: () => ({
      schemaVersion: 1,
      id: newId("form"),
      title: "Monthly check-in",
      layout: { mode: "focus" },
      blocks: [
        { kind: "field", id: "q_nps", key: "nps", type: "nps", label: "How likely are you to recommend us to a friend?", required: true },
        { kind: "field", id: "q_reason", key: "reason", type: "long-text", label: "What's the main reason for your score?" },
        { kind: "field", id: "q_wish", key: "wish", type: "long-text", label: "One thing you wish we offered?" },
      ],
      endings: [{ id: "default", title: "Thank you. We read every answer." }],
      settings: { anonymous: true },
    }),
  },
  {
    id: "intake",
    name: "New member intake",
    description: "Contact details, goals and experience, with a follow-up for injuries.",
    create: () => ({
      schemaVersion: 1,
      id: newId("form"),
      title: "Welcome! Tell us about you",
      layout: { mode: "classic" },
      blocks: [
        ...contact.map((b) => ({ ...b, required: true })),
        {
          kind: "field",
          id: "q_goals",
          key: "goals",
          type: "multi-choice",
          label: "What are your goals?",
          props: {
            options: [
              { value: "strength", label: "Get stronger" },
              { value: "weight", label: "Lose weight" },
              { value: "fitness", label: "General fitness" },
              { value: "community", label: "Find a community" },
            ],
          },
        },
        {
          kind: "field",
          id: "q_experience",
          key: "experience",
          type: "single-choice",
          label: "How much training experience do you have?",
          props: {
            options: [
              { value: "none", label: "None yet" },
              { value: "some", label: "Some" },
              { value: "lots", label: "Years of it" },
            ],
          },
        },
        { kind: "field", id: "q_injuries", key: "injuries", type: "yes-no", label: "Any injuries we should know about?" },
        { kind: "field", id: "q_injury_detail", key: "injury_detail", type: "long-text", label: "Tell us more", sensitive: true },
      ],
      logic: [
        { id: "r_injury", effect: "show", target: "q_injury_detail", when: { op: "eq", left: { field: "q_injuries" }, right: { value: true } } },
      ],
      endings: [{ id: "default", title: "Thanks! A coach will be in touch." }],
    }),
  },
];


/** Every fixture template, blank included. */
export const ALL_TEMPLATES: readonly FormTemplate[] = [BLANK_TEMPLATE, ...COACHING_TEMPLATES];

export const fixtureTemplate = (id: string): FormTemplate => {
  const t = ALL_TEMPLATES.find((x) => x.id === id);
  if (!t) throw new Error(`No fixture template ${id}`);
  return t;
};

/** A fresh after-class feedback form (rating, show logic, contact fields). */
export const afterClass = (): FormDefinition => fixtureTemplate("after-class").create();
