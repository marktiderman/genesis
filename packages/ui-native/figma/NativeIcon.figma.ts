// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=41-140
// source=packages/ui-native/src/components/icon.tsx
// component=NativeIcon
// The swapped icon component is named `icon/<lucide name>` in the library; NativeIcon takes a
// semantic NativeIconName (icon-names.ts), so the lucide name is translated. A library icon
// with no semantic name yet is emitted as-is with a note.
import figma from 'figma'
const instance = figma.selectedInstance

const semantic = {
  'arrow-up-down': 'sort',
  'circle-alert': 'error',
  'circle-check': 'success',
  ellipsis: 'more',
  'grip-vertical': 'grip',
  house: 'home',
  'layout-grid': 'grid',
  'loader-circle': 'refresh',
  'map-pin': 'pin',
  'message-square': 'message',
  'redo-2': 'redo',
  'square-check': 'check',
  'square-pen': 'compose',
  'trash-2': 'trash',
  'triangle-alert': 'warning',
  'undo-2': 'undo',
  x: 'close',
}
const known = ['arrow-left', 'arrow-up', 'aperture', 'bell', 'calendar', 'camera', 'camera-flip', 'check', 'clapperboard', 'chevron-down', 'chevron-left', 'chevron-right', 'chevron-up', 'clock', 'close', 'compose', 'copy', 'download', 'edit', 'error', 'expand', 'external-link', 'eye', 'file', 'filter', 'folder-plus', 'grid', 'grip', 'heart', 'home', 'image', 'info', 'link', 'list', 'lock', 'log-out', 'mail', 'maximize', 'menu', 'message', 'mic', 'minus', 'more', 'paperclip', 'pause', 'pin', 'play', 'plus', 'radio', 'redo', 'refresh', 'reply', 'search', 'settings', 'settings-2', 'share', 'smile', 'sort', 'star', 'stop', 'success', 'table', 'trash', 'undo', 'upload', 'user', 'video', 'volume', 'volume-off', 'warning']

const size = instance.getEnum('size', { '16': 16, '20': 20, '24': 24 })
const icon = instance.findInstance('Icon')
const lucideName = icon && icon.type === 'INSTANCE' ? icon.name.replace(/^icon\//, '') : 'bell'
const iconName = semantic[lucideName] || lucideName
const note = known.includes(iconName) ? '' : ` {/* no NativeIconName for icon/${lucideName} yet */}`

export default {
  example: figma.code`<NativeIcon name="${iconName}"${size !== 20 ? figma.code` size={${size}}` : ''} />${note}`,
  imports: ['import { NativeIcon } from "@marktiderman/genesis-ui-native"'],
  id: 'native-icon',
  metadata: { nestable: true },
}
