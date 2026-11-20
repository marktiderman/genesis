import { Navigate, useLocation } from "react-router";

/** Genesis Data moved to /data when the Data Studio was renamed (ADR 0025). Keeps the link's query (table, record, …). */
export default function Studio() {
  const { search, hash } = useLocation();
  return <Navigate to={{ pathname: "/data", search, hash }} replace />;
}
