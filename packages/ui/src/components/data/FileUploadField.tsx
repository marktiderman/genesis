"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { useDropzone, type FileRejection } from "react-dropzone";
import { Upload, X, FileIcon, ImageIcon, AlertCircle } from "lucide-react";
import { cn } from "../../utils";
import type { ResourceFormFieldDef } from "./ResourceFormField";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULT_MAX_SIZE = 10 * 1024 * 1024; // 10MB

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function parseAcceptProp(accept?: string): Record<string, string[]> | undefined {
  if (!accept) return undefined;
  // Convert shorthand like "image/*", ".pdf,.doc" into react-dropzone accept format
  const result: Record<string, string[]> = {};
  const parts = accept.split(",").map((s) => s.trim());
  for (const part of parts) {
    if (part.includes("/")) {
      // MIME type like "image/*"
      result[part] = [];
    } else if (part.startsWith(".")) {
      // Extension like ".pdf"
      // Group under a generic key — react-dropzone matches by extension
      const key = "application/octet-stream";
      if (!result[key]) result[key] = [];
      result[key].push(part);
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface FileUploadFieldProps {
  field: ResourceFormFieldDef;
  value: File | File[] | null;
  onChange: (value: File | File[] | null) => void;
  disabled?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FileUploadField({
  field,
  value,
  onChange,
  disabled,
}: FileUploadFieldProps) {
  const multiple = field.multiple ?? false;
  const maxSize = field.maxSize ?? DEFAULT_MAX_SIZE;
  const isImage = field.type === "image";
  const acceptObj = useMemo(
    () => parseAcceptProp(field.accept ?? (isImage ? "image/*" : undefined)),
    [field.accept, isImage],
  );

  const [errors, setErrors] = useState<string[]>([]);

  // Normalise value to an array for display
  const files: File[] = useMemo(() => {
    if (!value) return [];
    return Array.isArray(value) ? value : [value];
  }, [value]);

  // Preview URLs for image files
  const [previews, setPreviews] = useState<string[]>([]);

  useEffect(() => {
    const urls = files
      .filter((f) => f.type.startsWith("image/"))
      .map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [files]);

  const onDrop = useCallback(
    (accepted: File[], rejected: FileRejection[]) => {
      const newErrors: string[] = [];
      for (const rej of rejected) {
        for (const err of rej.errors) {
          if (err.code === "file-too-large") {
            newErrors.push(
              `"${rej.file.name}" exceeds ${formatFileSize(maxSize)} limit`,
            );
          } else if (err.code === "file-invalid-type") {
            newErrors.push(`"${rej.file.name}" is not an accepted file type`);
          } else {
            newErrors.push(`"${rej.file.name}": ${err.message}`);
          }
        }
      }
      setErrors(newErrors);

      if (accepted.length === 0) return;

      if (multiple) {
        const merged = [...files, ...accepted];
        onChange(merged);
      } else {
        onChange(accepted[0]);
      }
    },
    [files, maxSize, multiple, onChange],
  );

  const removeFile = useCallback(
    (index: number) => {
      const next = files.filter((_, i) => i !== index);
      if (next.length === 0) {
        onChange(null);
      } else if (multiple) {
        onChange(next);
      } else {
        onChange(null);
      }
      setErrors([]);
    },
    [files, multiple, onChange],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: acceptObj,
    maxSize,
    multiple,
    disabled,
  });

  const hasFiles = files.length > 0;

  return (
    <div className="space-y-2">
      {/* Drop zone */}
      <div
        {...getRootProps()}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-8 text-center transition-colors",
          isDragActive
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/25 hover:border-muted-foreground/50",
          disabled && "pointer-events-none opacity-50",
          hasFiles && "py-4",
        )}
      >
        <input {...getInputProps()} />
        {isImage ? (
          <ImageIcon className="mb-2 h-8 w-8 text-muted-foreground" />
        ) : (
          <Upload className="mb-2 h-8 w-8 text-muted-foreground" />
        )}
        <p className="text-sm text-muted-foreground">
          {isDragActive
            ? "Drop files here..."
            : "Drag & drop or click to upload"}
        </p>
        <p className="mt-1 text-xs text-muted-foreground/70">
          Max {formatFileSize(maxSize)}
          {field.accept ? ` -- ${field.accept}` : ""}
        </p>
      </div>

      {/* Error messages */}
      {errors.length > 0 && (
        <div className="space-y-1">
          {errors.map((err, i) => (
            <p key={i} className="flex items-center gap-1 text-sm text-destructive">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              {err}
            </p>
          ))}
        </div>
      )}

      {/* File previews */}
      {hasFiles && (
        <ul className="space-y-2">
          {files.map((file, index) => {
            const isImg = file.type.startsWith("image/");
            const previewUrl = isImg ? previews[
              files.filter((f, i) => i <= index && f.type.startsWith("image/")).length - 1
            ] : undefined;

            return (
              <li
                key={`${file.name}-${index}`}
                className="flex items-center gap-3 rounded-md border bg-muted/30 p-2"
              >
                {isImg && previewUrl ? (
                  <img
                    src={previewUrl}
                    alt={file.name}
                    className="h-10 w-10 rounded object-cover"
                  />
                ) : (
                  <FileIcon className="h-10 w-10 shrink-0 text-muted-foreground p-1" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatFileSize(file.size)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFile(index);
                  }}
                  className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label={`Remove ${file.name}`}
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
