// The inbox view type: the tickets view as a three-pane inbox (segments with counts, the list,
// the open ticket). The open ticket lives in the URL (`?ticket=`), which the page owns.
import { useSearchParams } from "react-router";
import { ResourceView } from "@marktiderman/genesis-ui/data";
import { ticketsView } from "../lib/views/tickets.view";

export default function Tickets() {
  const [params, setParams] = useSearchParams();
  return (
    <ResourceView
      view={ticketsView}
      title="Support"
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
