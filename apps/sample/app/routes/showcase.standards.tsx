import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Badge,
  Alert,
  AlertTitle,
  AlertDescription,
  Button,
} from "@marktiderman/genesis-ui";
import { ExternalLink } from "lucide-react";
import { STANDARDS } from "../lib/portfolio-data";

export default function Standards() {
  return (
    <div className="mx-auto max-w-3xl p-6 space-y-6" data-testid="showcase-standards">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Standards</h1>
        <p className="text-muted-foreground mt-1">
          The rules every Genesis consumer follows — straight from the docs
          in this repo, not paraphrased.
        </p>
      </header>

      <Alert>
        <AlertTitle>Pull, never push</AlertTitle>
        <AlertDescription>
          Genesis ships breaking changes only at minor versions on 0.x.
          Consumer teams pull updates on their own cadence — Genesis never
          reaches into a consumer repo to change code.
        </AlertDescription>
      </Alert>

      {STANDARDS.map((s) => (
        <Card key={s.title} data-testid={`standard-${s.title.toLowerCase().replace(/\s+/g, "-")}`}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>{s.title}</CardTitle>
              <Badge variant="outline">@stable</Badge>
            </div>
            <CardDescription>{s.summary}</CardDescription>
          </CardHeader>
          <CardContent>
            <a href={s.href} target="_blank" rel="noreferrer">
              <Button variant="outline" size="sm">
                Read on GitHub <ExternalLink className="h-3 w-3 ml-1" />
              </Button>
            </a>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
