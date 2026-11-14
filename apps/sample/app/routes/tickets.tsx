// The inbox view type: the tickets view as a three-pane inbox (segments with counts, the list,
// the open ticket). The open ticket lives in the URL (`?ticket=`), which the page owns. Solve (the
// view's `done` action, also the e key) runs here: the in-memory provider runs no actions itself.
import { useSearchParams } from "react-router";
import { useResource } from "@marktiderman/genesis-core";
import { ResourceView } from "@marktiderman/genesis-ui/data";
import type { Ticket } from "../lib/data";
import { ticketsView } from "../lib/views/tickets.view";

export default function Tickets() {
  const [params, setParams] = useSearchParams();
  const { update } = useResource<Ticket>("tickets", { enabled: false });
  return (
    <ResourceView
      view={ticketsView}
      title="Support"
      onAction={async (name, ticket) => {
        if (name === "done") await update(String(ticket.id), { status: "solved" });
      }}
      inbox={{
        selected: params.get("ticket"),
        onSelectedChange: (id) =>
          setParams((p) => {
            if (id) p.set("ticket", id);
            else p.delete("ticket");
            return p;
          }),
      }}
    />
  );
}
