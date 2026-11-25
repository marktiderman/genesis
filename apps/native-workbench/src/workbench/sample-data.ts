/**
 * Sample rows for the workbench: neutral names, held in memory, served through a read-only
 * data provider so NativeResourceView reads them as it would a table.
 */
import { defineResource } from "@marktiderman/genesis-core";
import type { BaseRecord, DataProvider } from "@marktiderman/genesis-core/provider";

export type SampleMessage = { id: string; from: string; subject: string };

const NAMES = ["Ada Lovelace", "Grace Hopper", "Alan Turing", "Katherine Johnson", "Edsger Dijkstra", "Barbara Liskov", "Donald Knuth", "Margaret Hamilton", "Claude Shannon", "Frances Allen"];

/** Thirty rows: enough to scroll, so a large title has room to collapse. */
export const SAMPLE_MESSAGES: readonly SampleMessage[] = Array.from({ length: 30 }, (_, i) => ({
  id: String(i + 1),
  from: `${NAMES[i % NAMES.length]}${i >= NAMES.length ? ` ${Math.floor(i / NAMES.length) + 1}` : ""}`,
  subject: `Message ${i + 1}`,
}));

export const sampleMessages = defineResource<SampleMessage>()({
  name: "workbench_messages",
  key: "id",
  label: "Messages",
  labelField: "from",
  fields: [
    { name: "id", type: "string", generated: true, hasDefault: true },
    { name: "from", type: "string", label: "From" },
    { name: "subject", type: "string", label: "Subject" },
  ],
});

const readOnly = () => Promise.reject(new Error("The workbench's sample rows are read only."));

/** A provider over `SAMPLE_MESSAGES`, filtered by a `from` search. */
export function sampleProvider(): DataProvider {
  return {
    async getList<T extends BaseRecord>(_resource: string, params: { search?: string }) {
      const q = params.search?.toLowerCase().trim();
      const rows = q ? SAMPLE_MESSAGES.filter((r) => r.from.toLowerCase().includes(q)) : SAMPLE_MESSAGES;
      return { data: rows as unknown as T[], total: rows.length };
    },
    getOne: async <T extends BaseRecord>(_r: string, { id }: { id: string | number }) => ({ data: SAMPLE_MESSAGES.find((r) => r.id === String(id)) as unknown as T }),
    getMany: async <T extends BaseRecord>() => ({ data: [] as T[] }),
    create: readOnly,
    update: readOnly,
    deleteOne: readOnly,
  } as DataProvider;
}
