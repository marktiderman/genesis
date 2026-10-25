/**
 * Screenshots on the web. The browser only lets a page capture itself with
 * the person's say-so: `getDisplayMedia` with `preferCurrentTab` asks, and a
 * single frame is kept. When the person says no (or the browser can't), there
 * is no screenshot: never a fake one.
 */

export interface WebCapture {
  /** `data:image/webp;base64,…` (or png where webp isn't supported). */
  dataUrl: string;
  contentType: "image/webp" | "image/png";
  width: number;
  height: number;
}

type DisplayMediaDevices = MediaDevices & { getDisplayMedia(constraints: Record<string, unknown>): Promise<MediaStream> };

/** Whether this browser can capture the tab at all. */
export function canCaptureScreenshot(): boolean {
  const devices = (globalThis.navigator as Navigator | undefined)?.mediaDevices as Partial<DisplayMediaDevices> | undefined;
  return typeof devices?.getDisplayMedia === "function";
}

/** One frame of the current tab, or `null` when the person declined or the browser can't. */
export async function captureScreenshot(doc: Document = document): Promise<WebCapture | null> {
  if (!canCaptureScreenshot()) return null;
  let stream: MediaStream;
  try {
    stream = await (navigator.mediaDevices as DisplayMediaDevices).getDisplayMedia({
      video: { preferCurrentTab: true, frameRate: 1 },
      audio: false,
      preferCurrentTab: true,
      selfBrowserSurface: "include",
    });
  } catch {
    return null;
  }
  try {
    const video = doc.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    await video.play();
    await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
    const canvas = doc.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx || !canvas.width || !canvas.height) return null;
    ctx.drawImage(video, 0, 0);
    return fromCanvas(canvas);
  } catch {
    return null;
  } finally {
    stream.getTracks().forEach((track) => track.stop());
  }
}

function fromCanvas(canvas: HTMLCanvasElement): WebCapture {
  const webp = canvas.toDataURL("image/webp", 0.9);
  const isWebp = webp.startsWith("data:image/webp");
  return { dataUrl: isWebp ? webp : canvas.toDataURL("image/png"), contentType: isWebp ? "image/webp" : "image/png", width: canvas.width, height: canvas.height };
}

/** A stroke in fractions of the image (0 to 1), so it survives resizing. */
export type Stroke = Array<{ x: number; y: number }>;

/** A rectangle in fractions of the image, painted solid to hide what's under it. */
export interface Redaction {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Draws pen strokes and solid redactions onto a captured image; returns the new capture. */
export async function annotateScreenshot(
  capture: WebCapture,
  { strokes = [], redactions = [], penColor = "red", redactColor = "black" }: { strokes?: Stroke[]; redactions?: Redaction[]; penColor?: string; redactColor?: string },
  doc: Document = document,
): Promise<WebCapture> {
  const img = doc.createElement("img");
  img.src = capture.dataUrl;
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("image_load_failed"));
  });
  const canvas = doc.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return capture;
  ctx.drawImage(img, 0, 0);
  ctx.fillStyle = redactColor;
  for (const r of redactions) ctx.fillRect(r.x * canvas.width, r.y * canvas.height, r.width * canvas.width, r.height * canvas.height);
  ctx.strokeStyle = penColor;
  ctx.lineWidth = Math.max(3, canvas.width / 300);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const stroke of strokes) {
    if (stroke.length < 2) continue;
    ctx.beginPath();
    ctx.moveTo(stroke[0]!.x * canvas.width, stroke[0]!.y * canvas.height);
    for (const p of stroke.slice(1)) ctx.lineTo(p.x * canvas.width, p.y * canvas.height);
    ctx.stroke();
  }
  return fromCanvas(canvas);
}
