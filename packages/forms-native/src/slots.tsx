/**
 * The parts of `<FormFocus>`, with the web kit's slot names: `header`, `brand`, `progress`,
 * `navigation`, `ending` and `errorSummary`, plus native's `notice` (a draft put back, answers
 * saving) and `status` (where a queued submission stands). Replace one with `slots`, feed one with
 * `slotProps`, drop one with `null`.
 */
import type { ComponentRef, ComponentType, ReactNode, Ref } from "react";
import { Pressable, Text, View } from "react-native";
import type { SubmissionStatus } from "./seams";
import { Button } from "./parts";
import { useFormStyles } from "./styles";

export interface HeaderSlotProps {
  title: string;
  /** Draw the title here too: true when the host gave no `screen` for the platform header. */
  showTitle: boolean;
  description?: string | undefined;
  /** "Required", drawn as "* Required", when the form has a required question. */
  requiredNote?: string | undefined;
}

export interface BrandSlotProps {
  name: string;
  /** Your own element (decorative: the name is the text). Without one, the name's initials are shown. */
  logo?: ReactNode;
}

export interface ProgressSlotProps {
  /** The step's number (from 1) on the respondent's path, and the path's length. */
  step: number;
  total: number;
}

export interface NavigationSlotProps {
  canGoBack: boolean;
  isLast: boolean;
  /** True while sending. */
  busy: boolean;
  /** True after sending failed; pressing the main button again resends. */
  failed: boolean;
  onBack(): void;
  /** Next, or Send on the last step. */
  onNext(): void;
  nextLabel: string;
  submitLabel: string;
  retryLabel: string;
  backLabel: string;
  /** Attach to the main button: focus goes back to it after a failed send. */
  submitRef: Ref<ComponentRef<typeof View>>;
}

export interface EndingSlotProps {
  title: string;
  description?: string | undefined;
  /** Buttons under the ending ("Done", "Send another"): pass them through `slotProps.ending`. */
  actions?: ReactNode;
  /** Attach to the title: screen readers move to it when the ending appears. */
  focusRef(node: unknown): void;
}

export interface ErrorSummaryItem {
  id: string;
  label: string;
  message: string;
}

export interface ErrorSummarySlotProps {
  count: number;
  errors: ErrorSummaryItem[];
  /** Go back to that question. */
  onSelect(id: string): void;
  /** Attach to the summary's title: screen readers move to it when it appears. */
  focusRef(node: unknown): void;
}

export interface NoticeSlotProps {
  /**
   * `restored`: a saved draft was put back. `discarded`: one was found but no longer fits the form.
   * `draftError`: the draft couldn't be read. `saving`: answers save as they go.
   */
  kind: "restored" | "discarded" | "draftError" | "saving";
  message: string;
}

export interface StatusSlotProps {
  status: SubmissionStatus;
  message: string;
  /** Try a failed submission again, when the outbox can. */
  onRetry?: (() => void) | undefined;
}

export interface FormSlotMap {
  header: HeaderSlotProps;
  brand: BrandSlotProps;
  progress: ProgressSlotProps;
  navigation: NavigationSlotProps;
  ending: EndingSlotProps;
  errorSummary: ErrorSummarySlotProps;
  notice: NoticeSlotProps;
  status: StatusSlotProps;
}

export type SlotOverride<P> = ComponentType<P> | null;
export type FormSlots = { [K in keyof FormSlotMap]?: SlotOverride<FormSlotMap[K]> };
export type FormSlotProps = { [K in keyof FormSlotMap]?: Partial<FormSlotMap[K]> };

export function renderSlot<P extends object>(Default: ComponentType<P>, override: SlotOverride<P> | undefined, props: P, extra?: Partial<P>): ReactNode {
  if (override === null) return null;
  const Component = override ?? Default;
  return <Component {...props} {...(extra as P)} />;
}

export function DefaultHeader({ title, showTitle, description, requiredNote }: HeaderSlotProps) {
  const s = useFormStyles();
  if (!showTitle && !description && !requiredNote) return null;
  return (
    <View style={s.header}>
      {showTitle ? (
        <Text style={s.headerTitle} accessibilityRole="header">
          {title}
        </Text>
      ) : null}
      {description ? <Text style={s.headerDescription}>{description}</Text> : null}
      {requiredNote ? (
        <Text style={s.headerNote}>
          <Text style={s.required}>* </Text>
          {requiredNote}
        </Text>
      ) : null}
    </View>
  );
}

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

