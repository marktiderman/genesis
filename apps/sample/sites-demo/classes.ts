// The multi-page demo: Riverside Gym's full site, made up, using the V1
// sections. A timetable, the coaches, plans in groups with a download, a
// map that loads only when asked, a six-week course, and a blog with posts.
//
//   /sites-demo/classes/            home: a trust bar, steps, the latest posts
//   /sites-demo/classes/timetable   the week's classes
//   /sites-demo/classes/coaches     the team
//   /sites-demo/classes/plans       grouped pricing and a price list
//   /sites-demo/classes/course      a six-week course
//   /sites-demo/classes/visit       the map and a mailto form
//   /sites-demo/classes/blog        the blog, and /blog/<slug> for each post
import type { BrandInput, MemorySiteStore, PageDoc, PostDocInput, SectionNode, SiteDocInput } from "@marktiderman/genesis-sites";

const node = (id: string, type: string, variant: string, props: Record<string, unknown>): SectionNode => ({ id, type, v: 1, variant, props });
const page = (title: string, description: string, content: SectionNode[]): PageDoc => ({ schemaVersion: 1, root: { props: { title } }, content, seo: { description } });

const BOOKING = "https://booking.example/riverside";
const book = (label: string, path = "") => ({ label, href: `${BOOKING}${path}`, external: true, target: "_blank" as const, event: "book" });

const site: SiteDocInput = {
  schemaVersion: 1,
  name: "Riverside Gym",
  nav: [
    { label: "Timetable", href: "/timetable" },
    { label: "Coaches", href: "/coaches" },
    { label: "Plans", href: "/plans" },
    { label: "Course", href: "/course" },
    { label: "Blog", href: "/blog" },
    { label: "Visit", href: "/visit" },
  ],
  header: [node("nav", "nav", "simple", { showName: true, cta: book("Book a free class", "/free") })],
  footer: [
    node("footer", "footer", "columns", {
      tagline: "Small classes and real coaching by the river.",
      columns: [
        { heading: "Train", links: [{ label: "Timetable", href: "/timetable" }, { label: "Plans", href: "/plans" }, { label: "Course", href: "/course" }] },
        { heading: "Visit", links: [{ label: "Find us", href: "/visit" }, { label: "hello@riverside.example", href: "mailto:hello@riverside.example" }] },
      ],
      copyright: "© 2026 Riverside Gym",
    }),
  ],
  seo: { titleTemplate: "%s · Riverside Gym", description: "Small classes and real coaching by the river.", organization: { name: "Riverside Gym" } },
  redirects: [{ from: "/schedule", to: "/timetable", status: 301 }],
};

