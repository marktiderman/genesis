/**
 * Golden outputs of the functions host apps rely on byte for byte: `choiceOptions`,
 * `withHostOptions`, `answerSnapshots`, `answersFromSnapshots` and `validateSubmission`, plus
 * the option helpers they are built on ("Other" answers, rich options, filters, search, link
 * prefill). The snapshots were written before the content-type registry refactor and must not
 * change: a diff here is a behaviour change for every app that stores these outputs.
 *
 * Each output is serialized with `JSON.stringify` (keys in insertion order, `undefined` kept as
 * a marker), so a reordered key or a dropped `undefined` shows as a diff too.
 */
import { describe, expect, it } from "vitest";
import {
  answerSnapshots,
  answersFromSnapshots,
  choiceOptions,
  isOtherValue,
  isSearchable,
  OTHER_MAX_LENGTH,
  otherOption,
  parseForm,
  prefillFromLink,
  respondentPath,
  searchOptions,
  visibleOptions,
  withHostOptions,
  createForm,
  type Block,
  type FieldBlock,
  type FormDefinition,
  type FormEvent,
  type HostOptions,
  type Json,
} from "../index";
import { validateSubmission, type SubmissionInput, type SubmissionOptions } from "../server";

/** Insertion-ordered JSON, with `undefined` kept visible. */
const golden = (value: unknown): string =>
  JSON.stringify(value, (_key, v: unknown) => (v === undefined ? "<undefined>" : v), 1);

const field = (id: string, type: string, extra: Partial<FieldBlock> = {}): FieldBlock => ({
  kind: "field",
  id,
  key: id,
  type,
  label: `Label ${id}`,
  ...extra,
});

const form = (id: string, blocks: Block[], extra: Partial<FormDefinition> = {}): FormDefinition => ({
  schemaVersion: 1,
  id,
  title: `Form ${id}`,
  blocks,
  endings: [{ id: "default", title: "Thanks" }],
  ...extra,
});

// ── Options ──────────────────────────────────────────────────────────────────

const richOptions: Json[] = [
  { value: "riverside", label: "Riverside Gym", description: "12 Main St", image: "https://example.com/r.png" },
  { value: "hilltop", label: "Hilltop Fitness", attributes: { region: "north", tags: ["indoor", "pool"] } },
  { value: "harbor" },
  { value: "bad-image", label: "Bad image", image: "http://example.com/x.png" },
  { value: "long-desc", description: "x".repeat(501) },
  { value: "blank-desc", description: "   " },
  { value: "bad-attrs", attributes: { "": "x", constructor: "y", ok: "fine", list: ["a", 2] } },
  { value: "many-attrs", attributes: Object.fromEntries(Array.from({ length: 25 }, (_, i) => [`a${i}`, `v${i}`])) },
  { value: "", label: "Empty value" },
  { value: 7, label: "Number value" },
  "not-an-object",
  null,
  ["array"],
  { label: "No value" },
  { value: "control", image: "https://example.com/a\nb.png" },
];

const choiceFields: FieldBlock[] = [
  field("single", "single-choice", { props: { options: richOptions } }),
  field("multi", "multi-choice", { props: { options: [{ value: "a", label: "A" }, { value: "b" }], other: true } }),
  field("drop", "dropdown", { props: { options: [{ value: "x", label: "X" }], other: { label: "  Something else  " } } }),
  field("no-options", "single-choice"),
  field("options-not-array", "single-choice", { props: { options: { value: "x" } as unknown as Json } }),
  field("other-blank", "single-choice", { props: { options: [{ value: "x" }], other: { label: "  " } } }),
  field("other-false", "single-choice", { props: { options: [{ value: "x" }], other: false } }),
  field("text-with-options", "short-text", { props: { options: [{ value: "x" }] } }),
];

