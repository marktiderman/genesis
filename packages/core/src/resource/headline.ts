// A headline number (a KPI card) as data: no React, so a server or a phone can build one.
// genesis-ui's `HeadlineNumbers` draws it; its own `HeadlineNumber` widens `value` and
// `detail` to any React node, so every one of these is one of those.

/** The colour of a headline number's detail: good news, bad news, a warning, or plain. */
export type HeadlineTone = "positive" | "negative" | "warning" | "muted";

/** One headline number, as data: a label, the number, and a short line under it. */
export interface HeadlineNumber {
  key: string;
  label: string;
  value: string | number;
  detail?: string | undefined;
  /** The detail's colour. Default plain. */
  tone?: HeadlineTone | undefined;
}
