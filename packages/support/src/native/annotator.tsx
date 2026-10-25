/**
 * ScreenshotAnnotator: mark up a screenshot before it is sent. Two tools:
 * a pen to point something out, and Hide, which paints a solid box over
 * anything private (a name, an email, a message). "Done" flattens the image
 * and the marks into one picture with `react-native-view-shot`'s `captureRef`,
 * so what is sent is exactly what the person saw, hidden parts included.
 *
 * Plain views and React Native's PanResponder: no Skia, SVG or gesture library.
 */
import { useRef, useState, type ComponentRef } from "react";
import { Image, PanResponder, View, type LayoutChangeEvent } from "react-native";
import { NativeButton, NativeSegmentedControl, NativeText } from "@marktiderman/genesis-ui-native/components";
import { useThemeRoles } from "@marktiderman/genesis-ui-native/hooks";
import type { SupportCopy } from "../copy";
import type { ViewShotLike } from "./modules";
import type { PendingScreenshot } from "./support";

type Point = { x: number; y: number };
type Mark = { kind: "pen"; points: Point[] } | { kind: "hide"; from: Point; to: Point };

const DOT = 6;
/** The most dots a drawing keeps, so a long scribble stays light. */
const MAX_DOTS = 3000;

/** The dots along a stroke, close enough to read as a line. */
export function strokeDots(points: readonly Point[], spacing = DOT / 2): Point[] {
  const dots: Point[] = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    const prev = points[i - 1];
    if (prev) {
      const dist = Math.hypot(p.x - prev.x, p.y - prev.y);
      for (let d = spacing; d < dist; d += spacing) dots.push({ x: prev.x + ((p.x - prev.x) * d) / dist, y: prev.y + ((p.y - prev.y) * d) / dist });
    }
    dots.push(p);
  }
  return dots;
}

export function boxOf(from: Point, to: Point) {
  return { left: Math.min(from.x, to.x), top: Math.min(from.y, to.y), width: Math.abs(to.x - from.x), height: Math.abs(to.y - from.y) };
}

export interface ScreenshotAnnotatorProps {
  screenshot: PendingScreenshot;
  viewShot: ViewShotLike;
  copy: SupportCopy["annotate"];
  /** `marked`: the image now carries marks (pen or hidden parts). */
  onDone: (screenshot: PendingScreenshot, marked: boolean) => void;
  /** `hadMarks`: the person drew something and left without saving it. */
  onCancel: (hadMarks: boolean) => void;
  testID?: string;
}

export function ScreenshotAnnotator({ screenshot, viewShot, copy, onDone, onCancel, testID = "genesis-support-annotator" }: ScreenshotAnnotatorProps) {
  const colors = useThemeRoles();
  const surface = useRef<ComponentRef<typeof View>>(null);
  const [tool, setTool] = useState<"pen" | "hide">("pen");
  const [marks, setMarks] = useState<Mark[]>([]);
  const [draft, setDraft] = useState<Mark | null>(null);
  const [width, setWidth] = useState(0);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const toolRef = useRef(tool);
  toolRef.current = tool;
  const draftRef = useRef<Mark | null>(null);

  const height = width ? Math.round((width * screenshot.height) / Math.max(1, screenshot.width)) : 0;

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      // Drawing inside a scroll view: keep the touch, don't hand it to the scroll.
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (event) => {
        const p = { x: event.nativeEvent.locationX, y: event.nativeEvent.locationY };
        draftRef.current = toolRef.current === "pen" ? { kind: "pen", points: [p] } : { kind: "hide", from: p, to: p };
        setDraft(draftRef.current);
      },
      onPanResponderMove: (event) => {
        const p = { x: event.nativeEvent.locationX, y: event.nativeEvent.locationY };
        const d = draftRef.current;
        if (!d) return;
        draftRef.current = d.kind === "pen" ? { kind: "pen", points: [...d.points, p] } : { ...d, to: p };
        setDraft(draftRef.current);
      },
      onPanResponderRelease: () => {
        const d = draftRef.current;
        draftRef.current = null;
        setDraft(null);
        if (d) setMarks((all) => [...all, d]);
      },
      onPanResponderTerminate: () => {
        draftRef.current = null;
        setDraft(null);
      },
    }),
  ).current;

  const done = async () => {
    if (!marks.length) {
      onDone(screenshot, false);
      return;
    }
    setSaving(true);
    setFailed(false);
    try {
      const uri = await viewShot.captureRef(surface, { format: "jpg", quality: 0.85, result: "data-uri" });
      setSaving(false);
      onDone({ ...screenshot, uri, contentType: "image/jpeg" }, true);
    } catch {
      // Flattening failed: never send the unmarked image in its place (hidden parts would show).
      setSaving(false);
      setFailed(true);
    }
  };

  let dots = 0;
  const all = draft ? [...marks, draft] : marks;
  return (
    <View testID={testID} style={{ gap: 12 }}>
      <NativeText style={{ color: colors.secondaryLabel, fontSize: 13, lineHeight: 18 }}>{copy.hint}</NativeText>
      <NativeSegmentedControl
        testID={`${testID}-tool`}
        options={[
          { value: "pen", label: copy.pen },
          { value: "hide", label: copy.hide },
        ]}
        value={tool}
        onChange={(v) => setTool(v as "pen" | "hide")}
      />
      <View onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)} style={{ width: "100%" }}>
        <View ref={surface} collapsable={false} testID={`${testID}-surface`} style={{ width: width || "100%", height: height || 320, overflow: "hidden", borderRadius: 12 }} {...responder.panHandlers}>
          <Image source={{ uri: screenshot.uri }} style={{ width: "100%", height: "100%" }} resizeMode="stretch" accessibilityIgnoresInvertColors />
          {all.map((mark, i) => {
            if (mark.kind === "hide") {
              const box = boxOf(mark.from, mark.to);
              return <View key={i} testID={`${testID}-hide-${i}`} pointerEvents="none" style={{ position: "absolute", ...box, backgroundColor: colors.label }} />;
            }
            return strokeDots(mark.points).map((p, j) => {
              if (dots++ > MAX_DOTS) return null;
              return (
                <View
                  key={`${i}-${j}`}
                  pointerEvents="none"
                  style={{ position: "absolute", left: p.x - DOT / 2, top: p.y - DOT / 2, width: DOT, height: DOT, borderRadius: DOT / 2, backgroundColor: colors.destructive }}
                />
              );
            });
          })}
        </View>
      </View>
      {failed ? (
        <NativeText testID={`${testID}-failed`} accessibilityLiveRegion="polite" style={{ color: colors.destructive, fontSize: 13, lineHeight: 18 }}>
          {copy.failed}
        </NativeText>
      ) : null}
      <View style={{ flexDirection: "row", gap: 8 }}>
        <NativeButton variant="ghost" onPress={() => onCancel(marks.length > 0 || draft !== null)} testID={`${testID}-cancel`}>
          {copy.cancel}
        </NativeButton>
        <NativeButton variant="outline" onPress={() => setMarks((m) => m.slice(0, -1))} disabled={!marks.length} testID={`${testID}-undo`}>
          {copy.undo}
        </NativeButton>
        <View style={{ flex: 1 }} />
        <NativeButton onPress={() => void done()} loading={saving} testID={`${testID}-done`}>
          {copy.done}
        </NativeButton>
      </View>
    </View>
  );
}
