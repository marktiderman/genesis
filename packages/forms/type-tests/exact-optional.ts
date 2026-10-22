// Compiled against the built .d.ts with exactOptionalPropertyTypes on, the
// strictest setting a consumer is likely to use (Breakthrough uses it).
import { defineForm, f, when } from "@marktiderman/genesis-forms";

export const form = defineForm({
  id: "exact",
  title: "Exact",
  hidden: {
    owner: f.hidden.string({ source: "server" }),
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
    f.list("goals", { label: "Keep", max: undefined, itemPlaceholder: "One thing" }),
    f.table("plan", { label: "Plan", columns: [{ key: "what", label: "What" }, { key: "why", label: "Why", long: true }] }),
    f.mediaNotes("moments", { label: "Moments", maxNotes: 5 }),
    f.textHighlights("article", { label: "Article", text: undefined }),
  ],
  logic: [when("contact").is(true).show("email")],
  endings: [{ id: "default", title: "Thanks" }],
});
