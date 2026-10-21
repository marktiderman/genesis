/** Copies of the definitions in apps/sample/app/lib/forms.ts: the source of the conformance fixtures. Keep in sync. */
import { defineForm, f, when } from "../index";

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

