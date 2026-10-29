/**
 * Fitness: section presets and sample data for a functional fitness gym.
 *
 * Template content only, on the neutral sections: nothing here changes how a
 * section renders. The business is made up.
 */
import type { SectionPreset } from "../core/registry";
import type { SiteBrand } from "../core/theme";
import type { TemplateMessage } from "../core/templates";
import type { IndustryTemplate } from "./types";

const brand: SiteBrand = {
  name: "Riverside Gym",
  colors: { primary: "#0f766e", primaryDark: "#2dd4bf" },
  fonts: { heading: "space-grotesk", body: "inter" },
};

const message: TemplateMessage = {
  headline: "Train with people who know your name",
  subhead: "Small classes and real coaching by the river.",
  benefits: [
    { title: "Coached classes", body: "A coach in every class." },
    { title: "Open gym", body: "Six days a week." },
  ],
};

const team: SectionPreset[] = [
  {
    name: "Coach cards",
    variant: "cards",
    props: {
      heading: "Meet the coaches",
      members: [
        { name: "Coach name", role: "Head coach", credentials: "Level 2 coach, nutrition coach", summary: "A line about what they love to coach.", bio: "Their story, in a few short paragraphs.\n\nWhat they love about coaching." },
        { name: "Coach name", role: "Coach", summary: "A line about what they love to coach." },
      ],
    },
  },
];

const schedule: SectionPreset[] = [
  {
    name: "Class timetable",
    variant: "grid",
    props: {
      heading: "Class times",
      types: [
        { id: "strength", name: "Strength", description: "Barbell work in a coached group.", tone: "primary" },
        { id: "conditioning", name: "Conditioning", description: "Intervals for every level.", tone: "soft" },
        { id: "open", name: "Open gym", description: "Train on your own; a coach is on the floor.", tone: "plain" },
      ],
      sessions: [
        { day: "mon", start: "06:00", end: "07:00", title: "Strength", type: "strength", host: "Coach name" },
        { day: "mon", start: "18:00", end: "19:00", title: "Conditioning", type: "conditioning", host: "Coach name" },
        { day: "wed", start: "06:00", end: "07:00", title: "Strength", type: "strength", host: "Coach name" },
        { day: "sat", start: "09:00", title: "Open gym", type: "open" },
      ],
    },
  },
];

const features: SectionPreset[] = [
  {
    name: "First visit steps",
    variant: "steps",
    props: {
      heading: "How to start",
      items: [
        { title: "Come to a free class", body: "Meet the coaches and try a session.", cta: { label: "Book a free class", href: "#contact" } },
        { title: "Learn the basics", body: "A few sessions on the movements, with a coach." },
        { title: "Pick a plan", body: "Choose what fits your week.", cta: { label: "See the plans", href: "/plans" } },
      ],
    },
  },
];

const stats: SectionPreset[] = [
  { name: "Gym in numbers", variant: "row", props: { items: [{ value: "12", label: "years open" }, { value: "40+", label: "classes a week" }, { value: "6", label: "coaches" }] } },
];

const logos: SectionPreset[] = [
  { name: "Gym trust bar", variant: "trust-bar", props: { claim: "Why people train here", items: [{ name: "Small classes" }, { name: "Friendly coaches" }, { name: "Free first visit" }], surface: "inverse" } },
];

const pricing: SectionPreset[] = [
  {
    name: "Memberships",
    variant: "cards",
    props: {
      heading: "Memberships",
      groups: [
        { heading: "Start here", anchor: "start", tiers: [{ name: "Drop-in", price: "$20", description: "One class", cta: { label: "Book a visit", href: "#contact" } }] },
        { heading: "Every week", anchor: "weekly", tiers: [{ name: "Unlimited", price: "$139", period: "per month", description: "Every class and open gym", highlighted: true, cta: { label: "Join", href: "#contact" } }] },
      ],
    },
  },
];

const file: SectionPreset[] = [
  { name: "Forms to bring", variant: "cards", props: { heading: "Forms to bring", files: [{ label: "Waiver", description: "Sign it before your first class.", file: { src: "/files/waiver.pdf", mime: "application/pdf" } }] } },
];

/** A functional fitness gym's presets and sample data. */
export const fitness: IndustryTemplate = Object.freeze({
  id: "fitness",
  label: "Fitness",
  brand,
  message,
  presets: { team, schedule, features, stats, logos, pricing, file },
});
