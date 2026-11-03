// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=63-348
// source=packages/ui/src/components/data/FileUploadField.tsx
// component=FileUploadField
// "dragging" is interaction (a file is over the drop zone), so it is not emitted; "uploaded"
// is a file in value.
import figma from 'figma'
const instance = figma.selectedInstance

const state = instance.getEnum('state', { idle: 'idle', dragging: 'dragging', uploaded: 'uploaded' })
const label = instance.getString('Label')

export default {
  example: figma.code`<FileUploadField
  field={{ key: "attachment", label: "${label}", type: "file" }}
  value={${state === 'uploaded' ? 'file' : 'null'}}
  onChange={setFile}
/>`,
  imports: ['import { FileUploadField } from "@marktiderman/genesis-ui/data"'],
  id: 'file-upload-field',
  metadata: { nestable: true },
}
