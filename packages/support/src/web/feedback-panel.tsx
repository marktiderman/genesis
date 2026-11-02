/**
 * The web feedback panel, built from Genesis UI: a "New" tab (type, message,
 * an optional screenshot of the tab with pen marks and hidden areas, an
 * optional pin on the page) and a "My reports" tab (the person's reports and
 * their status). Loading, empty and failed reads are told apart.
 *
 * Put it anywhere (a page, a Sheet); `FeedbackLauncher` puts it in a Sheet
 * behind a floating button.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Label,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  ToggleGroup,
  ToggleGroupItem,
} from "@marktiderman/genesis-ui";
import type { SupportClient, SupportReport } from "../client";
import { resolveSupportCopy, type SupportCopyOverrides } from "../copy";
import { cleanRoute, type FindingSeverity } from "../contract";
import { createContextCollector, FEEDBACK_TYPES, type ContextCollector, type FeedbackDelivery, type FeedbackSink, type FeedbackType } from "../record";
import { annotateScreenshot, canCaptureScreenshot, captureScreenshot, type Redaction, type Stroke, type WebCapture } from "./capture";
import { pickPin, type FeedbackPin } from "./pin";

/** The default web collector: the path (never the query string), `web`, and the viewport and language. */
export function webContextCollector(options: { appVersion?: string } = {}): ContextCollector {
  return createContextCollector({
    appVersion: options.appVersion,
    platform: "web",
    route: () => (typeof location === "undefined" ? undefined : cleanRoute(location.pathname)),
    device: () =>
      typeof window === "undefined"
        ? undefined
        : { viewport: { width: window.innerWidth, height: window.innerHeight }, pixelRatio: window.devicePixelRatio, language: navigator.language },
  });
}

export interface FeedbackPanelProps {
  /** Where feedback goes. A support client also fills "My reports". */
  client: FeedbackSink & Partial<Pick<SupportClient, "myReports">>;
  collector?: ContextCollector;
  copy?: SupportCopyOverrides;
  /** Offer a screenshot of the tab. Default: when the browser can capture. */
  screenshots?: boolean;
  /** Offer a pin on the page. Default on. */
  pins?: boolean;
  defaultType?: FeedbackType;
  onSent?: (delivery: FeedbackDelivery) => void;
  /** Hidden while the person picks a pin or the browser asks to capture, so the page shows. */
  onHide?: (hidden: boolean) => void;
  /**
   * What the app thinks the feedback is about (the feature of the screen the person is on). Shown
   * as a suggestion they can drop; when kept, its `context` joins the report's context.
   */
  about?: { label: string; context: Record<string, unknown> } | null | undefined;
  /** Take a screenshot as soon as the panel opens (opened with the keyboard shortcut, say). */
  captureOnOpen?: boolean | undefined;
  /**
   * What the person has written, captured and pinned so far, held by the host (`useFeedbackDraft`).
   * A host that hides the panel while the browser captures or the person pins (`onHide`), by
   * closing a Sheet say, unmounts it; with the draft outside, nothing is lost. Default: the
   * panel's own, which lasts as long as it's mounted.
   */
  draft?: FeedbackDraftStore | undefined;
  /**
   * Take a screenshot now, while open: each higher value asks once (the host's shortcut pressed
   * again, say), across remounts of the same draft. Unlike reopening, it keeps what the person
   * has written. Start it again from 0 when the draft is reset.
   */
  captureRequest?: number | undefined;
  /**
   * Opens the host's Help, where the person's reports and the replies are. Given, the thanks
   * after Send offers it as a button beside Send another.
   */
  onOpenHelp?: (() => void) | undefined;
}

/** A feedback panel's draft: what the person has chosen, written, captured and pinned. */
export interface FeedbackDraft {
  /** New on every reset: a send or capture that finishes after a reset leaves the new draft alone. */
  id: string;
  type: FeedbackType;
  message: string;
  shot: WebCapture | null;
  /** Set when the person asked for a screenshot and none came back (declined, or the browser can't). */
  shotFailed: boolean;
  // Marks stay a list until Send, then are drawn onto the image once: a quick second mark can't
  // drop the first, and nothing is sent half-marked.
  marks: Marks;
  pin: FeedbackPin | null;
  status: Status;
  severity: FindingSeverity | "";
  keepAbout: boolean;
  /** `captureOnOpen` already asked once for this draft. */
  captureAsked: boolean;
  /**
   * The last `captureRequest` this draft acted on: a request is taken once, however often the
   * panel remounts (a host that steps aside unmounts it).
   */
  captureHandled: number;
}

