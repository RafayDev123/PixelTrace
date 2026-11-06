"use client";

import { AlertCircle, CheckCircle2, FileQuestion, ImagePlus, Loader2, RotateCw, UploadCloud, X } from "lucide-react";
import { useRef, useState, type DragEvent } from "react";
import { formatBytes } from "@/lib/client/format";
import type { QueueItem } from "@/lib/client/hooks";
import type { Limits } from "@/lib/types";
import { Badge, Button, cx, ProgressBar } from "./ui";

export function UploadZone({ multiple, limits, onFiles, disabled }: { multiple: boolean; limits: Limits; onFiles: (files: File[]) => void; disabled?: boolean }) {
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (disabled) return;
    const files = Array.from(e.dataTransfer.files);
    if (files.length) onFiles(files);
  }

  return (
    <div
      onDragEnter={(e) => {
        e.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
      }}
      onDrop={onDrop}
      data-testid="dropzone"
      className={cx(
        "relative rounded-[14px] border-2 border-dashed px-5 py-10 text-center transition-colors focus-within:border-cyan sm:py-14",
        dragging ? "border-cyan bg-[#0b2230]" : "border-line2 bg-panel hover:border-[#3b4f79]",
        disabled && "opacity-60",
      )}
    >
      <div className={cx("marks mx-auto mb-5 grid h-20 w-20 place-items-center rounded-lg", dragging ? "text-cyan" : "text-accent")}>
        <UploadCloud className="h-9 w-9" aria-hidden />
      </div>
      <p className="text-lg font-semibold text-fg">{dragging ? "Release to add" : multiple ? "Drop images here" : "Drop an image here"}</p>
      <p className="mt-1 text-sm text-muted">or choose {multiple ? "up to " + limits.maxFiles + " files" : "a file"} from your device</p>
      <div className="mt-5">
        <Button variant="primary" size="lg" icon={<ImagePlus className="h-4.5 w-4.5" />} disabled={disabled} onClick={() => input.current?.click()}>
          Browse {multiple ? "files" : "file"}
        </Button>
      </div>
      <input
        ref={input}
        type="file"
        multiple={multiple}
        accept="image/jpeg,image/png,image/webp,image/tiff,.jpg,.jpeg,.png,.webp,.tif,.tiff"
        className="sr-only"
        aria-label={multiple ? "Choose images to analyze" : "Choose an image to analyze"}
        disabled={disabled}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) onFiles(files);
          e.target.value = "";
        }}
      />
      <ul className="mt-6 flex flex-wrap items-center justify-center gap-2 text-[12px] text-muted">
        <li>
          <Badge>{limits.formats.join(" · ")}</Badge>
        </li>
        <li>
          <Badge>≤ {formatBytes(limits.maxFileBytes)} each</Badge>
        </li>
        <li>
          <Badge>≤ {limits.maxMegapixels} MP</Badge>
        </li>
        {multiple && (
          <li>
            <Badge>≤ {limits.maxFiles} per batch</Badge>
          </li>
        )}
      </ul>
    </div>
  );
}

function StatusChip({ item }: { item: QueueItem }) {
  switch (item.status) {
    case "ready":
      return <Badge>Ready</Badge>;
    case "uploading":
      return (
        <Badge tone="blue" icon={<Loader2 className="pt-spin h-3 w-3" />}>
          Uploading {item.progress}%
        </Badge>
      );
    case "analyzing":
      return (
        <Badge tone="cyan" icon={<Loader2 className="pt-spin h-3 w-3" />}>
          Analyzing
        </Badge>
      );
    case "done":
      return (
        <Badge tone="ok" icon={<CheckCircle2 className="h-3 w-3" />}>
          Analyzed
        </Badge>
      );
    default:
      return (
        <Badge tone="bad" icon={<AlertCircle className="h-3 w-3" />}>
          Failed
        </Badge>
      );
  }
}

function formatLabel(file: File): string {
  const t = file.type.replace("image/", "").toUpperCase();
  if (t) return t === "JPG" ? "JPEG" : t;
  return (file.name.split(".").pop() ?? "?").toUpperCase();
}

export function FileCard({ item, onRemove, onRetry, busy }: { item: QueueItem; onRemove: () => void; onRetry?: () => void; busy?: boolean }) {
  const active = item.status === "uploading" || item.status === "analyzing";
  const [broken, setBroken] = useState(false);
  return (
    <li className="pt-rise flex gap-3 rounded-xl border border-line bg-panel p-3 sm:gap-4 sm:p-3.5">
      <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-line2 bg-canvas sm:h-[72px] sm:w-[72px]">
        {broken ? (
          <span className="grid h-full w-full place-items-center text-faint" role="img" aria-label="No preview available">
            <FileQuestion className="h-6 w-6" />
          </span>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.previewUrl} alt={`Preview of ${item.file.name}`} onError={() => setBroken(true)} className="h-full w-full object-cover" />
        )}
        {active && <span className="pt-scan absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-cyan/30 to-transparent" aria-hidden />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <p className="min-w-0 max-w-full truncate text-sm font-medium text-fg" title={item.file.name}>
            {item.file.name}
          </p>
          <StatusChip item={item} />
        </div>
        <p className="mt-1 text-[12.5px] text-muted">
          {formatLabel(item.file)} · {formatBytes(item.file.size)}
          {item.width && item.height ? ` · ${item.width}×${item.height}px` : ""}
        </p>
        {item.status === "uploading" && (
          <div className="mt-2">
            <ProgressBar value={item.progress} label={`Upload progress for ${item.file.name}`} />
          </div>
        )}
        {item.status === "analyzing" && (
          <div className="mt-2">
            <ProgressBar value={100} label={`Analyzing ${item.file.name}`} />
          </div>
        )}
        {item.status === "error" && item.error && (
          <p role="alert" className="mt-1.5 text-[13px] text-[#fca5a5]">
            {item.error}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-start gap-1">
        {item.status === "error" && onRetry && !item.error?.startsWith("Larger") && !item.error?.startsWith("Unsupported") && (
          <Button size="sm" variant="secondary" icon={<RotateCw className="h-3.5 w-3.5" />} onClick={onRetry} disabled={busy}>
            Retry
          </Button>
        )}
        <button
          type="button"
          aria-label={`Remove ${item.file.name}`}
          onClick={onRemove}
          disabled={active}
          className="grid h-8 w-8 place-items-center rounded-lg text-faint transition-colors hover:bg-raised hover:text-fg disabled:opacity-40"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </li>
  );
}
