/**
 * The form's styles, from the theme's roles. Sizes are minimums (`minHeight`), never fixed
 * heights around text, so every part grows with Dynamic Type and the system font size.
 */
import { useMemo } from "react";
import type { ImageStyle, TextStyle, ViewStyle } from "react-native";
import { useFormTheme, type FormTheme } from "./theme";

/** The smallest tap target, in points (Apple's 44, above WCAG 2.5.8's 24). */
export const MIN_TARGET = 44;

const v = (style: ViewStyle): ViewStyle => style;
const tx = (style: TextStyle): TextStyle => style;
const im = (style: ImageStyle): ImageStyle => style;

export function formStyles(t: FormTheme) {
  return {
    screen: v({ flex: 1, backgroundColor: t.background }),
    scrollContent: v({ flexGrow: 1, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 32 }),
    progressTrack: v({ height: 4, borderRadius: 2, backgroundColor: t.fill, overflow: "hidden" }),
    progressFill: v({ height: 4, borderRadius: 2, backgroundColor: t.tint }),
    progressText: tx({ marginTop: 6, fontSize: 13, color: t.secondaryLabel }),
    brandRow: v({ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 16 }),
    brandMark: v({ minWidth: 32, minHeight: 32, borderRadius: 8, backgroundColor: t.tint, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 }),
    brandInitials: tx({ fontSize: 12, fontWeight: "700", color: t.onTint }),
    brandName: tx({ flexShrink: 1, fontSize: 15, fontWeight: "600", color: t.label }),
    headerTitle: tx({ fontSize: 15, fontWeight: "500", color: t.secondaryLabel }),
    headerDescription: tx({ marginTop: 4, fontSize: 15, color: t.secondaryLabel }),
    headerNote: tx({ marginTop: 6, fontSize: 13, color: t.secondaryLabel }),
    header: v({ marginBottom: 20 }),
    step: v({ paddingTop: 8 }),
    question: tx({ fontSize: 24, lineHeight: 30, fontWeight: "600", color: t.label }),
    required: tx({ color: t.destructive }),
    description: tx({ marginTop: 8, fontSize: 17, lineHeight: 23, color: t.secondaryLabel }),
    answer: v({ marginTop: 24, gap: 10 }),
    error: tx({ marginTop: 14, fontSize: 15, lineHeight: 20, fontWeight: "500", color: t.destructive }),
    hint: tx({ fontSize: 15, color: t.secondaryLabel }),
    input: tx({
      minHeight: MIN_TARGET + 8,
      borderBottomWidth: 2,
      borderBottomColor: t.separator,
      paddingVertical: 8,
      fontSize: 22,
      color: t.label,
    }),
    inputFocused: tx({ borderBottomColor: t.tint }),
    inputInvalid: tx({ borderBottomColor: t.destructive }),
    multiline: tx({ minHeight: 120, textAlignVertical: "top" }),
    boxInput: tx({
      minHeight: MIN_TARGET,
      borderWidth: 1,
      borderColor: t.separator,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 17,
      color: t.label,
      backgroundColor: t.background,
    }),
    option: v({
      minHeight: MIN_TARGET + 8,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: t.separator,
      backgroundColor: t.surface,
    }),
    optionSelected: v({ borderColor: t.tint, backgroundColor: t.fill }),
    optionPressed: v({ opacity: 0.7 }),
    optionDisabled: v({ opacity: 0.5 }),
    optionText: v({ flex: 1, minWidth: 0 }),
    optionLabel: tx({ fontSize: 18, lineHeight: 24, color: t.label }),
    optionDescription: tx({ marginTop: 2, fontSize: 15, lineHeight: 20, color: t.secondaryLabel }),
    optionImage: im({ width: 48, height: 48, borderRadius: 8, backgroundColor: t.fill }),
    indicator: v({ width: 24, height: 24, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: t.tertiaryLabel }),
    indicatorRadio: v({ borderRadius: 12 }),
    indicatorBox: v({ borderRadius: 6 }),
    indicatorOn: v({ borderColor: t.tint, backgroundColor: t.tint }),
    indicatorDot: v({ width: 10, height: 10, borderRadius: 5, backgroundColor: t.onTint }),
    indicatorCheck: tx({ fontSize: 15, lineHeight: 18, fontWeight: "800", color: t.onTint }),
    scaleRow: v({ flexDirection: "row", flexWrap: "wrap", gap: 8 }),
    scaleItem: v({
      minWidth: MIN_TARGET + 4,
      minHeight: MIN_TARGET + 8,
      flexGrow: 1,
      flexBasis: MIN_TARGET + 4,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 10,
      borderWidth: 1.5,
      borderColor: t.separator,
      backgroundColor: t.surface,
      paddingHorizontal: 6,
    }),
    scaleItemSelected: v({ borderColor: t.tint, backgroundColor: t.tint }),
    scaleText: tx({ fontSize: 18, fontWeight: "600", color: t.label }),
    scaleTextSelected: tx({ color: t.onTint }),
    star: tx({ fontSize: 34, lineHeight: 40, color: t.tertiaryLabel }),
    starOn: tx({ color: t.tint }),
    endLabels: v({ flexDirection: "row", justifyContent: "space-between", gap: 16 }),
    endLabel: tx({ flexShrink: 1, fontSize: 14, color: t.secondaryLabel }),
    nav: v({ marginTop: 28, flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 12 }),
    button: v({
      minHeight: MIN_TARGET + 4,
      minWidth: 120,
      paddingHorizontal: 22,
      paddingVertical: 10,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: t.tint,
    }),
    buttonText: tx({ fontSize: 17, fontWeight: "600", color: t.onTint, textAlign: "center" }),
    buttonSecondary: v({ backgroundColor: t.fill }),
    buttonSecondaryText: tx({ color: t.label }),
    buttonPlain: v({ backgroundColor: "transparent", minWidth: 0, paddingHorizontal: 8 }),
    buttonPlainText: tx({ color: t.tint }),
    buttonDisabled: v({ opacity: 0.5 }),
    banner: v({ borderRadius: 12, padding: 14, gap: 6, backgroundColor: t.surface, borderWidth: 1, borderColor: t.separator }),
    bannerError: v({ borderColor: t.destructive }),
    bannerTitle: tx({ fontSize: 16, fontWeight: "600", color: t.label }),
    bannerTitleError: tx({ color: t.destructive }),
    bannerText: tx({ fontSize: 15, lineHeight: 20, color: t.label }),
    link: v({ minHeight: MIN_TARGET, justifyContent: "center" }),
    linkText: tx({ fontSize: 15, lineHeight: 20, color: t.tint, textDecorationLine: "underline" }),
    ending: v({ flexGrow: 1, alignItems: "center", justifyContent: "center", paddingVertical: 40, gap: 12 }),
    endingMark: v({ width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center", backgroundColor: t.fill }),
    endingCheck: tx({ fontSize: 30, fontWeight: "800", color: t.tint }),
    endingTitle: tx({ fontSize: 28, lineHeight: 34, fontWeight: "700", color: t.label, textAlign: "center" }),
    endingDescription: tx({ fontSize: 17, lineHeight: 24, color: t.secondaryLabel, textAlign: "center" }),
    content: v({ gap: 12 }),
    contentHeading: tx({ fontSize: 28, lineHeight: 34, fontWeight: "700", color: t.label }),
    contentText: tx({ fontSize: 19, lineHeight: 27, color: t.label }),
    callout: v({ borderRadius: 14, padding: 16, gap: 8, borderLeftWidth: 4, borderLeftColor: t.tint, backgroundColor: t.surface }),
    calloutWarning: v({ borderLeftColor: t.warning }),
    calloutSuccess: v({ borderLeftColor: t.success }),
    calculated: tx({ fontSize: 28, fontWeight: "600", color: t.label }),
    photoRow: v({ flexDirection: "row", flexWrap: "wrap", gap: 10 }),
    photoTile: v({ width: 96, height: 96, borderRadius: 10, overflow: "hidden", backgroundColor: t.fill, alignItems: "center", justifyContent: "center" }),
    photoImage: im({ width: 96, height: 96 }),
    photoName: tx({ fontSize: 12, color: t.secondaryLabel, padding: 4, textAlign: "center" }),
    photoRemove: v({ position: "absolute", top: 0, right: 0, minWidth: MIN_TARGET, minHeight: MIN_TARGET, alignItems: "flex-end", padding: 4 }),
    photoRemoveMark: tx({ width: 24, height: 24, borderRadius: 12, overflow: "hidden", textAlign: "center", lineHeight: 24, fontSize: 14, fontWeight: "700", color: t.label, backgroundColor: t.background }),
    accessory: v({ flexDirection: "row", justifyContent: "flex-end", paddingHorizontal: 8, borderTopWidth: 1, borderTopColor: t.separator, backgroundColor: t.surface }),
    loading: v({ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }),
  };
}

export type FormStyles = ReturnType<typeof formStyles>;

/** The styles for the current theme, made once per theme. */
export function useFormStyles(): FormStyles {
  const theme = useFormTheme();
  return useMemo(() => formStyles(theme), [theme]);
}
