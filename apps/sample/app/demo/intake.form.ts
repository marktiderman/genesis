import { defineForm, f } from "@marktiderman/genesis-forms";

// The intake form, as data: the same definition renders on web and native,
// and the server checks a submission against it.
export const intakeForm = defineForm({
  id: "demo-intake",
  title: "Tell us about yourself",
  layout: { mode: "classic" },
  blocks: [
    f.shortText("name", { label: "Your name", required: true }),
    f.email("email", { label: "Email", required: true }),
    f.singleChoice("plan", {
      label: "What are you interested in?",
      required: true,
      options: [
        { value: "Starter", label: "Getting started" },
        { value: "Ongoing", label: "Something ongoing" },
      ],
    }),
    f.longText("notes", { label: "Anything we should know?" }),
  ],
  endings: [{ id: "default", title: "Thanks! You're on the list." }],
});