const hostLists: HostOptions = {
  coaches: [
    { value: "c-ada", label: "Ada", attributes: { location: "riverside" } },
    { value: "c-sam", label: "Sam", attributes: { location: ["riverside", "hilltop"] } },
    { value: "c-zoe", label: "Zoë", attributes: { location: "hilltop" } },
    { value: "c-ada", label: "Ada again" },
    { value: "", label: "Blank" },
    { value: 3, label: "Number" } as never,
    { value: "c-img", label: "Pictured", image: "https://example.com/c.png", description: "Head coach" },
  ],
  locations: [
    { value: "riverside", label: "Riverside Gym" },
    { value: "hilltop", label: "Hilltop Fitness" },
  ],
  notAList: "nope" as never,
};

const hostForm = form("host", [
  field("location", "single-choice", {
    props: { optionsFrom: { source: "host", key: "locations" }, prefill: { param: "location", hideWhenPrefilled: true } },
  }),
  field("coach", "single-choice", {
    required: true,
    props: {
      options: [{ value: "c-ada", label: "Ada (own)" }, { value: "own", label: "Own option" }],
      optionsFrom: { source: "host", key: "coaches", filter: { attribute: "location", field: "location" } },
      other: true,
      prefill: { param: "coach" },
    },
  }),
  field("helpers", "multi-choice", {
    props: { options: [{ value: "nobody", label: "Nobody" }], optionsFrom: { source: "host", key: "coaches" }, other: true, prefill: { param: "helpers" } },
  }),
  field("room", "dropdown", { props: { optionsFrom: { source: "host", key: "missing" }, options: [{ value: "a", label: "Room A" }] } }),
  field("proto", "dropdown", { props: { optionsFrom: { source: "host", key: "__proto__" }, options: [{ value: "p" }] } }),
  field("not-a-list", "single-choice", { props: { optionsFrom: { source: "host", key: "notAList" } } }),
  field("note", "short-text"),
]);

/** `hostForm` plus a malformed `optionsFrom` (which `parseForm` refuses), for the pure helpers. */
const looseHostForm: FormDefinition = {
  ...hostForm,
  blocks: [
    ...hostForm.blocks,
    field("bad-source", "dropdown", { props: { optionsFrom: { source: "server", key: "coaches" } as unknown as Json, options: [{ value: "z" }] } }),
  ],
};

describe("golden: choice options", () => {
  it("choiceOptions over rich, malformed and missing options", () => {
    expect(golden(choiceFields.map((f) => [f.id, choiceOptions(f)]))).toMatchSnapshot();
  });

  it("otherOption, isOtherValue and OTHER_MAX_LENGTH", () => {
    const values: unknown[] = ["a", "b", "typed", "", "  ", "x", 3, null, ["a"], "y".repeat(OTHER_MAX_LENGTH + 1)];
    const out = choiceFields.map((f) => [f.id, otherOption(f), values.map((v) => isOtherValue(f, v))]);
    expect(golden({ OTHER_MAX_LENGTH, out })).toMatchSnapshot();
  });

  it("withHostOptions over host lists, missing keys and malformed entries", () => {
    const cases: [string, HostOptions | undefined][] = [
      ["none", undefined],
      ["empty", {}],
      ["full", hostLists],
      ["only-coaches", { coaches: hostLists.coaches! }],
      ["proto", JSON.parse('{"__proto__":[{"value":"evil"}]}') as HostOptions],
    ];
    const out = cases.map(([name, lists]) => {
      const result = withHostOptions(looseHostForm, lists);
      return [name, result === looseHostForm, result];
    });
    expect(golden(out)).toMatchSnapshot();
  });

  it("visibleOptions, isSearchable and searchOptions", () => {
    const def = withHostOptions(hostForm, hostLists);
    const coach = def.blocks[1] as FieldBlock;
    const answers: Record<string, Json | undefined>[] = [{}, { location: "riverside" }, { location: "hilltop" }, { location: "nowhere" }, { location: ["hilltop"] }];
    const visible = answers.map((a) => visibleOptions(def, coach, a).map((o) => o.value));
    const many = field("many", "dropdown", { props: { options: Array.from({ length: 12 }, (_, i) => ({ value: `o${i}`, label: `Option ${i}` })) } });
    const searchable = [
      isSearchable(coach),
      isSearchable(many),
      isSearchable({ ...many, props: { ...many.props, searchable: false } }),
      isSearchable({ ...coach, props: { ...coach.props, searchable: true } }),
      isSearchable(coach, 11),
      isSearchable({ ...many, props: { ...many.props, searchable: "yes" } }),
    ];
    const options = choiceOptions(coach);
    const queries = ["", "  ", "zoe", "ZOË", "ada own", "head", "c-s", "nothing"];
    const search = queries.map((q) => [q, searchOptions(options, q).map((o) => o.value)]);
    expect(golden({ visible, searchable, search })).toMatchSnapshot();
  });
});

