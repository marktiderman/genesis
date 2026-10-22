import { defineForm, f, when } from "../index";

export const afterClass = defineForm({
  id: "after-class",
  title: "How was class?",
  layout: { mode: "focus" },
  hidden: {
    class: f.hidden.string({ source: "server" }),
    coach: f.hidden.string({ source: "server" }),
    utm: f.hidden.string(),
  },
  blocks: [
    f.rating("overall", { label: "How was today's class?", max: 5, required: true }),
    f.multiChoice("went_well", {
      label: "What went well?",
      options: [{ value: "coaching" }, { value: "workout" }, { value: "community" }],
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
