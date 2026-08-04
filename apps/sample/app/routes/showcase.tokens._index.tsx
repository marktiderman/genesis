import { Link } from "react-router";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@marktiderman/genesis-ui";
import { TOKEN_CATEGORIES } from "../lib/portfolio-data";
import { ThemeControls } from "../components/theme-controls";

export default function TokensIndex() {
  return (
    <div className="mx-auto max-w-4xl p-6 space-y-6" data-testid="showcase-tokens-index">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Tokens</h1>
        <p className="text-muted-foreground mt-1">
          Six categories — every value sourced from{" "}
          <code className="text-xs bg-muted px-1 rounded">
            @marktiderman/genesis-design-system
          </code>
          .
        </p>
      </header>

      <ThemeControls />

      <div className="grid gap-3 md:grid-cols-2">
        {TOKEN_CATEGORIES.map((c) => (
          <Link
            key={c.slug}
            to={`/showcase/tokens/${c.slug}`}
            className="block hover:opacity-90 transition"
          >
            <Card data-testid={`tokens-link-${c.slug}`}>
              <CardHeader>
                <CardTitle>{c.label}</CardTitle>
                <CardDescription>{c.description}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
