/** The Data Studio on the demo's in-memory tables: spreadsheet editing as the signed-in role. */
import { useMemo } from "react";
import { useSearchParams } from "react-router";
import { useDataProvider } from "@marktiderman/genesis-core/provider";
import { FeatureGate } from "@marktiderman/genesis-features/gate/react";
import { DataStudio, createSearchParamsRouter } from "@marktiderman/genesis-studio";
import { Alert, AlertDescription, AlertTitle } from "@marktiderman/genesis-ui";
import { useDemo } from "../demo/context";
import { studioProvider } from "../demo/provider";
import { ORGS } from "../demo/tenants";

export default function DemoData() {
  const { org, role } = useDemo();
  const base = useDataProvider();
  const provider = useMemo(() => studioProvider(base, role === "owner", org ? [org.id] : ORGS.map((o) => o.id)), [base, role, org]);
  const [params, setParams] = useSearchParams();
  const router = useMemo(() => createSearchParamsRouter(params, setParams), [params, setParams]);
  return (
    <div className="space-y-4 p-4 md:p-6" data-testid="demo-studio">
      <header>
        <h1 className="text-xl font-semibold">Data Studio</h1>
        <p className="text-sm text-muted-foreground">
          The app's own tables, edited like a spreadsheet. In an app it runs as you, under the database's row rules; here, on the demo's in-memory rows.
        </p>
      </header>
      <FeatureGate
        feature="demo-data-studio"
        upsell={({ unlock }) => (
          <Alert>
            <AlertTitle>Part of the {unlock.plan} plan</AlertTitle>
            <AlertDescription>{org?.name} isn't on it, so the gate offers an upgrade instead of the studio.</AlertDescription>
          </Alert>
        )}
      >
        <DataStudio provider={provider} router={router} sessionKey={`demo-${role}`} title={org?.name ?? "All organizations"} />
      </FeatureGate>
    </div>
  );
}
