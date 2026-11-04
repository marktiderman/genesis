/**
 * A reply's files for `ThreadPage`. A photo signed from this app's storage shows; anything else is a
 * link that loads nothing until it's asked for, and a file from outside storage names its host: whoever
 * sent it chose that address.
 */
import type { ThreadAttachment } from "@marktiderman/genesis-ui";
import type { SupportReply } from "../client";
import type { SupportCopy } from "../copy";

/** Only web addresses open from a thread: a file's URL comes from a message. */
const isWebUrl = (url: string | null): url is string => Boolean(url && /^https?:\/\//i.test(url));

const hostOf = (url: string | null) => {
  try {
    return url ? new URL(url).host : "";
  } catch {
    return "";
  }
};

export function threadAttachments(r: SupportReply, copy: SupportCopy): ThreadAttachment[] {
  return (r.attachments ?? [])
    .filter((a) => isWebUrl(a.url))
    .map((a) => {
      const label = a.name ?? copy.agentInbox.openFile;
      const image = a.stored && (a.kind === "image" || Boolean(a.mime?.startsWith("image/")));
      return image
        ? { id: a.id, kind: "image" as const, uri: a.url as string, ...(a.width ? { width: a.width } : {}), ...(a.height ? { height: a.height } : {}), accessibilityLabel: a.name ?? copy.thread.screenshot }
        : { id: a.id, kind: "file" as const, uri: a.url as string, name: a.stored ? label : `${label} (${hostOf(a.url)})` };
    });
}
