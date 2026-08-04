// =====================================================================
// WC46.016 — NotionAdapter (L2). Network is MOCKED; the property SHAPES are
// real. Proves: read decode (title/rich_text/number/checkbox/select/date)
// + page id as `id`, cursor pagination, write encode (canonical → property
// objects), archive-on-delete, introspective describe(), and capped 429 retry.
// =====================================================================

import { describe, expect, it, vi } from "vitest";
import { NotionAdapter, type NotionResourceMap, type ResourceContract } from "../index";
import { makeNotionFetch, notionProp } from "./helpers/notion-fetch";

interface Task extends Record<string, unknown> {
  id: string;
  title: string;
  priority: number;
  done: boolean;
  stage: string;
  due: string;
}

const taskContract: ResourceContract<Task> = {
  name: "tasks",
  key: "id",
  sourceOfTruth: "L2",
  fields: [
    { name: "id", type: "string" },
    { name: "title", type: "string" },
    { name: "priority", type: "number", optional: true },
    { name: "done", type: "boolean", optional: true },
    { name: "stage", type: "string", optional: true },
    { name: "due", type: "datetime", optional: true },
  ],
};

const DB = "db_tasks_1";
const taskMap: NotionResourceMap = {
  database: DB,
  idField: "id",
  fields: {
    title: { property: "Name", type: "title" },
    priority: { property: "Priority", type: "number" },
    done: { property: "Done", type: "checkbox" },
    stage: { property: "Stage", type: "select" },
    due: { property: "Due", type: "date" },
  },
};

function makeAdapter(extra?: { throttleFirst?: number; retryAfterSeconds?: number; sleep?: (ms: number) => Promise<void> }) {
  const fetch = makeNotionFetch(
    {
      [DB]: [
        {
          id: "page_1",
          properties: {
            Name: notionProp.title("First"),
            Priority: notionProp.number(3),
            Done: notionProp.checkbox(false),
            Stage: notionProp.select("build"),
            Due: notionProp.date("2026-06-25"),
          },
        },
        {
          id: "page_2",
          properties: {
            Name: notionProp.title("Second"),
            Priority: notionProp.number(1),
            Done: notionProp.checkbox(true),
            Stage: notionProp.select("ship"),
          },
        },
      ],
    },
    extra,
  );
  return new NotionAdapter({
    apiKey: "secret_test",
    maps: { tasks: taskMap },
    ttlMs: 0,
    sleep: extra?.sleep ?? (async () => {}),
    fetch,
  });
}

describe("NotionAdapter — read decode + pagination", () => {
  it("decodes property shapes to canonical values across the cursor loop", async () => {
    const rows = await makeAdapter().list(taskContract);
    expect(rows).toHaveLength(2); // cursor loop walked both 1-page results.
    expect(rows[0]).toMatchObject({
      id: "page_1",
      title: "First",
      priority: 3,
      done: false,
      stage: "build",
      due: "2026-06-25",
    });
    expect(rows[1]).toMatchObject({ id: "page_2", title: "Second", done: true, stage: "ship" });
  });

  it("get() finds a page by canonical key", async () => {
    const row = await makeAdapter().get(taskContract, "page_2");
    expect(row).toMatchObject({ title: "Second", priority: 1 });
  });

  it("query() filters client-side off the snapshot", async () => {
    const open = await makeAdapter().query(taskContract, { where: { done: false } });
    expect(open).toHaveLength(1);
    expect(open[0]).toMatchObject({ title: "First" });
  });
});

describe("NotionAdapter — write encode", () => {
  it("create() encodes canonical values to property objects and returns canonical", async () => {
    const a = makeAdapter();
    const created = await a.create(taskContract, {
      id: "",
      title: "Third",
      priority: 5,
      done: false,
      stage: "plan",
      due: "2026-07-01",
    });
    expect(created).toMatchObject({ title: "Third", priority: 5, stage: "plan", due: "2026-07-01" });
    expect(String(created.id)).toMatch(/^page_mock_/);
    // It is now listable (write went through the property payload).
    expect((await a.list(taskContract)).map((r) => r.title)).toContain("Third");
  });

  it("update() patches a page by canonical key through property objects", async () => {
    const a = makeAdapter();
    const updated = await a.update(taskContract, "page_1", { stage: "review", done: true });
    expect(updated).toMatchObject({ id: "page_1", stage: "review", done: true });
  });

  it("delete() ARCHIVES the page (it disappears from reads)", async () => {
    const a = makeAdapter();
    await a.delete(taskContract, "page_1");
    const rows = await a.list(taskContract);
    expect(rows.map((r) => r.id)).not.toContain("page_1");
    expect(rows).toHaveLength(1);
  });
});

describe("NotionAdapter — introspective describe() (WC46.015)", () => {
  it("derives the schema from live pages, inferring types", async () => {
    const result = await makeAdapter().describe(taskContract);
    const byName = Object.fromEntries(result.fields.map((f) => [f.name, f]));
    expect(byName.priority).toMatchObject({ type: "number" });
    expect(byName.done).toMatchObject({ type: "boolean" });
    // `due` declared datetime; present on page_1, absent on page_2 ⇒ optional.
    expect(byName.due).toMatchObject({ type: "datetime", optional: true });
  });
});

describe("NotionAdapter — hardened request core", () => {
  it("retries capped on 429 and honors Retry-After", async () => {
    const sleep = vi.fn(async () => {});
    const a = makeAdapter({ throttleFirst: 2, retryAfterSeconds: 1, sleep });
    const rows = await a.list(taskContract);
    expect(rows).toHaveLength(2);
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(1000); // Retry-After: 1s honored.
  });
});
