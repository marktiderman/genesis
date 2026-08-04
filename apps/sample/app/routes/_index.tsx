import { Navigate } from "react-router";

/**
 * Phase G — root redirects to /showcase, the new hero landing.
 * The CRUD demos still live at /dashboard / /items / /tasks etc. for
 * teams that want to see Genesis data primitives in action.
 */
export default function Index() {
  return <Navigate to="/showcase" replace />;
}
