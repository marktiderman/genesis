import { Navigate, useLocation, type MetaFunction } from "react-router";
import { SITE_BASE, SITE_URL } from "../lib/site";

/** `/showcase/primitives[/:slug]` → `/showcase/elements[/:slug]`. */
export function elementsPath(pathname: string): string {
  return pathname.replace(/^\/showcase\/primitives(?=\/|$)/, "/showcase/elements");
}

// Prerendered as a static page, so the redirect is also a meta refresh for hosts that can't
// redirect and for readers without JavaScript; search engines follow the canonical link. Both
// carry the base path (the router's pathname doesn't) and no query, so the prerendered head and
// the hydrated one match.
export const meta: MetaFunction = ({ location }) => {
  const to = `${SITE_BASE}${elementsPath(location.pathname)}`;
  return [
    { title: "Moved to Elements" },
    { "http-equiv": "refresh", content: `0; url=${to}` },
    { tagName: "link", rel: "canonical", href: `${SITE_URL}${to}` },
    { name: "robots", content: "noindex" },
  ];
};

// Runs while the static page parses, before the refresh, and keeps the query and hash
// (`?surface=native` links).
const KEEP_QUERY = `location.replace(location.pathname.replace(/\\/showcase\\/primitives(?=\\/|$)/, "/showcase/elements") + location.search + location.hash)`;

export default function PrimitivesRedirect() {
  const location = useLocation();
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: KEEP_QUERY }} />
      <Navigate to={elementsPath(location.pathname) + location.search + location.hash} replace />
    </>
  );
}
