// The resource workspace's components moved to genesis-ui
// (`@marktiderman/genesis-ui/resource`). These names stay here, deprecated, so existing
// imports keep working; where genesis-ui's default words are neutral ("Share your page"),
// the form's words are passed from here, so nothing a form shows changes.
import type { ComponentProps } from "react";
import {
  Chip as UiChip,
  FollowUpList as UiFollowUpList,
  HeadlineNumbers as UiHeadlineNumbers,
  ReadinessChip as UiReadinessChip,
  ResourceHeader as UiResourceHeader,
  ResourceSettingsPage as UiResourceSettingsPage,
  ResponsesToolbar as UiResponsesToolbar,
  SettingsSection as UiSettingsSection,
  ShareDialog as UiShareDialog,
  SummaryCard as UiSummaryCard,
  type FollowUpEntry as UiFollowUpEntry,
  type HeadlineNumber as UiHeadlineNumber,
  type ResourceHeaderProps as UiResourceHeaderProps,
  type ResourceSettingsSection,
  type ResponsesView as UiResponsesView,
} from "@marktiderman/genesis-ui/resource";
import { FORM_READINESS_LABELS } from "./moved-rules";

/** A form's Share dialog words: "Share your form", "Anyone with the link can answer." */
export const FORM_SHARE_LABELS = {
  noun: "form",
  description: "Anyone with the link can answer.",
} as const;

/** @deprecated import from @marktiderman/genesis-ui */
export type ResourceHeaderProps = UiResourceHeaderProps;
/** @deprecated import from @marktiderman/genesis-ui */
export type ResponsesView = UiResponsesView;
/** @deprecated import from @marktiderman/genesis-ui */
export type HeadlineNumber = UiHeadlineNumber;
/** @deprecated import from @marktiderman/genesis-ui */
export type FollowUpEntry = UiFollowUpEntry;
/** @deprecated import `ResourceSettingsSection` from @marktiderman/genesis-ui */
export type SettingsPageSection = ResourceSettingsSection;

/** @deprecated import from @marktiderman/genesis-ui */
export const ResourceHeader: typeof UiResourceHeader = UiResourceHeader;
/** @deprecated import from @marktiderman/genesis-ui */
export const Chip: typeof UiChip = UiChip;
/** @deprecated import from @marktiderman/genesis-ui */
export const ResponsesToolbar: typeof UiResponsesToolbar = UiResponsesToolbar;
/** @deprecated import from @marktiderman/genesis-ui */
export const HeadlineNumbers: typeof UiHeadlineNumbers = UiHeadlineNumbers;
/** @deprecated import from @marktiderman/genesis-ui */
export const SummaryCard: typeof UiSummaryCard = UiSummaryCard;
/** @deprecated import from @marktiderman/genesis-ui */
export const FollowUpList: typeof UiFollowUpList = UiFollowUpList;
/** @deprecated import from @marktiderman/genesis-ui */
export const SettingsSection: typeof UiSettingsSection = UiSettingsSection;
/** @deprecated import from @marktiderman/genesis-ui */
export const ResourceSettingsPage: typeof UiResourceSettingsPage = UiResourceSettingsPage;

/**
 * "Ready to publish", or how many problems to fix, in a form's words ("Add a question").
 * @deprecated import from @marktiderman/genesis-ui and pass `labels={FORM_READINESS_LABELS}`
 */
export function ReadinessChip({ labels, ...props }: ComponentProps<typeof UiReadinessChip>) {
  return <UiReadinessChip {...props} labels={{ ...FORM_READINESS_LABELS, ...labels }} />;
}

/**
 * Sharing a published form: "Share your form", "Anyone with the link can answer."
 * @deprecated import from @marktiderman/genesis-ui and pass `{...FORM_SHARE_LABELS}`
 */
export function ShareDialog({
  noun = FORM_SHARE_LABELS.noun,
  description = FORM_SHARE_LABELS.description,
  ...props
}: ComponentProps<typeof UiShareDialog>) {
  return <UiShareDialog {...props} noun={noun} description={description} />;
}