const pages: { path: string; kind?: "page" | "post"; doc: PageDoc }[] = [
  {
    path: "/",
    doc: page("Home", "Small classes and real coaching by the river.", [
      node("hero", "hero", "centered", {
        eyebrow: "By the river since 2019",
        heading: "Train with people who know your name",
        body: "Small classes, real coaching and a community that shows up for you.",
        primaryCta: book("Book a free class", "/free"),
        secondaryCta: { label: "See the timetable", href: "/timetable" },
      }),
      node("trust", "logos", "trust-bar", { claim: "Why members stay", items: [{ name: "Small classes" }, { name: "Friendly coaches" }, { name: "Free first visit" }], surface: "inverse" }),
      node("start", "features", "steps", {
        eyebrow: "Getting started",
        heading: "Three steps to your first class",
        items: [
          { title: "Book a free class", body: "Come and try one. A coach shows you round.", note: "Weekdays at 6 pm, Saturdays at 9 am.", cta: book("Book it", "/free") },
          { title: "Learn the basics", body: "Two short sessions on the lifts, with a coach.", cta: { label: "About the course", href: "/course" } },
          { title: "Pick a plan", body: "Choose what fits your week. Change it any time.", cta: { label: "See the plans", href: "/plans" } },
        ],
      }),
      node("latest", "blog-list", "list", { eyebrow: "From the blog", heading: "Latest posts", perPage: 3, paginate: false, cta: { label: "All posts", href: "/blog" } }),
    ]),
  },
  {
    path: "/timetable",
    doc: page("Timetable", "Riverside Gym's classes, by time and day.", [
      node("hero", "hero", "centered", { eyebrow: "Every week", heading: "Timetable", body: "Coached classes six days a week. New here? Start with a free class." }),
      node("week", "schedule", "grid", {
        heading: "This term's classes",
        types: [
          { id: "strength", name: "Strength", description: "Barbell work in a coached group.", tone: "primary" },
          { id: "conditioning", name: "Conditioning", description: "Intervals for every level.", tone: "soft" },
          { id: "mobility", name: "Mobility", description: "Slow work for stiff joints.", tone: "outline" },
          { id: "open", name: "Open gym", description: "Train on your own; a coach is on the floor.", tone: "plain" },
        ],
        days: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
        sessions: [
          { day: "mon", start: "06:00", end: "07:00", title: "Strength", type: "strength", host: "Sam Lee", location: "Main floor" },
          { day: "mon", start: "18:00", title: "Conditioning", type: "conditioning", host: "Priya Shah" },
          { day: "tue", start: "06:00", title: "Conditioning", type: "conditioning", host: "Priya Shah" },
          { day: "tue", start: "18:00", title: "Mobility", type: "mobility", host: "Tom Okafor", location: "Studio" },
          { day: "wed", start: "06:00", title: "Strength", type: "strength", host: "Sam Lee" },
          { day: "wed", start: "12:15", title: "Conditioning", type: "conditioning", host: "Priya Shah" },
          { day: "thu", start: "18:00", title: "Strength", type: "strength", host: "Sam Lee", link: book("Book Thursday", "/thu") },
          { day: "fri", start: "06:00", title: "Conditioning", type: "conditioning", host: "Tom Okafor" },
          { day: "sat", start: "09:00", title: "Open gym", type: "open" },
          { day: "sat", start: "10:30", title: "Mobility", type: "mobility", host: "Tom Okafor", location: "Studio" },
        ],
        emptyText: "No classes",
        footnote: "Check the noticeboard for term dates.",
      }),
    ]),
  },
  {
    path: "/coaches",
    doc: page("Coaches", "Riverside Gym's coaches.", [
      node("team", "team", "cards", {
        eyebrow: "The team",
        heading: "Our coaches",
        body: "You'll know them by name, and they'll know yours.",
        members: [
          {
            name: "Sam Lee",
            role: "Head coach",
            credentials: "Level 2 coach, weightlifting coach",
            summary: "Loves teaching the barbell lifts.",
            bio: "Sam started coaching in 2015, after ten years of rowing.\n\nToday Sam runs the strength classes and the Saturday open gym, and writes the programme every term.",
            quote: { text: "Strong is a skill. Skills can be taught.", cite: "Sam Lee" },
            cta: book("Train with Sam", "/sam"),
            anchor: "sam-lee",
          },
          { name: "Priya Shah", role: "Coach", credentials: "Level 1 coach", summary: "Runs the conditioning classes.", bio: "Priya came for a free class in 2020 and stayed.\n\nShe coaches mornings and lunchtimes." },
          { name: "Tom Okafor", role: "Mobility coach", summary: "Helps stiff backs move again.", bio: "Tom teaches mobility and runs the six-week course." },
        ],
      }),
    ]),
  },
  {
    path: "/plans",
    doc: page("Plans", "Riverside Gym's plans and prices.", [
      node("hero", "hero", "centered", { eyebrow: "Plans", heading: "Simple prices", body: "No joining fee. Change or pause any time." }),
      node("plans", "pricing", "cards", {
        heading: "Choose a plan",
        groups: [
          { eyebrow: "First", heading: "Start here", anchor: "start", tiers: [{ name: "Free class", price: "$0", description: "Your first visit", highlighted: true, badge: "Start here", cta: book("Book a free class", "/free") }, { name: "Single visit", price: "$20", description: "One class", cta: book("Book a visit", "/visit") }] },
          {
            heading: "Every week",
            body: "Unlimited classes, with a better rate the longer you commit.",
            anchor: "weekly",
            tiers: [
              { name: "Monthly", price: "$99", period: "per month", description: "Cancel any time", cta: book("Join monthly", "/monthly") },
              { name: "Six months", price: "$94", period: "per month", description: "Paid every month", cta: book("Join for six months", "/six") },
              { name: "Yearly", price: "$89", period: "per month", description: "Paid yearly", highlighted: true, cta: book("Join for a year", "/year") },
            ],
          },
        ],
        note: "Prices include tax.",
      }),
      node("files", "file", "list", { heading: "Downloads", files: [{ label: "Price list", description: "Every plan on one page.", file: { src: "/files/riverside-prices.pdf", mime: "application/pdf", bytes: 182000 } }] }),
    ]),
  },
  {
    path: "/course",
    doc: page("Course", "Riverside Gym's six-week beginners' course.", [
      node("hero", "hero", "centered", { eyebrow: "For beginners", heading: "The six-week course", body: "Learn the lifts in a small group, one evening a week.", primaryCta: book("Join the next course", "/course") }),
      node("weeks", "timeline", "vertical", {
        heading: "Week by week",
        steps: [
          { label: "Week 1", title: "Welcome", body: "Meet the group, learn the warm-up, set a goal." },
          { label: "Week 2", title: "Squat", body: "The squat, from a box to a barbell." },
          { label: "Week 3", title: "Hinge", body: "Deadlifts and swings, with a coach beside you." },
          { label: "Week 4", title: "Press", body: "Pressing overhead without hurting your back." },
          { label: "Week 5", title: "Put it together", body: "A first full class, at your pace." },
          { label: "Week 6", title: "Showcase", body: "Show friends what you've learned.", cta: book("Book your place", "/course") },
        ],
      }),
    ]),
  },
  {
    path: "/visit",
    doc: page("Visit", "How to find Riverside Gym.", [
      node("map", "map", "split", {
        eyebrow: "Visit",
        heading: "Find us by the river",
        body: "Parking at the back. Ten minutes from the station.",
        address: ["1 River Road", "Riverside"],
        provider: "openstreetmap",
        lat: 51.5007,
        lng: -0.1246,
        contact: [{ label: "+1 555 0100", href: "tel:+15550100" }, { label: "hello@riverside.example", href: "mailto:hello@riverside.example" }],
        primaryCta: book("Book a free class", "/free"),
      }),
      node("contact", "form-embed", "card", { heading: "Write to us", body: "We reply within a day.", form: "write-to-us", anchor: "contact" }),
    ]),
  },
  {
    path: "/blog",
    kind: "post",
    doc: page("Blog", "Notes from the gym floor.", [
      node("post", "post-body", "article", {}),
      node("more", "blog-list", "grid", { eyebrow: "Notes from the floor", heading: "Blog", perPage: 3 }),
    ]),
  },
];

