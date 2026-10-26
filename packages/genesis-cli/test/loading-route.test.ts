import { describe, expect, it } from "vitest";
import { isLoadingOnlyRoute } from "../src/doctor/native";

describe("isLoadingOnlyRoute (native-screen-layout's loading exception)", () => {
  it("passes a route that is only a full-screen loading state, with its header options", () => {
    expect(isLoadingOnlyRoute("export default function R() { return <NativeLoadingState label=\"Opening\" />; }")).toBe(true);
    expect(isLoadingOnlyRoute("export default () => (<><Stack.Screen options={{ title: \"\" }} /><NativeLoadingState /></>);")).toBe(true);
  });

  it("doesn't pass a screen that renders anything else beside it", () => {
    expect(isLoadingOnlyRoute("export default () => (loading ? <NativeLoadingState /> : <View><Text>Hi</Text></View>);")).toBe(false);
    expect(isLoadingOnlyRoute("export default () => <FlatList data={d} ListFooterComponent={<NativeLoadingState fullScreen={false} />} />;")).toBe(false);
  });

  it("doesn't pass a block (fullScreen={false}) or a route without one", () => {
    expect(isLoadingOnlyRoute("export default () => <NativeLoadingState fullScreen={false} />;")).toBe(false);
    expect(isLoadingOnlyRoute("export default () => <Footer />;")).toBe(false);
  });
});