export function DefaultBrand({ name, logo }: BrandSlotProps) {
  const s = useFormStyles();
  return (
    <View style={s.brandRow}>
      <View style={logo ? null : s.brandMark} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        {logo ?? <Text style={s.brandInitials}>{initials(name)}</Text>}
      </View>
      <Text style={s.brandName} numberOfLines={2}>
        {name}
      </Text>
    </View>
  );
}

export function DefaultProgress({ step, total }: ProgressSlotProps) {
  const s = useFormStyles();
  if (!total) return null;
  // Fills with questions answered (empty on the first), like the web's focus layout.
  const percent = Math.round(((step - 1) / total) * 100);
  const label = `Question ${step} of ${total}`;
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="Progress"
      accessibilityValue={{ min: 0, max: total, now: step, text: label }}
      testID="form-progress"
    >
      <View style={s.progressTrack}>
        <View style={[s.progressFill, { width: `${percent}%` }]} />
      </View>
      <Text style={s.progressText}>{label}</Text>
    </View>
  );
}

export function DefaultNavigation({ canGoBack, isLast, busy, failed, onBack, onNext, nextLabel, submitLabel, retryLabel, backLabel, submitRef }: NavigationSlotProps) {
  const s = useFormStyles();
  const label = busy ? "Sending…" : failed ? retryLabel : isLast ? submitLabel : nextLabel;
  return (
    <View style={s.nav}>
      <Button ref={submitRef} testID="form-next" onPress={onNext} busy={busy} accessibilityLabel={label}>
        {label}
      </Button>
      {canGoBack ? (
        <Button testID="form-back" variant="secondary" onPress={onBack} disabled={busy}>
          {backLabel}
        </Button>
      ) : null}
    </View>
  );
}

export function DefaultEnding({ title, description, actions, focusRef }: EndingSlotProps) {
  const s = useFormStyles();
  return (
    <View style={s.ending} testID="form-ending">
      <View style={s.endingMark} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <Text style={s.endingCheck}>✓</Text>
      </View>
      <Text ref={focusRef} accessibilityRole="header" style={s.endingTitle}>
        {title}
      </Text>
      {description ? <Text style={s.endingDescription}>{description}</Text> : null}
      {actions ? <View style={s.nav}>{actions}</View> : null}
    </View>
  );
}

export function DefaultErrorSummary({ count, errors, onSelect, focusRef }: ErrorSummarySlotProps) {
  const s = useFormStyles();
  return (
    <View style={[s.banner, s.bannerError, { marginBottom: 20 }]} testID="form-error-summary">
      <Text ref={focusRef} accessibilityRole="header" style={[s.bannerTitle, s.bannerTitleError]}>
        {count === 1 ? "One answer needs attention." : `${count} answers need attention.`}
      </Text>
      {errors.map((e) => (
        <Pressable
          key={e.id}
          testID={`form-error-${e.id}`}
          accessibilityRole="link"
          accessibilityHint="Goes back to this question"
          onPress={() => onSelect(e.id)}
          style={s.link}
        >
          <Text style={s.linkText}>
            {e.label}: {e.message}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

export function DefaultNotice({ message }: NoticeSlotProps) {
  const s = useFormStyles();
  return (
    <Text style={[s.hint, { marginTop: 16 }]} testID="form-notice">
      {message}
    </Text>
  );
}

export function DefaultStatus({ status, message, onRetry }: StatusSlotProps) {
  const s = useFormStyles();
  return (
    <View style={[s.banner, status === "failed" ? s.bannerError : null, { alignSelf: "stretch" }]} testID="form-status" accessibilityLiveRegion="polite">
      <Text style={[s.bannerText, status === "failed" ? s.bannerTitleError : null]}>{message}</Text>
      {status === "failed" && onRetry ? (
        <Button variant="secondary" onPress={onRetry} testID="form-status-retry">
          Try again
        </Button>
      ) : null}
    </View>
  );
}
