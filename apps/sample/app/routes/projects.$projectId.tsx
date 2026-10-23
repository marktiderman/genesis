import { useParams } from "react-router";
import { Activity, CheckSquare, FileText, Settings } from "lucide-react";
import { Badge, Card, CardContent } from "@marktiderman/genesis-ui";
import {
  AppShellPageHeader,
  AppShellSubNavEnd,
  PageHeader,
  useAppShellSubNav,
} from "@marktiderman/genesis-ui/layout";

import { PROJECTS } from "../data/projects";

const TAB_TITLES: Record<string, string> = {
  overview: "Overview",
  tasks: "Tasks",
  activity: "Activity",
  settings: "Settings",
};

// A page with four children. The shell already knows them from the
// navigation tree (`_layout.tsx`); the page hands over the same list with
// live counts as badges, and puts a status chip at the end of the tab row.
export default function ProjectPage() {
  const { projectId = "", tab = "overview" } = useParams();
  const project = PROJECTS.find((p) => p.id === projectId);
  const base = `/projects/${projectId}`;

  useAppShellSubNav(
    project
      ? [
          { to: base, icon: FileText, label: "Overview", end: true },
          { to: `${base}/tasks`, icon: CheckSquare, label: "Tasks", badge: project.tasks },
          { to: `${base}/activity`, icon: Activity, label: "Activity", badge: project.activity.length ? "New" : undefined },
          { to: `${base}/settings`, icon: Settings, label: "Settings" },
        ]
      : null,
  );

  if (!project) {
    return <PageHeader title="Project not found" />;
  }

  return (
    <div className="space-y-6">
      <AppShellSubNavEnd>
        <Badge variant="success">Ready to publish</Badge>
      </AppShellSubNavEnd>
      {/* The resource header goes above the tab row, as in the design. */}
      <AppShellPageHeader>
        <PageHeader title={`${project.name} · ${TAB_TITLES[tab] ?? tab}`} />
      </AppShellPageHeader>
      <Card>
        <CardContent className="space-y-2 p-4 text-sm">
          {tab === "activity" ? (
            <ul className="list-disc space-y-1 pl-5">
              {project.activity.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground">
              {TAB_TITLES[tab] ?? tab} for {project.name}. Each tab is a real link, so
              this URL is a deep link: reload it and the same tab is current.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
