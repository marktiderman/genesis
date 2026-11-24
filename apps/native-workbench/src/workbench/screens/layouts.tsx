/**
 * Layouts: genesis-ui-native's assembled pages with sample content. SettingsPage (sections of
 * rows with leading icons, switches, drill-in rows, footnotes and a destructive footer) and
 * DetailPage (a record's title block, actions, body and side column).
 */
import { useMemo, useState, type ReactNode } from "react";
import { Platform, PlatformColor, View } from "react-native";
import {
  NativeBadge,
  NativeButton,
  NativeIcon,
  NativeSeparator,
  NativeStatusBadge,
  NativeSwitch,
  NativeText,
  NativeUserAvatar,
  type NativeIconName,
} from "@marktiderman/genesis-ui-native";
import { DetailPage, ScreenContainer, SettingsPage, type SettingsPageSection } from "@marktiderman/genesis-ui-native/layouts";
import type { WorkbenchScreen } from "../registry";

/** The Settings app's leading tile: a white glyph on a colored rounded square. */
/** The tile colors are iOS system colors, so they follow light and dark mode as Settings' do. */
type SystemColor = "systemBlue" | "systemOrange" | "systemGray" | "systemRed" | "systemGreen" | "systemIndigo" | "systemTeal";

function Tile({ name, color }: { name: NativeIconName; color: SystemColor }) {
  return (
    <View style={{ width: 29, height: 29, borderRadius: 7, backgroundColor: Platform.OS === "ios" ? PlatformColor(color) : PlatformColor("@android:color/holo_blue_dark"), alignItems: "center", justifyContent: "center" }}>
      <NativeIcon name={name} size={17} color={PlatformColor(Platform.OS === "ios" ? "white" : "@android:color/white")} />
    </View>
  );
}

function Value({ children }: { children: ReactNode }) {
  return (
    <NativeText preset="body" className="text-muted-foreground">
      {children}
    </NativeText>
  );
}

// --- Settings page ------------------------------------------------------------------------------

function SettingsPageScreen() {
  const header = useMemo(() => ({ headerTitle: "Settings", large: false }), []);
  const [last, setLast] = useState("");
  const [push, setPush] = useState(true);
  const [email, setEmail] = useState(false);
  const [faceId, setFaceId] = useState(true);
  const open = (what: string) => () => setLast(`Opened ${what}`);

  const sections: SettingsPageSection[] = [
    {
      id: "account",
      title: "Account",
      rows: [
        { id: "profile", title: "Profile", subtitle: "Name, photo and bio", leading: <Tile name="user" color="systemBlue" />, showChevron: true, onPress: open("Profile") },
        { id: "plan", title: "Plan", leading: <Tile name="star" color="systemOrange" />, trailing: <NativeBadge variant="info">Team</NativeBadge>, showChevron: true, onPress: open("Plan") },
        { id: "security", title: "Password & security", leading: <Tile name="lock" color="systemGray" />, showChevron: true, onPress: open("Password & security") },
      ],
    },
    {
      id: "notifications",
      title: "Notifications",
      footnote: "Mentions and direct messages always reach you while you're signed in.",
      rows: [
        {
          id: "push",
          title: "Push notifications",
          leading: <Tile name="bell" color="systemRed" />,
          trailing: <NativeSwitch checked={push} onCheckedChange={setPush} testID="workbench-settings-page-push" />,
        },
        {
          id: "email",
          title: "Email digest",
          subtitle: "A summary every Monday",
          leading: <Tile name="mail" color="systemGreen" />,
          trailing: <NativeSwitch checked={email} onCheckedChange={setEmail} testID="workbench-settings-page-email" />,
        },
        { id: "quiet", title: "Quiet hours", leading: <Tile name="clock" color="systemIndigo" />, trailing: <Value>10 PM – 7 AM</Value>, showChevron: true, onPress: open("Quiet hours") },
      ],
    },
    {
      id: "privacy",
      title: "Privacy",
      rows: [
        {
          id: "face-id",
          title: "Unlock with Face ID",
          leading: <Tile name="eye" color="systemTeal" />,
          trailing: <NativeSwitch checked={faceId} onCheckedChange={setFaceId} testID="workbench-settings-page-face-id" />,
        },
        { id: "blocked", title: "Blocked people", leading: <Tile name="close" color="systemGray" />, trailing: <Value>2</Value>, showChevron: true, onPress: open("Blocked people") },
        { id: "export", title: "Export my data", leading: <Tile name="download" color="systemBlue" />, showChevron: true, onPress: open("Export my data") },
      ],
    },
    {
      id: "about",
      title: "About",
      footnote: "Sample app · build 2026.11.24",
      rows: [
        { id: "version", title: "Version", trailing: <Value>4.2.0</Value> },
        { id: "help", title: "Help & feedback", showChevron: true, onPress: open("Help & feedback") },
        { id: "beta", title: "Beta features", subtitle: "Ask your admin to turn these on", disabled: true },
      ],
    },
  ];

  return (
    <ScreenContainer header={header} testID="workbench-settings-page">
      <SettingsPage
        sections={sections}
        dangerousActions={[
          { label: "Sign out", onPress: () => setLast("Signed out"), testID: "workbench-settings-page-sign-out" },
          { label: "Delete account", onPress: () => setLast("Asked to delete the account"), emphasized: true, testID: "workbench-settings-page-delete" },
        ]}
        testID="workbench-settings-page-layout"
      >
        <View className="flex-row items-center gap-3 py-2">
          <NativeUserAvatar name="Grace Hopper" size="lg" />
          <View className="flex-1">
            <NativeText preset="h4">Grace Hopper</NativeText>
            <NativeText preset="body-sm" className="text-muted-foreground">grace@acme.example</NativeText>
          </View>
        </View>
        <NativeText testID="workbench-settings-page-last" preset="caption" className="text-muted-foreground">
          {last || "Tap a row or flip a switch."}
        </NativeText>
      </SettingsPage>
    </ScreenContainer>
  );
}

