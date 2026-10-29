import { Navigate } from "react-router";

/** Record pages are now the demo app's client pages (RecordView). */
export default function Projects() {
  return <Navigate to="/demo/harbor/clients/harbor-c1" replace />;
}
