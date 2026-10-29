// A list screen is one line: the view (app/lib/views/items.view.ts) describes
// the data, the columns, the form and the order; ResourceView draws the
// screen with search, sort, grid/table/list modes and a detail panel.
import { Package } from "lucide-react";
import { ResourceView } from "@marktiderman/genesis-ui/data";
import { itemsView } from "../lib/views/items.view";

export default function Items() {
  return (
    <ResourceView
      view={itemsView}
      title="Items"
      subtitle="Manage your inventory and product listings. One view definition draws this whole screen."
      icon={Package}
      mode="grid"
      detail="panel"
    />
  );
}