// --- Detail page --------------------------------------------------------------------------------

const LINES = [
  { item: "Design system audit", qty: 1, amount: "$800.00" },
  { item: "Mobile prototype", qty: 2, amount: "$300.00" },
  { item: "Support (hours)", qty: 3, amount: "$150.00" },
];

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View className="flex-row items-center justify-between py-2.5">
      <NativeText preset="body-sm" className="text-muted-foreground">
        {label}
      </NativeText>
      {typeof children === "string" ? <NativeText preset="body-sm">{children}</NativeText> : children}
    </View>
  );
}

function DetailPageScreen() {
  const header = useMemo(() => ({ headerTitle: "Invoice", large: false }), []);
  const [paid, setPaid] = useState(false);

  return (
    <ScreenContainer header={header} testID="workbench-detail-page">
      <DetailPage
        breadcrumb="Invoices · Acme Ltd"
        title="Invoice #1042"
        subtitle="Issued 18 November 2026 · due in 14 days"
        actions={
          <>
            <NativeButton size="sm" disabled={paid} onPress={() => setPaid(true)} testID="workbench-detail-page-mark-paid">
              {paid ? "Paid" : "Mark as paid"}
            </NativeButton>
            <NativeButton size="sm" variant="outline">
              Send reminder
            </NativeButton>
          </>
        }
        sidebar={
          <View className="gap-1">
            <NativeText preset="caption" className="font-semibold uppercase tracking-wider text-muted-foreground">
              Details
            </NativeText>
            <DetailRow label="Status">{paid ? <NativeStatusBadge status="done">Paid</NativeStatusBadge> : <NativeStatusBadge status="atRisk">Due soon</NativeStatusBadge>}</DetailRow>
            <NativeSeparator />
            <DetailRow label="Customer">Acme Ltd</DetailRow>
            <NativeSeparator />
            <DetailRow label="Owner">
              <View className="flex-row items-center gap-2">
                <NativeUserAvatar name="Alan Turing" size="sm" />
                <NativeText preset="body-sm">Alan Turing</NativeText>
              </View>
            </DetailRow>
            <NativeSeparator />
            <DetailRow label="Terms">Net 14</DetailRow>
          </View>
        }
        testID="workbench-detail-page-layout"
      >
        <View className="gap-1 rounded-xl border border-border bg-card px-4 py-2">
          {LINES.map((l, i) => (
            <View key={l.item}>
              {i > 0 ? <NativeSeparator /> : null}
              <View className="flex-row items-center justify-between py-3">
                <View className="flex-1">
                  <NativeText preset="label">{l.item}</NativeText>
                  <NativeText preset="caption" className="text-muted-foreground">Qty {l.qty}</NativeText>
                </View>
                <NativeText preset="body-sm">{l.amount}</NativeText>
              </View>
            </View>
          ))}
          <NativeSeparator />
          <View className="flex-row items-center justify-between py-3">
            <NativeText preset="label">Total</NativeText>
            <NativeText preset="h4">$1,250.00</NativeText>
          </View>
        </View>
      </DetailPage>
    </ScreenContainer>
  );
}

export const layoutsSettingsPage: WorkbenchScreen = {
  id: "settings-page",
  title: "Settings page",
  summary: "Inset grouped sections with leading icon tiles, live switches, drill-in rows with values, footnotes, a disabled row, a profile header and the destructive footer.",
  section: "Layouts",
  package: "genesis-ui-native",
  covers: ["SettingsPage", "NativeSwitch", "NativeIcon", "NativeBadge", "NativeUserAvatar", "NativeText"],
  screen: SettingsPageScreen,
};

export const layoutsDetailPage: WorkbenchScreen = {
  id: "detail-page",
  title: "Detail page",
  summary: "A record's page: breadcrumb, title and subtitle, actions (Mark as paid updates the status), the body, and the side column below it on a phone.",
  section: "Layouts",
  package: "genesis-ui-native",
  covers: ["DetailPage", "NativeButton", "NativeStatusBadge", "NativeUserAvatar", "NativeSeparator"],
  screen: DetailPageScreen,
};
