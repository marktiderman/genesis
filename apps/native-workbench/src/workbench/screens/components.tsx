/**
 * Components: genesis-ui-native's building blocks in one place, each live: the controls (buttons
 * in every variant, switches, the segmented control, chips, sliders, the stepper, checkboxes and
 * radios), feedback (alerts and banners in each variant, the empty and loading states, skeletons,
 * progress) and cards (stat tiles with trends, status badges, avatars, summary and header cards).
 */
import { useMemo, useState, type ReactNode } from "react";
import { View } from "react-native";
import {
  NativeBadge,
  NativeBanner,
  NativeButton,
  NativeCard,
  NativeCardContent,
  NativeCardDescription,
  NativeCardFooter,
  NativeCardHeader,
  NativeCardTitle,
  NativeCheckbox,
  NativeChip,
  NativeChipGroup,
  NativeEmptyState,
  NativeHeaderCard,
  NativeIcon,
  NativeInlineAlert,
  NativeLabel,
  NativeLoadingState,
  NativeNumberInput,
  NativeProgress,
  NativeRadioGroup,
  NativeRadioGroupItem,
  NativeRangeSlider,
  NativeSegmentedControl,
  NativeSeparator,
  NativeSkeleton,
  NativeSlider,
  NativeStatCard,
  NativeStatusBadge,
  NativeStepper,
  NativeSummaryCard,
  NativeSwitch,
  NativeText,
  NativeToggle,
  NativeToggleRow,
  NativeUserAvatar,
  type NativeInlineAlertVariant,
} from "@marktiderman/genesis-ui-native";
import { ScreenContainer } from "@marktiderman/genesis-ui-native/layouts";
import type { WorkbenchScreen } from "../registry";

/** A group under a small uppercase label. */
function Section({ title, children, footnote }: { title: string; children: ReactNode; footnote?: string }) {
  return (
    <View className="gap-3 px-5 pt-7">
      <NativeText preset="caption" className="font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </NativeText>
      {children}
      {footnote ? (
        <NativeText preset="caption" className="text-muted-foreground">
          {footnote}
        </NativeText>
      ) : null}
    </View>
  );
}

/** Rows on one rounded surface, as a grouped list draws them. */
function Group({ children }: { children: ReactNode }) {
  return <View className="overflow-hidden rounded-xl border border-border bg-card">{children}</View>;
}

/** A label on the left, its control on the right. */
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View className="flex-row items-center justify-between gap-3">
      <NativeLabel>{label}</NativeLabel>
      {children}
    </View>
  );
}

// --- Controls -----------------------------------------------------------------------------------

const RANGES = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "year", label: "Year" },
];

const ONBOARDING_STEPS = [
  { label: "Account", description: "Name and email" },
  { label: "Workspace", description: "Pick a name" },
  { label: "Invite", description: "Add your team" },
  { label: "Done" },
];

