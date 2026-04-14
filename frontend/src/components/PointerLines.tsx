import { useMemo } from 'react';
import { Line } from '@react-three/drei';
import { useMemoryStore } from '../store/memoryStore';
import { calculateFoldedPosition } from '../utils/memoryLayout';
import type { MemoryBlock, Pointer } from '../types';

/** Accent colour for pointer lines. */
const LINE_COLOR = '#fcc419';

/** Peak height of the bezier arc so lines float above blocks. */
const ARC_HEIGHT = 4;

/** Number of intermediate points along each arc (including endpoints). */
const ARC_SEGMENTS = 32;

/**
 * Builds a lookup map from block ID → world position [x, y, 0].
 */
function buildPositionMap(blocks: MemoryBlock[]): Map<string, [number, number, number]> {
  const map = new Map<string, [number, number, number]>();
  for (const block of blocks) {
    const pos = calculateFoldedPosition(block.address, block.is_stack);
    map.set(block.id, [pos.x, pos.y, 0]);
  }
  return map;
}

/**
 * Returns an array of 3D points tracing a parabolic arc between two positions.
 * The arc peaks at ARC_HEIGHT on the Z axis at the midpoint.
 */
function buildArcPoints(
  src: [number, number, number],
  dst: [number, number, number],
): [number, number, number][] {
  const points: [number, number, number][] = [];
  for (let i = 0; i <= ARC_SEGMENTS; i++) {
    const t = i / ARC_SEGMENTS;
    const x = src[0] + (dst[0] - src[0]) * t;
    const y = src[1] + (dst[1] - src[1]) * t;
    // Parabolic arc: peaks at t = 0.5
    const z = ARC_HEIGHT * 4 * t * (1 - t);
    points.push([x, y, z]);
  }
  return points;
}

/**
 * Renders pointer-relationship lines for the currently hovered or selected
 * memory block. Lines follow a parabolic arc so they don't clip through blocks.
 */
export function PointerLines() {
  const pointers = useMemoryStore((s) => s.pointers);
  const stackBlocks = useMemoryStore((s) => s.stackBlocks);
  const heapBlocks = useMemoryStore((s) => s.heapBlocks);
  const selectedBlockId = useMemoryStore((s) => s.selectedBlockId);
  const hoveredBlockId = useMemoryStore((s) => s.hoveredBlockId);

  const lines = useMemo(() => {
    // Nothing active — skip everything.
    if (!selectedBlockId && !hoveredBlockId) return [];

    const posMap = buildPositionMap([...stackBlocks, ...heapBlocks]);

    const activeIds = new Set<string>();
    if (selectedBlockId) activeIds.add(selectedBlockId);
    if (hoveredBlockId) activeIds.add(hoveredBlockId);

    const visible: { key: string; points: [number, number, number][] }[] = [];

    for (const ptr of pointers) {
      if (!activeIds.has(ptr.source_id) && !activeIds.has(ptr.target_id)) continue;

      const src = posMap.get(ptr.source_id);
      const dst = posMap.get(ptr.target_id);

      // Skip if either endpoint is missing (nil / unmapped target).
      if (!src || !dst) continue;

      visible.push({ key: ptr.id, points: buildArcPoints(src, dst) });
    }

    return visible;
  }, [pointers, stackBlocks, heapBlocks, selectedBlockId, hoveredBlockId]);

  if (lines.length === 0) return null;

  return (
    <group>
      {lines.map((line) => (
        <Line
          key={line.key}
          points={line.points}
          color={LINE_COLOR}
          lineWidth={2}
          dashed={false}
        />
      ))}
    </group>
  );
}
