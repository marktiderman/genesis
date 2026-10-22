// Compiled against the built .d.ts with exactOptionalPropertyTypes on, the
// strictest setting a consumer is likely to use (Breakthrough uses it).
import { defineForm, f, when } from "@marktiderman/genesis-forms";

export const form = defineForm({
  id: "exact",
  title: "Exact",
  hidden: {
    coach: f.hidden.string({ source: "server" }),
    member: f.hidden.string({ source: "server", sensitive: true }),
    visits: f.hidden.number(),
    trial: f.hidden.boolean({ source: "url" }),
  },
  blocks: [
    f.rating("overall", { label: "Overall", required: true }),
    f.yesNo("contact", { label: "Contact me" }),
    f.email("email", { label: "Email", identifying: true, sensitive: true }),
    f.phone("phone", { label: "Phone" }),
    f.longText("note", { label: "Note", placeholder: "Anything else?" }),
    f.list("kalm", { label: "Keep", max: undefined, itemPlaceholder: "One thing" }),
    f.table("smac", { label: "SMACtalk", columns: [{ key: "say", label: "Say" }, { key: "mean", label: "Mean", long: true }] }),
    f.mediaNotes("moments", { label: "Moments", maxNotes: 5 }),
    f.textHighlights("verse", { label: "Verse", text: undefined }),
  ],
  logic: [when("contact").is(true).show("email")],
  endings: [{ id: "default", title: "Thanks" }],
});
