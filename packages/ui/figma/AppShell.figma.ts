// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=59-224
// source=packages/ui/src/components/layout/AppShell.tsx
// component=AppShell
// "Show secondary group" is the sidebar group (secondaryNavItems, up to 8 items in the
// component); "Show rail footer" is the sidebar footer above the user (footer).
import figma from 'figma'
const instance = figma.selectedInstance

const collapsed = instance.getEnum('collapsed', { false: 'false', true: 'true' })
const density = instance.getEnum('density', { comfortable: 'comfortable', compact: 'compact' })
const showSecondary = instance.getBoolean('Show secondary group')
const secondaryLabel = instance.getString('Secondary label')
const showFooter = instance.getBoolean('Show rail footer')

export default {
  example: figma.code`<AppShell
  appName="Acme"
  navItems={navItems}
  collapsed={${collapsed}}
  onCollapsedChange={setCollapsed}
  options={{ density: "${density}", showSecondaryNav: ${showSecondary}, showFooter: ${showFooter} }}${showSecondary ? figma.code`
  secondaryNavItems={secondaryNavItems}
  secondaryNavLabel="${secondaryLabel}"` : ''}${showFooter ? figma.code`
  footer={footer}` : ''}
>
  {children}
</AppShell>`,
  imports: ['import { AppShell } from "@marktiderman/genesis-ui/layout"'],
  id: 'app-shell',
  metadata: { nestable: false },
}
