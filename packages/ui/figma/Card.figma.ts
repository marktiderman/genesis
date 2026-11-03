// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=60-324
// source=packages/ui/src/components/ui/card.tsx
// component=Card
import figma from 'figma'
const instance = figma.selectedInstance

const title = instance.getString('Title')
const description = instance.getString('Description')
const content = instance.getString('Content')
const showHeader = instance.getBoolean('Show header')
const showContent = instance.getBoolean('Show content')
const showFooter = instance.getBoolean('Show footer')

export default {
  example: figma.code`<Card>${showHeader ? figma.code`
  <CardHeader>
    <CardTitle>${title}</CardTitle>
    <CardDescription>${description}</CardDescription>
  </CardHeader>` : ''}${showContent ? figma.code`
  <CardContent>${content}</CardContent>` : ''}${showFooter ? `
  <CardFooter>{footer}</CardFooter>` : ''}
</Card>`,
  imports: ['import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@marktiderman/genesis-ui"'],
  id: 'card',
  metadata: { nestable: true },
}