function Controls() {
  const header = useMemo(() => ({ headerTitle: "Controls", large: false }), []);
  const [last, setLast] = useState("");
  const [alerts, setAlerts] = useState(true);
  const [digest, setDigest] = useState(false);
  const [sounds, setSounds] = useState(true);
  const [offline, setOffline] = useState(false);
  const [range, setRange] = useState("week");
  const [plan, setPlan] = useState("team");
  const [topics, setTopics] = useState<string[]>(["design", "mobile"]);
  const [volume, setVolume] = useState(60);
  const [price, setPrice] = useState<[number, number]>([20, 80]);
  const [seats, setSeats] = useState(3);
  const [step, setStep] = useState(1);
  const [terms, setTerms] = useState(true);
  const [updates, setUpdates] = useState(false);
  const [shipping, setShipping] = useState("standard");
  const [bold, setBold] = useState(true);
  const [italic, setItalic] = useState(false);
  const [saving, setSaving] = useState(false);

  const press = (what: string) => () => setLast(`Pressed ${what}`);
  const save = () => {
    setSaving(true);
    setLast("Saving…");
    setTimeout(() => {
      setSaving(false);
      setLast("Saved");
    }, 1200);
  };

  return (
    <ScreenContainer header={header} scroll testID="workbench-controls">
      <NativeText testID="workbench-controls-last" preset="body-sm" className="px-5 pt-4 text-muted-foreground">
        {last || "Press, toggle or drag anything below."}
      </NativeText>

      <Section title="Buttons">
        <View className="flex-row flex-wrap gap-2">
          <NativeButton onPress={press("Primary")} testID="workbench-controls-button-default">Primary</NativeButton>
          <NativeButton variant="secondary" onPress={press("Secondary")} testID="workbench-controls-button-secondary">Secondary</NativeButton>
          <NativeButton variant="outline" onPress={press("Outline")} testID="workbench-controls-button-outline">Outline</NativeButton>
          <NativeButton variant="ghost" onPress={press("Ghost")} testID="workbench-controls-button-ghost">Ghost</NativeButton>
          <NativeButton variant="destructive" onPress={press("Delete")} testID="workbench-controls-button-destructive">Delete</NativeButton>
          <NativeButton variant="gradient" onPress={press("Upgrade")} testID="workbench-controls-button-gradient">Upgrade</NativeButton>
        </View>
        <View className="flex-row flex-wrap items-center gap-2">
          <NativeButton size="sm" variant="outline" onPress={press("Small")}>Small</NativeButton>
          <NativeButton size="md" variant="outline" onPress={press("Medium")}>Medium</NativeButton>
          <NativeButton size="lg" variant="outline" onPress={press("Large")}>Large</NativeButton>
        </View>
        <View className="flex-row flex-wrap items-center gap-2">
          <NativeButton onPress={save} loading={saving} haptic="success" testID="workbench-controls-button-save">
            Save changes
          </NativeButton>
          <NativeButton variant="secondary" disabled>Disabled</NativeButton>
          <NativeButton variant="outline" onPress={press("Share")} accessibilityLabel="Share">
            <NativeIcon name="share" size={18} />
          </NativeButton>
        </View>
      </Section>

      <Section title="Switches" footnote="The whole row is the switch, for a tap and for VoiceOver.">
        <Group>
          <NativeToggleRow label="Push notifications" description="Mentions, replies and direct messages" checked={alerts} onCheckedChange={setAlerts} testID="workbench-controls-toggle-alerts" rowTestID="workbench-controls-toggle-alerts-row" />
          <NativeSeparator />
          <NativeToggleRow label="Weekly digest" description="A summary every Monday morning" checked={digest} onCheckedChange={setDigest} testID="workbench-controls-toggle-digest" rowTestID="workbench-controls-toggle-digest-row" />
          <NativeSeparator />
          <NativeToggleRow label="Sounds" checked={sounds} onCheckedChange={setSounds} testID="workbench-controls-toggle-sounds" rowTestID="workbench-controls-toggle-sounds-row" />
          <NativeSeparator />
          <NativeToggleRow label="Sync over cellular" description="Needs a Pro plan" disabled testID="workbench-controls-toggle-cellular" rowTestID="workbench-controls-toggle-cellular-row" />
        </Group>
        <Field label="Work offline">
          <NativeSwitch checked={offline} onCheckedChange={setOffline} testID="workbench-controls-switch-offline" />
        </Field>
      </Section>

      <Section title="Segmented control">
        <NativeSegmentedControl options={RANGES} value={range} onChange={setRange} testID="workbench-controls-segmented" />
        <NativeText preset="body-sm" className="text-muted-foreground">
          Showing the last {range}.
        </NativeText>
      </Section>

      <Section title="Chips">
        <NativeLabel>Plan (one)</NativeLabel>
        <NativeChipGroup mode="single" value={plan} onChange={setPlan} testID="workbench-controls-chips-plan">
          <View className="flex-row flex-wrap gap-2">
            <NativeChip value="solo">Solo</NativeChip>
            <NativeChip value="team">Team</NativeChip>
            <NativeChip value="business">Business</NativeChip>
          </View>
        </NativeChipGroup>
        <NativeLabel>Topics (any)</NativeLabel>
        <NativeChipGroup mode="multiple" value={topics} onChange={setTopics} testID="workbench-controls-chips-topics">
          <View className="flex-row flex-wrap gap-2">
            <NativeChip value="design">Design</NativeChip>
            <NativeChip value="mobile">Mobile</NativeChip>
            <NativeChip value="data">Data</NativeChip>
            <NativeChip value="security">Security</NativeChip>
            <NativeChip value="ai">AI</NativeChip>
          </View>
        </NativeChipGroup>
      </Section>

      <Section title="Sliders">
        <Field label="Volume">
          <NativeText preset="body-sm" className="text-muted-foreground">{volume}%</NativeText>
        </Field>
        <NativeSlider value={volume} onChange={setVolume} min={0} max={100} step={5} testID="workbench-controls-slider" />
        <Field label="Price">
          <NativeText preset="body-sm" className="text-muted-foreground">
            ${price[0]} – ${price[1]}
          </NativeText>
        </Field>
        <NativeRangeSlider value={price} onChange={setPrice} min={0} max={200} step={10} testID="workbench-controls-range" />
      </Section>

      <Section title="Number input">
        <Field label="Seats">
          <NativeNumberInput value={seats} onChange={setSeats} min={1} max={50} testID="workbench-controls-seats" />
        </Field>
      </Section>

      <Section title="Stepper">
        <NativeStepper steps={ONBOARDING_STEPS} current={step} testID="workbench-controls-stepper" />
        <View className="flex-row gap-2">
          <NativeButton size="sm" variant="outline" disabled={step === 0} onPress={() => setStep((s) => Math.max(0, s - 1))} testID="workbench-controls-stepper-back">
            Back
          </NativeButton>
          <NativeButton size="sm" disabled={step === ONBOARDING_STEPS.length - 1} onPress={() => setStep((s) => Math.min(ONBOARDING_STEPS.length - 1, s + 1))} testID="workbench-controls-stepper-next">
            Next
          </NativeButton>
        </View>
      </Section>

      <Section title="Checkboxes and radios">
        <View className="flex-row items-center gap-3">
          <NativeCheckbox checked={terms} onCheckedChange={setTerms} testID="workbench-controls-checkbox-terms" />
          <NativeLabel onPress={() => setTerms((t) => !t)}>I agree to the terms</NativeLabel>
        </View>
        <View className="flex-row items-center gap-3">
          <NativeCheckbox checked={updates} onCheckedChange={setUpdates} testID="workbench-controls-checkbox-updates" />
          <NativeLabel onPress={() => setUpdates((u) => !u)}>Send me product updates</NativeLabel>
        </View>
        <NativeRadioGroup value={shipping} onValueChange={setShipping} className="gap-3 pt-2" testID="workbench-controls-radio">
          {[
            ["standard", "Standard", "3–5 days, free"],
            ["express", "Express", "1–2 days, $9"],
            ["pickup", "Pick up in store", "Ready today"],
          ].map(([value, label, hint]) => (
            <View key={value} className="flex-row items-center gap-3">
              <NativeRadioGroupItem value={value!} testID={`workbench-controls-radio-${value}`} />
              <View>
                <NativeLabel onPress={() => setShipping(value!)}>{label}</NativeLabel>
                <NativeText preset="caption" className="text-muted-foreground">{hint}</NativeText>
              </View>
            </View>
          ))}
        </NativeRadioGroup>
      </Section>

      <Section title="Toggle buttons">
        <View className="flex-row gap-2">
          <NativeToggle variant="outline" pressed={bold} onPressedChange={setBold} testID="workbench-controls-toggle-bold">
            <NativeText className="font-bold">B</NativeText>
          </NativeToggle>
          <NativeToggle variant="outline" pressed={italic} onPressedChange={setItalic} testID="workbench-controls-toggle-italic">
            <NativeText className="italic">I</NativeText>
          </NativeToggle>
        </View>
      </Section>
      <View style={{ height: 48 }} />
    </ScreenContainer>
  );
}

