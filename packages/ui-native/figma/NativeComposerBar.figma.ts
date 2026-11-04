// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=91-232
// source=packages/ui-native/src/components/composer-bar.tsx
// component=NativeComposerBar
// The Figma mode variant is the chosen mode's id; the two modes the picker shows come from
// `modes`, which the design does not carry, so the example names them in a placeholder array.
// The `above` slot has no library component: the example leaves a comment where it goes.
import figma from 'figma'
const instance = figma.selectedInstance

const placeholder = instance.getString('placeholder')
const sendLabel = instance.getString('sendLabel')
const disabled = instance.getBoolean('disabled')
const showAbove = instance.getBoolean('Show above')
const showLeading = instance.getBoolean('Show leading')
const showTrailing = instance.getBoolean('Show trailing')
const leadingSwap = instance.getInstanceSwap('leading')
const trailingSwap = instance.getInstanceSwap('trailing')
// A swap is an instance handle; its own template renders the code that goes in the slot.
let leading
if (leadingSwap && leadingSwap.type === 'INSTANCE') leading = leadingSwap.executeTemplate().example
let trailing
if (trailingSwap && trailingSwap.type === 'INSTANCE') trailing = trailingSwap.executeTemplate().example
const mode = instance.getEnum('mode', { text: 'text', voice: 'voice' })
const empty = instance.getEnum('empty', { true: true, false: false })
const sending = instance.getEnum('sending', { false: false, true: true })

export default {
  example: figma.code`<NativeComposerBar
  value={value}
  onChangeText={setValue}
  onSend={send}${placeholder ? figma.code`
  placeholder="${placeholder}"` : ''}${sendLabel ? figma.code`
  sendLabel="${sendLabel}"` : ''}
  modes={modes}
  mode="${mode}"
  onModeChange={setMode}${empty === false ? `
  empty={false}` : ''}${sending ? `
  sending` : ''}${disabled ? `
  disabled` : ''}${showLeading && leading ? figma.code`
  leading={${leading}}` : ''}${showTrailing && trailing ? figma.code`
  trailing={${trailing}}` : ''}${showAbove ? `
  above={/* what sits above the input: a reply preview, attachments */}` : ''}
/>`,
  imports: ['import { NativeComposerBar } from "@marktiderman/genesis-ui-native"'],
  id: 'native-composer-bar',
  metadata: { nestable: false },
}
