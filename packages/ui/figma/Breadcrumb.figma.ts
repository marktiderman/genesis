// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=67-9
// source=packages/ui/src/components/ui/breadcrumb.tsx
// component=Breadcrumb
// Three crumbs: the first two link, the last is the current page.
import figma from 'figma'
const instance = figma.selectedInstance

const crumb1 = instance.getString('Crumb 1')
const crumb2 = instance.getString('Crumb 2')
const crumb3 = instance.getString('Crumb 3')

export default {
  example: figma.code`<Breadcrumb>
  <BreadcrumbList>
    <BreadcrumbItem>
      <BreadcrumbLink href="/">${crumb1}</BreadcrumbLink>
    </BreadcrumbItem>
    <BreadcrumbSeparator />
    <BreadcrumbItem>
      <BreadcrumbLink href="/section">${crumb2}</BreadcrumbLink>
    </BreadcrumbItem>
    <BreadcrumbSeparator />
    <BreadcrumbItem>
      <BreadcrumbPage>${crumb3}</BreadcrumbPage>
    </BreadcrumbItem>
  </BreadcrumbList>
</Breadcrumb>`,
  imports: ['import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@marktiderman/genesis-ui"'],
  id: 'breadcrumb',
  metadata: { nestable: true },
}
