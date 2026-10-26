// @feat:product-roadmap @feat:product-insights
/**
 * `@marktiderman/genesis-product/native`: the product screens for a React
 * Native app, made of genesis-ui-native only.
 *
 *   <IdeaBoardScreen source={source} haptics={Haptics} />          the idea board, with offline votes
 *   <RoadmapScreen source={source} />                               Now / Next / Later, a sheet per item
 *   <ProductWhatsNew store={createProductWhatsNew(…)} />           once per app version plus update
 *
 * Data comes through an injected `ProductSource` (`memoryProductSource` for
 * tests and demos). Native modules (expo-haptics, AsyncStorage, NetInfo) are
 * passed in, never imported.
 *
 * @stability Experimental
 */
export { haptic, type HapticsLike, type ProductHapticEvent } from "./haptics";
export { PRODUCT_COPY, type ProductCopy, type ProductCopyInput } from "./copy";
export { useIdeaBoard, IdeaBoardScreen, VoteButton, type IdeaBoard, type IdeaBoardOptions, type VoteButtonProps } from "./idea-board";
export { useRoadmap, RoadmapScreen, RoadmapDetailSheet, type Roadmap, type RoadmapOptions, type RoadmapDetailSheetProps } from "./roadmap";
export { useProductWhatsNew, ProductWhatsNew, ProductWhatsNewSheet, type ProductWhatsNewProps, type ProductWhatsNewSheetProps } from "./whats-new";
export * from "../index";
