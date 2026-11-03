// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=59-224
// source=packages/ui/src/components/layout/AppShell.tsx
// component=AppShell
import figma from 'figma'
const instance = figma.selectedInstance

const collapsed = instance.getEnum('collapsed', { false: 'false', true: 'true' })
const density = instance.getEnum('density', { comfortable: 'comfortable', compact: 'compact' })
const showSecondaryNav = instance.getBoolean('Show secondary nav')
const showFooter = instance.getBoolean('Show footer')

export default {
  example: figma.code`<AppShell
  appName="Acme"
  navItems={navItems}
  collapsed={${collapsed}}
  onCollapsedChange={setCollapsed}
  options={{ density: "${density}", showSecondaryNav: ${showSecondaryNav}, showFooter: ${showFooter} }}${showSecondaryNav ? figma.code`
  secondaryNavItems={secondaryNavItems}` : ''}${showFooter ? figma.code`
  footer={footer}` : ''}
>
  {children}
</AppShell>`,
  imports: ['import { AppShell } from "@marktiderman/genesis-ui/layout"'],
  id: 'app-shell',
  metadata: { nestable: false },
}
