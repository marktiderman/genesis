import type { Meta, StoryObj } from "@storybook/react-vite";
import { AppShell, type AppShellOptions, type NavigationNode, type NavItem } from "@marktiderman/genesis-ui/layout";
import { CreditCard, Gift, LayoutDashboard, LifeBuoy, Mail, Megaphone, Package, Settings, User, Users } from "lucide-react";

/**
 * How a navigation node's children are drawn (`NavigationNode.subNav`), at any depth: tabs, a
 * second quieter tab row, the breadcrumb fold at a third level, a list, a hub, and each one's
 * phone form. Products › Offers › Drafts is three tabbed levels; Marketing is a hub; Settings
 * is a list. `headerItems` are the top bar's links (Help, here).
 */
const meta: Meta<typeof AppShell> = {
  title: "Foundation/Data/AppShell/Menu variants",
  component: AppShell,
  parameters: { layout: "fullscreen" },
};
export default meta;
type Story = StoryObj<typeof AppShell>;

const tree = (variant: { offers?: NavigationNode<NavItem>["subNav"]; drafts?: boolean } = {}): NavigationNode<NavItem> => ({
  id: "app",
  path: "/",
  label: "Home",
  items: [
    { to: "/", icon: LayoutDashboard, label: "Home", end: true },
    { to: "/clients", icon: Users, label: "Clients" },
    { to: "/products", icon: Package, label: "Products" },
    { to: "/marketing", icon: Megaphone, label: "Marketing" },
    { to: "/settings", icon: Settings, label: "Settings" },
  ],
  children: [
    {
      id: "products",
      path: "/products",
      label: "Products",
      subNav: "tabs",
      items: [
        { to: "/products/offers", icon: Gift, label: "Offers" },
        { to: "/products/catalog", icon: Package, label: "Catalog" },
        { to: "/products/pricing", icon: CreditCard, label: "Pricing" },
      ],
      children: [
        {
          id: "offers",
          path: "/products/offers",
          label: "Offers",
          ...(variant.offers ? { subNav: variant.offers } : {}),
          items: [
            { to: "/products/offers", icon: Gift, label: "All", end: true },
            { to: "/products/offers/drafts", icon: Gift, label: "Drafts", badge: 3 },
            { to: "/products/offers/archived", icon: Gift, label: "Archived" },
          ],
          children: [
            {
              id: "drafts",
              path: "/products/offers/drafts",
              label: "Drafts",
              items: variant.drafts
                ? [
                    { to: "/products/offers/drafts", icon: Gift, label: "Mine", end: true },
                    { to: "/products/offers/drafts/shared", icon: Gift, label: "Shared with me" },
                  ]
                : [],
            },
          ],
        },
      ],
    },
    {
      id: "marketing",
      path: "/marketing",
      label: "Marketing",
      subNav: "hub",
      items: [
        { to: "/marketing/campaigns", icon: Megaphone, label: "Campaigns" },
        { to: "/marketing/emails", icon: Mail, label: "Emails", badge: 2 },
        { to: "/marketing/referrals", icon: Users, label: "Referrals" },
        { to: "/marketing/gifts", icon: Gift, label: "Gift cards" },
      ],
    },
    {
      id: "settings",
      path: "/settings",
      label: "Settings",
      subNav: "list",
      items: [
        { to: "/settings/profile", icon: User, label: "Profile" },
        { to: "/settings/billing", icon: CreditCard, label: "Billing" },
        { to: "/settings/team", icon: Users, label: "Team" },
      ],
    },
  ],
});

const headerItems: NavItem[] = [{ to: "/help", icon: LifeBuoy, label: "Help" }];

function shell(activePath: string, title: string, options: AppShellOptions = {}, variant?: Parameters<typeof tree>[0]) {
  return (
    <AppShell
      appName="Acme"
      appLogo="A"
      navigation={tree(variant)}
      headerItems={headerItems}
      activePath={activePath}
      options={{ showThemeToggle: false, configurable: false, ...options }}
    >
      <div className="space-y-2">
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="text-sm text-muted-foreground">The page's own content.</p>
      </div>
    </AppShell>
  );
}

const phone = { viewport: { value: "mobile1", isRotated: false } };

/** One tabbed level: Products' Offers, Catalog and Pricing as the page's tab row. */
export const Tabs: Story = { name: "Tabs", render: () => shell("/products/catalog", "Catalog") };

/** Products › Offers: Offers' own tabs as a second, quieter row under Products' row. */
export const SecondRow: Story = { name: "Tabs: second row", render: () => shell("/products/offers/drafts", "Drafts") };

/** Products › Offers › Drafts, all tabbed: the outer row folds into a breadcrumb picker, two rows stay. */
export const ThirdLevel: Story = {
  name: "Tabs: third level folds into a breadcrumb",
  render: () => shell("/products/offers/drafts/shared", "Shared with me", {}, { drafts: true }),
};

/** Settings as a list beside the page. */
export const List: Story = { name: "List", render: () => shell("/settings/billing", "Billing") };

/** Marketing's own page as cards, one per child. */
export const Hub: Story = { name: "Hub", render: () => shell("/marketing", "Marketing") };

/** Help is a top-bar link (`headerItems`), here with the top-tabs layout. */
export const HeaderItems: Story = {
  name: "Top bar links (top-tabs)",
  render: () => shell("/clients", "Clients", { navigation: "top-tabs" }),
};

/** Phone, `phoneTabs: "bottom"` (default): Products' row is the bottom bar, Offers' a segmented control. */
export const PhoneBottom: Story = {
  name: "Phone: tabs in the bottom bar (default)",
  globals: phone,
  render: () => shell("/products/offers/drafts", "Drafts"),
};

/** Phone, `phoneTabs: "top"`: Products' row stays at the top as a row you swipe; the bar keeps the app's areas. */
export const PhoneTop: Story = {
  name: "Phone: tabs at the top",
  globals: phone,
  render: () => shell("/products/offers/drafts", "Drafts", { phoneTabs: "top" }),
};

/** Phone, a list level's own page: the list. */
export const PhoneListPage: Story = { name: "Phone: list page", globals: phone, render: () => shell("/settings", "Settings") };

/** Phone, a list's item: the item, with the way back to the list. */
export const PhoneListItem: Story = { name: "Phone: list item", globals: phone, render: () => shell("/settings/billing", "Billing") };

/** Phone, a hub: one card per row. */
export const PhoneHub: Story = { name: "Phone: hub", globals: phone, render: () => shell("/marketing", "Marketing") };
