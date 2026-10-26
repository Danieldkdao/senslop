"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { buddySize, defaultBuddyCharacter } from "../constants";
import { formatBuddyCharacter, getBuddyFrames } from "../lib/formatters";
import type { BuddyCharacter, BuddyMood } from "../types";

type BuddySpriteProps = {
  mood: BuddyMood;
  still: boolean;
  size?: number;
  character?: BuddyCharacter;
};

// Artwork cells stay fixed; the user's display size is independent of the atlas.
const poseSize = 48;
const sheetColumns = 4;
const sheetRows = 4;

export const BuddySprite = ({
  mood,
  still,
  size = buddySize,
  character = defaultBuddyCharacter,
}: BuddySpriteProps) => {
  const canvas = useRef<HTMLCanvasElement>(null);
  const { spriteSheet } = formatBuddyCharacter(character);
  const frameKey = `${spriteSheet}:${size}`;
  const [readyFrame, setReadyFrame] = useState<string | null>(null);
  const ready = readyFrame === frameKey;
  useEffect(() => {
    const target = canvas.current;
    if (!target) return;
    const context = target.getContext("2d");
    if (!context) return;
    const image = new Image();
    const sheet = document.createElement("canvas");
    sheet.width = poseSize * sheetColumns;
    sheet.height = poseSize * sheetRows;
    const source = sheet.getContext("2d", { willReadFrequently: true });
    if (!source) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    let pose = 0;
    let loaded = false;
    const frames = getBuddyFrames(mood);
    const draw = () => {
      if (stopped || !loaded) return;
      const index = frames[pose].pose;
      context.clearRect(0, 0, size, size);
      context.imageSmoothingEnabled = false;
      context.drawImage(
        sheet,
        (index % sheetColumns) * poseSize,
        Math.floor(index / sheetColumns) * poseSize,
        poseSize,
        poseSize,
        0,
        0,
        size,
        size,
      );
      setReadyFrame(frameKey);
    };
    const tint = () => {
      if (!loaded || stopped) return;
      source.imageSmoothingEnabled = false;
      source.clearRect(0, 0, sheet.width, sheet.height);
      source.drawImage(image, 0, 0, sheet.width, sheet.height);
      const pixels = source.getImageData(0, 0, sheet.width, sheet.height);
      const probe = document.createElement("span");
      target.parentElement?.append(probe);
      const palette = ["outline", "shadow", "body", "light", "shine"].map(
        (tone) => {
          probe.style.color = `var(--buddy-${tone})`;
          source.fillStyle = getComputedStyle(probe).color;
          source.fillRect(0, 0, 1, 1);
          return source.getImageData(0, 0, 1, 1).data.slice(0, 3);
        },
      );
      probe.remove();
      for (let offset = 0; offset < pixels.data.length; offset += 4) {
        if (!pixels.data[offset + 3]) continue;
        const lightness =
          (pixels.data[offset] +
            pixels.data[offset + 1] +
            pixels.data[offset + 2]) /
          765;
        const tone =
          lightness < 0.3
            ? 0
            : lightness < 0.63
              ? 1
              : lightness < 0.82
                ? 2
                : lightness < 0.94
                  ? 3
                  : 4;
        pixels.data.set(palette[tone], offset);
      }
      source.putImageData(pixels, 0, 0);
      draw();
    };
    const advance = () => {
      if (stopped) return;
      draw();
      if (still) return;
      timer = setTimeout(() => {
        pose = (pose + 1) % frames.length;
        advance();
      }, frames[pose].duration);
    };
    image.onload = () => {
      loaded = true;
      tint();
      advance();
    };
    image.src = spriteSheet;
    const observer = new MutationObserver(tint);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme", "style"],
    });
    return () => {
      stopped = true;
      clearTimeout(timer);
      observer.disconnect();
      image.onload = null;
    };
  }, [mood, still, size, spriteSheet, frameKey]);
  return (
    <span
      aria-hidden="true"
      data-sprite-sheet={spriteSheet}
      className="pip-sprite"
      style={{ "--buddy-size": `${size}px` } as CSSProperties}
    >
      <canvas
        ref={canvas}
        width={size}
        height={size}
        className={cn("pip-sprite-canvas", !ready && "invisible")}
      />
    </span>
  );
};