const text = (t: string) => ({ type: "paragraph", content: [{ type: "text", text: t }] });
const heading = (t: string) => ({ type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: t }] });
const post = (title: string, excerpt: string, extra: Partial<PostDocInput> = {}): PostDocInput => ({
  schemaVersion: 1,
  title,
  excerpt,
  body: { type: "doc", content: [text(excerpt), heading("What to expect"), text("Come ten minutes early. A coach will show you round and set up your first lifts."), heading("What to bring"), text("Water, trainers and a towel.")] },
  ...extra,
});

const posts: { slug: string; doc: PostDocInput; publishedAt: string }[] = [
  { slug: "first-class-tips", publishedAt: "2026-10-12T09:00:00Z", doc: post("Five tips for your first class", "Nervous about a first class? Most people are. Here's how to make it easy.", { author: { name: "Sam Lee" }, category: "Getting started" }) },
  { slug: "why-we-warm-up", publishedAt: "2026-09-20T09:00:00Z", doc: post("Why we warm up", "Ten minutes that make the next fifty count.", { category: "Training" }) },
  { slug: "morning-crew", publishedAt: "2026-08-30T09:00:00Z", doc: post("Meet the morning crew", "Six o'clock, every weekday, rain or shine.", { author: { name: "Priya Shah" }, category: "News" }) },
  { slug: "new-term", publishedAt: "2026-08-01T09:00:00Z", doc: post("A new term, a new timetable", "More evening classes, and mobility on Saturdays.", { category: "News" }) },
];

/** Creates and publishes the multi-page demo site, and imports its posts once. */
export async function buildClassesSite(store: MemorySiteStore, brand: BrandInput) {
  await store.createSite({ id: "classes", site, pages });
  await store.publish("classes", { brand, note: "Demo" });
  await store.importPosts!("classes", posts);
}
