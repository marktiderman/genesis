/**
 * Shared test data: a made-up brand, props that exercise every variant of
 * every built-in section, a forms resolver, and a seeded memory store.
 */
import { defineForm, f, when } from "@marktiderman/genesis-forms";
import {
  createMemorySiteStore,
  exampleBrands,
  landingPage,
  postSummary,
  starterSite,
  type FormsResolver,
  type LivePost,
  type PostDocInput,
  type PostsContext,
  type RenderContext,
  type ResolvedForm,
} from "../index";

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
  schedule: {
    eyebrow: "Every week",
    heading: "Class times",
    body: "Coached classes six days a week.",
    types: [
      { id: "strength", name: "Strength", description: "Barbell work in a coached group.", tone: "primary" },
      { id: "conditioning", name: "Conditioning", description: "Intervals for every level.", tone: "soft" },
      { id: "open", name: "Open gym", tone: "plain" },
    ],
    sessions: [
      { day: "mon", start: "06:00", end: "07:00", title: "Strength", type: "strength", coach: "Sam Lee", location: "Main floor" },
      { day: "mon", start: "18:00", title: "Conditioning", type: "conditioning", coach: "Jane Doe" },
      { day: "tue", start: "06:00", title: "Conditioning", type: "conditioning", coach: "Jane Doe", location: "Studio" },
      { day: "thu", start: "18:00", title: "Strength", type: "strength", coach: "Sam Lee", link: { label: "Book Thursday strength", href: "https://booking.example/riverside/thu", external: true, target: "_blank" } },
      { day: "sat", start: "09:00", title: "Open gym", type: "open", note: "Members only" },
    ],
    days: ["mon", "tue", "wed", "thu", "fri", "sat"],
    footnote: "Check the noticeboard for term dates.",
  },
  team: {
    eyebrow: "The coaches",
    heading: "Our coaches",
    members: [
      {
        name: "Sam Lee",
        role: "Head coach",
        credentials: "Level 2 coach, weightlifting coach",
        photo: img("sam", "Sam Lee coaching a lift"),
        summary: "Loves teaching the barbell lifts.",
        bio: "Sam started coaching in 2015.\n\nToday Sam runs the strength programme and the Saturday class.",
        quote: { text: "Strong is a skill.", cite: "Sam Lee" },
        profile: "/coaches/sam-lee",
        cta: { label: "Train with Sam", href: "#contact" },
        anchor: "sam-lee",
      },
      { name: "Jane Doe", role: "Coach", photo: img("jane", "Jane Doe"), summary: "Runs the morning conditioning classes." },
    ],
  },
  "blog-list": { eyebrow: "Notes", heading: "From the blog", perPage: 2, cta: { label: "All posts", href: "/blog" } },
  "post-body": {},
  map: {
    eyebrow: "Visit",
    heading: "Find us by the river",
    body: "Parking at the back.",
    address: ["1 River Road", "Riverside, RV1 2AB"],
    provider: "openstreetmap",
    lat: 51.5007,
    lng: -0.1246,
    image: img("map", "A map of the streets around the gym"),
    contact: [{ label: "+1 555 0100", href: "tel:+15550100" }, { label: "hello@riverside.example", href: "mailto:hello@riverside.example" }],
    primaryCta: { label: "Book a class", href: "https://booking.example/riverside", external: true, target: "_blank" },
  },
  timeline: {
    eyebrow: "Six weeks",
    heading: "The course, week by week",
    steps: [
      { label: "Week 1", title: "Basics", body: "Learn the warm-up and the first lifts." },
      { label: "Week 3", title: "Skills", body: "Put the lifts together.", image: img("skills", "Members practising kettlebell swings") },
      { label: "Week 6", title: "Showcase", body: "Show friends what you learned.", cta: { label: "Sign up", href: "https://booking.example/riverside/course", external: true } },
    ],
  },
  file: {
    heading: "Downloads",
    body: "Print these before your first class.",
    files: [
      { label: "Timetable", description: "This term's classes.", file: { src: "/sites/s1/files/a1-timetable.pdf", mime: "application/pdf", bytes: 245760 } },
      { label: "Price list", file: { src: "https://files.example/prices.pdf", mime: "application/pdf", bytes: 2097152 } },
    ],
  },
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

