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
  // The genesis-sites editor: full screen, outside the app shell.
  route("sites-editor", "routes/sites-editor.tsx"),
  // The demo app: its own shell, three organizations as workspaces.
  route("demo", "routes/demo.tsx", [
    index("routes/demo._index.tsx"),
    route(":ws", "routes/demo.$ws._index.tsx"),
    route(":ws/clients", "routes/demo.$ws.clients.tsx"),
    route(":ws/clients/:id/:section?", "routes/demo.$ws.clients.$id.tsx"),
    route(":ws/bookings", "routes/demo.$ws.bookings.tsx"),
    route(":ws/intake", "routes/demo.$ws.intake.tsx"),
    route(":ws/chat", "routes/demo.$ws.chat.tsx"),
    route(":ws/assistant", "routes/demo.$ws.assistant.tsx"),
    route(":ws/data", "routes/demo.$ws.data.tsx"),
    route(":ws/settings", "routes/demo.$ws.settings.tsx"),
  ]),
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
    // The old record-page sample moved to the demo app's client pages.
    route("projects/*", "routes/projects.tsx"),
    route("studio", "routes/studio.tsx"),
    route("features", "routes/features.tsx"),
    // genesis-sites: two demo sites in frames (sites-demo/ serves them).
    route("sites", "routes/sites.tsx"),
    // genesis-chat: the panel on the in-memory client.
    route("chat", "routes/chat.tsx"),
    // The design system: tokens, primitives, layouts and standards.
    // Generated at build from packages/* (app/lib/catalog.server.ts).
    route("integrations", "routes/integrations.tsx"),
    route("packages", "routes/packages._index.tsx"),
    route("packages/:name", "routes/packages.$name.tsx"),
    route("showcase", "routes/showcase._index.tsx"),
    route("showcase/tokens", "routes/showcase.tokens._index.tsx"),
    route("showcase/tokens/:category", "routes/showcase.tokens.$category.tsx"),
    route("showcase/elements", "routes/showcase.elements._index.tsx"),
    route("showcase/elements/:slug", "routes/showcase.elements.$slug.tsx"),
    // The old /showcase/primitives addresses: "primitive" is a package layer now (ADR 0005).
    route("showcase/primitives", "routes/showcase.primitives-redirect.tsx", { id: "showcase-primitives-redirect" }),
    route("showcase/primitives/:slug", "routes/showcase.primitives-redirect.tsx", { id: "showcase-primitive-redirect" }),
    route("showcase/layouts", "routes/showcase.layouts._index.tsx"),
    route("showcase/layouts/:slug", "routes/showcase.layouts.$slug.tsx"),
    route("showcase/standards", "routes/showcase.standards.tsx"),
  ]),
] satisfies RouteConfig;
