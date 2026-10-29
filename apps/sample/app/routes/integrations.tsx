/** The outside services Genesis works with (app/lib/integrations.ts), each linked to its feature. */
import { Badge, Card, CardDescription, CardHeader, CardTitle } from "@marktiderman/genesis-ui";
import type { FeatureLinks } from "@marktiderman/genesis-features";
import { features } from "../../../../features";
import { INTEGRATIONS } from "../lib/integrations";

const REPO = "https://github.com/marktiderman/genesis/blob/main";

export default function Integrations() {
  const categories = [...new Set(INTEGRATIONS.map((i) => i.category))];
  return (
    <div className="mx-auto max-w-5xl space-y-8 p-6" data-testid="integrations">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Integrations</h1>
        <p className="mt-1 text-muted-foreground">
          Genesis owns the contract (sign-in, email, flags, events) and each service plugs in behind it, so an app can
          switch or add one without changing its screens.
        </p>
      </header>
      {categories.map((category) => (
        <section key={category} className="space-y-3">
          <h2 className="text-lg font-semibold">{category}</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {INTEGRATIONS.filter((i) => i.category === category).map((i) => {
              const feature = (features as Record<string, { name: string; links?: FeatureLinks }>)[i.feature]!;
              const code = feature.links?.code?.[0];
              return (
                <Card key={i.name} className="h-full" data-testid={`integration-${i.name}`}>
                  <CardHeader>
                    <div className="flex items-center justify-between gap-2">
                      <CardTitle className="text-base">{i.name}</CardTitle>
                      <Badge variant={i.status === "available" ? "default" : "outline"}>{i.status}</Badge>
                    </div>
                    <CardDescription>{i.what}</CardDescription>
                    {(
                      <p className="text-xs text-muted-foreground">
                        {code ? <a className="underline" href={`${REPO}/${code}`}>{feature.name}</a> : feature.name}
                      </p>
                    )}
                  </CardHeader>
                </Card>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
