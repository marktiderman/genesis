import { defineContentPack } from "@marktiderman/genesis-features/blocks";

/**
 * A team's weekly meeting: the same agenda every week, most of it spent solving issues.
 *
 * @stability Experimental
 */
export const weeklyTeamMeetingPack = defineContentPack({
  id: "weekly-team-meeting",
  name: "Weekly team meeting",
  description: "A 60-minute weekly agenda: check in, review numbers, goals and tasks, then solve the week's issues.",
  version: "1.0.0",
  publisher: "@marktiderman/genesis-work",
  requires: ["sessions"],
  sessionTypes: [
    {
      key: "weekly_team_meeting",
      kind: "meeting",
      name: "Weekly team meeting",
      description: "Same day, same time, same agenda every week.",
      defaultMinutes: 60,
      agenda: [
        { key: "check_in", title: "Check in: one good thing", minutes: 5 },
        { key: "metrics", title: "Numbers: on or off track", minutes: 5 },
        { key: "goals", title: "Goals: on or off track", minutes: 5 },
        { key: "news", title: "Customer and team news", minutes: 5 },
        { key: "tasks", title: "Last week's tasks: done or not", minutes: 5 },
        { key: "issues", title: "Solve issues, most important first", minutes: 30 },
        { key: "wrap_up", title: "Recap new tasks and rate the meeting", minutes: 5 },
      ],
    },
  ],
});
