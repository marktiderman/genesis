/**
 * FeedbackForm: the feedback screen's content, for inside `SettingsSubPage`
 * (which keeps it above the keyboard). Type, message, and the screenshot the
 * shake (or `openFeedback`) captured: kept only if the person keeps it, after
 * they can mark it up and hide parts of it.
 *
 *   <SettingsSubPage testID="support-feedback"><FeedbackForm onSent={() => router.back()} /></SettingsSubPage>
 */
import { useEffect, useState } from "react";
import { Alert, Image, View } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { NativeButton, NativeLabel, NativeSegmentedControl, NativeText, NativeTextarea } from "@marktiderman/genesis-ui-native/components";
import { useThemeRoles } from "@marktiderman/genesis-ui-native/hooks";
import { SupportError } from "../client";
import { FEEDBACK_TYPES, type FeedbackDelivery, type FeedbackType } from "../record";
import { ScreenshotAnnotator } from "./annotator";
import { SUPPORT_QUERY_ROOT, useSupport, type PendingFeedback, type PendingScreenshot } from "./support";

export interface FeedbackFormProps {
  defaultType?: FeedbackType;
  /** After a report is saved (go back, say thanks). The form has already shown its own confirmation. */
  onSent?: (delivery: FeedbackDelivery) => void;
  testID?: string;
}

export function FeedbackForm({ defaultType = "bug", onSent, testID = "genesis-support-feedback" }: FeedbackFormProps) {
  const block = useSupport();
  const { copy } = block;
  const colors = useThemeRoles();
  const queryClient = useQueryClient();
  // What the shake (or openFeedback) left: taken once, so a second visit starts clean.
  const [origin] = useState<PendingFeedback | null>(() => block.peekPending());
  useEffect(() => {
    block.takePending();
  }, [block]);
  const [type, setType] = useState<FeedbackType>(defaultType);
  const [message, setMessage] = useState("");
  const [screenshot, setScreenshot] = useState<PendingScreenshot | null>(origin?.screenshot ?? null);
  const [annotating, setAnnotating] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setError(null), [message]);

  const send = async () => {
    if (!message.trim()) {
      setError(copy.feedback.messageRequired);
      return;
    }
    setSending(true);
    try {
      const context = await block.collector.collect();
      // Where the person was when they asked for the form, never the form itself.
      const route = origin?.route && !origin.route.startsWith(block.paths.inbox) ? origin.route : undefined;
      if (route) context.route = route;
      else delete context.route;
      const delivery = await block.client.submit({
        type,
        message: message.trim(),
        context,
        attachments: screenshot ? [{ kind: "screenshot", contentType: screenshot.contentType, base64: screenshot.uri, width: screenshot.width, height: screenshot.height }] : [],
      });
      void queryClient.invalidateQueries({ queryKey: [SUPPORT_QUERY_ROOT, "reports"] });
      setMessage("");
      setScreenshot(null);
      Alert.alert(copy.feedback.sentTitle, delivery.attachmentsDropped ? copy.feedback.sentWithoutScreenshot : copy.feedback.sentBody);
      onSent?.(delivery);
    } catch (e) {
      const err = e instanceof SupportError ? e : null;
      setError(err?.rateLimited ? copy.feedback.rateLimited : err?.code === "42501" ? copy.feedback.signInFirst : copy.feedback.failedBody);
    } finally {
      setSending(false);
    }
  };

  if (annotating && screenshot && block.options.viewShot) {
    return (
      <ScreenshotAnnotator
        screenshot={screenshot}
        viewShot={block.options.viewShot}
        copy={copy.annotate}
        onCancel={() => setAnnotating(false)}
        onDone={(next) => {
          setScreenshot(next);
          setAnnotating(false);
        }}
        testID={`${testID}-annotator`}
      />
    );
  }

  return (
    <View testID={testID} style={{ gap: 16 }}>
      <View style={{ gap: 8 }}>
        <NativeLabel>{copy.feedback.typeLabel}</NativeLabel>
        <NativeSegmentedControl
          testID={`${testID}-type`}
          options={FEEDBACK_TYPES.map((t) => ({ value: t, label: copy.feedback.types[t] }))}
          value={type}
          onChange={(v) => setType(v as FeedbackType)}
        />
      </View>
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
        <View testID={`${testID}-screenshot`} style={{ gap: 8 }}>
          <NativeLabel>{copy.feedback.screenshotLabel}</NativeLabel>
          <View style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
            <Image
              source={{ uri: screenshot.uri }}
              accessibilityLabel={copy.feedback.screenshotLabel}
              style={{ width: 96, height: Math.round((96 * screenshot.height) / Math.max(1, screenshot.width)), borderRadius: 8, backgroundColor: colors.fill }}
            />
            <View style={{ flex: 1, gap: 8 }}>
              <NativeText style={{ color: colors.secondaryLabel, fontSize: 13, lineHeight: 18 }}>{copy.feedback.screenshotHint}</NativeText>
              {block.options.viewShot ? (
                <NativeButton variant="outline" size="sm" onPress={() => setAnnotating(true)} testID={`${testID}-annotate`}>
                  {copy.feedback.annotate}
                </NativeButton>
              ) : null}
              <NativeButton variant="ghost" size="sm" onPress={() => setScreenshot(null)} testID={`${testID}-remove-screenshot`}>
                {copy.feedback.removeScreenshot}
              </NativeButton>
            </View>
          </View>
        </View>
      ) : null}
      <NativeButton onPress={() => void send()} loading={sending} disabled={sending} testID={`${testID}-send`}>
        {sending ? copy.feedback.sending : copy.feedback.send}
      </NativeButton>
    </View>
  );
}
