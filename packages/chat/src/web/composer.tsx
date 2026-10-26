/**
 * @feat:chat
 * The composer: a growing text box (Enter sends, Shift+Enter is a new line;
 * on touch screens Enter is a new line), photos and files from a picker, a
 * paste or a drop, with previews to remove before sending, a reply banner,
 * internal notes for observers, voice notes recorded in place, videos from the
 * camera, emoji, and scheduled send (the arrow beside Send). Where you may not
 * post it says why instead; when who you are couldn't load, it offers a retry.
 */
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
} from "react";
import { CalendarClock, FileText, Lock, Mic, Paperclip, RefreshCw, SendHorizontal, Smile, Trash2, Video, X } from "lucide-react";
import {
  Alert,
  AlertDescription,
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Skeleton,
  Textarea,
  Toggle,
  Tooltip,
  cn,
  toast,
} from "@marktiderman/genesis-ui";
import { scheduleLabel } from "../core/extras";
import { CHAT_LIMITS, attachmentKindFor, fileExtension, formatDuration, isAllowedExtension, randomId, recordingLimitMs } from "../core/media";
import type { LocalFile } from "../core/outbox";
import { parseMentions, previewText } from "../core/thread";
import type { ChatMessage } from "../core/types";
import { useChat, useScheduled, type ConversationState } from "../react/index";
import { ChatEmojiPicker, canPickEmoji } from "./emoji-picker";
import type { ResolveUser } from "./format";
import { ChatScheduleMenu, ChatScheduledList } from "./schedule";
import { ChatVideoRecorder } from "./video";
import { useVoiceRecorder, voiceFile } from "./use-voice-recorder";

export interface ChatComposerHandle {
  /** Adds files as if picked (a drop on the thread, say). Refused ones get a toast. */
  addFiles(files: File[] | FileList): void;
  /** Puts text at the cursor. */
  insertText(text: string): void;
  focus(): void;
}

export interface ChatComposerProps {
  /** From `useConversation`: how to send, and whether you may. */
  conversation: Pick<ConversationState, "send" | "signalTyping" | "signalRecording" | "role" | "canPost" | "accessLoading" | "conversation"> &
    Partial<Pick<ConversationState, "accessError" | "refetchAccess" | "signalRecordingVideo">>;
  /** The message being replied to; a banner shows above the box. */
  replyTo?: ChatMessage | null;
  onCancelReply?: () => void;
  /** Names the replied-to person. */
  resolveUser?: ResolveUser;
  placeholder?: string;
  /** Extra controls beside the attach button (the `composerAccessory` slot of ChatThread). */
  accessory?: ReactNode;
  /** Called after a message is queued. */
  onSent?: () => void;
  autoFocus?: boolean;
  /** Shown instead of the box, with a lock (a closed topic). */
  disabledReason?: string | null;
  /** The topic new messages go to (scheduled ones too). */
  topic?: string | null;
  /** Offer scheduled send (the arrow beside Send) and list what's scheduled. Default true. */
  scheduling?: boolean;
  /** Offer video recording. Default true where the browser can record. */
  video?: boolean;
  /** Offer the emoji picker (only when `emojibaseUrl` is given). Default true. */
  emoji?: boolean;
  /** Where the emoji picker loads its data from. */
  emojibaseUrl?: string;
  className?: string;
  ref?: Ref<ChatComposerHandle>;
}

interface Draft {
  id: string;
  file: File;
  previewUrl: string | null;
  kind: string;
}

