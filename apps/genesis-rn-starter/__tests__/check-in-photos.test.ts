// @feat:native-starter @feat:forms-native
/**
 * The check-in's photo host (`src/lib/check-in-photos.ts`): the sample's photo question can be
 * answered, through the photo library, with a name and type the form accepts.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createCheckInPhotos, photoFile, stubUpload, type LaunchLibrary } from "../src/lib/check-in-photos";

const field = { kind: "field", id: "photo", key: "photo", type: "photo", label: "A photo" } as never;
const read = (path: string) => readFileSync(join(__dirname, "..", path), "utf8");

describe("check-in photos", () => {
  it("picks from the library, up to the room left, and hands the form files it accepts", async () => {
    const launch = vi.fn<LaunchLibrary>(async () => ({
      canceled: false as const,
      assets: [
        { uri: "file:///tmp/IMG_0001.HEIC", fileName: "IMG_0001.HEIC", fileSize: 2048, mimeType: "image/jpeg" },
        { uri: "file:///tmp/extra.png", fileSize: 10 },
      ],
    }));
    const host = createCheckInPhotos(launch, stubUpload(() => "1"));
    expect(host.camera).toBe(false);
    const files = await host.pick(field, { max: 1, camera: false });
    expect(launch).toHaveBeenCalledWith({ mediaTypes: ["images"], allowsMultipleSelection: false, selectionLimit: 1, quality: 0.8 });
    expect(files).toEqual([{ uri: "file:///tmp/IMG_0001.HEIC", name: "IMG_0001.HEIC", type: "image/jpeg", size: 2048 }]);
  });

  it("answers nothing when the person cancels, and never opens the picker with no room", async () => {
    const launch = vi.fn<LaunchLibrary>(async () => ({ canceled: true as const, assets: null }));
    const host = createCheckInPhotos(launch, stubUpload(() => "1"));
    expect(await host.pick(field, { max: 3, camera: false })).toEqual([]);
    expect(await host.pick(field, { max: 0, camera: false })).toEqual([]);
    expect(launch).toHaveBeenCalledTimes(1);
  });

  it("names and types an asset the picker gave no name or type", () => {
    expect(photoFile({ uri: "file:///a/b/shot.png?x=1" }, 0)).toEqual({ uri: "file:///a/b/shot.png?x=1", name: "shot.png", type: "image/png", size: 0 });
    expect(photoFile({ uri: "" }, 2)).toMatchObject({ name: "photo-3.jpg", type: "image/jpeg" });
  });

  it("stores through the upload and answers with a reference", async () => {
    const host = createCheckInPhotos(vi.fn<LaunchLibrary>(), stubUpload(() => "abc"));
    await expect(host.upload({ uri: "file:///x.jpg", name: "x.jpg", type: "image/jpeg", size: 5 }, field)).resolves.toEqual({
      id: "local-abc",
      name: "x.jpg",
      type: "image/jpeg",
      size: 5,
    });
  });

  it("is wired into the check-in screen, with a photo-library sentence", () => {
    expect(read("src/app/(app)/(home)/check-in.tsx")).toMatch(/photos=\{checkInPhotos\}/);
    // The check-in picks from the library only. The camera and microphone sentences are chat's video
    // and voice messages, the same as expo-camera's and expo-audio's, or the picker would delete them.
    expect(read("app.config.ts")).toMatch(/\["expo-image-picker", \{ photosPermission: "[^"]{20,}", cameraPermission: CAMERA, microphonePermission: MICROPHONE \}\]/);
  });
});
