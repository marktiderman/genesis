import { FolderKanban } from "lucide-react";
import { Card, CardContent } from "@marktiderman/genesis-ui";
import { PageHeader } from "@marktiderman/genesis-ui/layout";
import { ReactRouterLink } from "@marktiderman/genesis-ui/router/react-router";

import { PROJECTS } from "../data/projects";

// The parent of a project page: the mobile bar's "back" item lands here.
export default function Projects() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Projects"
        subtitle="Open one to see the shell's sub-navigation: tabs on desktop, the bottom bar on a phone."
        icon={FolderKanban}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        {PROJECTS.map((p) => (
          <ReactRouterLink key={p.id} href={`/projects/${p.id}`} className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Card className="transition-colors hover:bg-muted/50">
              <CardContent className="space-y-1 p-4">
                <p className="font-medium">{p.name}</p>
                <p className="text-sm text-muted-foreground">
                  {p.tasks} tasks · {p.members} members
                </p>
              </CardContent>
            </Card>
          </ReactRouterLink>
        ))}
      </div>
    </div>
  );
}
