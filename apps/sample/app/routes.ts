import {
  type RouteConfig,
  route,
  layout,
  index,
} from "@react-router/dev/routes";

export default [
  index("routes/_index.tsx"),
  // The playground's device frame: the form alone, outside the app shell.
  route("forms-frame", "routes/forms-frame.tsx"),
  // What a respondent sees: the form full screen, no app nav.
  route("preview/:scenario", "routes/preview.$scenario.tsx"),
  layout("routes/_layout.tsx", [
    route("dashboard", "routes/dashboard.tsx"),
    route("items", "routes/items.tsx"),
    route("items-custom", "routes/items-custom.tsx"),
    route("tasks", "routes/tasks.tsx"),
    route("orders", "routes/orders.tsx"),
    route("design-system", "routes/design-system.tsx"),
    route("sandbox", "routes/sandbox.tsx"),
    route("forms-playground", "routes/forms-playground.tsx"),
    route("forms-builder", "routes/forms-builder.tsx"),
    route("forms", "routes/forms.tsx", [
      index("routes/forms._index.tsx"),
      route(":scenario", "routes/forms.$scenario.tsx"),
    ]),
    route("settings", "routes/settings.tsx"),
    // Shell sub-navigation demo: a page with four children.
    route("projects", "routes/projects._index.tsx"),
    route("projects/:projectId/:tab?", "routes/projects.$projectId.tsx"),
    route("studio", "routes/studio.tsx"),
    route("features", "routes/features.tsx"),
    // Phase G — Genesis Showcase portfolio routes
    route("showcase", "routes/showcase._index.tsx"),
    route("showcase/tokens", "routes/showcase.tokens._index.tsx"),
    route("showcase/tokens/:category", "routes/showcase.tokens.$category.tsx"),
    route("showcase/primitives", "routes/showcase.primitives._index.tsx"),
    route("showcase/primitives/:slug", "routes/showcase.primitives.$slug.tsx"),
    route("showcase/layouts", "routes/showcase.layouts._index.tsx"),
    route("showcase/layouts/:slug", "routes/showcase.layouts.$slug.tsx"),
    route("showcase/standards", "routes/showcase.standards.tsx"),
  ]),
] satisfies RouteConfig;
