/** The Data Studio on the demo's in-memory tables: spreadsheet editing as the signed-in role. */
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { useDataProvider } from "@marktiderman/genesis-core/provider";
import { FeatureGate } from "@marktiderman/genesis-features/gate/react";
import { DataStudio, createSearchParamsRouter } from "@marktiderman/genesis-studio";
import { Alert, AlertDescription, AlertTitle } from "@marktiderman/genesis-ui";
import { PageHeader } from "@marktiderman/genesis-ui/layout";
import { useDemo } from "../demo/context";
import { studioProvider } from "../demo/provider";
import { ORGS } from "../demo/tenants";

export default function DemoData() {
  const { org, role, ws } = useDemo();
  const base = useDataProvider();
  const provider = useMemo(() => studioProvider(base, role === "owner", org ? [org.id] : ORGS.map((o) => o.id)), [base, role, org]);
  const [params, setParams] = useSearchParams();
  const router = useMemo(() => createSearchParamsRouter(params, setParams), [params, setParams]);
  // The page is prerendered without a query string and the studio renders from `?table=`, so it
  // waits until the page runs in the browser; otherwise a deep link wouldn't match the HTML.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return (
    <div className="space-y-4 p-4 md:p-6" data-testid="demo-studio">
      <PageHeader
        title="Data Studio"
        subtitle="The app's own tables, edited like a spreadsheet. In an app it runs as you, under the database's row rules; here, on the demo's in-memory rows."
      />
      <FeatureGate
        feature="demo-data-studio"
        upsell={({ unlock }) => (
          <Alert>
            <AlertTitle>Part of the {unlock.plan} plan</AlertTitle>
            <AlertDescription>{org?.name} isn't on it, so the gate offers an upgrade instead of the studio.</AlertDescription>
          </Alert>
        )}
      >
        {mounted ? (
          // Keyed by workspace and role: the studio caches rows per session, so a new organization starts fresh.
          <DataStudio
            key={`${ws}-${role}`}
            provider={provider}
            router={router}
            sessionKey={`demo-${ws}-${role}`}
            title={org?.name ?? "All organizations"}
          />
        ) : (
          <p className="text-sm text-muted-foreground">Loading…</p>
        )}
      </FeatureGate>
    </div>
  );
}
