/**
 * Shared test data: a made-up brand, props that exercise every variant of
 * every built-in section, a forms resolver, and a seeded memory store.
 */
import { defineForm, f } from "@marktiderman/genesis-forms";
import { createMemorySiteStore, exampleBrands, landingPage, starterSite, type FormsResolver, type RenderContext, type ResolvedForm } from "../index";

export const brand = exampleBrands.riverside;

const img = (name: string, alt = `Photo of ${name}`) => ({ src: `/images/${name}.jpg`, alt, width: 1200, height: 900 });

/** Props for each built-in section, filled out so every variant has something to draw. */
export const sectionProps: Record<string, Record<string, unknown>> = {
  nav: { showName: true, cta: { label: "Join today", href: "#contact" } },
  hero: {
    eyebrow: "Strength and conditioning",
    heading: "Train with people who know your name",
    body: "Small classes, real coaching and a community that shows up for you.",
    primaryCta: { label: "Book a free class", href: "#contact" },
    secondaryCta: { label: "See the timetable", href: "/timetable" },
    image: img("gym-floor"),
  },
  features: {
    eyebrow: "Why Riverside",
    heading: "Everything you need to get stronger",
    body: "Coaching, programming and a place you want to be.",
    items: [
      { title: "Coached classes", body: "Every class has a coach who watches your form.", icon: "users", image: img("class"), link: { label: "Classes", href: "/classes" } },
      { title: "Open gym", body: "Train on your own, six days a week.", icon: "dumbbell", image: img("open-gym") },
      { title: "Nutrition", body: "Simple habits that last.", icon: "leaf", image: img("food") },
    ],
  },
  cta: { heading: "Your first class is free", body: "Come and see if it's for you.", primaryCta: { label: "Book now", href: "#contact" }, secondaryCta: { label: "Ask a question", href: "mailto:hello@riverside.example" } },
  testimonials: {
    heading: "Members say",
    items: [
      { quote: "I never thought I'd enjoy training. Now I don't miss a week.", name: "Sam Lee", role: "Member since 2022", avatar: img("sam", "Sam Lee") },
      { quote: "The coaches actually remember my goals.", name: "Jane Doe" },
    ],
  },
  faq: {
    heading: "Questions",
    items: [
      { question: "Do I need to be fit to start?", answer: "No. Every workout scales to you.\n\nStart where you are." },
      { question: "What should I bring?", answer: "Water, trainers and a towel." },
    ],
  },
  pricing: {
    heading: "Memberships",
    body: "No joining fee.",
    tiers: [
      { name: "Two a week", price: "$89", period: "per month", features: ["Two classes a week", "Open gym"], cta: { label: "Choose", href: "#contact" } },
      { name: "Unlimited", price: "$139", period: "per month", description: "Most members pick this.", features: ["Every class", "Open gym", "Nutrition guide"], cta: { label: "Choose", href: "#contact" }, highlighted: true },
    ],
    note: "Prices include tax.",
  },
  logos: { heading: "As seen in", items: [{ name: "Hilltop News", image: { src: "/logos/news.png", alt: "" }, href: "https://news.example" }, { name: "City Radio", image: { src: "/logos/radio.png", alt: "City Radio" } }] },
  stats: { heading: "In numbers", items: [{ value: "12", label: "years open" }, { value: "40+", label: "classes a week" }, { value: "6", label: "coaches" }] },
  gallery: { heading: "Inside the gym", images: [{ ...img("rig"), caption: "The rig" }, img("rowers"), img("weights")] },
  "rich-text": {
    heading: "Our story",
    body: {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "We opened in a garage with " }, { type: "text", text: "four members", marks: [{ type: "bold" }] }, { type: "text", text: "." }] },
        { type: "heading", attrs: { level: 3 }, content: [{ type: "text", text: "Today" }] },
        { type: "paragraph", content: [{ type: "text", text: "Read the ", marks: [] }, { type: "text", text: "timetable", marks: [{ type: "link", attrs: { href: "/timetable" } }] }] },
      ],
    },
  },
  "form-embed": { heading: "Book a free class", body: "We'll reply within a day.", form: "free-class" },
  footer: {
    tagline: "Strength and conditioning by the river.",
    columns: [{ heading: "Visit", links: [{ label: "Timetable", href: "/timetable" }, { label: "Contact", href: "/contact" }] }],
    links: [{ label: "Privacy", href: "/privacy" }, { label: "Instagram", href: "https://instagram.example/riverside", newTab: true }],
    copyright: "© 2026 Riverside Gym",
  },
};

export const contactForm = defineForm({
  id: "free-class",
  title: "Free class",
  layout: { mode: "classic" },
  blocks: [f.shortText("name", { label: "Your name", required: true }), f.email("email", { label: "Email", required: true })],
});

export const formsResolver: FormsResolver = (slug) => {
  if (slug === "free-class") return { kind: "definition", definition: contactForm.definition, submitUrl: "/api/forms/free-class" } satisfies ResolvedForm;
  if (slug === "hosted") return { kind: "embed", url: "https://forms.example/riverside", title: "Riverside sign-up" };
  return null;
};

export function testCtx(overrides: Partial<RenderContext> = {}): RenderContext {
  return {
    headingLevel: 2,
    site: { name: "Riverside Gym", lang: "en", nav: [{ label: "Home", href: "/" }, { label: "Classes", href: "/classes" }, { label: "Contact", href: "/contact" }] },
    pagePath: "/",
    href: (h) => h,
    forms: new Map([["free-class", formsResolver("free-class", { siteId: "s", pagePath: "/", mode: "live" }) as ResolvedForm]]),
    mode: "live",
    idPrefix: "gs-test",
    ...overrides,
  };
}

/** A memory store with a published landing page (site `landing`) and a published starter site (site `starter`). */
export async function seededStore() {
  const store = createMemorySiteStore({ now: () => new Date("2026-10-24T12:00:00Z") });
  const landing = landingPage({
    brand,
    message: {
      headline: "Train with people who know your name",
      subhead: "Small classes and real coaching by the river.",
      benefits: [
        { title: "Coached classes", body: "A coach in every class." },
        { title: "Open gym", body: "Six days a week." },
        { title: "Community", body: "People who show up for you." },
      ],
    },
    form: { slug: "free-class", heading: "Book a free class" },
    contact: { email: "hello@riverside.example" },
  });
  // The template's sample quotes are placeholders: replace them as an editor would.
  const page = landing.pages[0]!;
  page.doc.content = page.doc.content.map((n) => (n.type === "testimonials" ? { ...n, placeholder: false, props: sectionProps.testimonials! } : n));
  await store.createSite({ id: "landing", site: landing.site, pages: landing.pages });
  const starter = starterSite({ brand: exampleBrands.hilltop, message: { headline: "Fitness on the hill", subhead: "Classes for every level.", benefits: [{ title: "Every level", body: "Start where you are." }] }, form: { slug: "free-class" } });
  for (const p of starter.pages) p.doc.content = p.doc.content.map((n) => (n.placeholder ? { ...n, placeholder: false } : n));
  await store.createSite({ id: "starter", site: starter.site, pages: starter.pages });
  await store.publish("landing", { brand, note: "First" });
  await store.publish("starter", { brand: exampleBrands.hilltop });
  return store;
}
