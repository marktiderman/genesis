import { defineContentPack } from "@marktiderman/genesis-features/blocks";

/**
 * Objectives set each quarter, each with a confidence the team updates as the quarter goes.
 *
 * @stability Experimental
 */
export const quarterlyObjectivesPack = defineContentPack({
  id: "quarterly-objectives",
  name: "Quarterly objectives",
  description: "A quarterly planning session and a confidence rating on every goal.",
  version: "1.0.0",
  publisher: "@marktiderman/genesis-work",
  requires: ["sessions", "pursuits"],
  sessionTypes: [
    {
      key: "quarterly_planning",
      kind: "planning",
      name: "Quarterly planning",
      description: "Close the quarter that's ending and set the next one's objectives.",
      defaultMinutes: 240,
      agenda: [
        { key: "check_in", title: "Check in", minutes: 15 },
        { key: "review", title: "Review last quarter's objectives and numbers", minutes: 45 },
        { key: "issues", title: "Raise and solve the big issues", minutes: 90 },
        { key: "objectives", title: "Set next quarter's objectives and owners", minutes: 75 },
        { key: "wrap_up", title: "Recap and next steps", minutes: 15 },
      ],
    },
  ],
  fieldDefinitions: [
    {
      key: "confidence",
      target: "pursuits",
      label: "Confidence",
      field: {
        type: "single-choice",
        options: [
          { value: "on_track", label: "On track" },
          { value: "at_risk", label: "At risk" },
          { value: "off_track", label: "Off track" },
        ],
      },
      visibility: "tenant",
    },
  ],
});