// --- Feedback -----------------------------------------------------------------------------------

const ALERTS: { variant: NativeInlineAlertVariant; title: string; description: string; icon: "info" | "success" | "warning" | "error" }[] = [
  { variant: "info", title: "Scheduled maintenance", description: "Sync pauses for ten minutes on Sunday at 2:00 AM.", icon: "info" },
  { variant: "success", title: "Invoice paid", description: "Acme Ltd paid invoice #1042 ($1,250.00).", icon: "success" },
  { variant: "warning", title: "Storage almost full", description: "You've used 92% of your 10 GB.", icon: "warning" },
  { variant: "destructive", title: "Couldn't send", description: "Check your connection and try again.", icon: "error" },
];

function Feedback() {
  const header = useMemo(() => ({ headerTitle: "Feedback", large: false }), []);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [bannerOpen, setBannerOpen] = useState(true);
  const [progress, setProgress] = useState(35);
  const [searched, setSearched] = useState(false);

  return (
    <ScreenContainer header={header} scroll testID="workbench-feedback">
      {bannerOpen ? (
        <NativeBanner
          variant="info"
          title="A new version is ready"
          description="Restart to get the latest features."
          icon={<NativeIcon name="download" size={18} />}
          onDismiss={() => setBannerOpen(false)}
          actions={
            <NativeButton size="sm" onPress={() => setBannerOpen(false)}>
              Restart
            </NativeButton>
          }
          testID="workbench-feedback-banner"
        />
      ) : null}

      <Section title="Inline alerts" footnote={dismissed.length ? `${dismissed.length} dismissed.` : "Each one can be dismissed."}>
        {ALERTS.filter((a) => !dismissed.includes(a.variant)).map((a) => (
          <NativeInlineAlert
            key={a.variant}
            variant={a.variant}
            title={a.title}
            description={a.description}
            icon={<NativeIcon name={a.icon} size={18} />}
            onDismiss={() => setDismissed((d) => [...d, a.variant])}
            testID={`workbench-feedback-alert-${a.variant}`}
          />
        ))}
        {dismissed.length ? (
          <NativeButton size="sm" variant="ghost" onPress={() => setDismissed([])} testID="workbench-feedback-alerts-reset">
            Show them again
          </NativeButton>
        ) : null}
      </Section>

      <Section title="Banners">
        <View className="overflow-hidden rounded-xl border border-border">
          <NativeBanner variant="success" title="Backup complete" description="All 1,284 files are safe." />
          <NativeBanner variant="warning" title="Trial ends in 3 days" description="Pick a plan to keep your projects." />
          <NativeBanner variant="destructive" title="You're offline" description="Changes will sync when you reconnect." />
        </View>
      </Section>

      <Section title="Progress">
        <NativeProgress value={progress} testID="workbench-feedback-progress" />
        <View className="flex-row items-center justify-between">
          <NativeText preset="body-sm" className="text-muted-foreground">Uploading 4 of 12 photos · {progress}%</NativeText>
          <NativeButton size="sm" variant="outline" onPress={() => setProgress((p) => (p >= 100 ? 0 : Math.min(100, p + 15)))} testID="workbench-feedback-progress-advance">
            {progress >= 100 ? "Reset" : "Advance"}
          </NativeButton>
        </View>
      </Section>

      <Section title="Skeletons">
        <View className="flex-row items-center gap-3">
          <NativeSkeleton circle size={40} />
          <View className="flex-1 gap-2">
            <NativeSkeleton height={14} className="w-3/4" />
            <NativeSkeleton height={12} className="w-1/2" />
          </View>
        </View>
        <NativeSkeleton height={120} className="w-full rounded-xl" />
      </Section>

      <Section title="Loading state">
        <Group>
          <NativeLoadingState fullScreen={false} label="Loading your projects…" testID="workbench-feedback-loading" />
        </Group>
      </Section>

      <Section title="Empty states">
        <Group>
          <NativeEmptyState
            variant="first-run"
            title="No projects yet"
            body="Create your first project to start tracking work with your team."
            icon={<NativeIcon name="folder-plus" size={32} />}
            primaryAction={<NativeButton size="sm">New project</NativeButton>}
            testID="workbench-feedback-empty-first-run"
          />
        </Group>
        <Group>
          <NativeEmptyState
            variant="no-results"
            body={searched ? "Still nothing for “quarterly”." : "Nothing matches “quarterly”. Try another word."}
            icon={<NativeIcon name="search" size={32} />}
            secondaryAction={
              <NativeButton size="sm" variant="outline" onPress={() => setSearched(true)}>
                Clear search
              </NativeButton>
            }
            testID="workbench-feedback-empty-no-results"
          />
        </Group>
        <Group>
          <NativeEmptyState variant="error" body="We couldn't load this page." icon={<NativeIcon name="error" size={32} />} primaryAction={<NativeButton size="sm" variant="outline">Try again</NativeButton>} testID="workbench-feedback-empty-error" />
        </Group>
      </Section>
      <View style={{ height: 48 }} />
    </ScreenContainer>
  );
}

