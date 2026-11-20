/**
 * FeedbackForm: the feedback screen's content, for inside `SettingsSubPage`
 * (which keeps it above the keyboard). Type, message, and the screenshot the
 * shake (or `openFeedback`) captured: kept only if the person keeps it, after
 * they can mark it up and hide parts of it.
 *
 *   <SettingsSubPage testID="support-feedback"><FeedbackForm onSent={() => router.back()} /></SettingsSubPage>
 */
import { useEffect, useRef, useState } from "react";
import { Alert, Image, Modal } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import {
  Box,
  Inline,
  NativeButton,
  NativeInlineAlert,
  NativeLabel,
  NativeSegmentedControl,
  NativeSwitch,
  NativeText,
  NativeTextarea,
  Stack,
} from "@marktiderman/genesis-ui-native/components";
import { useThemeRoles } from "@marktiderman/genesis-ui-native/hooks";
import { SupportError } from "../client";
import { cleanRoute } from "../contract";
import { isUnderPath, stripZone } from "../routes";
import { FEEDBACK_TYPES, type FeedbackDelivery, type FeedbackRecord, type FeedbackType } from "../record";
import { DiagnosticsSendError } from "../diagnostics/queue";
import type { DiagnosticsDelivery } from "../diagnostics/create";
import { fill } from "../copy";
import { ScreenshotAnnotator } from "./annotator";
import { SUPPORT_QUERY_ROOT, useSupport, type PendingFeedback, type PendingScreenshot } from "./support";

export interface FeedbackFormProps {
  defaultType?: FeedbackType;
  /** After a report is saved (go back, say thanks). The form has already shown its own confirmation, unless `sentAlert` is false. */
  onSent?: (delivery: FeedbackDelivery & { diagnostics?: DiagnosticsDelivery | null; queued?: boolean }) => void;
  /** Confirm a sent report with an alert. Default true; false when `onSent` says so itself (a toast). */
  sentAlert?: boolean;
  testID?: string;
}

