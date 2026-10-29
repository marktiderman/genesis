/** A workspace's overview: numbers from its own rows, on DashboardPage. */
import { Link } from "react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@marktiderman/genesis-ui";
import { DashboardPage } from "@marktiderman/genesis-ui/dashboard-page";
import { useDemo } from "../demo/context";
import { useBookings, useClients } from "../demo/data";
import { ViewSource } from "../demo/source";
import tenantsSource from "../demo/tenants.ts?raw";
import routeSource from "./demo.tsx?raw";

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl tabular-nums">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}

export default function DemoOverview() {
  const { org, role, self, href } = useDemo();
  const { rows: clients, loading } = useClients(role === "client" && self ? [{ field: "id", operator: "eq", value: self }] : []);
  const { rows: bookings } = useBookings(role === "client" && self ? [{ field: "client_id", operator: "eq", value: self }] : []);
  const noun = org?.clientNoun.toLowerCase() ?? "client";
  const v = (n: number) => (loading ? "…" : n);
  return (
    <DashboardPage
      title={org ? org.name : "All organizations"}
      subtitle={
        role === "client"
          ? `Signed in as ${clients[0]?.name ?? `a ${noun}`}: you see your own record and bookings, nothing else.`
          : org
            ? `${org.kind}. Every number below is this organization's rows only.`
            : "The roll-up: every organization's rows together, for an owner of all three."
      }
      actions={<ViewSource files={{ "tenants.ts": tenantsSource, "routes/demo.tsx": routeSource }} />}
      stats={
        role === "client"
          ? [<Stat key="b" label="Your bookings" value={v(bookings.length)} />, <Stat key="n" label="Booked" value={v(bookings.filter((b) => b.status === "booked").length)} />]
          : [
              <Stat key="c" label={`${org?.clientNoun ?? "Client"}s`} value={v(clients.length)} />,
              <Stat key="a" label="Active" value={v(clients.filter((c) => c.status === "active").length)} />,
              <Stat key="l" label="Leads" value={v(clients.filter((c) => c.status === "lead").length)} />,
              <Stat key="b" label="Upcoming bookings" value={v(bookings.filter((b) => b.status === "booked").length)} />,
            ]
      }
    >
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Try this</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>Switch organization in the header: the lists, the numbers and the menu follow, with no screen code.</p>
          <p>Change "View as" at the bottom of the sidebar: a client sees only their own record; staff can't delete or open settings.</p>
          {role !== "client" ? (
            <p>
              Open <Link className="underline" to={href("clients")}>the {noun} list</Link>, add someone, then open their page.
            </p>
          ) : null}
        </CardContent>
      </Card>
    </DashboardPage>
  );
}
