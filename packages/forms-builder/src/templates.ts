/**
 * Starting points for a new form. Each `create()` returns a fresh, valid
 * definition with a new form id; block ids inside a template are fixed, which
 * is fine because answers are only compared within one form.
 *
 * `TEMPLATES` is only `BLANK_TEMPLATE`. `STARTER_TEMPLATES` are opt-in
 * examples a host may offer too; hosts also define their own templates (as
 * `FormTemplate`s) and pass them to `getTemplate` or their own picker.
 */
import type { FieldBlock, FormDefinition } from "@marktiderman/genesis-forms";
import { emptyForm, newId } from "./ops";

export interface FormTemplate {
  id: string;
  name: string;
  description: string;
  create: () => FormDefinition;
}

/** An empty form: the one built-in starting point. */
export const BLANK_TEMPLATE: FormTemplate = {
  id: "blank",
  name: "Blank form",
  description: "Start from nothing.",
  create: () => emptyForm(),
};

/** The built-in templates: just `BLANK_TEMPLATE`. Spread it into your own list: `[...TEMPLATES, ...mine]`. */
export const TEMPLATES: readonly FormTemplate[] = [BLANK_TEMPLATE];

/** Find a template by id in `templates` (default: the built-ins). */
export const getTemplate = (id: string, templates: readonly FormTemplate[] = TEMPLATES): FormTemplate | undefined =>
  templates.find((t) => t.id === id);

// Typed one by one, so blocks with different optional parts aren't merged into one union.
const fields = (...blocks: FieldBlock[]): FieldBlock[] => blocks;

// Name, email and phone, marked identifying so an anonymous form never stores them.
const contactFields = (required = false): FieldBlock[] => [
  { kind: "field", id: "q_name", key: "name", type: "short-text", label: "Your name", identifying: true, ...(required ? { required } : {}) },
  { kind: "field", id: "q_email", key: "email", type: "email", label: "Email", identifying: true, ...(required ? { required } : {}) },
  { kind: "field", id: "q_phone", key: "phone", type: "phone", label: "Phone", identifying: true },
];

/**
 * Ready-made examples, each showing which field suits which question: a
 * rating or NPS for a score, long text for "why", a table for an action
 * plan, a list for short items, notes at moments for a video and highlights
 * for a reading. Opt-in, not part of `TEMPLATES`:
 * `[...TEMPLATES, ...STARTER_TEMPLATES]`. The structured types they use
 * (list, table, media-notes, text-highlights) are outside the default
 * palette, so add them to `palette` for authors to edit those forms freely.
 */