describe("golden: link prefill", () => {
  it("prefillFromLink and respondentPath", () => {
    const def = withHostOptions(hostForm, hostLists);
    const links: unknown[] = [
      undefined,
      {},
      { location: "hilltop", coach: "c-zoe", helpers: ["c-ada", "c-sam"] },
      { location: "hilltop", coach: "c-ada" },
      { location: "riverside", coach: "own", helpers: "c-ada, c-zoe,nobody" },
      { location: "nowhere", coach: ["c-zoe", "c-sam"], helpers: ["c-ada", "c-ada"] },
      new URLSearchParams("location=riverside&helpers=c-sam&helpers=nobody&coach=c-sam"),
      { location: "x".repeat(2000) },
      "not-params",
    ];
    const out = links.map((link) => {
      const prefill = prefillFromLink(def, link as never);
      const withValues = prefillFromLink(def, link as never, { coach: "own" });
      const engine = createForm(hostForm, { hostOptions: hostLists, linkParams: link as never });
      const state = engine.getState();
      return { prefill, withValues, path: state.path, respondent: respondentPath(engine.definition, state), current: state.current };
    });
    expect(golden(out)).toMatchSnapshot();
  });
});

// ── Snapshots ────────────────────────────────────────────────────────────────

describe("golden: answer snapshots", () => {
  it("answerSnapshots over host-sourced, own and typed answers", () => {
    const def = withHostOptions(looseHostForm, hostLists);
    const answers: Record<string, Json | undefined>[] = [
      {},
      { location: "riverside", coach: "c-sam", helpers: ["c-ada", "nobody", "typed helper"], room: "a", note: "hi", "bad-source": "z" },
      { location: "gone", coach: "typed coach", helpers: [], room: "zzz" },
      { coach: "", helpers: ["c-img", 4 as never, "c-zoe"], location: 5 as never },
      JSON.parse('{"__proto__":"c-ada","coach":"c-zoe"}') as Record<string, Json>,
    ];
    expect(golden(answers.map((a) => answerSnapshots(def, a)))).toMatchSnapshot();
    // Without the host's lists filled in, the snapshot falls back to the values.
    expect(golden(answerSnapshots(hostForm, answers[1]!))).toMatchSnapshot();
  });

  it("answersFromSnapshots: kept, relabelled, typed and missing picks", () => {
    const def = withHostOptions(hostForm, hostLists);
    const cases: Record<string, unknown>[] = [
      {},
      answerSnapshots(def, { location: "riverside", coach: "c-sam", helpers: ["c-ada", "nobody", "typed helper"] }),
      { coach: { value: "c-old", label: "zoe" }, helpers: [{ value: "x-old", label: "ADA" }, { value: "gone", label: "Gone" }] },
      { coach: { value: "typed", label: "typed", other: true }, room: { value: "typed room", label: "typed room", other: true } },
      { location: [{ value: "riverside", label: "Riverside Gym" }, { value: "hilltop", label: "Hilltop Fitness" }] },
      { helpers: [{ value: "c-ada", label: "Ada" }, { value: "c-ada", label: "Ada" }, { value: "x-old", label: "Ada" }] },
      { coach: "not-a-snapshot", helpers: [null, 3, { label: "No value" }], note: { value: "x", label: "x" } },
      { coach: { value: "c-zoe" } },
    ];
    expect(golden(cases.map((c) => answersFromSnapshots(def, c)))).toMatchSnapshot();
  });
});

