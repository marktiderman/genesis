/**
 * The shapes `<FormFocus>` takes for a draft and an outbox. They are written structurally, so
 * what genesis-forms-react's `useFormDraft` returns and what genesis-forms' `createSubmitOutbox`
 * makes fit as they are, and a host can bring its own.
 */
import type { FormEngine, FormEvent, Json } from "@marktiderman/genesis-forms";

/** A draft on the device (`useFormDraft`'s result fits). */
export interface FormDraftLike {
  /** The engine with the draft put back; null while the draft is read. */
  engine: FormEngine | null;
  draft: "restored" | "discarded" | "none" | "error" | "loading";
  /** Save now what is waiting (the app is going to the background). */
  flush(): Promise<void>;
  /** Remove the draft: called once the submission is safe (queued in the outbox, or sent). */
  clear(): Promise<void>;
}

/** One queued submission, as an outbox shows it. */
export interface OutboxItemLike {
  id: string;
  state: "pending" | "failed";
  sending?: boolean | undefined;
  lastError?: string | null | undefined;
}

/** What an outbox reports. */
export interface OutboxSnapshotLike {
  online: boolean;
  items: readonly OutboxItemLike[];
}

/** What `<FormFocus>` queues. */
export interface OutboxEnqueueLike {
  formId: string;
  submission: { events: FormEvent[]; hidden?: Record<string, Json> | undefined };
  idempotencyKey?: string | undefined;
  meta?: Record<string, Json> | undefined;
}

/**
 * An offline outbox (`createSubmitOutbox`'s result fits): submissions wait on the device until
 * the server has them. `enqueue` resolves once the submission is stored; only then is the draft
 * cleared.
 */
export interface OutboxLike {
  enqueue(input: OutboxEnqueueLike): Promise<OutboxItemLike>;
  /** The same object until something changes (it backs `useSyncExternalStore`). */
  getSnapshot(): OutboxSnapshotLike;
  subscribe(listener: () => void): () => void;
  /** Try a failed submission again. */
  retry?(id: string): Promise<void>;
}

/** Where a queued submission stands, for the status line. */
export type SubmissionStatus =
  /** Stored on the device; the device is offline. */
  | "waiting"
  /** On its way, or due to be tried again. */
  | "sending"
  /** The server has it (it left the outbox). */
  | "sent"
  /** Refused, or out of tries: it stays on the device until it is retried or discarded. */
  | "failed";

/** Where the submission `id` stands in an outbox snapshot. */
export function submissionStatus(snapshot: OutboxSnapshotLike, id: string): { status: SubmissionStatus; error: string | null } {
  const item = snapshot.items.find((i) => i.id === id);
  if (!item) return { status: "sent", error: null };
  if (item.state === "failed") return { status: "failed", error: item.lastError ?? null };
  if (!snapshot.online && !item.sending) return { status: "waiting", error: null };
  return { status: "sending", error: null };
}
