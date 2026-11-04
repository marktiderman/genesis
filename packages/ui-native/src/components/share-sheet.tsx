/**
 * ShareSheet — sharing one published page (a form, a course, a worksheet) from the phone: its
 * link with Copy and the system share sheet, and a QR code to show someone across the desk.
 * The twin of genesis-ui's `ShareDialog`: the host passes the link and how to draw a QR code
 * (`renderQr`, the same approach as the web; Genesis bundles no QR library), so nothing native
 * is added. Copy goes through `onCopy` (pass expo-clipboard's `setStringAsync`); without it,
 * Copy opens the system share sheet, which has Copy.
 *
 * @stability Beta
 */
import { useEffect, useState, type ReactNode } from "react";
import { Platform, Share, Text, View } from "react-native";
import { NativeButton, buttonTextVariants } from "./button";
import { NativeIcon } from "./icon";
import { NativeSheet } from "./sheet";
import { NativeText } from "./text";

export interface NativeShareSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** What it is, in the default title and buttons: "page" (default), "form", "course". */
  noun?: string;
  /** Default "Share your {noun}". */
  title?: string;
  /** Default "Anyone with the link can open it." */
  description?: ReactNode;
  /** The public link; null while it is still loading. */
  url: string | null;
  /** Its name, sent with the link to the system share sheet. */
  name?: string;
  /** Draws a QR code for a link. None hides the QR code. */
  renderQr?: (url: string) => ReactNode;
  /** Copies text (expo-clipboard's `setStringAsync`). Default: the system share sheet. */
  onCopy?: (text: string) => void | Promise<void>;
  testID?: string;
}

function IconButton({ icon, label, onPress, variant, testID }: { icon: "copy" | "share"; label: string; onPress: () => void; variant: "default" | "outline"; testID: string }) {
  return (
    <NativeButton variant={variant} onPress={onPress} testID={testID} accessibilityLabel={label} className="flex-1">
      <NativeIcon name={icon} size={16} />
      <Text className={buttonTextVariants({ variant, size: "md" })}>{label}</Text>
    </NativeButton>
  );
}

export function NativeShareSheet({
  open,
  onOpenChange,
  noun = "page",
  title = `Share your ${noun}`,
  description = "Anyone with the link can open it.",
  url,
  name,
  renderQr,
  onCopy,
  testID = "native-share-sheet",
}: NativeShareSheetProps) {
  const [copied, setCopied] = useState(false);
  // A new link hasn't been copied yet.
  useEffect(() => setCopied(false), [url]);
  // iOS sends `message` and `url` both (Messages and Mail would show the link twice) and
  // Android reads only `message`: send the link once, in the field each platform uses.
  const share = (link: string) => {
    const content = Platform.OS === "ios" ? { url: link } : { message: link };
    void Share.share(name ? { ...content, title: name } : content).catch(() => undefined);
  };
  const copy = (link: string) => {
    if (!onCopy) return share(link);
    // onCopy runs inside the executor, so a synchronous throw also falls back to the share sheet.
    void new Promise<void>((resolve) => resolve(onCopy(link))).then(
      () => setCopied(true),
      () => share(link),
    );
  };
  return (
    <NativeSheet
      open={open}
      onOpenChange={(next) => {
        if (!next) setCopied(false);
        onOpenChange(next);
      }}
      fitContent
      testID={testID}
    >
      <View className="gap-4 p-6">
        <View className="gap-1">
          <NativeText preset="h3" accessibilityRole="header">
            {title}
          </NativeText>
          {typeof description === "string" ? (
            <NativeText preset="body-sm" className="text-muted-foreground">
              {description}
            </NativeText>
          ) : (
            description
          )}
        </View>
        {!url ? (
          <NativeText preset="body-sm" className="text-muted-foreground" testID={`${testID}-loading`}>
            Loading the link…
          </NativeText>
        ) : (
          <>
            {renderQr ? (
              <View className="items-center gap-2" testID={`${testID}-qr`}>
                <View className="w-56 max-w-full">{renderQr(url)}</View>
                <NativeText preset="caption" className="text-center text-muted-foreground">
                  Scan with a phone's camera to open the {noun}.
                </NativeText>
              </View>
            ) : null}
            <View className="rounded-md border border-border bg-muted px-3 py-2">
              <Text selectable numberOfLines={2} className="text-sm text-foreground" testID={`${testID}-url`}>
                {url}
              </Text>
            </View>
            <View className="flex-row gap-2">
              <IconButton icon="copy" label={copied ? "Copied" : "Copy link"} onPress={() => copy(url)} variant="outline" testID={`${testID}-copy`} />
              <IconButton icon="share" label="Share" onPress={() => share(url)} variant="default" testID={`${testID}-share`} />
            </View>
          </>
        )}
      </View>
    </NativeSheet>
  );
}
