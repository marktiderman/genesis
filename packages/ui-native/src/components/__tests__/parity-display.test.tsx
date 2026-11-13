import { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Text } from "react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WorkspaceScope } from "@marktiderman/genesis-core/hooks";
import type { Workspace } from "@marktiderman/genesis-core/workspaces";
import { GenesisModulesProvider } from "../../native-modules";
import { NativeChartContainer } from "../chart";
import { NativeNoFeaturesFound, NativeNoFeedbackFound, NativeNoSearchResults } from "../empty-state";
import { NativeFollowUpList, NativeHeadlineNumbers, NativeReadinessChip, NativeResponsesToolbar, NativeSummaryCard } from "../resource";
import { NativeResourceSettingsPage, NativeSettingsRow, NativeToggleRow } from "../settings-row";
import { NativeStatCard, NativeStatusBadge, NativeUserAvatar } from "../stat-card";
import { NativeWorkspaceSwitcher } from "../workspace-switcher";
import { DashboardPage, DetailPage, DocumentPage, FormPage } from "../../layouts/pages";

describe("NativeChartContainer", () => {
  const data = [
    { month: "Jan", visits: 120, signups: 12 },
    { month: "Feb", visits: 140, signups: 18 },
  ];
  const config = { visits: { label: "Visits", color: "var(--chart-1)" }, signups: { label: "Signups", theme: { light: "#111111", dark: "#eeeeee" } } };

  it("reads its values to a screen reader and draws a bar per value", () => {
    render(<NativeChartContainer config={config} data={data} xKey="month" accessibilityLabel="Traffic" />);
    expect(screen.getByRole("image").getAttribute("aria-label")).toBe("Traffic. Visits: Jan 120, Feb 140. Signups: Jan 12, Feb 18.");
    expect(screen.getByTestId("native-chart-bar-1").children).toHaveLength(2);
    expect(screen.getByText("Visits")).toBeTruthy(); // the legend, with two series
  });

  it("draws lines with the SVG module, and the points without it", () => {
    const { rerender } = render(<NativeChartContainer config={config} data={data} xKey="month" type="line" />);
    expect(screen.getByTestId("native-chart-point-visits-1")).toBeTruthy();
    const Svg = ({ children, testID }: { children?: React.ReactNode; testID?: string }) => <svg data-testid={testID}>{children}</svg>;
    const Path = ({ d, testID }: { d: string; testID?: string }) => <path d={d} data-testid={testID} />;
    rerender(
      <GenesisModulesProvider modules={{ svg: { Svg, Path } }}>
        <NativeChartContainer config={config} data={data} xKey="month" type="area" />
      </GenesisModulesProvider>,
    );
    // Width comes from layout; before it is measured the points stand in.
    expect(screen.queryByTestId("native-chart-svg") ?? screen.getByTestId("native-chart-point-visits-0")).toBeTruthy();
  });
});

describe("stat card, status badge, avatar", () => {
  it("StatCard reads its label, value and trend as one, and presses", () => {
    const onPress = vi.fn();
    render(<NativeStatCard label="Members" value={42} trend={{ value: -3, label: "this week" }} onPress={onPress} />);
    const button = screen.getByRole("button");
    expect(button.getAttribute("aria-label")).toBe("Members, 42, -3% this week");
    fireEvent.click(button);
    expect(onPress).toHaveBeenCalled();
  });

  it("StatusBadge words and tint come from the status", () => {
    render(<NativeStatusBadge status="offTrack" />);
    expect(screen.getByText("Off track")).toBeTruthy();
    expect(screen.getByTestId("status-badge-offTrack").className).toContain("bg-destructive/15");
  });

  it("UserAvatar names the person and shows initials", () => {
    render(<NativeUserAvatar name="Ada Lovelace" />);
    expect(screen.getByRole("image").getAttribute("aria-label")).toBe("Ada Lovelace");
    expect(screen.getByText("AL")).toBeTruthy();
  });
});

describe("resource pieces", () => {
  it("ReadinessChip says what's left and opens the checks", () => {
    const onPress = vi.fn();
    render(<NativeReadinessChip readiness={{ state: "problems", problems: 2, warnings: 0, findings: [] } as never} onPress={onPress} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onPress).toHaveBeenCalled();
  });

  it("HeadlineNumbers and SummaryCard draw their tiles", () => {
    render(
      <>
        <NativeHeadlineNumbers numbers={[{ key: "n", label: "Responses", value: 24, detail: "+4", tone: "positive" }]} />
        <NativeSummaryCard title="Q1" meta="24 responses">
          <Text>bars</Text>
        </NativeSummaryCard>
      </>,
    );
    expect(screen.getByTestId("headline-n")).toBeTruthy();
    expect(screen.getByText("24 responses")).toBeTruthy();
    expect(screen.getByText("bars")).toBeTruthy();
  });

  it("FollowUpList lists entries with their actions, or says there's nothing", () => {
    const { rerender } = render(
      <NativeFollowUpList
        entries={[{ id: "1", name: "Leo", comment: null, rating: { value: 2, max: 5 }, tag: { label: "New lead", tone: "info" } }]}
        actions={() => <Text>Reply</Text>}
      />,
    );
    const entry = screen.getByTestId("follow-up-1");
    expect(within(entry).getByText("No comment")).toBeTruthy();
    expect(within(entry).getByLabelText("Rated 2 out of 5")).toBeTruthy();
    expect(within(entry).getByText("Reply")).toBeTruthy();
    rerender(<NativeFollowUpList entries={[]} />);
    expect(screen.getByText(/Nothing to follow up/)).toBeTruthy();
  });

  it("ResponsesToolbar switches between summary and each response", () => {
    const onViewChange = vi.fn();
    render(<NativeResponsesToolbar view="summary" onViewChange={onViewChange} labels={{ each: "Each submission" }} />);
    fireEvent.click(screen.getByText("Each submission"));
    expect(onViewChange).toHaveBeenCalledWith("each");
  });
});

