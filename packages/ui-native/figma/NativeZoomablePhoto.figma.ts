// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=91-318
// source=packages/ui-native/src/components/lightbox-zoom.tsx
// component=NativeZoomablePhoto
// Zoom is state the component owns (pinch, double tap) and reports through `onZoomChange`;
// `active` means the page is on screen, so the "zoomed" variant maps to no prop and only
// changes the comment. The photo is the `src` the lightbox hands over, so the "image" swap is
// not emitted; the scrim belongs to NativeLightbox, so "Show scrim" is not emitted either.
import figma from 'figma'
const instance = figma.selectedInstance

const zoomed = instance.getEnum('zoomed', { false: false, true: true })

export default {
  example: figma.code`${zoomed ? `// Zoomed in: the user pinched or double-tapped; onZoomChange(true) was called.
` : ''}<NativeZoomablePhoto
  src={item.src}
  alt={item.alt}
  width={width}
  height={height}
  active={index === current}
  onZoomChange={setZoomed}
  onPull={pull}
  onDismiss={close}
  onTap={toggleChrome}
  testID="lightbox-photo"
/>`,
  imports: ['import { NativeZoomablePhoto } from "@marktiderman/genesis-ui-native"'],
  id: 'native-zoomable-photo',
  metadata: { nestable: false },
}