// --- Cards --------------------------------------------------------------------------------------

const TEAM = ["Ada Lovelace", "Grace Hopper", "Alan Turing", "Katherine Johnson", "Edsger Dijkstra"];

function Cards() {
  const header = useMemo(() => ({ headerTitle: "Cards", large: false }), []);
  const [last, setLast] = useState("");

  return (
    <ScreenContainer header={header} scroll testID="workbench-cards">
      <NativeText testID="workbench-cards-last" preset="body-sm" className="px-5 pt-4 text-muted-foreground">
        {last || "Tap a stat tile to open what's behind it."}
      </NativeText>

      <Section title="Stat cards">
        <View className="flex-row flex-wrap gap-3">
          <View className="min-w-[45%] flex-1">
            <NativeStatCard label="Revenue" value="$48.2k" icon={<NativeIcon name="star" size={16} />} color="success" trend={{ value: 12, label: "vs last month" }} onPress={() => setLast("Opened Revenue")} testID="workbench-cards-stat-revenue" />
          </View>
          <View className="min-w-[45%] flex-1">
            <NativeStatCard label="Active users" value={1284} icon={<NativeIcon name="user" size={16} />} color="info" trend={{ value: 4.5, label: "this week" }} onPress={() => setLast("Opened Active users")} testID="workbench-cards-stat-users" />
          </View>
          <View className="min-w-[45%] flex-1">
            <NativeStatCard label="Churn" value="2.1%" icon={<NativeIcon name="warning" size={16} />} color="warning" trend={{ value: -0.8, label: "vs last month" }} testID="workbench-cards-stat-churn" />
          </View>
          <View className="min-w-[45%] flex-1">
            <NativeStatCard label="Open tickets" value={17} icon={<NativeIcon name="message" size={16} />} color="destructive" trend={{ value: -15, label: "since Monday" }} testID="workbench-cards-stat-tickets" />
          </View>
        </View>
      </Section>

      <Section title="Status badges">
        <View className="flex-row flex-wrap gap-2">
          <NativeStatusBadge status="onTrack" />
          <NativeStatusBadge status="atRisk" />
          <NativeStatusBadge status="offTrack" />
          <NativeStatusBadge status="inProgress" />
          <NativeStatusBadge status="blocked" />
          <NativeStatusBadge status="done" />
        </View>
      </Section>

      <Section title="Badges">
        <View className="flex-row flex-wrap gap-2">
          <NativeBadge>New</NativeBadge>
          <NativeBadge variant="secondary">Draft</NativeBadge>
          <NativeBadge variant="outline">v2.4</NativeBadge>
          <NativeBadge variant="success">Paid</NativeBadge>
          <NativeBadge variant="warning">Due soon</NativeBadge>
          <NativeBadge variant="info">Beta</NativeBadge>
          <NativeBadge variant="muted">Archived</NativeBadge>
          <NativeBadge variant="danger">Overdue</NativeBadge>
          <NativeBadge variant="destructive">Failed</NativeBadge>
        </View>
      </Section>

      <Section title="Avatars">
        <View className="flex-row items-end gap-4">
          <NativeUserAvatar name="Grace Hopper" size="sm" />
          <NativeUserAvatar name="Grace Hopper" />
          <NativeUserAvatar name="Grace Hopper" size="lg" />
        </View>
        <View className="flex-row">
          {TEAM.map((name, i) => (
            <View key={name} style={{ marginLeft: i === 0 ? 0 : -10 }} className="rounded-full border-2 border-background">
              <NativeUserAvatar name={name} size="sm" distinct />
            </View>
          ))}
        </View>
      </Section>

      <Section title="Summary card">
        <NativeSummaryCard title="This week" icon={<NativeIcon name="calendar" size={16} />} meta={<NativeStatusBadge status="onTrack" />} testID="workbench-cards-summary">
          <View className="gap-2">
            <NativeText preset="body-sm">14 tasks done, 3 in review, 1 blocked.</NativeText>
            <NativeProgress value={78} />
          </View>
        </NativeSummaryCard>
      </Section>

      <Section title="Header card">
        <NativeHeaderCard
          title="Acme onboarding"
          description="Kickoff on Thursday with the sample-app team"
          body={
            <View className="gap-3">
              <View className="flex-row items-center gap-3">
                <NativeUserAvatar name="Barbara Liskov" size="sm" />
                <View className="flex-1">
                  <NativeText preset="label">Barbara Liskov</NativeText>
                  <NativeText preset="caption" className="text-muted-foreground">Account lead</NativeText>
                </View>
                <NativeStatusBadge status="inProgress" />
              </View>
            </View>
          }
          footer={
            <View className="flex-row gap-2">
              <NativeButton size="sm" variant="outline" onPress={() => setLast("Rescheduled")}>Reschedule</NativeButton>
              <NativeButton size="sm" onPress={() => setLast("Joined the call")}>Join call</NativeButton>
            </View>
          }
          testID="workbench-cards-header"
        />
      </Section>

      <Section title="Card">
        <NativeCard testID="workbench-cards-card">
          <NativeCardHeader>
            <NativeCardTitle>Pro plan</NativeCardTitle>
            <NativeCardDescription>Everything in Team, plus SSO and audit logs.</NativeCardDescription>
          </NativeCardHeader>
          <NativeCardContent>
            <NativeText preset="h2">
              $24<NativeText preset="body-sm" className="text-muted-foreground"> / seat / month</NativeText>
            </NativeText>
          </NativeCardContent>
          <NativeCardFooter>
            <NativeButton variant="gradient" onPress={() => setLast("Upgraded to Pro")} className="flex-1">
              Upgrade
            </NativeButton>
          </NativeCardFooter>
        </NativeCard>
      </Section>
      <View style={{ height: 48 }} />
    </ScreenContainer>
  );
}