// ── validateSubmission ───────────────────────────────────────────────────────

const kitchenSink = form(
  "kitchen-sink",
  [
    { kind: "content", id: "intro", type: "heading", text: "Hello {{hidden:owner|there}}" },
    field("short", "short-text", { required: true, props: { maxLength: 10 } }),
    field("long", "long-text"),
    field("email", "email", { identifying: true }),
    field("phone", "phone"),
    field("rating", "rating", { props: { max: 7, lowLabel: "Poor", highLabel: "Great" } }),
    field("nps", "nps"),
    field("single", "single-choice", { props: { options: [{ value: "a", label: "A" }, { value: "b", label: "B" }], other: true } }),
    field("multi", "multi-choice", { props: { options: [{ value: "a" }, { value: "b" }, { value: "c" }], other: { label: "Else" } } }),
    field("yes", "yes-no"),
    field("drop", "dropdown", { props: { options: [{ value: "x", label: "X" }] } }),
    { kind: "page-break", id: "pb1", title: "Numbers" },
    field("num", "number", { props: { min: 0, max: 10, step: 0.5 } }),
    field("day", "date", { props: { min: "2026-01-01", max: "2026-12-31" } }),
    field("agree", "consent", { props: { text: "I agree" } }),
    field("items", "list", { props: { min: 1, max: 3, itemMaxLength: 20 } }),
    field("plan", "table", { props: { columns: [{ key: "what", label: "What" }, { key: "cost", label: "Cost" }], maxRows: 2 } }),
    field("notes", "media-notes", { props: { maxNotes: 2 } }),
    field("marks", "text-highlights", { props: { text: "The quick brown fox", maxHighlights: 2 } }),
    field("pics", "photo", { props: { maxFiles: 2, maxSizeMb: 1, formats: ["jpeg", "png"] } }),
    field("total", "calculated", { props: { formula: "rating + nps + sum(plan.cost)", format: "number", decimals: 1 } }),
    field("label", "calculated", { props: { formula: "short", format: "text" } }),
    field("after", "short-text"),
  ],
  {
    hidden: [
      { name: "owner", type: "string", source: "server" },
      { name: "utm", type: "string", source: "url" },
      { name: "uid", type: "string", source: "host", identifying: true },
      { name: "count", type: "number", source: "url" },
    ],
    logic: [
      { id: "r1", when: { op: "eq", left: { field: "yes" }, right: { value: false } }, effect: "hide", target: "after" },
      { id: "r2", when: { op: "gt", left: { field: "total" }, right: { value: 100 } }, effect: "jump", from: "total", to: { ending: "big" } },
    ],
    endings: [{ id: "default", title: "Thanks" }, { id: "big", title: "Big" }],
  },
);

const photo = (id: string, extra: Record<string, Json> = {}): Json => ({ id, name: `${id}.jpg`, type: "image/jpeg", size: 1000, ...extra });

const validAnswers: Record<string, Json> = {
  short: "  hello ",
  long: "Long answer",
  email: "  ada@example.com ",
  phone: " +1 (555) 010-0199 ",
  rating: 7,
  nps: 9,
  single: "typed other",
  multi: ["a", "c", "my own"],
  yes: true,
  drop: "x",
  num: 2.5,
  day: " 2026-05-01 ",
  agree: true,
  items: [" one ", "", "two"],
  plan: [{ what: " Rent ", cost: "100" }, { what: "", cost: "" }, { what: "Food", cost: "20" }],
  notes: [{ at: 20, text: " later " }, { at: 5, text: "early" }, { at: 9, text: "  " }],
  marks: [{ start: 4, end: 9, quote: "quick", note: " fast " }],
  pics: [photo("p1"), photo("p2", { type: "image/png", extra: "dropped" })],
  total: 999,
  label: "forged",
  after: "kept",
  unknown: "dropped",
};

