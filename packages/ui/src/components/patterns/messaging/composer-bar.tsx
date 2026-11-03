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
 *   replies). Nothing sends while composing with an input method (Safari
 *   included, which reports the confirming Enter as keyCode 229). On a touch
 *   screen, Enter adds a line and the button sends, as in a phone's apps.
 * - **Modes:** `modes` with a tone each ("Reply" / "Internal note"). Two or
 *   more show a picker above the input; an `internal` tone edges the bar and
 *   the input in the theme's `warning` colour and labels the input with the
 *   mode, so a staff-only note never reads like a reply.
 * - **Slots:** `leading` (attach), `trailing` (beside send: a mic), `above`
 *   (a reply preview, attachments waiting to send).
 * - **Accessibility:** the input is labelled; the mode picker is a single-choice
 *   toggle group (arrow keys move between modes); the send button stays put
 *   while sending, so focus stays on it, and "Sending" is announced politely
 *   from a region that's always there.
 *
 * @stability Beta
 */
import * as React from "react";
import { ArrowUp } from "lucide-react";
import type { ComposerMode } from "@marktiderman/genesis-core/conversation";
import { cn } from "../../../utils";
import { Spinner } from "../../ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "../../ui/toggle-group";

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
  /** The mode picker's name, for a screen reader. Default "Send as". */
  modesLabel?: string;
  /** Which key sends. Default `enter` (Shift+Enter for a new line; on a touch screen Enter adds a line). */
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

const isTouch = () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;

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
    modesLabel = "Send as",
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
        <ToggleGroup
          type="single"
          aria-label={modesLabel}
          value={current?.id ?? ""}
          onValueChange={(id) => {
            if (id) onModeChange?.(id);
          }}
          data-testid={`${testID}-modes`}
          className="justify-start"
        >
          {modes.map((m) => (
            <ToggleGroupItem
              key={m.id}
              value={m.id}
              data-testid={`${testID}-mode-${m.id}`}
              className={cn("min-h-11 rounded-full px-3", m.tone === "internal" && "border border-warning")}
            >
              {m.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
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
            if (e.key !== "Enter" || e.nativeEvent.isComposing || e.keyCode === 229) return;
            const mod = e.metaKey || e.ctrlKey;
            if (sendOn === "enter" ? !e.shiftKey && !mod && !isTouch() : mod) {
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
        <button
          type="button"
          data-testid={`${testID}-send`}
          aria-label={sendLabel}
          aria-disabled={!canSend}
          aria-busy={sending || undefined}
          onClick={send}
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-full transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            canSend || sending ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
          )}
        >
          {sending ? <Spinner data-testid={`${testID}-sending`} className="size-5 motion-reduce:animate-none" aria-hidden /> : <ArrowUp className="size-5" aria-hidden />}
        </button>
        <span className="sr-only" role="status" aria-live="polite" data-testid={`${testID}-status`}>
          {sending ? sendingLabel : ""}
        </span>
      </div>
    </div>
  );
});