export const STARTER_TEMPLATES: readonly FormTemplate[] = [
  {
    id: "customer-feedback",
    name: "Customer feedback",
    description: "A Net Promoter Score, the reason behind it, and an optional request to be contacted.",
    create: () => ({
      schemaVersion: 1,
      id: newId("form"),
      title: "How are we doing?",
      layout: { mode: "focus" },
      blocks: [
        { kind: "field", id: "q_nps", key: "nps", type: "nps", label: "How likely are you to recommend Acme to a friend or colleague?", required: true },
        { kind: "field", id: "q_reason", key: "reason", type: "long-text", label: "What's the main reason for your score?" },
        { kind: "field", id: "q_improve", key: "improve", type: "long-text", label: "What one thing should we improve?" },
        { kind: "field", id: "q_contact", key: "contact", type: "yes-no", label: "May we contact you about your answers?" },
        ...contactFields(),
      ],
      logic: [
        { id: "r_name", effect: "show", target: "q_name", when: { op: "eq", left: { field: "q_contact" }, right: { value: true } } },
        { id: "r_email", effect: "show", target: "q_email", when: { op: "eq", left: { field: "q_contact" }, right: { value: true } } },
        { id: "r_phone", effect: "show", target: "q_phone", when: { op: "eq", left: { field: "q_contact" }, right: { value: true } } },
      ],
      endings: [{ id: "default", title: "Thank you. We read every answer." }],
    }),
  },
  {
    id: "event-feedback",
    name: "Event feedback",
    description: "A 1–5 rating, what worked, what to change, and whether they'd come again.",
    create: () => ({
      schemaVersion: 1,
      id: newId("form"),
      title: "How was the event?",
      layout: { mode: "focus" },
      blocks: [
        { kind: "field", id: "q_rating", key: "rating", type: "rating", label: "Overall, how was the event?", required: true, props: { max: 5 } },
        { kind: "field", id: "q_best", key: "best", type: "long-text", label: "What did you enjoy most?" },
        { kind: "field", id: "q_change", key: "change", type: "long-text", label: "What should we change next time?" },
        { kind: "field", id: "q_again", key: "again", type: "yes-no", label: "Would you come to another event like this?" },
      ],
      logic: [
        { id: "r_best", effect: "show", target: "q_best", when: { op: "gte", left: { field: "q_rating" }, right: { value: 4 } } },
        { id: "r_change", effect: "show", target: "q_change", when: { op: "lte", left: { field: "q_rating" }, right: { value: 3 } } },
      ],
      endings: [{ id: "default", title: "Thanks for coming, and for your feedback." }],
      settings: { anonymous: true },
    }),
  },
  {
    id: "contact-request",
    name: "Contact request",
    description: "Name, email, what it's about and a message: a simple contact form.",
    create: () => ({
      schemaVersion: 1,
      id: newId("form"),
      title: "Get in touch",
      layout: { mode: "classic" },
      blocks: [
        ...contactFields(true),
        {
          kind: "field",
          id: "q_topic",
          key: "topic",
          type: "single-choice",
          label: "What is it about?",
          required: true,
          props: {
            options: [
              { value: "question", label: "A question" },
              { value: "sales", label: "Sales" },
              { value: "support", label: "Support" },
              { value: "other", label: "Something else" },
            ],
          },
        },
        { kind: "field", id: "q_message", key: "message", type: "long-text", label: "Your message", required: true },
      ],
      endings: [{ id: "default", title: "Thanks — we'll get back to you soon." }],
    }),
  },
  {
    id: "action-plan",
    name: "Action plan",
    description: "A goal, a table of actions (what, who, by when) and a list of next steps.",
    create: () => ({
      schemaVersion: 1,
      id: newId("form"),
      title: "Action plan",
      layout: { mode: "classic" },
      blocks: fields(
        { kind: "field", id: "q_goal", key: "goal", type: "short-text", label: "What are you working towards?", required: true },
        {
          kind: "field",
          id: "q_actions",
          key: "actions",
          type: "table",
          label: "Actions",
          description: "One action per row.",
          required: true,
          props: {
            columns: [
              { key: "what", label: "What", long: true },
              { key: "who", label: "Who" },
              { key: "by_when", label: "By when" },
            ],
            minRows: 1,
            maxRows: 10,
          },
        },
        { kind: "field", id: "q_next", key: "next_steps", type: "list", label: "Next steps", props: { max: 5, placeholder: "A next step" } },
      ),
      endings: [{ id: "default", title: "Plan saved." }],
    }),
  },
  {
    id: "video-notes",
    name: "Video notes",
    description: "Notes pinned to moments in a video or recording, then the key takeaways.",
    create: () => ({
      schemaVersion: 1,
      id: newId("form"),
      title: "Video notes",
      layout: { mode: "classic" },
      blocks: fields(
        { kind: "field", id: "q_notes", key: "notes", type: "media-notes", label: "Notes as you watch", description: "Add a note at any moment.", props: { maxNotes: 30 } },
        { kind: "field", id: "q_takeaways", key: "takeaways", type: "list", label: "Key takeaways", required: true, props: { min: 1, max: 5 } },
      ),
      endings: [{ id: "default", title: "Notes saved." }],
    }),
  },
  {
    id: "reading-notes",
    name: "Reading notes",
    description: "Highlight passages of a text with a note on each, then what stood out.",
    create: () => ({
      schemaVersion: 1,
      id: newId("form"),
      title: "Reading notes",
      layout: { mode: "classic" },
      blocks: [
        {
          kind: "field",
          id: "q_highlights",
          key: "highlights",
          type: "text-highlights",
          label: "Highlight what matters",
          description: "Select a passage, then add a note.",
          props: {
            text: "Replace this with the text to read. Readers select a passage, add a note on it, and can highlight as many passages as they like.",
            maxHighlights: 20,
          },
        },
        { kind: "field", id: "q_stood_out", key: "stood_out", type: "long-text", label: "What stood out to you?" },
      ],
      endings: [{ id: "default", title: "Notes saved." }],
    }),
  },
];
