/**
 * Templates that used to ship in `templates.ts` (renamed neutrally), kept as
 * test fixtures: real forms with logic, contact fields and endings.
 */
import type { FormDefinition } from "@marktiderman/genesis-forms";
import { newId } from "../ops";
import { BLANK_TEMPLATE, STARTER_TEMPLATES, type FormTemplate } from "../templates";

const contact = [
  { kind: "field", id: "q_name", key: "name", type: "short-text", label: "Your name", identifying: true },
  { kind: "field", id: "q_email", key: "email", type: "email", label: "Email", identifying: true },
  { kind: "field", id: "q_phone", key: "phone", type: "phone", label: "Phone", identifying: true },
] as const satisfies FormDefinition["blocks"];

export const FIXTURE_TEMPLATES: readonly FormTemplate[] = [
  {
    id: "visit-feedback",
    name: "Visit feedback",
    description: "A 1–5 rating, what went well, and a follow-up request when the rating is low.",
    create: () => ({
      schemaVersion: 1,
      id: newId("form"),
      title: "How was your visit?",
      layout: { mode: "focus" },
      blocks: [
        { kind: "field", id: "q_rating", key: "rating", type: "rating", label: "How was your visit today?", required: true, props: { max: 5 } },
        { kind: "field", id: "q_better", key: "better", type: "long-text", label: "What could we do better?" },
        { kind: "field", id: "q_highlight", key: "highlight", type: "long-text", label: "What did you enjoy most?" },
        { kind: "field", id: "q_follow_up", key: "follow_up", type: "yes-no", label: "Would you like someone to follow up with you?" },
        ...contact,
      ],
      logic: [
        { id: "r_better", effect: "show", target: "q_better", when: { op: "lte", left: { field: "q_rating" }, right: { value: 3 } } },
        { id: "r_highlight", effect: "show", target: "q_highlight", when: { op: "gte", left: { field: "q_rating" }, right: { value: 4 } } },
      ],
      endings: [{ id: "default", title: "Thanks — see you next time!" }],
    }),
  },
  {
    id: "monthly-check-in",
    name: "Monthly check-in",
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
    id: "onboarding",
    name: "New customer onboarding",
    description: "Contact details, goals and experience, with a follow-up for access needs.",
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
              { value: "learn", label: "Learn something new" },
              { value: "save", label: "Save time" },
              { value: "organise", label: "Get organised" },
              { value: "community", label: "Find a community" },
            ],
          },
        },
        {
          kind: "field",
          id: "q_experience",
          key: "experience",
          type: "single-choice",
          label: "How much experience do you have with tools like ours?",
          props: {
            options: [
              { value: "none", label: "None yet" },
              { value: "some", label: "Some" },
              { value: "lots", label: "Years of it" },
            ],
          },
        },
        { kind: "field", id: "q_access", key: "access_needs", type: "yes-no", label: "Any access needs we should know about?" },
        { kind: "field", id: "q_access_detail", key: "access_detail", type: "long-text", label: "Tell us more", sensitive: true },
      ],
      logic: [
        { id: "r_access", effect: "show", target: "q_access_detail", when: { op: "eq", left: { field: "q_access" }, right: { value: true } } },
      ],
      endings: [{ id: "default", title: "Thanks! Someone will be in touch." }],
    }),
  },
];


/** Every fixture template, blank included. */
export const ALL_TEMPLATES: readonly FormTemplate[] = [BLANK_TEMPLATE, ...STARTER_TEMPLATES, ...FIXTURE_TEMPLATES];

export const fixtureTemplate = (id: string): FormTemplate => {
  const t = ALL_TEMPLATES.find((x) => x.id === id);
  if (!t) throw new Error(`No fixture template ${id}`);
  return t;
};

/** A fresh visit feedback form (rating, show logic, contact fields). */
export const visitFeedback = (): FormDefinition => fixtureTemplate("visit-feedback").create();
