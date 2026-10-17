import { expect, test } from "vitest";
import {
  clampBuddyPosition,
  normalizeBuddyPosition,
  resolveBuddyPosition,
} from "../lib/buddy-position";

const viewport = { left: 0, top: 0, width: 1200, height: 800 };

test("dragging is bounded by the whole visible viewport and the buddy's full dimensions", () => {
  expect(clampBuddyPosition({ x: -200, y: 900 }, viewport)).toEqual({
    x: 12,
    y: 692,
  });
  expect(clampBuddyPosition({ x: 1800, y: -1 }, viewport)).toEqual({
    x: 1092,
    y: 12,
  });
});

test("saved fractional positions survive viewport resizing and reset is at the lower right", () => {
  const saved = normalizeBuddyPosition({ x: 552, y: 352 }, viewport);
  expect(saved).toEqual({ x: 0.5, y: 0.5 });
  expect(
    resolveBuddyPosition(saved, { left: 0, top: 0, width: 600, height: 400 }),
  ).toEqual({ x: 252, y: 152 });
  expect(resolveBuddyPosition(null, viewport)).toEqual({ x: 1092, y: 692 });
});

test("mobile visual viewport offsets and very small windows cannot strand the buddy", () => {
  const mobile = { left: 40, top: 120, width: 320, height: 300 };
  expect(resolveBuddyPosition({ x: 1, y: 1 }, mobile)).toEqual({
    x: 252,
    y: 312,
  });
  const tiny = { left: 0, top: 0, width: 80, height: 80 };
  expect(resolveBuddyPosition({ x: 1, y: 1 }, tiny)).toEqual({ x: 0, y: 0 });
  expect(normalizeBuddyPosition({ x: 0, y: 0 }, tiny)).toEqual({ x: 0, y: 0 });
});

test("size changes keep the whole buddy in bounds and preserve fractional placement", () => {
  expect(resolveBuddyPosition(null, viewport, 120)).toEqual({
    x: 1068,
    y: 668,
  });
  expect(clampBuddyPosition({ x: 1200, y: 800 }, viewport, 80)).toEqual({
    x: 1108,
    y: 708,
  });
  const saved = normalizeBuddyPosition({ x: 540, y: 340 }, viewport, 120);
  expect(saved).toEqual({ x: 0.5, y: 0.5 });
  expect(resolveBuddyPosition(saved, viewport, 80)).toEqual({ x: 560, y: 360 });
  expect(
    resolveBuddyPosition(
      saved,
      { left: 20, top: 40, width: 100, height: 100 },
      120,
    ),
  ).toEqual({ x: 20, y: 40 });
});
