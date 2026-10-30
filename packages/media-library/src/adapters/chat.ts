/**
 * @marktiderman/genesis-media-library/chat: an adapter for genesis-chat's
 * upload port (`createTusUpload`'s `transport`), on this package's Supabase
 * TUS transport. A chat app opts in by passing it:
 *
 *   createTusUpload({ supabaseUrl, userId, getAccessToken, transport: createChatTusTransport({ supabaseUrl }) })
 *
 * It fits the port by shape, so neither package depends on the other. chat
 * keeps its paths, file checks and errors; this sends the bytes. It never
 * loads the uploader or the browser worker.
 *
 * @packageDocumentation
 */
import { TusError, createSupabaseTusTransport, type SupabaseTusOptions, type TusRecord, type TusSource } from "../client/supabase-tus";

/** What chat tells a transport about the file it sends (genesis-chat's `TusSendInfo`). */
export interface ChatTusSendInfo {
  bucket: string;
  contentType: string;
  cacheControl: string;
  /** The person's headers; rejects when they're signed out. */
  headers: () => Promise<Record<string, string>>;
}

/** @stability Experimental */
export type ChatTusTransportOptions = Pick<SupabaseTusOptions, "supabaseUrl" | "fetch" | "chunkBytes" | "retries" | "sleep">;

/** What `createChatTusTransport` returns: an object that fits genesis-chat's `TusTransport`. */
export interface ChatTusTransport {
  send(record: TusRecord, source: TusSource, info: ChatTusSendInfo, renamePath: () => string): Promise<string>;
}

/** Whether an error is a refusal: this transport's own, or one chat made (a `transient` that is false). */
const isRefusal = (e: unknown) =>
  (e instanceof TusError && e.failure !== "transient") || (typeof e === "object" && e !== null && (e as { transient?: unknown }).transient === false);

/** @stability Experimental */
export function createChatTusTransport(options: ChatTusTransportOptions): ChatTusTransport {
  return {
    send(record, source, info, renamePath) {
      // Chat names the bucket and the person's headers per send.
      const transport = createSupabaseTusTransport({ ...options, bucket: info.bucket, headers: info.headers, isPermanent: isRefusal });
      return transport.send(record, source, { contentType: info.contentType, cacheControl: info.cacheControl }, renamePath);
    },
  };
}
