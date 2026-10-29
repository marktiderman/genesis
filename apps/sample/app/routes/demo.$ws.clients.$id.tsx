/** One client's page: RecordView from the record view, with the shell's tabs as its sections. */
import { useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router";
import { useOne } from "@marktiderman/genesis-core/hooks";
import { Button } from "@marktiderman/genesis-ui";
import { RecordView } from "@marktiderman/genesis-ui/data";
import { EmptyState } from "@marktiderman/genesis-ui/empty-state";
import { Code } from "lucide-react";
import { useDemo } from "../demo/context";
import type { Client } from "../demo/seed";
import { ViewSource } from "../demo/source";
import { clientRecordView } from "../demo/views/client.record";
import recordSource from "../demo/views/client.record.ts?raw";
import viewSource from "../demo/views/clients.view.ts?raw";

export default function DemoClient() {
  const { id = "", section } = useParams();
  const { href, org, role, self } = useDemo();
  const navigate = useNavigate();
  const [source, setSource] = useState(false);
  const { data: row, isLoading } = useOne<Client>("clients", id);
  const visible = row && (!org || row.org_id === org.id) && (role !== "client" || row.id === self);

  // The first section is the record's address without one: send it there so its tab shows as current.
  if (!section) return <Navigate to={href(`clients/${id}/bookings`)} replace />;
  if (isLoading) return <p className="p-6 text-sm text-muted-foreground">Loading…</p>;
  if (!visible) {
    return (
      <EmptyState
        title="Not here"
        description={role === "client" ? "A client sees only their own record." : "This record isn't in this organization."}
        action={<Button testID="demo-ws-clients-id-button-1" asChild><Link to={href(role === "client" ? "" : "clients")}>Back</Link></Button>}
      />
    );
  }
  return (
    <>
      <ViewSource files={{ "client.record.ts": recordSource, "clients.view.ts": viewSource }} open={source} onOpenChange={setSource} />
      <RecordView
        view={clientRecordView}
        row={row}
        section={section}
        sectionHref={(s) => href(`clients/${row.id}/${s}`)}
        parent={role === "client" ? undefined : <Link to={href("clients")}>{org?.clientNoun ?? "Client"}s</Link>}
        readinessLabels={{ ready: "Complete", problems: (n) => `${n} to fill in` }}
        onSaved={() => navigate(href(`clients/${row.id}/${section}`), { replace: true })}
        slots={{
          activity: (
            <div className="space-y-3 p-1 text-sm">
              <p className="text-muted-foreground">Joined on {row.joined_on}. {row.notes ?? "No notes yet."}</p>
              <Button testID="demo-ws-clients-id-button-2" variant="outline" size="sm" onClick={() => setSource(true)}>
                <Code className="mr-1.5 h-4 w-4" aria-hidden />
                View source
              </Button>
            </div>
          ),
        }}
      />
    </>
  );
}
