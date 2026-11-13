/**
 * Theme parts: the named pieces of genesis-ui a theme can style.
 *
 * Every part is an element with `data-slot="<name>"`, and the attributes
 * listed with it (`data-variant`, `data-size`, `data-active`, `data-state`…),
 * so a theme reaches any of them by name, without knowing the component's
 * markup or classes: `card`, `button[variant=outline]`,
 * `shell-nav-item[active]`. This list is the contract; genesis-ui's tests
 * check that every part here is rendered by a component with its attributes,
 * and a renamed part is a breaking change.
 *
 * An app's own parts (its components with their own `data-slot`) are named
 * `app-<name>`, so they never collide with a Genesis part.
 */

export interface ThemePartInfo {
  /** The `data-slot` value. */
  name: string;
  /** The `data-*` attributes it carries, without `data-`. */
  attributes: readonly string[];
  description: string;
}

const p = (name: string, description: string, attributes: string[] = []): ThemePartInfo =>
  Object.freeze({ name, description, attributes: Object.freeze(attributes) });

export const THEME_PARTS: readonly ThemePartInfo[] = Object.freeze([
  // Controls
  p("button", "A button.", ["variant", "size"]),
  p("input", "A text field."),
  p("textarea", "A multi-line field."),
  p("select-trigger", "A select's closed field."),
  p("select-content", "A select's open list."),
  p("select-item", "One option in a select.", ["state"]),
  p("checkbox", "A checkbox.", ["state"]),
  p("switch", "A switch.", ["state"]),
  p("label", "A field's label."),
  // Surfaces
  p("card", "A card."),
  p("card-header", "A card's header."),
  p("card-title", "A card's title."),
  p("card-description", "A card's description."),
  p("card-content", "A card's body."),
  p("card-footer", "A card's footer."),
  p("badge", "A badge.", ["variant"]),
  p("popover", "A popover."),
  p("dropdown-menu", "A menu."),
  p("dropdown-menu-item", "One item in a menu."),
  p("context-menu", "A right-click menu."),
  p("hover-card", "A card shown on hover."),
  p("tooltip", "A tooltip."),
  p("dialog-overlay", "The shade behind a dialog."),
  p("dialog", "A dialog.", ["mobile-layout"]),
  p("dialog-title", "A dialog's title."),
  p("sheet", "A sheet sliding in from an edge.", ["side"]),
  p("sheet-title", "A sheet's title."),
  // Data
  p("table-container", "A table's scrolling box."),
  p("table", "A table."),
  p("table-row", "A table row.", ["state"]),
  p("table-head", "A column heading."),
  p("table-cell", "A table cell."),
  p("tabs-list", "A row of tabs."),
  p("tabs-trigger", "One tab.", ["state"]),
  p("tabs-content", "A tab's panel."),
  // Widgets: tiles fed by a view, and the one tile StatCard, HeadlineNumbers and SummaryCard draw
  p("widget", "A widget's tile.", ["kind", "state"]),
  p("widget-label", "A tile's label."),
  p("widget-value", "A tile's number."),
  p("widget-detail", "The short line under a tile's number."),
  p("widget-body", "A widget's bar, list or chart, under its number."),
  p("widget-grid", "A dashboard's grid of widgets."),
  p("stat-card", "A stat card."),
  p("headline-numbers", "A row of headline numbers."),
  p("headline-number", "One headline number."),
  p("summary-card", "A summary card."),
  // The app shell
  p("shell", "The whole app shell: its density, navigation style, frame and the zone you are in.", ["density", "navigation", "frame", "zone"]),
  p("shell-sidebar", "The desktop sidebar.", ["collapsed"]),
  p("shell-nav-item", "A sidebar item; in the page tree, its depth (0 at the top).", ["active", "depth"]),
  p("shell-page-tree", "The page tree: the sidebar's nested, collapsible pages (navigation page-tree)."),
  p("shell-top-tabs", "The desktop top bar of the top-tabs navigation: brand, tabs and the account."),
  p("shell-frame", "The page area's frame: flush to the sidebar, or an inset panel (frame inset).", ["frame"]),
  p("shell-header", "The top bar."),
  p("shell-main", "The page area beside the sidebar."),
  p("shell-mobile-nav", "The phone-width tab bar."),
  // Navigation pieces
  p("tab-bar", "A bottom tab bar (TabBar)."),
  p("tab-bar-item", "One tab in a tab bar.", ["active"]),
  p("sub-nav", "A row of navigation tabs (SubNavTabs, the top tabs)."),
  p("sub-nav-item", "One tab in a navigation tab row.", ["active"]),
  p("page-header", "A list page's header (PageHeader)."),
  p("page-header-title", "A page header's title."),
  // Page layouts
  p("dashboard-page", "A dashboard page."),
  p("dashboard-page-header", "A dashboard page's header."),
  p("dashboard-page-title", "A dashboard page's title."),
  p("detail-page", "A detail page."),
  p("detail-page-title", "A detail page's title."),
  p("form-page", "A form page."),
  p("form-page-title", "A form page's title."),
  p("settings-page", "A settings page."),
  p("settings-page-title", "A settings page's title."),
  p("settings-row", "One settings row."),
  p("document-page", "A document page: cover, icon, title and a reading column.", ["width"]),
  p("document-page-cover", "A document page's cover."),
  p("document-page-icon", "A document page's icon."),
  p("document-page-title", "A document page's title."),
  p("section", "A page section."),
  p("section-title", "A section's title."),
]);

/** A part by name, or undefined. */
export function getThemePart(name: string): ThemePartInfo | undefined {
  return THEME_PARTS.find((part) => part.name === name);
}
