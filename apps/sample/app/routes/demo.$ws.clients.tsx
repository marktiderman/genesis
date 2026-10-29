/** The client list: one line, from the view. The workspace scopes it; the view's guards narrow what each role may do, and the shell keeps clients out (canOpen). */
import { useNavigate } from "react-router";
import { useState } from "react";
import { Code } from "lucide-react";
import { ResourceView } from "@marktiderman/genesis-ui/data";
import { useDemo } from "../demo/context";
import { ViewSource } from "../demo/source";
import { clientsView } from "../demo/views/clients.view";
import viewSource from "../demo/views/clients.view.ts?raw";

export default function DemoClients() {
  const [source, setSource] = useState(false);
  const { org, href } = useDemo();
  const navigate = useNavigate();
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
