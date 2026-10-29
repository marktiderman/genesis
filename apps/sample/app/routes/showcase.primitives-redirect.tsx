import { Navigate, useLocation, type MetaFunction } from "react-router";

/** `/showcase/primitives[/:slug]` → `/showcase/elements[/:slug]`, keeping the query. */
export function elementsPath(pathname: string): string {
  return pathname.replace(/^\/showcase\/primitives(?=\/|$)/, "/showcase/elements");
}

// Prerendered as a static page, so the redirect is also a meta refresh for hosts that can't
// redirect and for readers without JavaScript; search engines follow the canonical link.
export const meta: MetaFunction = ({ location }) => {
  const to = elementsPath(location.pathname) + location.search;
  return [
    { title: "Moved to Elements" },
    { "http-equiv": "refresh", content: `0; url=${to}` },
    { tagName: "link", rel: "canonical", href: to },
    { name: "robots", content: "noindex" },
  ];
};

export default function PrimitivesRedirect() {
  const location = useLocation();
  return <Navigate to={elementsPath(location.pathname) + location.search} replace />;
}
