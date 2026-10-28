import type { FormDefinition, Json } from "@marktiderman/genesis-forms";
import type { SummaryItem } from "@marktiderman/genesis-forms-studio";

/** A gym's Saturday check-in: a rating, a photo consent and a comment. */
export const checkIn = {
  schemaVersion: 1,
  id: "e2e-saturday-check-in",
  title: "E2E Saturday check-in",
  blocks: [
    { kind: "field", id: "r", key: "score", type: "rating", label: "How was today's class?", props: { max: 5 } },
    { kind: "field", id: "c", key: "photo", type: "consent", label: "Photo consent" },
    { kind: "field", id: "t", key: "wrong", type: "long-text", label: "What went wrong?" },
  ],
  logic: [],
  endings: [{ id: "thanks", title: "Thanks for your answers." }],
} as unknown as FormDefinition;

export const TODAY = "2026-10-23";

type Row = [day: string, score: number, photo: boolean, wrong: string | null, name: string, who: string, cls: string, coach: string];
const rows: Row[] = [
  ["2026-10-23", 2, true, "Rower was broken again, so we waited 10 minutes.", "Priya Shah", "Member", "6:00 class", "Leo"],
  ["2026-10-23", 5, true, null, "Sam Lee", "Member", "6:00 class", "Leo"],
  ["2026-10-22", 2, true, "Too crowded for the barbell section.", "", "", "Noon class", "Casey"],
  ["2026-10-22", 5, true, null, "Ana Ruiz", "Member", "Noon class", "Casey"],
  ["2026-10-21", 1, false, null, "Tom Becker", "New lead", "5:30 class", "Leo"],
  ["2026-10-21", 4, true, null, "Jo Park", "Member", "5:30 class", "Leo"],
  ["2026-10-20", 5, true, null, "Mia Chen", "Member", "6:00 class", "Leo"],
  ["2026-10-19", 4, true, null, "Ravi Das", "Member", "Noon class", "Casey"],
  ["2026-10-14", 5, true, null, "Sam Lee", "Member", "6:00 class", "Leo"],
  ["2026-10-13", 4, true, null, "Ana Ruiz", "Member", "Noon class", "Casey"],
];

export const items: SummaryItem[] = rows.map(([date, score, photo, wrong, name, who, cls, coach], i) => {
  const answers: Record<string, Json> = { r: score, c: photo };
  if (wrong) answers["t"] = wrong;
  return { id: `r${i}`, date, definition: checkIn, answers, extra: { name, who, class: cls, coach } };
});
