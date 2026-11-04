/**
 * A reply's files in `ThreadPage`, whose own attachment draws images only. A photo in this app's
 * storage shows; anything else is a link. A file from outside storage names its host and loads
 * nothing until it's asked for: whoever sent it chose that address.
 */
import { createContext, useContext } from "react";
import type { ThreadAttachment, ThreadPageSlotMap } from "@marktiderman/genesis-ui";
import type { SupportReply } from "../client";
import type { SupportCopy } from "../copy";

export interface ThreadFile {
  image: boolean;
  name: string;
}

export const ThreadFilesContext = createContext<ReadonlyMap<string, ThreadFile>>(new Map());

/** Only web addresses open from a thread: a file's URL comes from a message. */
const isWebUrl = (url: string | null): url is string => Boolean(url && /^https?:\/\//i.test(url));

const hostOf = (url: string | null) => {
  try {
    return url ? new URL(url).host : "";
  } catch {
    return "";
  }
};

export function threadFiles(replies: readonly SupportReply[], copy: SupportCopy): ReadonlyMap<string, ThreadFile> {
  const map = new Map<string, ThreadFile>();
  for (const r of replies) {
    for (const a of r.attachments ?? []) {
      const stored = Boolean(a.path);
      const name = a.name ?? copy.agentInbox.openFile;
      map.set(a.id, { image: stored && (a.kind === "image" || Boolean(a.mime?.startsWith("image/"))), name: stored ? name : `${name} (${hostOf(a.url)})` });
    }
  }
  return map;
}

export function threadAttachments(r: SupportReply, copy: SupportCopy): ThreadAttachment[] {
  return (r.attachments ?? [])
    .filter((a) => isWebUrl(a.url))
    .map((a) => ({ id: a.id, uri: a.url as string, ...(a.width ? { width: a.width } : {}), ...(a.height ? { height: a.height } : {}), accessibilityLabel: a.name ?? copy.thread.file }));
}

export function ThreadFileAttachment({ id, uri, accessibilityLabel, testID }: ThreadPageSlotMap["attachment"]) {
  const file = useContext(ThreadFilesContext).get(id);
  return (
    <a data-testid={testID} href={uri} target="_blank" rel="noreferrer noopener" className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      {file?.image ? (
        <img src={uri} alt={accessibilityLabel ?? ""} loading="lazy" className="h-40 w-auto rounded-xl object-cover" />
      ) : (
        <span className="inline-block rounded-xl border px-3 py-2 text-sm underline underline-offset-2">{file?.name ?? accessibilityLabel}</span>
      )}
    </a>
  );
}
