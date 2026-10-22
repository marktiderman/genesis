import { defineForm, f, when } from "../index";

export const eventFeedback = defineForm({
  id: "event-feedback",
  title: "How was the event?",
  layout: { mode: "focus" },
  hidden: {
    session: f.hidden.string({ source: "server" }),
    owner: f.hidden.string({ source: "server" }),
    utm: f.hidden.string(),
  },
  blocks: [
    f.rating("overall", { label: "How was today's event?", max: 5, required: true }),
    f.multiChoice("went_well", {
      label: "What went well?",
      options: [{ value: "hosting" }, { value: "content" }, { value: "community" }],
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
