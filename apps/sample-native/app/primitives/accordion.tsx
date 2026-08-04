import { ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  NativeAccordion,
  NativeAccordionContent,
  NativeAccordionItem,
  NativeAccordionTrigger,
  NativeText,
} from "@marktiderman/genesis-ui-native";

export default function AccordionSample() {
  return (
    <SafeAreaView className="flex-1 bg-background" edges={["left", "right"]}>
      <ScrollView className="flex-1 p-4" contentContainerStyle={{ gap: 16 }}>
        <NativeText preset="h1">Accordion</NativeText>
        <NativeText preset="h3">Single (default)</NativeText>
        <NativeAccordion testID="accordion-single" defaultValue={["a"]}>
          <NativeAccordionItem value="a">
            <NativeAccordionTrigger>What is Genesis?</NativeAccordionTrigger>
            <NativeAccordionContent>
              Brand-agnostic primitives + tokens + layouts shared across
              consumer apps.
            </NativeAccordionContent>
          </NativeAccordionItem>
          <NativeAccordionItem value="b">
            <NativeAccordionTrigger>Where do tokens live?</NativeAccordionTrigger>
            <NativeAccordionContent>
              In each consumer brand package; Genesis ships the schema only.
            </NativeAccordionContent>
          </NativeAccordionItem>
        </NativeAccordion>

        <NativeText preset="h3">Multiple</NativeText>
        <NativeAccordion type="multiple" testID="accordion-multi">
          <NativeAccordionItem value="x">
            <NativeAccordionTrigger>Section X</NativeAccordionTrigger>
            <NativeAccordionContent>Body X.</NativeAccordionContent>
          </NativeAccordionItem>
          <NativeAccordionItem value="y">
            <NativeAccordionTrigger>Section Y</NativeAccordionTrigger>
            <NativeAccordionContent>Body Y.</NativeAccordionContent>
          </NativeAccordionItem>
        </NativeAccordion>
      </ScrollView>
    </SafeAreaView>
  );
}
