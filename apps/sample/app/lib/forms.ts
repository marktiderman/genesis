import { defineForm, f, when } from "@marktiderman/genesis-forms";

/** CrossFit Fairfield after-class feedback: the R1 reference form. */
export const afterClass = defineForm({
  id: "after-class",
  title: "How was class?",
  layout: { mode: "focus" },
  hidden: {
    class: f.hidden.string({ source: "server" }),
    coach: f.hidden.string({ source: "server" }),
  },
  blocks: [
    f.rating("overall", { label: "How was today's class?", required: true }),
    f.multiChoice("went_well", {
      label: "What went well?",
      options: [
        { value: "coaching", label: "Coaching" },
        { value: "workout", label: "The workout" },
        { value: "community", label: "Community" },
        { value: "scaling", label: "Scaling options" },
        { value: "equipment", label: "Equipment" },
        { value: "cleanliness", label: "Cleanliness" },
      ],
    }),
    f.longText("improve", { label: "Anything we could do better?" }),
    f.yesNo("contact_me", { label: "Want {{hidden:coach|a coach}} to follow up with you?" }),
    f.shortText("name", { label: "Your name", required: true }),
    f.email("email", { label: "Best email to reach you", required: true }),
  ],
  logic: [
    when("contact_me").isNot(true).hide("name"),
    when("contact_me").isNot(true).hide("email"),
    when("overall").lessThan(4).jumpTo("improve"),
  ],
  endings: [{ id: "default", title: "Thanks! See you at the next class." }],
  settings: { anonymous: true },
});

/** Monthly pulse with an NPS question. */
export const monthlyPulse = defineForm({
  id: "monthly-pulse",
  title: "Monthly check-in",
  layout: { mode: "focus" },
  blocks: [
    f.nps("recommend", { label: "How likely are you to recommend CrossFit Fairfield to a friend?", required: true }),
    f.longText("why", { label: "What's the main reason for your score?" }),
    f.singleChoice("frequency", {
      label: "How often did you train with us this month?",
      options: [
        { value: "1-4", label: "1–4 times" },
        { value: "5-8", label: "5–8 times" },
        { value: "9-12", label: "9–12 times" },
        { value: "13+", label: "13 or more" },
      ],
    }),
  ],
  logic: [when("recommend").atLeast(9).jumpTo({ ending: "promoter" })],
  endings: [
    { id: "default", title: "Thanks for the honest feedback." },
    { id: "promoter", title: "Thank you! Bring a friend to a free class anytime." },
  ],
  settings: { anonymous: true },
});

export const playgroundForms = { "after-class": afterClass, "monthly-pulse": monthlyPulse } as const;

export interface PlaygroundScenario {
  id: string;
  title: string;
  description: string;
  form: typeof afterClass | typeof monthlyPulse;
  context: Record<string, string>;
  tags: string[];
}

/** The scenario library shown in the playground sidebar. */
export const scenarios: PlaygroundScenario[] = [
  {
    id: "after-class",
    title: "After class",
    description: "Rating, optional follow-up; a low rating skips “what went well”.",
    form: afterClass,
    context: { coach: "Sam", class: "06:00 CrossFit" },
    tags: ["R1", "jump", "show/hide", "recall", "server context"],
  },
  {
    id: "monthly-pulse",
    title: "Monthly pulse",
    description: "NPS; promoters jump to their own ending.",
    form: monthlyPulse,
    context: {},
    tags: ["R1", "nps", "endings"],
  },
];
