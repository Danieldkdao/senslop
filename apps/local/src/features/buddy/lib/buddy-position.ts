import { buddyMargin, buddySize } from "../constants";
import type { BuddyPosition, BuddyViewport } from "../types";

export const getBuddyBounds = (viewport: BuddyViewport, size = buddySize) => {
  const marginX = viewport.width < size + buddyMargin * 2 ? 0 : buddyMargin;
  const marginY = viewport.height < size + buddyMargin * 2 ? 0 : buddyMargin;
  return {
    left: viewport.left + marginX,
    top: viewport.top + marginY,
    right: viewport.left + Math.max(marginX, viewport.width - size - marginX),
    bottom: viewport.top + Math.max(marginY, viewport.height - size - marginY),
  };
};

export const clampBuddyPosition = (
  position: BuddyPosition,
  viewport: BuddyViewport,
  size = buddySize,
): BuddyPosition => {
  const bounds = getBuddyBounds(viewport, size);
  return {
    x: Math.max(bounds.left, Math.min(bounds.right, position.x)),
    y: Math.max(bounds.top, Math.min(bounds.bottom, position.y)),
  };
};

export const resolveBuddyPosition = (
  saved: BuddyPosition | null,
  viewport: BuddyViewport,
  size = buddySize,
): BuddyPosition => {
  const bounds = getBuddyBounds(viewport, size);
  return {
    x: bounds.left + (bounds.right - bounds.left) * (saved?.x ?? 1),
    y: bounds.top + (bounds.bottom - bounds.top) * (saved?.y ?? 1),
  };
};

export const normalizeBuddyPosition = (
  position: BuddyPosition,
  viewport: BuddyViewport,
  size = buddySize,
): BuddyPosition => {
  const bounds = getBuddyBounds(viewport, size);
  const clamped = clampBuddyPosition(position, viewport, size);
  return {
    x: (clamped.x - bounds.left) / (bounds.right - bounds.left || 1),
    y: (clamped.y - bounds.top) / (bounds.bottom - bounds.top || 1),
  };
};