export interface FeedbackDraftStore {
  draft: FeedbackDraft;
  /** Changes the draft; with `forDraft`, only while that's still the draft (not after a reset). */
  update: (patch: Partial<FeedbackDraft>, forDraft?: string) => void;
  /** Starts over (call it when the host opens the panel afresh). */
  reset: () => void;
}

const draftId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const emptyDraft = (type: FeedbackType): FeedbackDraft => ({
  id: draftId(),
  type,
  message: "",
  shot: null,
  shotFailed: false,
  marks: { strokes: [], redactions: [] },
  pin: null,
  status: { kind: "idle" },
  severity: "",
  keepAbout: true,
  captureAsked: false,
  captureHandled: 0,
});

/** A feedback draft for a host to hold outside the panel (see `FeedbackPanelProps.draft`). */
export function useFeedbackDraft(defaultType: FeedbackType = "bug"): FeedbackDraftStore {
  const [draft, setDraft] = useState<FeedbackDraft>(() => emptyDraft(defaultType));
  const update = useCallback(
    (patch: Partial<FeedbackDraft>, forDraft?: string) => setDraft((d) => (forDraft && d.id !== forDraft ? d : { ...d, ...patch })),
    [],
  );
  const reset = useCallback(() => setDraft(emptyDraft(defaultType)), [defaultType]);
  return useMemo(() => ({ draft, update, reset }), [draft, update, reset]);
}

type Status = { kind: "idle" } | { kind: "sending" } | { kind: "sent"; dropped: number } | { kind: "error"; message: string };

