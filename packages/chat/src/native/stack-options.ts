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
import type { ColorValue } from "react-native";
import { getThreadPageStackOptions, type ScreenHeaderProps } from "@marktiderman/genesis-ui-native/layouts";
import { useThemeRoles } from "@marktiderman/genesis-ui-native/hooks";

export type ChatThreadStackOptionsProps = ScreenHeaderProps & { headerTitle?: string };

/** The thread's header options with an opaque bar in `background` (the thread's own background). */
export function chatThreadStackOptions(props: ChatThreadStackOptionsProps, background: ColorValue): Record<string, unknown> {
  return getThreadPageStackOptions({
    ...props,
    // Large titles collapse into the content scroll view, which is the flipped list here.
    large: false,
    headerOptions: { headerTransparent: false, headerStyle: { backgroundColor: background }, ...props.headerOptions },
  });
}

/** `chatThreadStackOptions` in the theme's grouped background, the color `ChatThreadScreen` draws. */
export function useChatThreadStackOptions(props: ChatThreadStackOptionsProps): Record<string, unknown> {
  const colors = useThemeRoles();
  return chatThreadStackOptions(props, colors.groupedBackground);
}
