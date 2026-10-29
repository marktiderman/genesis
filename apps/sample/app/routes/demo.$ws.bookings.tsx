import { useState } from "react";
import { Code } from "lucide-react";
import { ResourceView } from "@marktiderman/genesis-ui/data";
import { useDemo } from "../demo/context";
import { ViewSource } from "../demo/source";
import { bookingsView } from "../demo/views/bookings.view";
import viewSource from "../demo/views/bookings.view.ts?raw";

export default function DemoBookings() {
  const [source, setSource] = useState(false);
  const { org } = useDemo();
  return (
    <>
    <ViewSource files={{ "bookings.view.ts": viewSource }} open={source} onOpenChange={setSource} />
    <ResourceView
      view={bookingsView}
      title="Bookings"
      subtitle={org ? `${org.name}'s bookings, newest first.` : "Every organization's bookings."}
      mode="table"
      secondaryActions={[{ label: "View source", icon: Code, onClick: () => setSource(true) }]}
    />
    </>
  );
}
