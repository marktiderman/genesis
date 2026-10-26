import { useState } from "react";
import { Redirect, Stack } from "expo-router";
import { View } from "react-native";
import * as Haptics from "expo-haptics";
import { IdeaBoardScreen, RoadmapScreen } from "@marktiderman/genesis-product/native";
import { NativeSegmentedControl, getInboxPageStackOptions } from "@marktiderman/genesis-ui-native";
import starter from "../../../../starter.config";
import { copy } from "@/copy";
import { productDemoSource, productDemoVotes } from "@/lib/product-demo";

const t = copy.productDemo;

/** The product demo (`features.productDemo`): the idea board and the roadmap over sample data. */
export default function ProductDemoScreen() {
  if (!starter.features.productDemo) return <Redirect href="/settings" />;
  return <Demo />;
}

function Demo() {
  const [tab, setTab] = useState<"ideas" | "roadmap">("ideas");
  return (
    <>
      <Stack.Screen options={getInboxPageStackOptions({ headerTitle: t.title, large: false })} />
      <View style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
        <NativeSegmentedControl
          testID="product-demo-tab"
          value={tab}
          onChange={setTab}
          options={[
            { value: "ideas", label: t.ideasTab },
            { value: "roadmap", label: t.roadmapTab },
          ]}
        />
      </View>
      <View style={{ flex: 1 }}>
        {tab === "ideas" ? (
          <IdeaBoardScreen source={productDemoSource} queue={productDemoVotes} haptics={Haptics} />
        ) : (
          <RoadmapScreen source={productDemoSource} haptics={Haptics} />
        )}
      </View>
    </>
  );
}
