/**
 * @feat:chat
 * A link's preview under its message, from `useLinkPreviews`: the site, the title and the
 * description, all plain text the server fetched (Open Graph, never HTML). Tap to open: in an
 * in-app browser with `modules.webBrowser` (expo-web-browser), else the system's (`Linking`).
 * Only https links. The image shows only when the app turns on `linkPreviewImages`: fetching
 * a page's og:image from the phone tells that site the reader's address, so by default the
 * card has none and nothing is fetched.
 */
import { Linking, Pressable, View } from "react-native";
import { NativeImage, NativeText } from "@marktiderman/genesis-ui-native/components";
import { useThemeRoles } from "@marktiderman/genesis-ui-native/hooks";
import { extractLinks, isHttpsUrl } from "../core/extras";
import type { ChatLinkPreview, ChatMessage } from "../core/types";
import { fill } from "./copy";
import { useChatNative } from "./context";
import { ON_TINT_FILL } from "./media-colors";
import type { WebBrowserLike } from "./modules";

/** The site a link is on, without `www.`. */
export function linkHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** The preview a bubble shows: the first one the server fetched for a link in its text, https only. */
export function previewToShow(previews: readonly ChatLinkPreview[] | undefined): ChatLinkPreview | null {
  return previews?.find((p) => p.status === "ok" && isHttpsUrl(p.url)) ?? null;
}

/** The messages to ask previews for: shown (not deleted, not hidden by moderation), with a link. */
export function linkPreviewIds(messages: readonly ChatMessage[]): string[] {
  return messages.filter((m) => !m.deletedAt && m.moderation !== "hidden" && extractLinks(m.body).length > 0).map((m) => m.id);
}

/** Opens a link from chat: https only, in the in-app browser when there is one. */
export async function openChatLink(url: string, webBrowser?: WebBrowserLike): Promise<boolean> {
  if (!isHttpsUrl(url)) return false;
  try {
    if (webBrowser) await webBrowser.openBrowserAsync(url);
    else await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}

export interface ChatLinkPreviewCardProps {
  preview: ChatLinkPreview;
  /** On the tint bubble. */
  mine?: boolean;
  /** Show the og:image (`ChatProvider linkPreviewImages`). Off by default: it reveals the reader's address to the site. */
  images?: boolean;
  testID?: string;
}

export function ChatLinkPreviewCard({ preview, mine = false, images = false, testID = "chat-link-preview" }: ChatLinkPreviewCardProps) {
  const { copy, modules } = useChatNative();
  const colors = useThemeRoles();
  if (preview.status !== "ok" || !isHttpsUrl(preview.url)) return null;
  const host = linkHost(preview.url);
  const site = preview.siteName?.trim() || host;
  const title = preview.title?.trim() || host;
  const image = images && isHttpsUrl(preview.imageUrl) ? preview.imageUrl : null;
  const fg = mine ? "text-primary-foreground" : undefined;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="link"
      accessibilityLabel={fill(copy.linkPreview, { title, site })}
      accessibilityHint={copy.openLink}
      onPress={() => void openChatLink(preview.url, modules.webBrowser)}
      style={{
        marginTop: 2,
        borderLeftWidth: 3,
        borderLeftColor: mine ? colors.surface : colors.tint,
        borderRadius: 10,
        overflow: "hidden",
        backgroundColor: mine ? ON_TINT_FILL : colors.groupedBackground,
      }}
    >
      {image ? (
        <NativeImage testID={`${testID}-image`} src={image} width={240} height={126} contentFit="cover" />
      ) : null}
      <View style={{ paddingHorizontal: 10, paddingVertical: 8, gap: 2 }}>
        <NativeText preset="caption" numberOfLines={1} className={fg} style={mine ? { opacity: 0.8 } : { color: colors.secondaryLabel }}>
          {site}
        </NativeText>
        <NativeText numberOfLines={2} className={fg} style={mine ? { fontWeight: "600", fontSize: 15 } : { fontWeight: "600", fontSize: 15, color: colors.label }}>
          {title}
        </NativeText>
        {preview.description ? (
          <NativeText preset="caption" numberOfLines={2} className={fg} style={mine ? { opacity: 0.85 } : { color: colors.secondaryLabel }}>
            {preview.description}
          </NativeText>
        ) : null}
      </View>
    </Pressable>
  );
}
