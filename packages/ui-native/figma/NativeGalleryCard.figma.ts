// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=54-32
// source=packages/ui-native/src/components/gallery-card.tsx
// component=NativeGalleryCard
// The cover picture is a placeholder fill; `src` comes from the data. The badge shown in Figma
// is a NativeBadge instance, resolved through its own template.
import figma from 'figma'
const instance = figma.selectedInstance

const title = instance.getString('Title')
const subtitle = instance.getString('Subtitle')
const showBadges = instance.getBoolean('Show badges')
const showActions = instance.getBoolean('Show actions')

const badge = showBadges ? instance.findInstance('Badges') : null
let badgeCode
if (badge && badge.type === 'INSTANCE') {
  badgeCode = badge.executeTemplate().example
}

export default {
  example: figma.code`<NativeGalleryCard
  src={coverUrl}
  alt="${title}"
  title="${title}"${subtitle ? figma.code`
  subtitle="${subtitle}"` : ''}${badgeCode ? figma.code`
  badges={${badgeCode}}` : ''}${showActions ? `
  actions={<NativeButton variant="ghost" size="sm" onPress={onMore}>…</NativeButton>}` : ''}
  onPress={onOpen}
/>`,
  imports: [
    showActions
      ? 'import { NativeGalleryCard, NativeButton } from "@marktiderman/genesis-ui-native"'
      : 'import { NativeGalleryCard } from "@marktiderman/genesis-ui-native"',
  ],
  id: 'native-gallery-card',
  metadata: { nestable: true },
}