export function FeedbackPanel({ client, collector, copy: overrides, screenshots, pins = true, defaultType = "bug", onSent, onHide, about, captureOnOpen, draft: held, captureRequest, onOpenHelp }: FeedbackPanelProps) {
  const copy = useMemo(() => resolveSupportCopy(overrides), [overrides]);
  const collect = useMemo(() => collector ?? webContextCollector(), [collector]);
  const own = useFeedbackDraft(defaultType);
  const { draft, update } = held ?? own;
  const { type, message, shot, marks, pin, status, severity, keepAbout, shotFailed } = draft;
  const setType = (value: FeedbackType) => update({ type: value });
  const setMessage = (value: string) => update({ message: value });
  const setShot = (value: WebCapture | null) => update({ shot: value });
  const setShotFailed = (value: boolean) => update({ shotFailed: value });
  const setMarks = (value: Marks) => update({ marks: value });
  const setPin = (value: FeedbackPin | null) => update({ pin: value });
  const setStatus = (value: Status) => update({ status: value });
  const setSeverity = (value: FindingSeverity | "") => update({ severity: value });
  const setKeepAbout = (value: boolean) => update({ keepAbout: value });
  const canShoot = screenshots ?? canCaptureScreenshot();

  // Results that arrive after an await go to the draft they were started for, never a newer one.
  const takeScreenshot = async () => {
    const forDraft = draft.id;
    onHide?.(true);
    try {
      const taken = await captureScreenshot();
      update({ shot: taken, shotFailed: !taken, marks: { strokes: [], redactions: [] } }, forDraft);
    } finally {
      onHide?.(false);
    }
  };

  // What this mount has already asked for, read from the draft once: React may run an effect twice
  // on one mount (development), before the draft's update lands, and that must not ask twice.
  const asked = useRef(draft.captureAsked);
  const handled = useRef(draft.captureHandled);

  useEffect(() => {
    // Once per draft: a panel remounted after stepping aside doesn't ask again.
    if (captureOnOpen && canShoot && !asked.current) {
      asked.current = true;
      update({ captureAsked: true });
      void takeScreenshot();
    }
    // Once, when the panel opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (captureRequest && canShoot && captureRequest > handled.current) {
      handled.current = captureRequest;
      update({ captureHandled: captureRequest });
      void takeScreenshot();
    }
    // Each new request asks once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [captureRequest]);

  const placePin = async () => {
    const forDraft = draft.id;
    onHide?.(true);
    try {
      update({ pin: await pickPin() }, forDraft);
    } finally {
      onHide?.(false);
    }
  };

  const send = async () => {
    if (!message.trim()) {
      setStatus({ kind: "error", message: copy.feedback.messageRequired });
      return;
    }
    const forDraft = draft.id;
    setStatus({ kind: "sending" });
    try {
      const context = await collect.collect();
      if (pin) context.extra = { ...context.extra, pin };
      // What the page is about, as the person saw it ("About: …"): the route alone names no record.
      if (about && keepAbout) context.extra = { ...context.extra, ...about.context, about_label: about.label };
      let image = shot;
      if (shot && (marks.strokes.length || marks.redactions.length)) {
        try {
          image = await annotateScreenshot(shot, marks);
        } catch {
          // Never send the screenshot without the parts the person hid.
          update({ status: { kind: "error", message: copy.annotate.failed } }, forDraft);
          return;
        }
      }
      const delivery = await client.submit({
        type,
        message: message.trim(),
        ...(type === "bug" && severity ? { severity } : {}),
        context,
        attachments: image ? [{ kind: "screenshot", contentType: image.contentType, base64: image.dataUrl, width: image.width, height: image.height }] : [],
      });
      update(
        {
          status: { kind: "sent", dropped: delivery.attachmentsDropped },
          message: "",
          shot: null,
          shotFailed: false,
          marks: { strokes: [], redactions: [] },
          pin: null,
          severity: "",
        },
        forDraft,
      );
      onSent?.(delivery);
    } catch (error) {
      const limited = (error as { code?: string }).code === "GS429";
      update({ status: { kind: "error", message: limited ? copy.feedback.rateLimited : copy.feedback.failedBody } }, forDraft);
    }
  };

  return (
    <Tabs defaultValue="new" className="flex flex-col gap-4" data-testid="genesis-support-panel">
      {/* The tabs share the bar (a long label ends in an ellipsis rather than
          overflowing a narrow sheet); the choice rows start under their labels. */}
      <TabsList className="flex w-full">
        <TabsTrigger value="new" className="min-w-0 flex-1">
          <span className="truncate">{copy.feedback.title}</span>
        </TabsTrigger>
        {client.myReports ? (
          <TabsTrigger value="mine" className="min-w-0 flex-1">
            <span className="truncate">{copy.inbox.sectionTitle}</span>
          </TabsTrigger>
        ) : null}
      </TabsList>
      <TabsContent value="new" className="flex flex-col gap-4">
        {status.kind === "sent" ? (
          // Sent: the confirmation takes the form's place, so it can't be missed.
          <>
            <Alert data-testid="genesis-support-sent" role="status">
              <AlertTitle>{copy.feedback.sentTitle}</AlertTitle>
              <AlertDescription>{status.dropped ? copy.feedback.sentWithoutScreenshot : copy.feedback.sentBody}</AlertDescription>
            </Alert>
            <div className="flex flex-wrap gap-2">
              {onOpenHelp ? (
                <Button type="button" onClick={onOpenHelp} data-testid="genesis-support-open-help">
                  {copy.feedback.openHelp}
                </Button>
              ) : null}
              <Button type="button" variant="outline" onClick={() => setStatus({ kind: "idle" })} data-testid="genesis-support-send-another">
                {copy.feedback.sendAnother}
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              <Label>{copy.feedback.typeLabel}</Label>
              <ToggleGroup type="single" className="flex-wrap justify-start" value={type} onValueChange={(v: string) => v && setType(v as FeedbackType)} aria-label={copy.feedback.typeLabel}>
                {FEEDBACK_TYPES.map((t) => (
                  <ToggleGroupItem key={t} value={t} data-testid={`genesis-support-type-${t}`}>
                    {copy.feedback.types[t]}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
            {about && keepAbout ? (
              <div className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm" data-testid="genesis-support-about">
                <span className="min-w-0 truncate">
                  <span className="text-muted-foreground">{copy.feedback.aboutLabel} </span>
                  {about.label}
                </span>
                <Button type="button" variant="ghost" size="sm" onClick={() => setKeepAbout(false)} data-testid="genesis-support-about-clear">
                  {copy.feedback.aboutClear}
                </Button>
              </div>
            ) : null}
            {type === "bug" ? (
              <div className="flex flex-col gap-2">
                <Label>{copy.feedback.severityLabel}</Label>
                <ToggleGroup type="single" className="flex-wrap justify-start" value={severity} onValueChange={(v: string) => setSeverity((v || "") as FindingSeverity | "")} aria-label={copy.feedback.severityLabel}>
                  {(["low", "medium", "high", "critical"] as const).map((level) => (
                    <ToggleGroupItem key={level} value={level} data-testid={`genesis-support-severity-${level}`}>
                      {copy.feedback.severities[level]}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </div>
            ) : null}
            <div className="flex flex-col gap-2">
              <Label htmlFor="genesis-support-message">{copy.feedback.messageLabel}</Label>
              <Textarea
                id="genesis-support-message"
                data-testid="genesis-support-message"
                value={message}
                maxLength={20000}
                rows={5}
                placeholder={copy.feedback.messagePlaceholder}
                onChange={(e) => {
                  setMessage(e.target.value);
                  // "Write a few words first." goes as soon as there are some.
                  if (status.kind === "error" && status.message === copy.feedback.messageRequired && e.target.value.trim())
                    setStatus({ kind: "idle" });
                }}
              />
            </div>
            {canShoot || pins ? (
              <div className="flex flex-wrap gap-2">
                {canShoot && !shot ? (
                  <Button type="button" variant="outline" size="sm" onClick={() => void takeScreenshot()} data-testid="genesis-support-capture">
                    {copy.feedback.screenshotLabel}
                  </Button>
                ) : null}
                {pins ? (
                  <Button type="button" variant="outline" size="sm" onClick={() => void placePin()} data-testid="genesis-support-pin">
                    {pin ? copy.feedback.pinned : copy.feedback.pin}
                  </Button>
                ) : null}
              </div>
            ) : null}
            {shotFailed && !shot ? (
              <p className="text-sm text-muted-foreground" role="status" data-testid="genesis-support-capture-failed">
                {copy.feedback.screenshotFailed}
              </p>
            ) : null}
            {pin ? (
              <div className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm" data-testid="genesis-support-pinned">
                <span className="min-w-0">{copy.feedback.pinnedHint}</span>
                <Button type="button" variant="ghost" size="sm" onClick={() => setPin(null)} data-testid="genesis-support-pin-remove">
                  {copy.feedback.removePin}
                </Button>
              </div>
            ) : null}
            {shot ? <ScreenshotEditor shot={shot} marks={marks} onMarks={setMarks} onRemove={() => setShot(null)} copy={copy} /> : null}
            {status.kind === "error" ? (
              <Alert variant="destructive" data-testid="genesis-support-error">
                <AlertDescription>{status.message}</AlertDescription>
              </Alert>
            ) : null}
            <Button type="button" onClick={() => void send()} disabled={status.kind === "sending"} data-testid="genesis-support-send">
              {status.kind === "sending" ? copy.feedback.sending : copy.feedback.send}
            </Button>
          </>
        )}
      </TabsContent>
      {client.myReports ? (
        <TabsContent value="mine">
          <MyReports load={client.myReports} copy={copy} refreshKey={status.kind === "sent" ? 1 : 0} />
        </TabsContent>
      ) : null}
    </Tabs>
  );
}

function MyReports({ load, copy, refreshKey }: { load: NonNullable<SupportClient["myReports"]>; copy: ReturnType<typeof resolveSupportCopy>; refreshKey: number }) {
  const [state, setState] = useState<{ kind: "loading" } | { kind: "error" } | { kind: "ok"; reports: SupportReport[] }>({ kind: "loading" });
  useEffect(() => {
    let alive = true;
    setState({ kind: "loading" });
    load()
      .then((reports) => alive && setState({ kind: "ok", reports }))
      .catch(() => alive && setState({ kind: "error" }));
    return () => {
      alive = false;
    };
  }, [load, refreshKey]);
  if (state.kind === "loading") return <p className="text-sm text-muted-foreground" data-testid="genesis-support-mine-loading">…</p>;
  if (state.kind === "error")
    return (
      <Alert variant="destructive" data-testid="genesis-support-mine-error">
        <AlertDescription>{copy.feedback.failedBody}</AlertDescription>
      </Alert>
    );
  if (!state.reports.length)
    return (
      <div data-testid="genesis-support-mine-empty" className="flex flex-col gap-1">
        <p className="font-medium">{copy.inbox.emptyTitle}</p>
        <p className="text-sm text-muted-foreground">{copy.inbox.emptyBody}</p>
      </div>
    );
  return (
    <ul className="flex flex-col divide-y" data-testid="genesis-support-mine">
      {state.reports.map((r) => (
        <li key={r.id} className="flex items-center justify-between gap-3 py-2">
          <span className="truncate">{r.title || r.message}</span>
          <span className="flex shrink-0 items-center gap-2">
            {r.unread ? <Badge>{copy.inbox.unread}</Badge> : null}
            <Badge variant="secondary">{copy.status[r.status]}</Badge>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** The box being dragged, while it is dragged. */
function DraftBox({ drag }: { drag: { start: { x: number; y: number }; points: Stroke } }) {
  const end = drag.points[drag.points.length - 1] ?? drag.start;
  const x = Math.min(drag.start.x, end.x);
  const y = Math.min(drag.start.y, end.y);
  return (
    <div
      className="pointer-events-none absolute border-2 border-dashed border-foreground bg-foreground/60"
      style={{ left: `${x * 100}%`, top: `${y * 100}%`, width: `${Math.abs(end.x - drag.start.x) * 100}%`, height: `${Math.abs(end.y - drag.start.y) * 100}%` }}
    />
  );
}

/** Pen strokes and hidden areas, in fractions of the image. */
export interface Marks {
  strokes: Stroke[];
  redactions: Redaction[];
  /** The kinds in the order they were drawn, for Undo. */
  order?: Array<"stroke" | "redaction">;
}

/** Marks without the newest one (by `order`; without it, the last redaction, then the last stroke). */
export function undoMark(marks: Marks): Marks {
  const order = marks.order ?? [];
  const last = order[order.length - 1] ?? (marks.redactions.length ? "redaction" : "stroke");
  const rest = order.slice(0, -1);
  return last === "redaction"
    ? { ...marks, redactions: marks.redactions.slice(0, -1), order: rest }
    : { ...marks, strokes: marks.strokes.slice(0, -1), order: rest };
}

/** The captured tab, with pen strokes and hidden (solid) areas shown over it; drawn into the image at Send. */
function ScreenshotEditor({
  shot,
  marks,
  onMarks,
  onRemove,
  copy,
}: {
  shot: WebCapture;
  marks: Marks;
  onMarks: (next: Marks) => void;
  onRemove: () => void;
  copy: ReturnType<typeof resolveSupportCopy>;
}) {
  const [tool, setTool] = useState<"pen" | "hide">("pen");
  const [drag, setDrag] = useState<{ start: { x: number; y: number }; points: Stroke } | null>(null);
  const point = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  };
  const finish = (end: { x: number; y: number }) => {
    if (!drag) return;
    setDrag(null);
    const order = marks.order ?? [];
    if (tool === "pen") onMarks({ ...marks, strokes: [...marks.strokes, [...drag.points, end]], order: [...order, "stroke"] });
    else
      onMarks({
        ...marks,
        order: [...order, "redaction"],
        redactions: [...marks.redactions, { x: Math.min(drag.start.x, end.x), y: Math.min(drag.start.y, end.y), width: Math.abs(end.x - drag.start.x), height: Math.abs(end.y - drag.start.y) }],
      });
  };
  const pct = (n: number) => `${n * 100}%`;
  const strokes = drag && tool === "pen" ? [...marks.strokes, drag.points] : marks.strokes;
  return (
    <div className="flex flex-col gap-2" data-testid="genesis-support-screenshot">
      <div className="flex items-center justify-between gap-2">
        <Label>{copy.feedback.screenshotLabel}</Label>
        <div className="flex gap-2">
          <ToggleGroup type="single" size="sm" value={tool} onValueChange={(v: string) => v && setTool(v as "pen" | "hide")}>
            <ToggleGroupItem value="pen">{copy.annotate.pen}</ToggleGroupItem>
            <ToggleGroupItem value="hide">{copy.annotate.hide}</ToggleGroupItem>
          </ToggleGroup>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={!marks.strokes.length && !marks.redactions.length}
            onClick={() => onMarks(undoMark(marks))}
            data-testid="genesis-support-undo"
          >
            {copy.annotate.undo}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onRemove} data-testid="genesis-support-remove-screenshot">
            {copy.feedback.removeScreenshot}
          </Button>
        </div>
      </div>
      <div
        className="relative cursor-crosshair touch-none overflow-hidden rounded-md border"
        data-testid="genesis-support-screenshot-surface"
        onPointerDown={(e) => {
          // Keep the gesture when the pointer leaves the image, so a release outside still ends it.
          e.currentTarget.setPointerCapture?.(e.pointerId);
          const p = point(e);
          setDrag({ start: p, points: [p] });
        }}
        onPointerCancel={() => setDrag(null)}
        onPointerMove={(e) => drag && setDrag({ ...drag, points: tool === "pen" ? [...drag.points, point(e)] : [drag.start, point(e)] })}
        onPointerUp={(e) => finish(point(e))}
      >
        <img src={shot.dataUrl} alt={copy.feedback.screenshotLabel} className="block w-full select-none" draggable={false} />
        <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden>
          {strokes.map((stroke, i) => (
            <polyline
              key={i}
              points={stroke.map((p) => `${p.x},${p.y}`).join(" ")}
              fill="none"
              stroke="hsl(var(--destructive))"
              strokeWidth={0.006}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
        </svg>
        {drag && tool === "hide" ? <DraftBox drag={drag} /> : null}
        {marks.redactions.map((r, i) => (
          <div
            key={i}
            data-testid={`genesis-support-redaction-${i}`}
            className="pointer-events-none absolute bg-foreground"
            style={{ left: pct(r.x), top: pct(r.y), width: pct(r.width), height: pct(r.height) }}
          />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{copy.feedback.screenshotHint}</p>
    </div>
  );
}
