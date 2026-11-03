// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=71-183
// source=packages/ui/src/components/ui/carousel.tsx
// component=Carousel
// The index=1|2|3 property is the visible slide, an interaction state, and is not emitted.
import figma from 'figma'
const instance = figma.selectedInstance

export default {
  example: figma.code`<Carousel>
  <CarouselContent>
    <CarouselItem>{slide1}</CarouselItem>
    <CarouselItem>{slide2}</CarouselItem>
    <CarouselItem>{slide3}</CarouselItem>
  </CarouselContent>
  <CarouselPrevious />
  <CarouselNext />
</Carousel>`,
  imports: ['import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "@marktiderman/genesis-ui"'],
  id: 'carousel',
  metadata: { nestable: true },
}
