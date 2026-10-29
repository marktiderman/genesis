/** The demo's front door: pick an organization (the workspace switcher does the same). */
import { Link } from "react-router";
import { Card, CardDescription, CardHeader, CardTitle } from "@marktiderman/genesis-ui";
import { DashboardPage } from "@marktiderman/genesis-ui/dashboard-page";
import { ORGS, ROLES } from "../demo/tenants";

export default function DemoHome() {
  return (
    <DashboardPage
      title="A demo app on Genesis"
      subtitle="Three invented businesses share one app. Pick one to work in, then try it as an owner, a member of staff or a client. Everything runs in your browser on sample data; Reset puts it back."
    >
      <div className="grid gap-4 md:grid-cols-3">
        {ORGS.map((o) => (
          <Link key={o.id} to={`/demo/${o.id}`} className="block" data-testid={`demo-org-${o.id}`}>
            <Card className="h-full transition hover:border-primary/50">
              <CardHeader>
                <CardTitle className="text-base">{o.name}</CardTitle>
                <CardDescription>{o.kind}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
      <div className="mt-6 space-y-1 text-sm text-muted-foreground">
        {ROLES.map((r) => (
          <p key={r.id}>
            <span className="font-medium text-foreground">{r.label}:</span> {r.description}
          </p>
        ))}
      </div>
    </DashboardPage>
  );
}
