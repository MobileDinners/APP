"use client";

import { useCallback, useState } from "react";
import { foodPhoto, plateHue } from "@/lib/images";

/**
 * A food photo over a warm gradient plate. The photo fades in on load; if it
 * never loads, the plate is what you see — no grey holes, no broken-image icons.
 *
 * The ref callback matters: a cached image can finish decoding *before* React
 * attaches onLoad, so that event never fires and the photo would stay at
 * opacity 0 forever. Checking `complete` on mount covers that case.
 */
export function FoodPhoto({
  keyword,
  seed,
  width,
  height,
  alt,
  className = "",
  priority = false,
}: {
  keyword: string;
  seed: string;
  width: number;
  height: number;
  alt: string;
  className?: string;
  priority?: boolean;
}) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const src = foodPhoto(keyword, seed, width);

  const ref = useCallback((node: HTMLImageElement | null) => {
    if (node?.complete) {
      if (node.naturalWidth === 0) setFailed(true);
      else setLoaded(true);
    }
  }, []);

  return (
    <div
      className={`photo ${className}`}
      style={{ ["--hue" as string]: String(plateHue(seed)) }}
    >
      {!failed && src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={ref}
          src={src}
          alt={alt}
          width={width}
          height={height}
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          className={loaded ? "loaded" : ""}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}