const invalidAnswers: Record<string, Json>[] = [
  { short: "this is far too long" },
  { short: "ok", email: "not-an-email" },
  { short: "ok", phone: "12" },
  { short: "ok", rating: 8 },
  { short: "ok", rating: 2.5 },
  { short: "ok", nps: 11 },
  { short: "ok", single: "y".repeat(OTHER_MAX_LENGTH + 1) },
  { short: "ok", single: "   " },
  { short: "ok", multi: ["a", "a"] },
  { short: "ok", multi: ["one other", "two others"] },
  { short: "ok", drop: "not an option" },
  { short: "ok", yes: "true" },
  { short: "ok", num: 11 },
  { short: "ok", num: 0.3 },
  { short: "ok", day: "2026-02-30" },
  { short: "ok", day: "2025-12-31" },
  { short: "ok", agree: false },
  { short: "ok", items: ["1", "2", "3", "4"] },
  { short: "ok", items: ["x".repeat(21)] },
  { short: "ok", plan: [{ what: "a" }, { what: "b" }, { what: "c" }] },
  { short: "ok", plan: [{ nope: "a" }] },
  { short: "ok", notes: [{ at: -1, text: "x" }] },
  { short: "ok", marks: [{ start: 0, end: 3, quote: "The", note: "" }] },
  { short: "ok", marks: [{ start: 0, end: 3, quote: "Thx", note: "n" }] },
  { short: "ok", pics: [photo("p1"), photo("p2"), photo("p3")] },
  { short: "ok", pics: [photo("p1", { type: "image/gif" })] },
  { short: "ok", pics: [photo("p1", { size: 5_000_000 })] },
  { short: "ok", pics: [photo("p1"), photo("p1")] },
  { short: "ok", pics: [{ id: "p1" }] },
  {},
];

const hostSubmissions: [SubmissionInput, SubmissionOptions][] = [
  [{ answers: { coach: "c-sam", location: "riverside", helpers: ["c-ada", "typed"] } }, { hostOptions: hostLists }],
  [{ answers: { coach: "c-zoe", location: "riverside" } }, { hostOptions: hostLists }],
  [{ answers: { coach: "c-zoe" } }, { hostOptions: hostLists }],
  [{ answers: { coach: "c-zoe" } }, {}],
  [{ answers: { coach: "own", room: "a", "bad-source": "z", proto: "p" } }, { hostOptions: hostLists }],
  [{ answers: { coach: "typed coach", helpers: ["one", "two"] } }, { hostOptions: hostLists }],
  [{ answers: { location: "hilltop", coach: "c-zoe" } }, { hostOptions: hostLists, complete: false }],
  [{ answers: { location: "hilltop", coach: "c-ada" } }, { hostOptions: hostLists, complete: false }],
];

const answerEvents = (answers: Record<string, Json>): FormEvent[] =>
  Object.entries(answers).map(([field, value]) => ({ type: "answer", field, value }));

