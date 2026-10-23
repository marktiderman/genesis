/** Demo data for the sub-navigation sample (`/projects`). */
export interface Project {
  id: string;
  name: string;
  tasks: number;
  members: number;
  activity: string[];
}

export const PROJECTS: Project[] = [
  {
    id: "launch",
    name: "Spring launch",
    tasks: 12,
    members: 4,
    activity: ["Ana moved 3 tasks to Done", "Ben invited Kai", "Launch date set to May 4"],
  },
  {
    id: "rebrand",
    name: "Rebrand",
    tasks: 5,
    members: 2,
    activity: ["Logo v3 uploaded"],
  },
];