/** Every field type the light form draws. */
export const everyLightField = defineForm({
  id: "sign-up",
  title: "Sign up",
  description: "Takes a minute.",
  layout: { mode: "classic" },
  blocks: [
    f.shortText("name", { label: "Your name", required: true, description: "As you'd like us to call you." }),
    f.longText("about", { label: "About you" }),
    f.email("email", { label: "Email", required: true }),
    f.phone("phone", { label: "Phone" }),
    f.date("start", { label: "Start date", min: "2026-01-01" }),
    f.number("age", { label: "Age", min: 16, max: 99, step: 1 }),
    f.singleChoice("level", { label: "Level", required: true, options: [{ value: "new", label: "New" }, { value: "some", label: "Some" }, { value: "lots", label: "Lots" }] }),
    f.dropdown("time", { label: "Best time", options: [{ value: "morning", label: "Morning" }, { value: "evening", label: "Evening" }] }),
    f.multiChoice("goals", { label: "Goals", required: true, options: [{ value: "strength", label: "Strength" }, { value: "fitness", label: "Fitness" }] }),
    f.yesNo("injury", { label: "Any injuries?" }),
    f.consent("terms", { label: "Terms", text: "I agree to the terms", required: true }),
  ],
});

/** A form that needs the engine (a rule), so it gets forms-web's <Form> and the form island. */
export const branchingForm = defineForm({
  id: "branching",
  title: "Tell us more",
  layout: { mode: "classic" },
  blocks: [f.yesNo("member", { label: "Already a member?" }), f.shortText("number", { label: "Member number" })],
  logic: [when("member").is(true).show("number")],
});

export const formsResolver: FormsResolver = (slug) => {
  if (slug === "free-class") return { kind: "definition", definition: contactForm.definition, submitUrl: "/api/forms/free-class" } satisfies ResolvedForm;
  if (slug === "sign-up") return { kind: "definition", definition: everyLightField.definition, submitUrl: "/api/forms/sign-up", submitLabel: "Sign me up" };
  if (slug === "branching") return { kind: "definition", definition: branchingForm.definition, submitUrl: "https://forms.example/submit" };
  if (slug === "hosted") return { kind: "embed", url: "https://forms.example/riverside", title: "Riverside sign-up" };
  return null;
};

/** A post's document, made up. */
export const postDoc = (title: string, extra: Partial<PostDocInput> = {}): PostDocInput => ({
  schemaVersion: 1,
  title,
  excerpt: `${title}: what it is about, in a sentence.`,
  body: {
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "The first paragraph of the post." }] },
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "A section" }] },
      { type: "paragraph", content: [{ type: "text", text: "More of the post, with " }, { type: "text", text: "a link", marks: [{ type: "link", attrs: { href: "/schedule" } }] }] },
    ],
  },
  ...extra,
});

export const livePosts: LivePost[] = [
  { slug: "first-class-tips", publishedAt: "2026-09-02T09:00:00Z", updatedAt: "2026-09-02T09:00:00Z", doc: { ...(postDoc("Five tips for your first class") as LivePost["doc"]), cover: { src: "/images/kettlebells.jpg", alt: "Kettlebells in a row", width: 1600, height: 1000 }, category: "Training", author: { name: "Sam Lee" } } },
  { slug: "why-we-warm-up", publishedAt: "2026-06-17T09:00:00Z", updatedAt: "2026-06-18T09:00:00Z", doc: postDoc("Why we warm up") as LivePost["doc"] },
  { slug: "morning-crew", publishedAt: "2026-05-01T09:00:00Z", updatedAt: "2026-05-01T09:00:00Z", doc: { ...(postDoc("Meet the morning crew") as LivePost["doc"]), category: "News" } },
];

export const testPosts = (overrides: Partial<PostsContext> = {}): PostsContext => ({
  path: "/blog",
  list: livePosts.map(postSummary),
  current: { slug: "first-post", publishedAt: "2026-10-01T09:00:00Z", updatedAt: "2026-10-02T09:00:00Z", doc: { ...(postDoc("Our first post") as LivePost["doc"]), cover: { src: "/images/first.jpg", alt: "The gym at sunrise" }, author: { name: "Jane Doe" }, category: "News" } },
  page: 1,
  ...overrides,
});

export function testCtx(overrides: Partial<RenderContext> = {}): RenderContext {
  return {
    headingLevel: 2,
    site: { name: "Riverside Gym", lang: "en", nav: [{ label: "Home", href: "/" }, { label: "Classes", href: "/classes" }, { label: "Contact", href: "/contact" }] },
    pagePath: "/",
    href: (h) => h,
    forms: new Map(["free-class", "sign-up", "branching"].map((slug) => [slug, formsResolver(slug, { siteId: "s", pagePath: "/", mode: "live" }) as ResolvedForm])),
    mode: "live",
    idPrefix: "gs-test",
    posts: testPosts(),
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