describe("golden: validateSubmission", () => {
  it("accepts and normalizes every built-in kind", () => {
    const out = [
      validateSubmission(kitchenSink, { answers: validAnswers, hidden: { utm: "news", owner: "forged", uid: "u1", count: "3", extra: "x" } }, { context: { owner: "Riverside Gym" } }),
      validateSubmission(kitchenSink, { answers: { ...validAnswers, yes: false } }),
      validateSubmission(kitchenSink, { answers: { short: "only" } }),
      validateSubmission(kitchenSink, { answers: validAnswers }, { complete: false }),
      validateSubmission({ ...kitchenSink, settings: { anonymous: true } }, { answers: validAnswers, hidden: { uid: "u1", utm: "x" } }),
      validateSubmission({ ...kitchenSink, settings: { clearHiddenValues: false } }, { answers: { ...validAnswers, yes: false, after: "off path" } }),
    ];
    expect(golden(out)).toMatchSnapshot();
  });

  it("refuses an invalid answer of every built-in kind", () => {
    const out = invalidAnswers.map((answers) => [
      validateSubmission(kitchenSink, { answers }),
      validateSubmission(kitchenSink, { answers }, { complete: false }),
    ]);
    expect(golden(out)).toMatchSnapshot();
  });

  it("replays event logs, including a submit and answers after it", () => {
    const events: FormEvent[] = [
      ...answerEvents({ short: "a", rating: 3 }),
      ...answerEvents({ short: "ab" }),
      { type: "next" },
      { type: "back" },
      { type: "submit" },
      { type: "answer", field: "short", value: "after submit" },
    ];
    const out = [
      validateSubmission(kitchenSink, { events }),
      validateSubmission(kitchenSink, { events: answerEvents(validAnswers) }),
      validateSubmission(kitchenSink, { events: [...answerEvents({ short: "x" }), { type: "mystery" } as never] }),
      validateSubmission(kitchenSink, { events: answerEvents({ short: "x" }) }, { maxEvents: 0 }),
      validateSubmission(kitchenSink, { answers: { short: "x".repeat(5) } }, { maxValues: 1 }),
    ];
    expect(golden(out)).toMatchSnapshot();
  });

  it("checks host options, filters and typed Other answers", () => {
    const out = hostSubmissions.map(([input, options]) => validateSubmission(hostForm, input, options));
    expect(golden(out)).toMatchSnapshot();
  });

  it("refuses malformed bodies and invalid definitions", () => {
    const bad = form("bad", [field("r", "rating", { props: { max: 20 } }), field("t", "table"), { kind: "content", id: "c", type: "video" as never, text: "x" }]);
    const out = [
      validateSubmission(kitchenSink, null as never),
      validateSubmission(kitchenSink, { answers: [] as never }),
      validateSubmission(kitchenSink, { answers: { short: () => 1 } as never }),
      validateSubmission(kitchenSink, { events: "x" as never }),
      validateSubmission(kitchenSink, { events: [{ type: "answer" }] as never }),
      validateSubmission(bad, { answers: {} }),
      validateSubmission(form("unknown", [field("u", "no-such-type")]), { answers: {} }),
      parseForm(bad),
    ];
    expect(golden(out)).toMatchSnapshot();
  });

  it("checks the forms the fixtures define", async () => {
    const { eventFeedback, monthlyCheckIn } = await import("./sample-forms");
    const fb = eventFeedback.definition;
    const id = (key: string) => fb.blocks.find((b): b is FieldBlock => b.kind === "field" && b.key === key)!.id;
    const mc = monthlyCheckIn.definition;
    const mid = (key: string) => mc.blocks.find((b): b is FieldBlock => b.kind === "field" && b.key === key)!.id;
    const out = [
      validateSubmission(fb, { answers: { [id("overall")]: 5, [id("contact_me")]: true, [id("name")]: "Ada", [id("email")]: "ada@example.com" } }, { context: { owner: "Sam" } }),
      validateSubmission(fb, { answers: { [id("overall")]: 2, [id("went_well")]: ["content"], [id("improve")]: "More" } }),
      validateSubmission(fb, { answers: { [id("overall")]: 5, [id("contact_me")]: true } }),
      validateSubmission(mc, { answers: { [mid("recommend")]: 10, [mid("frequency")]: "5-8" } }),
      validateSubmission(mc, { answers: { [mid("recommend")]: 4, [mid("why")]: "Price", [mid("frequency")]: "nope" } }),
    ];
    expect(golden(out)).toMatchSnapshot();
  });
});

// ── parseForm (props checks, literal types and choice-only settings move into the registry) ──

