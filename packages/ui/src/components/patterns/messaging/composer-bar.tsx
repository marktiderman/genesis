/**
 * ComposerBar — the bar you write a message in, on the web: a textarea that
 * grows with what you type (up to `maxLines`, then scrolls), a send button,
 * and slots beside and above it.
 *
 * The web twin of ui-native's `NativeComposerBar`, with the same props, on
 * the shared conversation contract (`@marktiderman/genesis-core/conversation`).
 *
 * - **Sending:** Enter sends and Shift+Enter adds a line (`sendOn="enter"`,
 *   the default), or Cmd/Ctrl+Enter sends (`sendOn="mod-enter"`, for long
 *   replies). Nothing sends while composing with an input method.
 * - **Modes:** `modes` with a tone each ("Reply" / "Internal note"). Two or
 *   more show a picker above the input; an `internal` tone edges the bar and
 *   the input in the theme's `warning` colour and labels the input with the
 *   mode, so a staff-only note never reads like a reply.
 * - **Slots:** `leading` (attach), `trailing` (beside send: a mic), `above`
 *   (a reply preview, attachments waiting to send).
 * - **Accessibility:** the input is labelled, the mode picker is a tablist,
 *   and "Sending" is announced politely.
 *
 * @stability Beta
 */
import * as React from "react";
import { ArrowUp, Loader2 } from "lucide-react";
import type { ComposerMode } from "@marktiderman/genesis-core/conversation";
import { cn } from "../../../utils";

export interface ComposerBarProps {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  /** A send is in flight: the button spins and won't send twice. */
  sending?: boolean;
  /** Turns sending off (besides a blank value). */
  disabled?: boolean;
  placeholder?: string;
  /** Send's label, to a screen reader. Default "Send". */
  sendLabel?: string;
  sendingLabel?: string;
  maxLength?: number;
  /** The input grows to this many lines, then scrolls. Default 6. */
  maxLines?: number;
  /** Which key sends. Default `enter` (Shift+Enter for a new line). */
  sendOn?: "enter" | "mod-enter";
  /** Ways to send ("Reply", "Internal note"). Two or more show the picker. */
  modes?: readonly ComposerMode[];
  /** The chosen mode's id. Default the first. */
  mode?: string;
  onModeChange?: (id: string) => void;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  above?: React.ReactNode;
  className?: string;
  testID?: string;
}

const LINE_PX = 22;
const PAD_PX = 16;

export const ComposerBar = React.forwardRef<HTMLTextAreaElement, ComposerBarProps>(function ComposerBar(
  {
    value,
    onChangeText,
    onSend,
    sending = false,
    disabled = false,
    placeholder = "Message",
    sendLabel = "Send",
    sendingLabel = "Sending",
    maxLength,
    maxLines = 6,
    sendOn = "enter",
    modes,
    mode,
    onModeChange,
    leading,
    trailing,
    above,
    className,
    testID = "composer",
  },
  ref,
) {
  const input = React.useRef<HTMLTextAreaElement | null>(null);
  React.useImperativeHandle(ref, () => input.current as HTMLTextAreaElement);
  const current = modes?.find((m) => m.id === mode) ?? modes?.[0];
  const internal = current?.tone === "internal";
  const canSend = Boolean(value.trim()) && !disabled && !sending;
  const label = internal ? current!.label : placeholder;

  // Grow with the text, up to maxLines.
  React.useLayoutEffect(() => {
    const el = input.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, LINE_PX * maxLines + PAD_PX)}px`;
  }, [value, maxLines]);

  const send = () => {
    if (canSend) onSend();
  };

  return (
    <div
      data-testid={testID}
      data-tone={internal ? "internal" : undefined}
      className={cn("flex flex-col gap-2 border-t bg-background px-3 py-2", internal && "border-t-2 border-t-warning", className)}
    >
      {modes && modes.length > 1 ? (
        <div role="tablist" aria-label="Send as" data-testid={`${testID}-modes`} className="flex gap-1">
          {modes.map((m) => {
            const on = m.id === current?.id;
            return (
              <button
                key={m.id}
                type="button"
                role="tab"
                aria-selected={on}
                data-testid={`${testID}-mode-${m.id}`}
                onClick={() => onModeChange?.(m.id)}
                className={cn(
                  "min-h-11 rounded-full px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  on ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
                  m.tone === "internal" && "border border-warning",
                )}
              >
                {m.label}
              </button>
            );
          })}
        </div>
      ) : null}
      {above}
      <div className="flex items-end gap-2">
        {leading}
        <textarea
          ref={input}
          data-testid={`${testID}-input`}
          rows={1}
          value={value}
          maxLength={maxLength}
          placeholder={label}
          aria-label={label}
          onChange={(e) => onChangeText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
            const mod = e.metaKey || e.ctrlKey;
            if (sendOn === "enter" ? !e.shiftKey && !mod : mod) {
              e.preventDefault();
              send();
            }
          }}
          className={cn(
            "min-h-11 flex-1 resize-none rounded-2xl border bg-muted/40 px-4 py-2 text-base leading-[22px] placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            internal && "border-warning",
          )}
        />
        {trailing}
        {sending ? (
          <span data-testid={`${testID}-sending`} role="status" aria-live="polite" aria-label={sendingLabel} className="flex size-11 items-center justify-center">
            <Loader2 className="size-5 animate-spin motion-reduce:animate-none" aria-hidden />
          </span>
        ) : (
          <button
            type="button"
            data-testid={`${testID}-send`}
            aria-label={sendLabel}
            disabled={!canSend}
            onClick={send}
            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity disabled:bg-muted disabled:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowUp className="size-5" aria-hidden />
          </button>
        )}
      </div>
    </div>
  );
});