const isTouch = () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
const objectUrl = (f: Blob) => (typeof URL !== "undefined" && typeof URL.createObjectURL === "function" ? URL.createObjectURL(f) : null);
const revoke = (u: string | null) => {
  if (u && typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function") URL.revokeObjectURL(u);
};
const MAX_HEIGHT = 160;

export function ChatComposer({
  conversation: state,
  replyTo,
  onCancelReply,
  resolveUser,
  placeholder = "Message",
  accessory,
  onSent,
  autoFocus,
  disabledReason,
  topic,
  scheduling = true,
  video = true,
  emoji = true,
  emojibaseUrl,
  className,
  ref,
}: ChatComposerProps) {
  const { userId: me, videoUpload } = useChat();
  const conversationId = state.conversation?.id ?? null;
  const scheduled = useScheduled(conversationId, { enabled: scheduling && Boolean(conversationId) });
  const [recordingVideo, setRecordingVideo] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const canRecordVideo = video && typeof MediaRecorder !== "undefined" && typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);
  const [text, setText] = useState("");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [internal, setInternal] = useState(false);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;
  // One clientId per scheduled draft, kept until it is scheduled, so pressing Schedule again
  // after a timeout (the server may have saved it) never schedules it twice.
  const scheduleId = useRef<string | null>(null);
  const [schedulingNow, setSchedulingNow] = useState(false);
  const schedulingRef = useRef(false);

  const recorder = useVoiceRecorder({
    maxMs: recordingLimitMs(state.role),
    onTick: state.signalRecording,
    onLimit: (rec) => {
      void sendVoice(rec);
      toast.info(`Voice messages stop at ${formatDuration(recordingLimitMs(state.role))}. Sent.`);
    },
  });

  // Previews not sent are freed when the composer goes.
  useEffect(() => () => draftsRef.current.forEach((d) => revoke(d.previewUrl)), []);

  const autosize = useCallback(() => {
    const el = textarea.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`;
  }, []);
  useEffect(autosize, [text, autosize]);

  useEffect(() => {
    if (replyTo) textarea.current?.focus();
  }, [replyTo]);

  const addFiles = useCallback((list: File[] | FileList) => {
    const files = Array.from(list);
    if (files.length === 0) return;
    const next: Draft[] = [];
    let room = CHAT_LIMITS.attachmentsPerMessage - draftsRef.current.length;
    for (const file of files) {
      const ext = fileExtension(file.name, file.type);
      if (!isAllowedExtension(ext)) {
        toast.error(`${file.name} can't be sent`, { description: "Photos, videos, audio, PDFs and office documents can." });
        continue;
      }
      const type = file.type || "application/octet-stream";
      const kind = attachmentKindFor(type);
      const limit = kind === "video" ? CHAT_LIMITS.videoBytes : CHAT_LIMITS.fileBytes;
      if (file.size > limit) {
        toast.error(`${file.name} is too big`, { description: `The limit is ${Math.round(limit / 1024 / 1024)} MB.` });
        continue;
      }
      if (room <= 0) {
        toast.error(`Up to ${CHAT_LIMITS.attachmentsPerMessage} files per message`);
        break;
      }
      room -= 1;
      next.push({ id: randomId(), file, kind, previewUrl: kind === "image" || kind === "video" ? objectUrl(file) : null });
    }
    if (next.length) setDrafts((d) => [...d, ...next]);
  }, []);

  const insertText = useCallback((value: string) => {
    const el = textarea.current;
    setText((t) => {
      if (!el) return t + value;
      const start = el.selectionStart ?? t.length;
      const end = el.selectionEnd ?? t.length;
      return t.slice(0, start) + value + t.slice(end);
    });
    el?.focus();
  }, []);

  useImperativeHandle(ref, () => ({ addFiles, insertText, focus: () => textarea.current?.focus() }), [addFiles, insertText]);

  const removeDraft = (id: string) =>
    setDrafts((d) => {
      const gone = d.find((x) => x.id === id);
      revoke(gone?.previewUrl ?? null);
      return d.filter((x) => x.id !== id);
    });

  const common = () => ({
    replyToId: replyTo?.id ?? null,
    visibility: internal ? ("observers" as const) : ("everyone" as const),
    ...(topic ? { topic } : {}),
  });

  const scheduleAt = async (at: Date) => {
    const body = text.trim();
    if ((!body && drafts.length === 0) || !conversationId || schedulingRef.current) return;
    schedulingRef.current = true;
    setSchedulingNow(true);
    scheduleId.current ??= randomId();
    const files: LocalFile[] = drafts.map((d) => ({
      data: d.file,
      name: d.file.name,
      contentType: d.file.type || "application/octet-stream",
      meta: { kind: d.kind, bytes: d.file.size, name: d.file.name },
    }));
    try {
      await scheduled.schedule(
        { conversationId, clientId: scheduleId.current, body, mentions: parseMentions(body), replyToId: replyTo?.id ?? null, topic: topic ?? null, sendAt: at },
        files,
      );
      scheduleId.current = null;
      setText("");
      drafts.forEach((d) => revoke(d.previewUrl));
      setDrafts([]);
      onCancelReply?.();
      toast.success(`Scheduled for ${scheduleLabel(at)}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't schedule it");
    } finally {
      schedulingRef.current = false;
      setSchedulingNow(false);
    }
  };

  const submit = () => {
    const body = text.trim();
    if (!body && drafts.length === 0) return;
    if (body.length > CHAT_LIMITS.bodyChars) {
      toast.error(`Messages can be up to ${CHAT_LIMITS.bodyChars.toLocaleString()} characters`);
      return;
    }
    const files: LocalFile[] = drafts.map((d) => ({
      data: d.file,
      name: d.file.name,
      contentType: d.file.type || "application/octet-stream",
      previewUrl: d.previewUrl ?? undefined,
      meta: { kind: d.kind, bytes: d.file.size, name: d.file.name },
    }));
    void state.send({ body, mentions: parseMentions(body), ...common() }, files);
    setText("");
    setDrafts([]);
    onCancelReply?.();
    onSent?.();
    textarea.current?.focus();
  };

  async function sendVoice(rec: Awaited<ReturnType<typeof recorder.stop>>) {
    if (!rec) return;
    if (rec.durationMs < 700) {
      toast.info("Hold on a little longer to record a voice message");
      return;
    }
    await state.send({ body: "", ...common() }, [voiceFile(rec)]);
    onCancelReply?.();
    onSent?.();
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && !isTouch()) {
      e.preventDefault();
      submit();
    } else if (e.key === "Escape" && replyTo) {
      onCancelReply?.();
    }
  };

  const onChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    if (e.target.value) state.signalTyping();
  };

  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(e.clipboardData?.files ?? []);
    if (files.length) {
      e.preventDefault();
      addFiles(files);
    }
  };

  // Loading who you are in this conversation.
  if (state.accessLoading) {
    return (
      <div className={cn("border-t p-3", className)} aria-busy>
        <Skeleton className="h-10 w-full rounded-2xl" />
      </div>
    );
  }

  if (state.accessError) {
    return (
      <div className={cn("flex items-center justify-center gap-2 border-t p-3 text-sm text-muted-foreground", className)} role="alert" data-testid="genesis-chat-access-error">
        <span>Couldn't check whether you can post here.</span>
        <Button type="button" variant="outline" size="sm" className="h-7 gap-1" onClick={() => void state.refetchAccess?.()} data-testid="genesis-chat-access-retry">
          <RefreshCw className="size-3.5" aria-hidden /> Try again
        </Button>
      </div>
    );
  }

  // Who may post depends on the conversation's settings: wait for them rather than say the wrong reason.
  if (!state.canPost && !state.conversation) {
    return (
      <div className={cn("border-t p-3", className)} aria-busy>
        <Skeleton className="h-10 w-full rounded-2xl" />
      </div>
    );
  }

  if (state.canPost && disabledReason) {
    return (
      <div className={cn("border-t p-3 text-center text-sm text-muted-foreground", className)} role="status" data-testid="genesis-chat-composer-disabled">
        <Lock className="mr-1 inline size-3.5 align-[-2px]" aria-hidden />
        {disabledReason}
      </div>
    );
  }

  if (!state.canPost) {
    const adminsOnly = state.conversation?.settings?.who_posts === "admins";
    return (
      <div className={cn("border-t p-3 text-center text-sm text-muted-foreground", className)} role="status" data-testid="genesis-chat-cannot-post">
        <Lock className="mr-1 inline size-3.5 align-[-2px]" aria-hidden />
        {adminsOnly ? "Only admins can post here" : "You can't post in this conversation"}
      </div>
    );
  }

  const hasContent = text.trim().length > 0 || drafts.length > 0;
  const replyName = replyTo?.senderId ? (replyTo.senderId === me ? "yourself" : (resolveUser?.(replyTo.senderId).name ?? "message")) : "message";

  return (
    <div className={cn("border-t bg-background", className)} data-testid="genesis-chat-composer">
      {recorder.error ? (
        <Alert variant="destructive" className="m-2 w-auto" data-testid="genesis-chat-mic-error">
          <Mic className="size-4" aria-hidden />
          <AlertDescription className="flex items-start justify-between gap-2">
            <span>{recorder.error}</span>
            <Button type="button" variant="ghost" size="icon" className="size-6 shrink-0" onClick={recorder.clearError} aria-label="Dismiss">
              <X />
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      {replyTo ? (
        <div className="flex items-center gap-2 border-b px-3 py-2" data-testid="genesis-chat-reply-banner">
          <div className="min-w-0 flex-1 border-l-4 border-primary pl-2">
            <div className="text-xs font-semibold text-primary">Replying to {replyName}</div>
            <div className="truncate text-xs text-muted-foreground">{previewText(replyTo.body, replyTo.attachments[0]?.kind ?? null, Boolean(replyTo.deletedAt))}</div>
          </div>
          <Button type="button" variant="ghost" size="icon" className="size-7 shrink-0" onClick={onCancelReply} aria-label="Cancel reply">
            <X />
          </Button>
        </div>
      ) : null}
      {scheduling && scheduled.items.length ? (
        <div className="flex items-center px-3 pt-1.5">
          <Popover>
            <PopoverTrigger asChild>
              <Button type="button" variant="ghost" size="sm" className="h-6 gap-1 px-2 text-xs text-muted-foreground" data-testid="genesis-chat-scheduled-count">
                <CalendarClock className="size-3.5" aria-hidden />
                {scheduled.items.length === 1 ? "1 scheduled message" : `${scheduled.items.length} scheduled messages`}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-80 p-0">
              <ChatScheduledList conversationId={conversationId} />
            </PopoverContent>
          </Popover>
        </div>
      ) : null}
      {drafts.length ? (
        <ul className="flex gap-2 overflow-x-auto px-3 pt-3" aria-label="Attachments to send">
          {drafts.map((d) => (
            <li key={d.id} className="relative shrink-0">
              {d.kind === "image" && d.previewUrl ? (
                <img src={d.previewUrl} alt={d.file.name} className="size-16 rounded-lg border object-cover" />
              ) : d.kind === "video" && d.previewUrl ? (
                <video src={d.previewUrl} muted playsInline preload="metadata" className="size-16 rounded-lg border object-cover" aria-label={d.file.name} />
              ) : (
                <span className="flex h-16 w-40 items-center gap-2 rounded-lg border bg-muted px-2 text-xs">
                  <FileText className="size-4 shrink-0" aria-hidden />
                  <span className="line-clamp-2 break-all">{d.file.name}</span>
                </span>
              )}
              <Button
                type="button"
                size="icon"
                variant="secondary"
                className="absolute -right-1.5 -top-1.5 size-5 rounded-full border shadow-sm [&_svg]:size-3"
                onClick={() => removeDraft(d.id)}
                aria-label={`Remove ${d.file.name}`}
              >
                <X />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      {recorder.recording || recorder.state === "requesting" ? (
        <div className="flex items-center gap-2 p-2" data-testid="genesis-chat-recording">
          <Button type="button" variant="ghost" size="icon" className="shrink-0 rounded-full text-destructive hover:text-destructive" onClick={recorder.cancel} aria-label="Cancel recording">
            <Trash2 />
          </Button>
          <span className="size-2.5 shrink-0 animate-pulse rounded-full bg-destructive" aria-hidden />
          <span className="w-24 shrink-0 text-sm tabular-nums" role="timer" aria-live="off">
            {formatDuration(recorder.elapsedMs)}
            <span className="text-muted-foreground"> / {formatDuration(recorder.maxMs)}</span>
          </span>
          <span className="flex h-8 flex-1 items-center justify-end gap-[2px] overflow-hidden" aria-hidden>
            {recorder.levels.map((l, i) => (
              <span key={i} className="w-[3px] shrink-0 rounded-full bg-primary" style={{ height: `${Math.max(10, Math.min(100, l * 140))}%` }} />
            ))}
          </span>
          <span className="sr-only" role="status">
            {recorder.state === "requesting" ? "Asking for the microphone" : "Recording a voice message"}
          </span>
          <Button
            type="button"
            size="icon"
            className="shrink-0 rounded-full"
            disabled={!recorder.recording}
            onClick={() => void recorder.stop().then(sendVoice)}
            aria-label="Send voice message"
            data-testid="genesis-chat-voice-send"
          >
            <SendHorizontal />
          </Button>
        </div>
      ) : (
        <div className="flex items-end gap-1 p-2">
          <input
            ref={picker}
            type="file"
            multiple
            className="hidden"
            tabIndex={-1}
            aria-hidden
            accept="image/*,video/*,audio/*,.pdf,.txt,.csv,.docx,.xlsx,.pptx,.heic,.heif"
            onChange={(e) => {
              if (e.target.files) addFiles(e.target.files);
              e.target.value = "";
            }}
            data-testid="genesis-chat-file-input"
          />
          <Tooltip content="Attach photos or files">
            <Button type="button" variant="ghost" size="icon" className="shrink-0 rounded-full text-muted-foreground" onClick={() => picker.current?.click()} aria-label="Attach photos or files">
              <Paperclip />
            </Button>
          </Tooltip>
          {canRecordVideo && conversationId ? (
            <Tooltip content="Record a video">
              <Button type="button" variant="ghost" size="icon" className="shrink-0 rounded-full text-muted-foreground" onClick={() => setRecordingVideo(true)} aria-label="Record a video" data-testid="genesis-chat-video-button">
                <Video />
              </Button>
            </Tooltip>
          ) : null}
          {accessory}
          {state.role === "observer" ? (
            <Tooltip content={internal ? "Internal note: only observers see it" : "Write an internal note"}>
              <Toggle
                pressed={internal}
                onPressedChange={setInternal}
                aria-label="Internal note"
                size="sm"
                className="h-10 shrink-0 rounded-full data-[state=on]:bg-warning/20"
              >
                <Lock className="size-4" />
              </Toggle>
            </Tooltip>
          ) : null}
          <Textarea
            ref={textarea}
            rows={1}
            value={text}
            onChange={onChange}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            placeholder={internal ? "Internal note" : placeholder}
            aria-label={internal ? "Internal note" : placeholder}
            autoFocus={autoFocus}
            maxLength={CHAT_LIMITS.bodyChars}
            enterKeyHint="send"
            className={cn(
              "max-h-40 min-h-10 flex-1 resize-none rounded-2xl py-2 leading-snug",
              internal && "border-warning/60 bg-warning/10",
            )}
            data-testid="genesis-chat-input"
          />
          {emoji && canPickEmoji(emojibaseUrl) ? (
            <Popover open={emojiOpen} onOpenChange={setEmojiOpen}>
              <PopoverTrigger asChild>
                <Button type="button" variant="ghost" size="icon" className="shrink-0 rounded-full text-muted-foreground" aria-label="Add emoji" data-testid="genesis-chat-emoji-button">
                  <Smile />
                </Button>
              </PopoverTrigger>
              <PopoverContent side="top" align="end" className="w-auto overflow-hidden p-0" onCloseAutoFocus={(e) => { e.preventDefault(); textarea.current?.focus(); }}>
                <ChatEmojiPicker
                  emojibaseUrl={emojibaseUrl}
                  onSelect={(e) => {
                    insertText(e);
                    setEmojiOpen(false);
                  }}
                />
              </PopoverContent>
            </Popover>
          ) : null}
          {hasContent ? (
            <>
              <Button type="button" size="icon" className="shrink-0 rounded-full" onClick={submit} aria-label="Send" data-testid="genesis-chat-send">
                <SendHorizontal />
              </Button>
              {scheduling && conversationId && !internal ? <ChatScheduleMenu onSchedule={(at) => void scheduleAt(at)} disabled={schedulingNow} /> : null}
            </>
          ) : (
            <Tooltip content="Record a voice message">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0 rounded-full text-muted-foreground"
                onClick={() => void recorder.start()}
                aria-label="Record a voice message"
                data-testid="genesis-chat-mic"
              >
                <Mic />
              </Button>
            </Tooltip>
          )}
        </div>
      )}
      {canRecordVideo && conversationId ? (
        <ChatVideoRecorder
          open={recordingVideo}
          onOpenChange={setRecordingVideo}
          conversationId={conversationId}
          maxMs={recordingLimitMs(state.role)}
          send={(input, files) => state.send({ ...input, ...common() }, files)}
          videoUpload={videoUpload}
          onTick={state.signalRecordingVideo ?? state.signalRecording}
          onSent={() => {
            onCancelReply?.();
            onSent?.();
          }}
        />
      ) : null}
    </div>
  );
}
