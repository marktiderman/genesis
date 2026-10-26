/**
 * @feat:chat
 * Videos on their way, above the composer: how far each upload has got, and, when one
 * fails, why, with Retry (it resumes where it stopped) and Cancel. Once a video's bytes are
 * all there, its message joins the outbox and shows in the thread like any other.
 */
import { Pressable, View } from "react-native";
import { NativeIcon, NativeProgress, NativeText } from "@marktiderman/genesis-ui-native/components";
import { useThemeRoles } from "@marktiderman/genesis-ui-native/hooks";
import { fill } from "./copy";
import { useChatNative } from "./context";
import { useVideoUploads, videoUploads as defaultUploads, type VideoUploads } from "./video-upload";

export interface VideoUploadTrayProps {
  conversationId: string;
  uploads?: VideoUploads;
  testID?: string;
}

export function VideoUploadTray({ conversationId, uploads = defaultUploads, testID = "chat-video-uploads" }: VideoUploadTrayProps) {
  const { copy } = useChatNative();
  const colors = useThemeRoles();
  const tasks = useVideoUploads(conversationId, uploads);
  if (!tasks.length) return null;
  return (
    <View testID={testID} style={{ paddingHorizontal: 12, paddingTop: 6, gap: 6, backgroundColor: colors.groupedBackground }}>
      {tasks.map((t) => {
        const percent = Math.round(t.progress * 100);
        const failed = t.status === "failed";
        return (
          <View key={t.id} testID={`${testID}-${t.id}`} style={{ flexDirection: "row", alignItems: "center", gap: 8, padding: 8, borderRadius: 12, backgroundColor: colors.surface }}>
            <NativeIcon name="video" size={20} color={failed ? colors.destructive : colors.tint} />
            <View style={{ flex: 1, gap: 4 }} accessible accessibilityLiveRegion="polite" accessibilityLabel={failed ? `${copy.videoUploadFailed} ${t.error ?? ""}`.trim() : fill(copy.videoUploading, { percent })}>
              <NativeText preset="caption" numberOfLines={2} style={{ color: failed ? colors.destructive : colors.label }}>
                {failed ? (t.error ? `${copy.videoUploadFailed} ${t.error}` : copy.videoUploadFailed) : fill(copy.videoUploading, { percent })}
              </NativeText>
              {failed ? null : <NativeProgress value={percent} testID={`${testID}-${t.id}-progress`} />}
            </View>
            {failed ? (
              <Pressable testID={`${testID}-${t.id}-retry`} accessibilityRole="button" accessibilityLabel={copy.retry} onPress={() => uploads.retry(t.id)} style={{ minHeight: 44, minWidth: 44, paddingHorizontal: 8, alignItems: "center", justifyContent: "center" }}>
                <NativeText preset="label" style={{ color: colors.tint }}>
                  {copy.retry}
                </NativeText>
              </Pressable>
            ) : null}
            <Pressable testID={`${testID}-${t.id}-cancel`} accessibilityRole="button" accessibilityLabel={copy.cancelUpload} onPress={() => uploads.cancel(t.id)} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
              <NativeIcon name="close" size={18} color={colors.secondaryLabel} />
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}
