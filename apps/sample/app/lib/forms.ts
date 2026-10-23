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

/** A booking request: dropdown, number, date, a star rating with end labels, and a consent checkbox. */
export const classBooking = defineForm({
  id: "class-booking",
  title: "Book a class",
  layout: { mode: "classic" },
  blocks: [
    f.dropdown("class", {
      label: "Which class?",
      required: true,
      options: [
        { value: "early", label: "Early morning" },
        { value: "lunch", label: "Lunchtime" },
        { value: "evening", label: "Evening" },
        { value: "weekend", label: "Weekend" },
      ],
    }),
    f.date("day", { label: "Which day?", required: true, min: "2026-01-01" }),
    f.number("guests", { label: "How many guests are you bringing?", min: 0, max: 5, step: 1 }),
    f.rating("last", { label: "How was your last class?", display: "stars", lowLabel: "Poor", highLabel: "Great" }),
    f.consent("terms", { label: "Booking terms", text: "I agree to the booking terms", required: true }),
  ],
  logic: [when("guests").greaterThan(2).jumpTo({ ending: "group" })],
  endings: [
    { id: "default", title: "You're booked in." },
    { id: "group", title: "Thanks! We'll confirm space for your group." },
  ],
});

/** The organisation shown on the respondent's screen: initials stand in for a logo. */
export const demoBrand = { name: "Acme Events" };

export const playgroundForms = { "event-feedback": eventFeedback, "monthly-check-in": monthlyCheckIn, "class-booking": classBooking } as const;

export interface PlaygroundScenario {
  id: string;
  title: string;
  description: string;
  form: typeof eventFeedback | typeof monthlyCheckIn | typeof classBooking;
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
  {
    id: "class-booking",
    title: "Class booking",
    description: "Dropdown, date, number, star rating and a required consent; a group jumps to its own ending.",
    form: classBooking,
    context: {},
    tags: ["dropdown", "number", "date", "consent", "stars"],
  },
];
