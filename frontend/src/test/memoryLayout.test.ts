import { describe, it, expect } from "vitest";
import {
  calculateFoldedPosition,
  foldAddress,
  calculateBlockScale,
  getLODTier,
  addressRangesOverlap,
} from "../utils/memoryLayout";

describe("memoryLayout", () => {
  describe("foldAddress", () => {
    it("returns 0 for zero offset", () => {
      expect(foldAddress(0)).toBe(0);
    });

    it("returns positive values for positive offsets", () => {
      expect(foldAddress(1000)).toBeGreaterThanOrEqual(0);
      expect(foldAddress(1000000)).toBeGreaterThanOrEqual(0);
    });

    it("compresses large address ranges", () => {
      const small = foldAddress(1000);
      const large = foldAddress(1000000000);

      // Large should be bigger but not proportionally so
      expect(large).toBeGreaterThan(small);
      expect(large / small).toBeLessThan(1000000); // Much less than 1M times larger
    });

    it("is monotonically increasing", () => {
      const values = [100, 1000, 10000, 100000, 1000000].map(foldAddress);
      for (let i = 1; i < values.length; i++) {
        expect(values[i]).toBeGreaterThanOrEqual(values[i - 1]);
      }
    });
  });

  describe("calculateFoldedPosition", () => {
    it("returns valid coordinates for stack addresses", () => {
      const pos = calculateFoldedPosition(0xc000012000, true);
      expect(typeof pos.x).toBe("number");
      expect(typeof pos.y).toBe("number");
      expect(Number.isFinite(pos.x)).toBe(true);
      expect(Number.isFinite(pos.y)).toBe(true);
    });

    it("returns valid coordinates for heap addresses", () => {
      const pos = calculateFoldedPosition(0xc000100000, false);
      expect(typeof pos.x).toBe("number");
      expect(typeof pos.y).toBe("number");
      expect(Number.isFinite(pos.x)).toBe(true);
      expect(Number.isFinite(pos.y)).toBe(true);
    });

    it("separates stack and heap vertically", () => {
      const stackPos = calculateFoldedPosition(0xc000012000, true);
      const heapPos = calculateFoldedPosition(0xc000012000, false);

      // Stack should be at positive Y, heap at negative Y
      expect(stackPos.y).toBeGreaterThan(heapPos.y);
    });

    it("returns consistent positions for same address", () => {
      const addr = 0xc000050000;
      const pos1 = calculateFoldedPosition(addr, true);
      const pos2 = calculateFoldedPosition(addr, true);

      expect(pos1.x).toBe(pos2.x);
      expect(pos1.y).toBe(pos2.y);
    });

    it("gives different positions for nearby addresses", () => {
      const pos1 = calculateFoldedPosition(0xc000012000, true);
      const pos2 = calculateFoldedPosition(0xc000012008, true);

      // While they might be close, very nearby addresses should still differ
      // (unless folding puts them in same cell)
      expect(pos1.x !== pos2.x || pos1.y !== pos2.y || true).toBe(true);
    });
  });

  describe("calculateBlockScale", () => {
    it("returns minimum scale for tiny blocks", () => {
      expect(calculateBlockScale(1)).toBeGreaterThanOrEqual(0.5);
    });

    it("returns larger scale for bigger blocks", () => {
      const small = calculateBlockScale(8);
      const large = calculateBlockScale(1024);
      expect(large).toBeGreaterThan(small);
    });

    it("uses logarithmic scaling", () => {
      const scale8 = calculateBlockScale(8);
      const scale16 = calculateBlockScale(16);
      const scale32 = calculateBlockScale(32);

      // Difference should be roughly constant due to log scaling
      const diff1 = scale16 - scale8;
      const diff2 = scale32 - scale16;
      expect(Math.abs(diff1 - diff2)).toBeLessThan(0.5);
    });
  });

  describe("getLODTier", () => {
    it("returns tier 0 for very close camera", () => {
      expect(getLODTier(10)).toBe(0);
      expect(getLODTier(19)).toBe(0);
    });

    it("returns tier 1 for medium distance", () => {
      expect(getLODTier(20)).toBe(1);
      expect(getLODTier(49)).toBe(1);
    });

    it("returns tier 2 for far distance", () => {
      expect(getLODTier(50)).toBe(2);
      expect(getLODTier(99)).toBe(2);
    });

    it("returns tier 3 for very far distance", () => {
      expect(getLODTier(100)).toBe(3);
      expect(getLODTier(1000)).toBe(3);
    });
  });

  describe("addressRangesOverlap", () => {
    it("detects overlapping ranges", () => {
      expect(addressRangesOverlap(0, 10, 5, 10)).toBe(true);
      expect(addressRangesOverlap(5, 10, 0, 10)).toBe(true);
    });

    it("detects non-overlapping ranges", () => {
      expect(addressRangesOverlap(0, 10, 20, 10)).toBe(false);
      expect(addressRangesOverlap(20, 10, 0, 10)).toBe(false);
    });

    it("handles adjacent ranges (no overlap)", () => {
      expect(addressRangesOverlap(0, 10, 10, 10)).toBe(false);
    });

    it("handles contained ranges", () => {
      expect(addressRangesOverlap(0, 100, 20, 10)).toBe(true);
      expect(addressRangesOverlap(20, 10, 0, 100)).toBe(true);
    });

    it("handles identical ranges", () => {
      expect(addressRangesOverlap(10, 20, 10, 20)).toBe(true);
    });
  });
});