export function FeedbackForm({ defaultType = "bug", onSent, sentAlert = true, testID = "genesis-support-feedback" }: FeedbackFormProps) {
  const block = useSupport();
  const { copy } = block;
  const colors = useThemeRoles();
  const queryClient = useQueryClient();
  // What the shake (or openFeedback) left: taken once, so a second visit starts clean.
  const [origin] = useState<PendingFeedback | null>(() => block.peekPending());
  useEffect(() => {
    block.takePending();
  }, [block]);
  // The shake's dump goes with this report; left without one, it goes on its own.
  const [shakeDump] = useState(() => origin?.shakeDump ?? null);
  const claimed = useRef(false);
  useEffect(() => {
    if (!shakeDump) return;
    claimed.current = Boolean(block.options.diagnostics && block.options.dumpOnFeedback !== false && shakeDump.claim());
    if (!claimed.current) {
      shakeDump.sendAlone();
      return;
    }
    return () => {
      claimed.current = false;
      shakeDump.release();
    };
  }, [block, shakeDump]);
  const [type, setType] = useState<FeedbackType>(defaultType);
  const [message, setMessage] = useState("");
  const [screenshot, setScreenshot] = useState<PendingScreenshot | null>(origin?.screenshot ?? null);
  // Off until the person says so: a captured screen is never sent by default.
  const [include, setInclude] = useState(false);
  const [annotating, setAnnotating] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Where the person was when they asked for the form, never the form itself.
  const fromRoute = origin?.route && !isUnderPath(stripZone(origin.route, block.options.zones), block.paths.inbox) ? origin.route : undefined;
  // What it is about, as the web panel says it ("About: Billing"): the app's label, else the screen's path.
  const aboutLabel = origin?.about?.label?.trim() || cleanRoute(fromRoute ? stripZone(fromRoute, block.options.zones) : undefined) || null;
  const [keepAbout, setKeepAbout] = useState(true);
  const errorAttached = Boolean(origin?.extra && "error" in origin.extra);

  useEffect(() => setError(null), [message]);

  const send = async () => {
    if (!message.trim()) {
      setError(copy.feedback.messageRequired);
      return;
    }
    setSending(true);
    let withShake: typeof shakeDump = null;
    try {
      const context = await block.collector.collect();
      // "Not this": the person says it isn't about that screen, so neither its path nor its label goes.
      if (fromRoute && keepAbout) context.route = fromRoute;
      else delete context.route;
      if (origin?.extra) context.extra = { ...context.extra, ...origin.extra };
      if (origin?.about && keepAbout && aboutLabel) context.extra = { ...context.extra, ...origin.about.context, about_label: aboutLabel };
      const record: FeedbackRecord = {
        type,
        message: message.trim(),
        context,
        attachments: screenshot && include ? [{ kind: "screenshot", contentType: screenshot.contentType, base64: screenshot.uri, width: screenshot.width, height: screenshot.height }] : [],
      };
      const { diagnostics, dumpOnFeedback = true, feedbackSink } = block.options;
      const sink = feedbackSink ?? block.client;
      // With diagnostics, a dump goes with it (linked both ways): the shake's, if a shake opened
      // this, else one made now. A failed dump never fails the report.
      withShake = diagnostics && dumpOnFeedback && shakeDump && claimed.current ? shakeDump : null;
      // Held for this report from here: an unmount while it is sent doesn't send the dump alone too.
      withShake?.begin();
      const made = withShake ? await withShake.report() : null;
      const delivery: FeedbackDelivery & { diagnostics?: DiagnosticsDelivery | null; queued?: boolean } =
        diagnostics && dumpOnFeedback ? await diagnostics.submitFeedback(record, { sink, report: made }) : await sink.submit(record);
      if (withShake) {
        withShake.end(true);
        claimed.current = false;
      }
      void queryClient.invalidateQueries({ queryKey: [SUPPORT_QUERY_ROOT, "reports"] });
      setMessage("");
      setScreenshot(null);
      if (sentAlert) {
        const body = delivery.queued ? copy.feedback.queuedBody : delivery.attachmentsDropped ? copy.feedback.sentWithoutScreenshot : copy.feedback.sentBody;
        const reference = delivery.diagnostics ? `\n\n${fill(copy.diagnostics.feedbackReference, { id: delivery.diagnostics.shortId })}` : "";
        Alert.alert(copy.feedback.sentTitle, `${body}${reference}`);
      }
      onSent?.(delivery);
    } catch (e) {
      // Not sent: the dump is held again (or goes alone, once, if the screen has gone).
      withShake?.end(false);
      const err = e instanceof SupportError ? e : null;
      const rateLimited = err?.rateLimited || (e instanceof DiagnosticsSendError && e.status === 429);
      const forbidden = err?.code === "42501" || (e instanceof DiagnosticsSendError && e.status === 401);
      setError(rateLimited ? copy.feedback.rateLimited : forbidden ? copy.feedback.signInFirst : copy.feedback.failedBody);
    } finally {
      setSending(false);
    }
  };

  return (
    <Stack gap="lg" testID={testID}>
      {aboutLabel && keepAbout ? (
        <Inline gap="sm" justify="between" testID={`${testID}-about`}>
          <NativeText preset="body-sm" className="flex-1">
            <NativeText preset="body-sm" className="text-muted-foreground">{`${copy.feedback.aboutLabel} `}</NativeText>
            {aboutLabel}
          </NativeText>
          <NativeButton variant="ghost" size="sm" onPress={() => setKeepAbout(false)} testID={`${testID}-about-clear`}>
            {copy.feedback.aboutClear}
          </NativeButton>
        </Inline>
      ) : null}
      {errorAttached ? <NativeInlineAlert variant="info" description={copy.feedback.errorAttached} testID={`${testID}-error-attached`} /> : null}
      <Stack gap="sm">
        <NativeLabel>{copy.feedback.typeLabel}</NativeLabel>
        <NativeSegmentedControl
          testID={`${testID}-type`}
          options={FEEDBACK_TYPES.map((t) => ({ value: t, label: copy.feedback.types[t] }))}
          value={type}
          onChange={(v) => setType(v as FeedbackType)}
        />
      </Stack>
      <NativeTextarea
        testID={`${testID}-message`}
        label={copy.feedback.messageLabel}
        placeholder={copy.feedback.messagePlaceholder}
        value={message}
        onChangeText={setMessage}
        maxLength={20000}
        rows={6}
        error={error ?? undefined}
      />
      {screenshot ? (
        <Stack gap="sm" testID={`${testID}-screenshot`}>
          <NativeLabel>{copy.feedback.screenshotLabel}</NativeLabel>
          <Inline gap="md" align="start">
            <Image
              source={{ uri: screenshot.uri }}
              accessibilityLabel={copy.feedback.screenshotLabel}
              style={{ width: THUMB_WIDTH, height: Math.round((THUMB_WIDTH * screenshot.height) / Math.max(1, screenshot.width)), borderRadius: 8, backgroundColor: colors.fill }}
            />
            <Stack gap="sm" style={{ flex: 1 }}>
              <Inline gap="sm" justify="between">
                <NativeText preset="body" className="flex-1">
                  {copy.feedback.includeScreenshot}
                </NativeText>
                <NativeSwitch
                  testID={`${testID}-include-screenshot`}
                  accessibilityLabel={copy.feedback.includeScreenshot}
                  checked={include}
                  onCheckedChange={setInclude}
                />
              </Inline>
              <NativeText preset="body-sm" className="text-muted-foreground">
                {copy.feedback.screenshotHint}
              </NativeText>
              {block.options.viewShot ? (
                <NativeButton variant="outline" size="sm" onPress={() => setAnnotating(true)} testID={`${testID}-annotate`}>
                  {copy.feedback.annotate}
                </NativeButton>
              ) : null}
              <NativeButton
                variant="ghost"
                size="sm"
                onPress={() => {
                  setScreenshot(null);
                  setInclude(false);
                }}
                testID={`${testID}-remove-screenshot`}
              >
                {copy.feedback.removeScreenshot}
              </NativeButton>
            </Stack>
          </Inline>
        </Stack>
      ) : null}
      {/* Full screen, outside the page's scroll view: on iOS a scroll view takes a drag before the drawing can. */}
      {annotating && screenshot && block.options.viewShot ? (
        <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={() => {
            // Android back: like Cancel, never leave a screenshot included without the person's marks.
            setInclude(false);
            setAnnotating(false);
          }}>
          <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
            <Box p="lg" style={{ flex: 1, justifyContent: "center" }}>
              <ScreenshotAnnotator
                screenshot={screenshot}
                viewShot={block.options.viewShot}
                copy={copy.annotate}
                onCancel={(hadMarks) => {
                  // Marks left unsaved: the screenshot would go without the parts the person meant to hide.
                  if (hadMarks) setInclude(false);
                  setAnnotating(false);
                }}
                onDone={(next, marked) => {
                  setScreenshot(next);
                  if (marked) setInclude(true);
                  setAnnotating(false);
                }}
                testID={`${testID}-annotator`}
              />
            </Box>
          </SafeAreaView>
        </Modal>
      ) : null}
      <NativeButton onPress={() => void send()} loading={sending} disabled={sending} testID={`${testID}-send`}>
        {sending ? copy.feedback.sending : copy.feedback.send}
      </NativeButton>
    </Stack>
  );
}

/** The screenshot's thumbnail width, in points. */
const THUMB_WIDTH = 96;
