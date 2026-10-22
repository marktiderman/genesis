import { Button, Card, Input, Label } from "@marktiderman/genesis-ui";
import { DataTable } from "@marktiderman/genesis-ui/data";

export function Page() {
  return (
    <Card className="bg-card text-foreground">
      <Label htmlFor="q">Search</Label>
      <Input id="q" />
      <Button>Go</Button>
      <DataTable />
    </Card>
  );
}
