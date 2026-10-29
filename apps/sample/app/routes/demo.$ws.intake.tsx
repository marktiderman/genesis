/**
 * The intake form. A submission is checked against the same
 * definition (as the server would) and becomes a client in this
 * organization's list: open the list to see the loop close.
 */
import { useState } from "react";
import { Link, Navigate } from "react-router";
import type { FormEngine, Json } from "@marktiderman/genesis-forms";
import { validateSubmission } from "@marktiderman/genesis-forms/server";
import { Form } from "@marktiderman/genesis-forms-web";
import { FeatureGate } from "@marktiderman/genesis-features/gate/react";
import { Alert, AlertDescription, AlertTitle, Button } from "@marktiderman/genesis-ui";
import { PageHeader } from "@marktiderman/genesis-ui/layout";
import { useDemo } from "../demo/context";
import { useClients } from "../demo/data";
import { intakeForm } from "../demo/intake.form";
import { ViewSource } from "../demo/source";
import formSource from "../demo/intake.form.ts?raw";

export default function DemoIntake() {
  const { org, href } = useDemo();
  if (!org) return <Navigate to={href()} replace />;
  return <Intake />;
}

function Intake() {
  const { org, href } = useDemo();
  const { create } = useClients();
  const [added, setAdded] = useState<string | null>(null);
  const [run, setRun] = useState(0);

  const onSubmit = async (engine: FormEngine) => {
    const state = engine.getState();
    const answers: Record<string, Json> = {};
    for (const [key, value] of Object.entries(state.values)) if (value !== undefined) answers[key] = value as Json;
    const checked = validateSubmission(intakeForm.definition, { answers, events: state.events });
    if (!checked.ok) throw new Error("The form's own check refused this answer.");
    await create({
      org_id: org!.id,
      name: String(answers.name),
      email: String(answers.email),
      plan: String(answers.plan),
      notes: answers.notes ? String(answers.notes) : null,
      status: "lead",
      joined_on: new Date().toISOString().slice(0, 10),
    });
    setAdded(String(answers.name));
  };

  return (
    // Not FormPage: that renders a <form>, and the Genesis Form renders its own.
    <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6">
      <PageHeader
      title="Intake form"
      subtitle={`What a new ${org?.clientNoun.toLowerCase() ?? "client"} of ${org?.name ?? "the organization"} fills in. Submitting adds them to the list as a lead.`}
      actions={<ViewSource files={{ "intake.form.ts": formSource }} />}
    />
      <FeatureGate
        feature="demo-intake"
        fallback={
          <Alert>
            <AlertTitle>Switched off here</AlertTitle>
            <AlertDescription>{org?.name} turned the intake form off. An owner turns it back on in Settings.</AlertDescription>
          </Alert>
        }
      >
        {added ? (
          <Alert className="mb-4">
            <AlertTitle>{added} is on the list</AlertTitle>
            <AlertDescription className="flex flex-wrap items-center gap-3">
              <Link className="underline" to={href("clients")}>Open the list</Link>
              <Button testID="demo-ws-intake-button-1" size="sm" variant="outline" onClick={() => { setAdded(null); setRun((n) => n + 1); }}>Fill it in again</Button>
            </AlertDescription>
          </Alert>
        ) : null}
        <Form key={run} form={intakeForm} presentation="embedded" onSubmit={onSubmit} />
      </FeatureGate>
    </div>
  );
}
