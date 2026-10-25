"use client";

import { useState } from "react";
import Image from "next/image";
import type {
  PreviewFileSchema,
  PreviewImageAssetSchema,
} from "@senslop/contracts";
import { Minus, Plus, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TooltipWrapper } from "@/components/ui/tooltip-wrapper";

const FrozenImage = ({
  image,
  label,
  zoom,
}: {
  image?: PreviewImageAssetSchema | null;
  label: string;
  zoom: number;
}) => {
  const [dimensions, setDimensions] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [failed, setFailed] = useState(false);
  return (
    <section className="flex min-w-0 flex-1 flex-col gap-3">
      <h3 className="font-medium">{label}</h3>
      {!image ? (
        <p className="text-muted-foreground">
          Preview unavailable for this captured side.
        </p>
      ) : failed ? (
        <p role="status" className="text-muted-foreground">
          Captured bytes could not be decoded as an image.
        </p>
      ) : (
        <>
          <div className="max-h-[65dvh] overflow-auto rounded-lg border bg-muted/20 p-4">
            <Image
              unoptimized
              src={`data:${image.mime};base64,${image.base64}`}
              alt={`${label} frozen image`}
              width={dimensions?.width ?? 600}
              height={dimensions?.height ?? 400}
              style={{
                width: dimensions ? dimensions.width * zoom : undefined,
                height: "auto",
                maxWidth: "none",
              }}
              onLoad={(event) =>
                setDimensions({
                  width: event.currentTarget.naturalWidth,
                  height: event.currentTarget.naturalHeight,
                })
              }
              onError={() => setFailed(true)}
            />
          </div>
          {dimensions && (
            <p className="text-muted-foreground tabular-nums">
              {dimensions.width} × {dimensions.height} px
            </p>
          )}
        </>
      )}
    </section>
  );
};

export const ImageDiffPreview = ({ file }: { file: PreviewFileSchema }) => {
  const [zoom, setZoom] = useState(1);
  return (
    <div className="flex flex-col gap-4 p-5 text-base">
      <header className="flex items-center gap-2">
        <span className="min-w-0 flex-1 text-muted-foreground">
          Frozen image comparison
        </span>
        <TooltipWrapper content="Zoom out">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Zoom out"
            disabled={zoom <= 0.25}
            onClick={() => setZoom((value) => Math.max(0.25, value - 0.25))}
          >
            <Minus />
          </Button>
        </TooltipWrapper>
        <span className="tabular-nums">{Math.round(zoom * 100)}%</span>
        <TooltipWrapper content="Zoom in">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Zoom in"
            disabled={zoom >= 4}
            onClick={() => setZoom((value) => Math.min(4, value + 0.25))}
          >
            <Plus />
          </Button>
        </TooltipWrapper>
        <TooltipWrapper content="Reset zoom">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Reset zoom"
            onClick={() => setZoom(1)}
          >
            <RotateCcw />
          </Button>
        </TooltipWrapper>
      </header>
      <div className="flex flex-col gap-5 xl:flex-row">
        <FrozenImage
          image={file.imagePreview?.before}
          label="Before"
          zoom={zoom}
        />
        <FrozenImage
          image={file.imagePreview?.after}
          label="After"
          zoom={zoom}
        />
      </div>
      {file.imagePreview?.unavailableReason && (
        <p className="text-muted-foreground">
          {file.imagePreview.unavailableReason}
        </p>
      )}
    </div>
  );
};
