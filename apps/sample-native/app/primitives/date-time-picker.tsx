import { useState } from "react";
import { ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  NativeDatePicker,
  NativeText,
  NativeTimePicker,
} from "@marktiderman/genesis-ui-native";

export default function DateTimePickerSample() {
  const [date, setDate] = useState(new Date());
  const [time, setTime] = useState(new Date());
  return (
    <SafeAreaView className="flex-1 bg-background" edges={["left", "right"]}>
      <ScrollView className="flex-1 p-4" contentContainerStyle={{ gap: 16 }}>
        <NativeText preset="h1">Date / Time</NativeText>
        <NativeText preset="body" className="text-muted-foreground">
          iOS shows the wheel inline; Android opens a calendar/clock dialog.
        </NativeText>
        <NativeText preset="label">Date</NativeText>
        <NativeDatePicker testID="date-picker" value={date} onChange={setDate} />
        <NativeText preset="label">Time</NativeText>
        <NativeTimePicker testID="time-picker" value={time} onChange={setTime} />
      </ScrollView>
    </SafeAreaView>
  );
}
