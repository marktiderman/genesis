import { Navigate } from "react-router";

/** Genesis Data moved to /data when the Data Studio was renamed (ADR 0025). */
export default function Studio() {
  return <Navigate to="/data" replace />;
}
