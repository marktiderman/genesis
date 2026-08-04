import {
  type RouteConfig,
  route,
  layout,
  index,
} from "@react-router/dev/routes";

export default [
  index("routes/_index.tsx"),
  layout("routes/_layout.tsx", [
    route("dashboard", "routes/dashboard.tsx"),
    route("items", "routes/items.tsx"),
    route("items-custom", "routes/items-custom.tsx"),
    route("tasks", "routes/tasks.tsx"),
    route("orders", "routes/orders.tsx"),
    route("design-system", "routes/design-system.tsx"),
    route("sandbox", "routes/sandbox.tsx"),
    route("settings", "routes/settings.tsx"),
    // Phase G — Genesis Showcase portfolio routes
    route("showcase", "routes/showcase._index.tsx"),
    route("showcase/tokens", "routes/showcase.tokens._index.tsx"),
    route("showcase/tokens/:category", "routes/showcase.tokens.$category.tsx"),
    route("showcase/primitives", "routes/showcase.primitives._index.tsx"),
    route("showcase/primitives/:slug", "routes/showcase.primitives.$slug.tsx"),
    route("showcase/layouts", "routes/showcase.layouts._index.tsx"),
    route("showcase/layouts/:slug", "routes/showcase.layouts.$slug.tsx"),
    route("showcase/data", "routes/showcase.data._index.tsx"),
    route("showcase/data/:slug", "routes/showcase.data.$slug.tsx"),
    route("showcase/standards", "routes/showcase.standards.tsx"),
  ]),
] satisfies RouteConfig;
