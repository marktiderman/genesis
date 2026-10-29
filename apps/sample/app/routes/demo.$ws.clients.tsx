/** The client list: one line, from the view. The workspace scopes it; the guards narrow it by role. */
import { Navigate, useNavigate } from "react-router";
import { useState } from "react";
import { Code } from "lucide-react";
import { ResourceView } from "@marktiderman/genesis-ui/data";
import { useDemo } from "../demo/context";
import { ViewSource } from "../demo/source";
import { clientsView } from "../demo/views/clients.view";
import viewSource from "../demo/views/clients.view.ts?raw";

export default function DemoClients() {
  const [source, setSource] = useState(false);
  const { org, role, self, href } = useDemo();
  const navigate = useNavigate();
  if (role === "client" && self) return <Navigate to={href(`clients/${self}`)} replace />;
  return (
    <>
    <ViewSource files={{ "clients.view.ts": viewSource }} open={source} onOpenChange={setSource} />
    <ResourceView
      view={clientsView}
      title={org ? `${org.clientNoun}s` : "Clients"}
      subtitle={org ? `${org.name}'s ${org.clientNoun.toLowerCase()}s. Switch organization and the list follows.` : "Every organization's clients."}
      detail="route"
      onNavigate={(to) => navigate(href(to.replace(/^\//, "")))}
      secondaryActions={[{ label: "View source", icon: Code, onClick: () => setSource(true) }]}
    />
    </>
  );
}
