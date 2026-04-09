/**
 * Memory Layout Utilities
 *
 * This module handles the mathematical transformation of raw hex memory addresses
 * into navigable XY coordinates for 3D visualization.
 *
 * Key features:
 * - Memory folding: Collapses large gaps between stack and heap regions
 * - Consistent positioning: Same address always maps to same XY position
 * - Scale normalization: Keeps coordinates within reasonable bounds
 */

/** Stack typically starts at high addresses and grows down */
const STACK_BASE = 0xc000000000;

/** Heap typically starts at lower addresses */
const HEAP_BASE = 0xc000000000;

/** Folding factor to collapse large address gaps */
const FOLD_FACTOR = 256;

/** Grid cell size in world units */
const GRID_CELL_SIZE = 2;

/** Maximum grid dimension before additional folding */
const MAX_GRID_DIM = 100;

export interface Position2D {
  x: number;
  y: number;
}

/**
 * Calculates the folded XY position for a memory address.
 *
 * This function maps raw hex addresses to a navigable 2D grid by:
 * 1. Normalizing addresses relative to stack/heap base
 * 2. Applying logarithmic folding to collapse large gaps
 * 3. Mapping to a 2D grid using space-filling curve concepts
 *
 * @param address - The raw memory address (as a number from JSON)
 * @param isStack - Whether this address is on the stack (vs heap)
 * @returns The folded XY position in world coordinates
 */
export function calculateFoldedPosition(
  address: number,
  isStack: boolean,
): Position2D {
  const baseAddr = isStack ? STACK_BASE : HEAP_BASE;
  const offset = Math.abs(address - baseAddr);
  const foldedOffset = foldAddress(offset);
  const gridX = (foldedOffset % MAX_GRID_DIM) * GRID_CELL_SIZE;
  const gridY = Math.floor(foldedOffset / MAX_GRID_DIM) * GRID_CELL_SIZE;
  const yOffset = isStack ? 50 : -50;

  return {
    x: gridX - (MAX_GRID_DIM * GRID_CELL_SIZE) / 2,
    y: gridY + yOffset,
  };
}

/**
 * Applies logarithmic folding to compress large address ranges into a compact grid index.
 *
 * Formula: `floor(log2(offset / FOLD_FACTOR + 1) × 10)` – maps addresses
 * to navigable grid positions while preserving relative ordering.
 *
 * @param offset - The raw address offset from the region base address.
 * @returns A folded grid index.
 */
export function foldAddress(offset: number): number {
  if (offset === 0) return 0;

  const normalized = offset / FOLD_FACTOR;
  const folded = Math.log2(normalized + 1) * 10;

  return Math.max(0, Math.floor(folded));
}

/**
 * Calculates the visual scale for a memory block based on its size in bytes.
 *
 * Uses logarithmic scaling so that small primitives (8 bytes) and large
 * heap objects (megabytes) are both reasonably visible.
 *
 * @param size - The size of the memory block in bytes.
 * @returns A scale factor for the block's visual representation.
 */
export function calculateBlockScale(size: number): number {
  return Math.max(0.5, Math.log2(size + 1) * 0.5);
}

/**
 * Returns the Level of Detail tier for a given camera distance.
 *
 * Tiers control how much text is rendered on memory blocks:
 * - 0 (< 20): full detail – name, type, and value labels.
 * - 1 (< 50): name labels only.
 * - 2 (< 100): no text labels.
 * - 3 (>= 100): simplified geometry, no text.
 *
 * @param distance - Camera distance from the world origin.
 * @returns LOD tier number (0 = closest/most detailed, 3 = farthest/simplest).
 */
export function getLODTier(distance: number): number {
  if (distance < 20) return 0;
  if (distance < 50) return 1;
  if (distance < 100) return 2;
  return 3;
}

/**
 * Checks if two address ranges overlap.
 *
 * @param addr1 - Start of first range
 * @param size1 - Size of first range
 * @param addr2 - Start of second range
 * @param size2 - Size of second range
 * @returns True if ranges overlap
 */
export function addressRangesOverlap(
  addr1: number,
  size1: number,
  addr2: number,
  size2: number,
): boolean {
  const end1 = addr1 + size1;
  const end2 = addr2 + size2;
  return addr1 < end2 && addr2 < end1;
}

/**
 * Finds the closest memory block to a given world position.
 *
 * @param worldX - X coordinate in world space
 * @param worldY - Y coordinate in world space
 * @param blocks - Array of blocks with calculated positions
 * @returns The closest block or null if none within threshold
 */
export function findClosestBlock<T extends { position: Position2D }>(
  worldX: number,
  worldY: number,
  blocks: T[],
  threshold: number = 5,
): T | null {
  let closest: T | null = null;
  let minDist = threshold;

  for (const block of blocks) {
    const dx = block.position.x - worldX;
    const dy = block.position.y - worldY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < minDist) {
      minDist = dist;
      closest = block;
    }
  }

  return closest;
}
