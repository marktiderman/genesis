import { defineContentPack } from "@marktiderman/genesis-features/blocks";

/**
 * Regular one-on-ones between a manager and each person on the team.
 *
 * @stability Experimental
 */
export const oneOnOnesPack = defineContentPack({
  id: "one-on-ones",
  name: "One-on-ones",
  description: "A 30-minute one-on-one led by the person's own topics, with feedback both ways and agreed next steps.",
  version: "1.0.0",
  publisher: "@marktiderman/genesis-work",
  requires: ["sessions"],
  sessionTypes: [
    {
      key: "one_on_one",
      kind: "one_on_one",
      name: "One-on-one",
      description: "Their meeting first: the person brings the topics.",
      defaultMinutes: 30,
      agenda: [
        { key: "check_in", title: "Check in", minutes: 5 },
        { key: "their_topics", title: "Their topics", minutes: 15 },
        { key: "feedback", title: "Feedback both ways", minutes: 5 },
        { key: "next_steps", title: "Next steps", minutes: 5 },
      ],
    },
  ],
});
