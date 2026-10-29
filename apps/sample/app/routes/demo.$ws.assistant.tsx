/** The assistant: one AI task through genesis-ai's useAiStream, answered in the browser. */
import { useMemo, useState } from "react";
import { useAiStream } from "@marktiderman/genesis-ai/react";
import { FeatureGate } from "@marktiderman/genesis-features/gate/react";
import { Alert, AlertDescription, AlertTitle, Badge, Button, Card, CardContent, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@marktiderman/genesis-ui";
import { PageHeader } from "@marktiderman/genesis-ui/layout";
import { cannedAiFetch, cannedSummary } from "../demo/ai";
import { useDemo } from "../demo/context";
import { useBookings, useClients } from "../demo/data";
import { ViewSource } from "../demo/source";
import aiSource from "../demo/ai.ts?raw";

export default function DemoAssistant() {
  const { org } = useDemo();
  const { rows: clients } = useClients();
  const { rows: bookings } = useBookings();
  const [clientId, setClientId] = useState<string>("");
  const picked = clients.find((c) => c.id === clientId);
  const fetcher = useMemo(
    () => cannedAiFetch(() => cannedSummary(picked, bookings.filter((b) => b.client_id === picked?.id).length)),
    [picked, bookings],
  );
  const ai = useAiStream("summarise-client", { fetch: fetcher });

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6">
      <PageHeader
        title="Assistant"
        subtitle="Summarise a client. In an app this task runs on the server: it reads the data as you, checks consent and budget, then calls the model."
        actions={<ViewSource files={{ "ai.ts": aiSource }} />}
      />
      <FeatureGate
        feature="demo-assistant"
        fallback={
          <Alert>
            <AlertTitle>The assistant is off</AlertTitle>
            <AlertDescription>Its release flag is off for {org?.name ?? "this organization"}. An owner turns it on in Settings.</AlertDescription>
          </Alert>
        }
      >
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="assistant-client">Client</Label>
                <Select value={clientId} onValueChange={setClientId}>
                  <SelectTrigger id="assistant-client">
                    <SelectValue placeholder="Pick a client" />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button disabled={!picked || ai.pending} onClick={() => void ai.run({ clientId })}>
                {ai.pending ? "Writing…" : "Summarise"}
              </Button>
            </div>
            {ai.text ? (
              <div className="space-y-2" aria-live="polite">
                <Badge variant="outline">Demo answer</Badge>
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{ai.text}</p>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </FeatureGate>
    </div>
  );
}
