/**
 * The `photo` renderer: choose (or take) a photo through the host's picker, see it as a
 * thumbnail, remove it. The file goes to the host's `upload` (`photos` on `<FormFocus>`); the
 * answer keeps only the reference it resolves to. Type, size and count are checked here first so
 * a respondent hears why at once; the host's server checks them again. While a photo is on its
 * way the form neither moves on nor sends.
 */
import { useEffect, useRef, useState } from "react";
import { Image, Pressable, Text, View } from "react-native";
import {
  isPhotoRef,
  photoCountMessage,
  photoLimits,
  photoRefs,
  photoSizeMessage,
  photoTypeMessage,
  type FieldBlock,
  type PhotoRef,
} from "@marktiderman/genesis-forms";
import type { FieldRendererProps } from "@marktiderman/genesis-forms-react";
import { FieldChrome } from "../chrome";
import { useFormNative, type NativePhotoFile } from "../context";
import { useFormStyles } from "../styles";
import { Button } from "../parts";

/** Why a picked file can't be added, or null when it can. */
export function photoProblem(field: FieldBlock, file: Pick<NativePhotoFile, "type" | "size">): string | null {
  const limits = photoLimits(field);
  if (!limits.mimeTypes.includes(file.type.toLowerCase())) return photoTypeMessage(field);
  if (!(file.size > 0) || file.size > limits.maxBytes) return photoSizeMessage(field);
  return null;
}

let nextKey = 0;

export function PhotoField(props: FieldRendererProps) {
  const s = useFormStyles();
  const { binding, engine } = props;
  const { field } = binding;
  const { photos, pending, locked } = useFormNative();
  const limits = photoLimits(field);
  const refs = photoRefs(binding.value);
  const [uploading, setUploading] = useState<{ key: string; name: string; uri: string }[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  // Local pictures of photos picked here, by reference id, to draw thumbnails.
  const previews = useRef(new Map<string, string>());
  // Uploads still counted as in flight, released on unmount so a form left mid-upload can still send.
  const releases = useRef(new Set<() => void>());
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    const pendingReleases = releases.current;
    return () => {
      mounted.current = false;
      for (const release of pendingReleases) release();
      pendingReleases.clear();
    };
  }, []);

  const currentRefs = () => photoRefs(engine.getState().values[field.id]);
  const full = refs.length + uploading.length >= limits.maxFiles;
  const disabled = !photos || locked;

  const add = async (camera: boolean) => {
    if (!photos) return;
    setProblem(null);
    let files: NativePhotoFile[];
    try {
      files = await photos.pick(field, { max: limits.maxFiles - currentRefs().length - uploading.length, camera });
    } catch {
      if (mounted.current) setProblem("Photos couldn't be opened. Try again.");
      return;
    }
    let room = limits.maxFiles - currentRefs().length - uploading.length;
    for (const file of files) {
      if (room <= 0) {
        setProblem(photoCountMessage(field));
        break;
      }
      const why = photoProblem(field, file);
      if (why) {
        setProblem(why);
        continue;
      }
      room--;
      const key = `p${nextKey++}`;
      setUploading((list) => [...list, { key, name: file.name, uri: file.uri }]);
      const release = pending.start();
      releases.current.add(release);
      const finish = () => {
        release();
        releases.current.delete(release);
        if (mounted.current) setUploading((list) => list.filter((u) => u.key !== key));
      };
      // Through a promise, so an upload that throws before returning one is caught too.
      Promise.resolve()
        .then(() => photos.upload(file, field))
        .then((ref: PhotoRef) => {
          if (!isPhotoRef(ref)) throw new Error("The upload returned no photo reference.");
          previews.current.set(ref.id, file.uri);
          const next = [...currentRefs().filter((r) => r.id !== ref.id), { id: ref.id, name: ref.name, type: ref.type, size: ref.size }];
          binding.setValue(next);
          finish();
        })
        .catch(() => {
          if (mounted.current) setProblem(`“${file.name}” didn't upload. Try again.`);
          finish();
        });
    }
  };

  const remove = (ref: PhotoRef) => {
    previews.current.delete(ref.id);
    const next = currentRefs().filter((r) => r.id !== ref.id);
    binding.setValue(next.length ? next : undefined);
    setProblem(null);
  };

  return (
    <FieldChrome props={props}>
      {refs.length || uploading.length ? (
        <View style={s.photoRow} accessibilityLabel="Photos">
          {refs.map((ref) => {
            const uri = previews.current.get(ref.id);
            return (
              <View key={ref.id} style={s.photoTile} testID={`${props.inputId}-photo-${ref.id}`}>
                {uri ? <Image source={{ uri }} style={s.photoImage} accessibilityLabel={ref.name} /> : <Text style={s.photoName}>{ref.name}</Text>}
                {locked ? null : (
                  <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${ref.name}`} onPress={() => remove(ref)} style={s.photoRemove}>
                    <Text style={s.photoRemoveMark}>✕</Text>
                  </Pressable>
                )}
              </View>
            );
          })}
          {uploading.map((u) => (
            <View key={u.key} style={[s.photoTile, { opacity: 0.6 }]} accessibilityLabel={`Uploading ${u.name}`}>
              <Image source={{ uri: u.uri }} style={s.photoImage} accessible={false} />
            </View>
          ))}
        </View>
      ) : null}
      <View style={s.nav}>
        <Button testID={`${props.inputId}-choose`} variant="secondary" disabled={disabled || full} onPress={() => void add(false)}>
          {refs.length ? "Add another photo" : "Choose a photo"}
        </Button>
        {photos?.camera ? (
          <Button testID={`${props.inputId}-camera`} variant="secondary" disabled={disabled || full} onPress={() => void add(true)}>
            Take a photo
          </Button>
        ) : null}
      </View>
      <Text style={s.hint}>
        {photos
          ? `Up to ${limits.maxFiles} ${limits.maxFiles === 1 ? "photo" : "photos"}, ${limits.maxSizeMb} MB each.`
          : "Photos can't be added here."}
      </Text>
      {problem ? (
        <Text style={s.error} accessibilityRole="alert" accessibilityLiveRegion="assertive">
          {problem}
        </Text>
      ) : null}
    </FieldChrome>
  );
}
