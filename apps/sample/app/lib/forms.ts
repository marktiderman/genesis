import { defineForm, f, when } from "@marktiderman/genesis-forms";

/** Post-event feedback: the R1 reference form. */
export const eventFeedback = defineForm({
  id: "event-feedback",
  title: "How was the event?",
  layout: { mode: "focus" },
  hidden: {
    session: f.hidden.string({ source: "server" }),
    owner: f.hidden.string({ source: "server" }),
  },
  blocks: [
    f.rating("overall", { label: "How was today's event?", required: true }),
    f.multiChoice("went_well", {
      label: "What went well?",
      options: [
        { value: "hosting", label: "Hosting" },
        { value: "content", label: "The content" },
        { value: "community", label: "Community" },
        { value: "pacing", label: "Pacing" },
        { value: "venue", label: "The venue" },
        { value: "cleanliness", label: "Cleanliness" },
      ],
    }),
    f.longText("improve", { label: "Anything we could do better?" }),
    f.yesNo("contact_me", { label: "Want {{hidden:owner|someone}} to follow up with you?" }),
    f.shortText("name", { label: "Your name", required: true }),
    f.email("email", { label: "Best email to reach you", required: true }),
  ],
  logic: [
    when("contact_me").isNot(true).hide("name"),
    when("contact_me").isNot(true).hide("email"),
    when("overall").lessThan(4).jumpTo("improve"),
  ],
  endings: [{ id: "default", title: "Thanks! See you next time." }],
  settings: { anonymous: true },
});

/** Monthly check-in with an NPS question. */
export const monthlyCheckIn = defineForm({
  id: "monthly-check-in",
  title: "Monthly check-in",
  layout: { mode: "focus" },
  blocks: [
    f.nps("recommend", { label: "How likely are you to recommend us to a friend?", required: true }),
    f.longText("why", { label: "What's the main reason for your score?" }),
    f.singleChoice("frequency", {
      label: "How often did you use the service this month?",
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
    { id: "promoter", title: "Thank you! Tell a friend about us anytime." },
  ],
  settings: { anonymous: true },
});

/** The organisation shown on the respondent's screen: initials stand in for a logo. */
export const demoBrand = { name: "Acme Events" };

export const playgroundForms ={ "event-feedback": eventFeedback, "monthly-check-in": monthlyCheckIn } as const;

export interface PlaygroundScenario {
  id: string;
  title: string;
  description: string;
  form: typeof eventFeedback | typeof monthlyCheckIn;
  context: Record<string, string>;
  tags: string[];
}

/** The scenario library shown in the playground sidebar. */
export const scenarios: PlaygroundScenario[] = [
  {
    id: "event-feedback",
    title: "Event feedback",
    description: "Rating, optional follow-up; a low rating skips “what went well”.",
    form: eventFeedback,
    context: { owner: "Sam", session: "Tuesday 6 PM workshop" },
    tags: ["R1", "jump", "show/hide", "recall", "server context"],
  },
  {
    id: "monthly-check-in",
    title: "Monthly check-in",
    description: "NPS; promoters jump to their own ending.",
    form: monthlyCheckIn,
    context: {},
    tags: ["R1", "nps", "endings"],
  },
];
