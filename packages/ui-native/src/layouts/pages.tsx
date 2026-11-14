/**
 * The phone's page layouts that match genesis-ui's: DashboardPage, DetailPage, DocumentPage and
 * FormPage, with the same names and props (`title`, `subtitle`, `actions`, `stats`, `sidebar`,
 * `cover`, `icon`, `errors`…). Each is a ScreenContainer (safe areas, theme background, pull to
 * refresh, a loading state) with the page's title block and body, so a screen passes content and
 * never draws the chrome.
 *
 * On a phone the stack header usually shows the screen's title too: pass `hideTitle` to leave
 * the in-page title out, or give the stack the same title with `composeHeaderOptions`.
 *
 * @stability Beta
 */
import type { ReactNode } from "react";
import { Keyboard, KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { flattenChildren } from "../components/flatten-children";
import { NativeImage } from "../components/image";
import { NativeInlineAlert } from "../components/inline-alert";
import { cn } from "../utils";
import { KEYBOARD_TOOLBAR_HEIGHT, useKeyboardScroll, useKeyboardSticky, useKeyboardToolbar } from "./keyboard";
import { ScreenContainer, type ScreenContainerProps } from "./screen-container";

type ContainerProps = Pick<ScreenContainerProps, "onRefresh" | "refreshing" | "loading" | "loadingLabel" | "safeAreaEdges" | "className" | "contentClassName">;

interface PageTitleProps {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  /** Leave the in-page title out (the stack header shows it). */
  hideTitle?: boolean;
  testID?: string;
}

const text = (node: ReactNode, className: string, header = false) =>
  typeof node === "string" || typeof node === "number" ? (
    <Text className={className} accessibilityRole={header ? "header" : undefined}>
      {node}
    </Text>
  ) : (
    node
  );

/** The title block every page shares: a title, a line under it, and the page's actions. */
function PageTitle({ title, subtitle, actions, hideTitle, testID, size = "page", above }: PageTitleProps & { size?: "page" | "document"; above?: ReactNode }) {
  if (hideTitle && !actions && !above) return null;
  return (
    <View testID={`${testID}-header`} className="gap-2">
      {above}
      {hideTitle ? null : (
        <View className="gap-1">
          {text(title, size === "document" ? "text-3xl font-bold text-foreground" : "text-2xl font-bold text-foreground", true)}
          {subtitle ? text(subtitle, "text-sm text-muted-foreground") : null}
        </View>
      )}
      {actions ? <View className="flex-row flex-wrap items-center gap-2">{actions}</View> : null}
    </View>
  );
}

export interface DashboardPageProps extends PageTitleProps, ContainerProps {
  /** Stat tiles (NativeStatCard), two to a row. */
  stats?: ReactNode;
  /** Tiles per row. Default 2. */
  statColumns?: 1 | 2 | 3;
  children?: ReactNode;
}

export function DashboardPage({ title, subtitle, actions, hideTitle, stats, statColumns = 2, children, testID = "dashboard-page", ...container }: DashboardPageProps) {
  const tiles = flattenChildren(stats);
  const basis = statColumns === 1 ? "w-full" : statColumns === 3 ? "min-w-[30%]" : "min-w-[45%]";
  return (
    <ScreenContainer {...container} scroll testID={testID} contentClassName={cn("gap-6 p-4", container.contentClassName)}>
      <PageTitle title={title} subtitle={subtitle} actions={actions} hideTitle={hideTitle} testID={testID} />
      {tiles.length ? (
        <View testID={`${testID}-stats`} className="flex-row flex-wrap gap-3">
          {tiles.map((tile, i) => (
            <View key={i} className={cn("flex-1", basis)}>
              {tile}
            </View>
          ))}
        </View>
      ) : null}
      <View testID={`${testID}-body`} className="gap-8">
        {children}
      </View>
    </ScreenContainer>
  );
}

export interface DetailPageProps extends PageTitleProps, ContainerProps {
  /** Above the title (a parent's name). */
  breadcrumb?: ReactNode;
  /** The web's side column; on a phone it follows the content. */
  sidebar?: ReactNode;
  children?: ReactNode;
}

export function DetailPage({ title, subtitle, actions, hideTitle, breadcrumb, sidebar, children, testID = "detail-page", ...container }: DetailPageProps) {
  return (
    <ScreenContainer {...container} scroll testID={testID} contentClassName={cn("gap-6 p-4", container.contentClassName)}>
      <PageTitle
        title={title}
        subtitle={subtitle}
        actions={actions}
        hideTitle={hideTitle}
        testID={testID}
        above={breadcrumb ? text(breadcrumb, "text-sm text-muted-foreground") : undefined}
      />
      <View testID={`${testID}-content`}>{children}</View>
      {sidebar ? (
        <View testID={`${testID}-sidebar`} className="gap-4 border-t border-border pt-4">
          {sidebar}
        </View>
      ) : null}
    </ScreenContainer>
  );
}

export interface DocumentPageProps extends PageTitleProps, ContainerProps {
  /** An emoji, an image or an icon over the title. */
  icon?: ReactNode;
  /** A banner across the top: an image URL, or your own node. */
  cover?: string | ReactNode;
  /** `reading` (default) keeps a reading column on a tablet; `full` uses the width. */
  width?: "reading" | "full";
  children?: ReactNode;
}

export function DocumentPage({ title, subtitle, actions, hideTitle, icon, cover, width = "reading", children, testID = "document-page", ...container }: DocumentPageProps) {
  const hasCover = cover != null && cover !== false;
  return (
    <ScreenContainer {...container} scroll testID={testID} contentClassName={cn("pb-8", container.contentClassName)}>
      {hasCover ? (
        <View testID={`${testID}-cover`} className="h-40 w-full overflow-hidden bg-muted">
          {typeof cover === "string" ? <NativeImage src={cover} className="h-full w-full" /> : cover}
        </View>
      ) : null}
      <View className={cn("w-full gap-6 px-4", width === "reading" && "max-w-[680px] self-center", hasCover ? "pt-0" : "pt-4")}>
        <PageTitle
          title={title}
          subtitle={subtitle}
          actions={actions}
          hideTitle={hideTitle}
          testID={testID}
          size="document"
          above={
            icon != null ? (
              <View testID={`${testID}-icon`} className={cn("h-16 w-16 items-center justify-center", hasCover && "-mt-8")} accessibilityElementsHidden={typeof icon === "string"}>
                {typeof icon === "string" ? <Text className="text-5xl">{icon}</Text> : icon}
              </View>
            ) : undefined
          }
        />
        <View testID={`${testID}-body`}>{children}</View>
      </View>
    </ScreenContainer>
  );
}

export interface FormPageProps extends ContainerProps {
  title: ReactNode;
  description?: ReactNode;
  /** A summary of what to fix, over the fields. */
  errors?: ReactNode;
  /**
   * The Save / Cancel row. It stays above the keyboard: through the app's keyboard-aware scroll
   * view and `KeyboardStickyView` when it gave them (`KeyboardScrollProvider`), else in a
   * KeyboardAvoidingView. With a keyboard-aware scroll view but no sticky view, it ends the form.
   * A touch on it dismisses the keyboard first, so the focused field commits what's typed before
   * the button's press runs.
   */
  actions?: ReactNode;
  hideTitle?: boolean;
  children?: ReactNode;
  testID?: string;
}

const dismissKeyboard = () => {
  Keyboard.dismiss();
  return false;
};

/** FormPage's action bar: a row of buttons with its padding, kept clear of the focused field. */
const FORM_ACTIONS_HEIGHT = 64;

export function FormPage({ title, description, errors, actions, hideTitle, children, testID = "form-page", onRefresh: _onRefresh, refreshing: _refreshing, ...container }: FormPageProps) {
  // The package's keyboard handling, as AuthScreen and SettingsSubPage use it.
  const KeyboardScroll = useKeyboardScroll();
  const KeyboardToolbar = useKeyboardToolbar();
  const Sticky = useKeyboardSticky();
  const insets = useSafeAreaInsets();
  // The padding is the form's own: ScreenContainer's body gets none, so it isn't doubled.
  const { contentClassName, ...outer } = container;
  const form = (
    <>
      <PageTitle title={title} subtitle={description} hideTitle={hideTitle} testID={testID} />
      {errors ? (
        <NativeInlineAlert variant="destructive" testID={`${testID}-errors`}>
          {text(errors, "text-sm text-foreground")}
        </NativeInlineAlert>
      ) : null}
      <View testID={`${testID}-fields`} className="gap-6">
        {children}
      </View>
    </>
  );
  const bar = (inFlow: boolean) =>
    actions ? (
      <View
        testID={`${testID}-actions`}
        // A touch on Save or Cancel first dismisses the keyboard, so the focused field ends its edit
        // (a NativeNumberInput commits what's typed) before the press runs. The scroll keeps taps
        // ("handled"), which otherwise leaves the field focused. Returning false lets the button
        // take the touch.
        onStartShouldSetResponderCapture={dismissKeyboard}
        className={cn("flex-row flex-wrap items-center justify-end gap-2", !inFlow && "border-t border-border bg-background px-4 py-3")}
      >
        {actions}
      </View>
    ) : null;

  if (KeyboardScroll) {
    const toolbar = KeyboardToolbar ? KEYBOARD_TOOLBAR_HEIGHT : 0;
    const sticky = Boolean(Sticky && actions);
    return (
      <ScreenContainer testID={testID} {...outer}>
        <KeyboardScroll
          testID={`${testID}-scroll`}
          keyboardShouldPersistTaps="handled"
          contentInsetAdjustmentBehavior="automatic"
          bottomOffset={24 + toolbar + (sticky ? FORM_ACTIONS_HEIGHT : 0)}
        >
          <View className={cn("gap-6 p-4", contentClassName)}>
            {form}
            {sticky ? null : bar(true)}
          </View>
        </KeyboardScroll>
        {sticky && Sticky ? (
          // Open, the bar meets the keyboard (or its toolbar) rather than floating the home indicator's height above it.
          <Sticky offset={{ closed: 0, opened: insets.bottom - toolbar }}>{bar(false)}</Sticky>
        ) : null}
        {KeyboardToolbar ? <KeyboardToolbar /> : null}
      </ScreenContainer>
    );
  }
  return (
    <KeyboardAvoidingView testID={`${testID}-kav`} style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScreenContainer testID={testID} {...outer}>
        <ScrollView
          testID={`${testID}-scroll`}
          className="flex-1"
          contentContainerClassName={cn("gap-6 p-4", contentClassName)}
          keyboardShouldPersistTaps="handled"
          contentInsetAdjustmentBehavior="automatic"
        >
          {form}
        </ScrollView>
        {bar(false)}
      </ScreenContainer>
    </KeyboardAvoidingView>
  );
}