describe("golden: parseForm", () => {
  const types = [
    "short-text", "long-text", "email", "phone", "rating", "nps", "single-choice", "multi-choice", "yes-no",
    "dropdown", "number", "date", "consent", "list", "table", "media-notes", "text-highlights", "photo", "calculated",
  ];

  it("reports bad props on every built-in kind", () => {
    const bad: Record<string, Json> = {
      min: "x", max: "y", step: -1, lowLabel: 1, highLabel: 2, display: "bars", text: 3, maxLength: 0,
      itemMaxLength: 0, placeholder: 4, columns: [], minRows: -1, maxRows: 0, maxNotes: 0, textMaxLength: 0,
      maxHighlights: 0, maxFiles: 99, maxSizeMb: 0, formats: ["gif"], format: "money", decimals: 11, formula: "1 +",
      options: [{ value: "a", image: "ftp://x" }, { label: "no value" }], other: "yes", searchable: "no",
      optionsFrom: { source: "host", key: "k", filter: { attribute: "", field: "nope" } }, prefill: { param: "bad param" },
    };
    const out = types.map((type) => [type, parseForm(form(`bad-${type}`, [field("f", type, { props: bad })]))]);
    expect(golden(out)).toMatchSnapshot();
  });

  it("checks each kind's props when they are missing or ordered wrong", () => {
    const out = types.map((type) => [
      type,
      parseForm(form(`none-${type}`, [field("f", type)])),
      parseForm(form(`order-${type}`, [field("f", type, { props: { min: 5, max: 1, minRows: 4, maxRows: 2, formats: ["jpeg", "jpeg"] } })])),
    ]);
    expect(golden(out)).toMatchSnapshot();
  });

  it("warns on literals that never match and on choice-only settings elsewhere", () => {
    const literals: Json[] = ["text", 3, true, ["list"], null];
    const ops = ["eq", "neq", "lt", "in", "contains"];
    const out = types.map((type) => {
      const props: Record<string, Json> =
        type === "table" ? { columns: [{ key: "a", label: "A" }] }
        : type === "calculated" ? { formula: "1", format: "text" }
        : { options: [{ value: "a" }, { value: "b" }], optionsFrom: { source: "host", key: "k" }, prefill: { param: "p" }, other: true };
      const logic = ops.flatMap((op, i) =>
        literals.map((value, j) => ({ id: `r${i}-${j}`, when: { op, left: { field: "f" }, right: { value } }, effect: "hide" as const, target: "after" })),
      );
      return [type, parseForm(form(`lit-${type}`, [field("f", type, { props }), field("after", "short-text")], { logic: logic as never }))];
    });
    const own = form("own-options", [
      field("pick", "single-choice", { props: { options: [{ value: "a" }] } }),
      field("calc", "calculated", { props: { formula: "1" } }),
      field("calcn", "calculated", { props: { formula: "1", format: "percent" } }),
      field("after", "short-text"),
    ], {
      logic: [
        { id: "x1", when: { op: "eq", left: { field: "pick" }, right: { value: "zzz" } }, effect: "hide", target: "after" },
        { id: "x2", when: { op: "in", left: { field: "pick" }, right: { value: ["a", "q"] } }, effect: "hide", target: "after" },
        { id: "x3", when: { op: "eq", left: { field: "calc" }, right: { value: "t" } }, effect: "hide", target: "after" },
        { id: "x4", when: { op: "eq", left: { field: "calcn" }, right: { value: "t" } }, effect: "hide", target: "after" },
      ],
    });
    expect(golden({ out, own: parseForm(own) })).toMatchSnapshot();
  });

  it("checks content blocks", () => {
    const blocks: Json[] = [
      { kind: "content", id: "h", type: "heading", text: "Hi" },
      { kind: "content", id: "t", type: "text", text: "" },
      { kind: "content", id: "v", type: "video", text: "x" },
      { kind: "content", id: "n", type: "heading" },
      { kind: "content", id: "p", type: "text", text: "x", props: { anything: true } },
      { kind: "content", id: "u" },
    ];
    expect(golden(parseForm(form("content", blocks as never)))).toMatchSnapshot();
  });
});
