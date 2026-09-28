"use client";

import { useId, useState, type ChangeEvent } from "react";

import { Button } from "./ui/button";

type SelectedImage = { id: string; name: string };

export function ProjectImagePicker({
  eventId,
  initialAssetIds = [],
  initialThumbnailAssetId = null,
}: {
  eventId: string;
  initialAssetIds?: string[];
  initialThumbnailAssetId?: string | null;
}) {
  const inputId = useId();
  const [images, setImages] = useState<SelectedImage[]>(() =>
    initialAssetIds.map((id, index) => ({ id, name: `Image ${index + 1}` })));
  const [thumbnailId, setThumbnailId] = useState<string | null>(() =>
    initialThumbnailAssetId && initialAssetIds.includes(initialThumbnailAssetId)
      ? initialThumbnailAssetId : initialAssetIds[0] ?? null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length === 0) return;
    if (images.length + files.length > 10) {
      setError("Choose at most 10 project images. Remove an image before adding more.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    let uploaded = 0;
    try {
      for (const file of files) {
        const data = new FormData();
        data.set("file", file);
        const response = await fetch(`/api/v1/events/${encodeURIComponent(eventId)}/assets`, {
          method: "POST",
          body: data,
        });
        const body = await response.json() as {
          asset?: { id: string; originalName: string };
          error?: { message: string };
        };
        if (!response.ok || !body.asset) {
          throw new Error(body.error?.message ?? `Could not upload ${file.name}.`);
        }
        const { id, originalName } = body.asset;
        setImages((current) => [...current, { id, name: originalName }]);
        setThumbnailId((current) => current ?? id);
        uploaded += 1;
      }
      setMessage(`${uploaded} image${uploaded === 1 ? "" : "s"} added. Save the project to keep this order.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The image upload failed. Try again.");
    } finally {
      setBusy(false);
    }
  }

  function move(index: number, direction: -1 | 1) {
    setImages((current) => {
      const next = [...current];
      const other = index + direction;
      if (other < 0 || other >= next.length) return current;
      [next[index], next[other]] = [next[other], next[index]];
      return next;
    });
  }

  function remove(id: string) {
    const next = images.filter((image) => image.id !== id);
    setImages(next);
    if (thumbnailId === id) setThumbnailId(next[0]?.id ?? null);
  }

  return (
    <section aria-label="Project images" className="space-y-3">
      <input type="hidden" name="imageAssetIds" value={JSON.stringify(images.map((image) => image.id))} />
      <input type="hidden" name="thumbnailAssetId" value={thumbnailId ?? ""} />
      <div>
        <label htmlFor={inputId} className="block text-small font-medium text-fg">Project images</label>
        <p className="mt-1 text-caption text-fg-subtle">Add up to 10 PNG or JPEG images, 5 MiB each. Choose one as the gallery thumbnail.</p>
      </div>
      <input
        id={inputId}
        type="file"
        accept="image/png,image/jpeg"
        multiple
        disabled={busy}
        onChange={upload}
        aria-describedby={`${inputId}-status`}
        className="block w-full max-w-md text-small text-fg-muted file:mr-3 file:rounded-md file:border file:border-line file:bg-surface file:px-3 file:py-2 file:font-medium file:text-fg hover:file:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--df-ring)] disabled:opacity-55"
      />
      <p id={`${inputId}-status`} role="status" aria-live="polite" className="text-caption text-fg-muted">
        {busy ? "Uploading images…" : message}
      </p>
      {error ? <p role="alert" className="text-caption text-danger-solid">{error}</p> : null}
      {images.length > 0 ? (
        <ol className="space-y-2" aria-label="Image order">
          {images.map((image, index) => (
            <li key={image.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface p-2.5">
              <img
                src={`/api/v1/assets/${image.id}`}
                alt=""
                width={64}
                height={64}
                className="size-16 rounded-md bg-surface-sunken object-cover"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-small font-medium text-fg">{index + 1}. {image.name}</p>
                {thumbnailId === image.id ? <p className="text-caption text-accent">Gallery thumbnail</p> : null}
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Button type="button" size="sm" variant="outline" disabled={index === 0} onClick={() => move(index, -1)} aria-label={`Move ${image.name} up`}>Up</Button>
                <Button type="button" size="sm" variant="outline" disabled={index === images.length - 1} onClick={() => move(index, 1)} aria-label={`Move ${image.name} down`}>Down</Button>
                {thumbnailId !== image.id ? <Button type="button" size="sm" variant="outline" onClick={() => setThumbnailId(image.id)} aria-label={`Use ${image.name} as gallery thumbnail`}>Make thumbnail</Button> : null}
                <Button type="button" size="sm" variant="ghost" onClick={() => remove(image.id)} aria-label={`Remove ${image.name}`}>Remove</Button>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-caption text-fg-subtle">No images selected.</p>
      )}
    </section>
  );
}
