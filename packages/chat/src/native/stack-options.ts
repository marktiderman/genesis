/**
 * @feat:chat
 * `<Stack.Screen options>` for a screen that renders `ChatThreadScreen`.
 *
 * The bar is opaque. It was made so while the thread was an inverted list
 * (`transform: scaleY(-1)` on the scroll view), which it no longer is; it
 * stays opaque until a see-through bar is checked over the upright list. On
 * iOS 26 and later the navigation bar is see-through and draws a scroll
 * edge effect over the content scroll view under it; UIKit lays that effect
 * out in the flipped scroll view's own coordinates, so once the thread is
 * long enough to reach the bar the whole list renders blurred. An opaque bar
 * keeps the screen's content below it: nothing scrolls under the bar, and no
 * edge effect is drawn over the flipped list. Seen on iOS 27 with FlashList
 * and with FlatList.
 */
import { createElement, type ReactNode } from "react";
import type { ColorValue } from "react-native";
import { getThreadPageStackOptions, type ScreenHeaderProps } from "@marktiderman/genesis-ui-native/layouts";
import { ChatThreadTitle, type ChatThreadTitleAvatar } from "./thread-title";
import { useChatColors } from "./messages-look";

export type ChatThreadStackOptionsProps = ScreenHeaderProps & {
  headerTitle?: string;
  /** Beside the title: who it is (`{ src, name, id }`), or your own element. */
  avatar?: ChatThreadTitleAvatar | ReactNode;
  /**
   * Under the title. Left out with `conversationId`: the away line ("Sam is away until Monday"),
   * which needs `ChatProvider` above the navigator. `null`: none. Show it here, and pass
   * `availability={false}` to `ChatThreadScreen` so it isn't said twice.
   */
  subtitle?: string | null;
  /** Makes the title a button (to the conversation's details). */
  onPressTitle?: () => void;
  /** VoiceOver's hint on that button. */
  titleHint?: string;
  /** For the default subtitle. */
  conversationId?: string;
  /** `"stacked"` (default): Messages' face over the name pill. `"inline"`: the picture beside the name. */
  titleLayout?: "stacked" | "inline";
  /** The stacked face's size (default 30, which fits the bar). */
  faceSize?: number;
};

/** The thread's header options with an opaque bar in `background` (the thread's own background). */
export function chatThreadStackOptions(props: ChatThreadStackOptionsProps, background: ColorValue): Record<string, unknown> {
  const { avatar, subtitle, onPressTitle, titleHint, conversationId, titleLayout, faceSize, ...header } = props;
  // A title of its own only when asked for: otherwise the bar's plain title, as before.
  const custom = avatar !== undefined || subtitle !== undefined || onPressTitle !== undefined || conversationId !== undefined;
  const title = header.headerTitle ?? "Conversation";
  return getThreadPageStackOptions({
    ...header,
    // Large titles collapse into the content scroll view, which is the flipped list here.
    large: false,
    headerOptions: {
      headerTransparent: false,
      headerStyle: { backgroundColor: background },
      headerShadowVisible: false,
      // The chevron alone, as Messages' back button.
      headerBackButtonDisplayMode: "minimal",
      ...(custom
        ? {
            headerTitle: ({ tintColor }: { tintColor?: string }) =>
              createElement(ChatThreadTitle, { title, subtitle, avatar, onPress: onPressTitle, pressHint: titleHint, conversationId, tintColor, layout: titleLayout, faceSize }),
          }
        : {}),
      ...props.headerOptions,
    },
  });
}

/**
 * `chatThreadStackOptions` on the chat role `pageSolid`: the page as a plain string for the scheme,
 * since the native header takes no PlatformColor for its background. It follows a scheme change.
 */
export function useChatThreadStackOptions(props: ChatThreadStackOptionsProps): Record<string, unknown> {
  const c = useChatColors();
  return chatThreadStackOptions(props, String(c.roles.pageSolid));
}