export const componentsControls: WorkbenchScreen = {
  id: "controls",
  title: "Controls",
  summary: "Buttons in every variant and size, toggle rows and a switch, the segmented control, chips, sliders, a number input, the stepper, checkboxes, radios and toggle buttons, all live.",
  section: "Components",
  package: "genesis-ui-native",
  covers: [
    "NativeButton",
    "NativeToggleRow",
    "NativeSwitch",
    "NativeSegmentedControl",
    "NativeChipGroup",
    "NativeChip",
    "NativeSlider",
    "NativeRangeSlider",
    "NativeNumberInput",
    "NativeStepper",
    "NativeCheckbox",
    "NativeRadioGroup",
    "NativeToggle",
    "NativeLabel",
    "NativeSeparator",
    "NativeIcon",
    "NativeText",
  ],
  screen: Controls,
};

export const componentsFeedback: WorkbenchScreen = {
  id: "feedback",
  title: "Feedback",
  summary: "A dismissible banner, inline alerts and banners in each variant, progress, skeletons, a loading state in place and the three empty states.",
  section: "Components",
  package: "genesis-ui-native",
  covers: ["NativeBanner", "NativeInlineAlert", "NativeProgress", "NativeSkeleton", "NativeLoadingState", "NativeEmptyState", "NativeButton", "NativeIcon"],
  screen: Feedback,
};

export const componentsCards: WorkbenchScreen = {
  id: "cards",
  title: "Cards",
  summary: "Stat tiles with rising and falling trends, every status badge and badge variant, avatar sizes, and the summary, header and plain cards.",
  section: "Components",
  package: "genesis-ui-native",
  covers: ["NativeStatCard", "NativeStatusBadge", "NativeBadge", "NativeUserAvatar", "NativeSummaryCard", "NativeHeaderCard", "NativeCard", "NativeProgress"],
  screen: Cards,
};