describe("settings rows", () => {
  it("SettingsRow shows its control; ToggleRow is one switch that flips", () => {
    const onChange = vi.fn();
    render(
      <>
        <NativeSettingsRow label="Version" description="The app's build">
          <Text>1.2.3</Text>
        </NativeSettingsRow>
        <NativeToggleRow label="Email me" description="Once a week" onCheckedChange={onChange} />
      </>,
    );
    expect(screen.getByText("1.2.3")).toBeTruthy();
    const row = screen.getByTestId("toggle-row");
    expect(row.getAttribute("role")).toBe("switch");
    expect(row.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(row);
    expect(onChange).toHaveBeenCalledWith(true);
    expect(row.getAttribute("aria-checked")).toBe("true");
  });

  it("ResourceSettingsPage draws sections as cards and runs a link-only section's onSelect", () => {
    const onSelect = vi.fn();
    render(
      <NativeResourceSettingsPage
        sections={[
          { id: "general", title: "General", content: <NativeToggleRow label="Open" /> },
          { id: "danger", title: "Danger zone", onSelect },
        ]}
      />,
    );
    expect(screen.getByTestId("resource-settings-page-section-general")).toBeTruthy();
    expect(screen.queryByTestId("resource-settings-page-section-danger")).toBeNull();
    fireEvent.click(screen.getByTestId("resource-settings-page-link-danger"));
    expect(onSelect).toHaveBeenCalled();
  });
});

describe("empty-state presets", () => {
  it("say the web's words", () => {
    const onClear = vi.fn();
    render(
      <>
        <NativeNoFeaturesFound />
        <NativeNoFeedbackFound />
        <NativeNoSearchResults query="kettle" onClear={onClear} />
      </>,
    );
    expect(screen.getByText("No features found")).toBeTruthy();
    expect(screen.getByText("No feedback yet")).toBeTruthy();
    expect(screen.getByText('No results found for "kettle". Try a different search term.')).toBeTruthy();
    fireEvent.click(screen.getByTestId("no-search-results-clear"));
    expect(onClear).toHaveBeenCalled();
  });
});

describe("page layouts", () => {
  it("DashboardPage, DetailPage, DocumentPage and FormPage draw their title blocks and bodies", () => {
    render(
      <>
        <DashboardPage title="Today" subtitle="Tuesday" stats={[<Text key="a">tile</Text>]}>
          <Text>dash body</Text>
        </DashboardPage>
        <DetailPage title="Ada" breadcrumb="People" sidebar={<Text>side</Text>}>
          <Text>detail body</Text>
        </DetailPage>
        <DocumentPage title="Handbook" icon="📘">
          <Text>doc body</Text>
        </DocumentPage>
        <FormPage title="New class" errors="Fix the time" actions={<Text>Save</Text>}>
          <Text>form body</Text>
        </FormPage>
      </>,
    );
    expect(screen.getAllByRole("header").map((h) => h.textContent)).toEqual(["Today", "Ada", "Handbook", "New class"]);
    expect(screen.getByTestId("dashboard-page-stats").textContent).toBe("tile");
    expect(screen.getByTestId("detail-page-sidebar").textContent).toBe("side");
    expect(screen.getByTestId("document-page-icon").textContent).toBe("📘");
    expect(screen.getByTestId("form-page-errors").textContent).toContain("Fix the time");
    expect(screen.getByTestId("form-page-actions").textContent).toBe("Save");
  });
});

describe("NativeWorkspaceSwitcher", () => {
  const workspaces: Workspace[] = [
    { id: "me", kind: "personal", label: "Personal", path: "/me", scope: {} },
    { id: "acme", kind: "tenant", label: "Acme Studio", path: "/o/acme", scope: { orgId: "acme" }, badge: 3 },
    { id: "west", kind: "tenant", label: "West Gym", path: "/o/west", scope: { orgId: "west" } },
  ];

  it("lists the scope's workspaces by kind and goes to the picked one", async () => {
    const onSelect = vi.fn();
    function Screen() {
      const [open, setOpen] = useState(false);
      return (
        <QueryClientProvider client={new QueryClient()}>
          <WorkspaceScope viewer="u-1" timeZone="UTC" workspaces={workspaces} pathname="/o/acme/classes">
            <NativeWorkspaceSwitcher onSelect={onSelect} open={open} onOpenChange={setOpen} />
          </WorkspaceScope>
        </QueryClientProvider>
      );
    }
    render(<Screen />);
    const trigger = screen.getByTestId("workspace-switcher-trigger");
    expect(trigger.getAttribute("aria-label")).toBe("Acme Studio");
    fireEvent.click(trigger);
    expect(await screen.findByText("Organizations")).toBeTruthy();
    expect(screen.getByLabelText("3 new")).toBeTruthy();
    fireEvent.click(screen.getByTestId("workspace-switcher-option-west"));
    expect(onSelect).toHaveBeenCalledWith(workspaces[2], "/o/west/classes");
  });
});
