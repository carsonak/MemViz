import { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useMemoryStore } from '../store/memoryStore';
import { calculateFoldedPosition } from '../utils/memoryLayout';
import { PointerLines } from './PointerLines';
import type { MemoryBlock } from '../types';

/** Maximum number of memory blocks rendered via GPU instancing. */
const MAX_INSTANCES = 10000;

/** Number of historical snapshots drawn behind the current state in Z depth. */
const MAX_VISIBLE_HISTORY_STEPS = 20;

/** World-space distance between consecutive historical layers on the Z axis. */
const Z_STEP_UNIT = 2;

/** Color palette keyed by memory kind or interaction state. */
const COLORS = {
  stack: new THREE.Color(0x4a9eff),
  heap: new THREE.Color(0xff6b6b),
  string: new THREE.Color(0x51cf66),
  slice: new THREE.Color(0xfcc419),
  selected: new THREE.Color(0xffffff),
  hovered: new THREE.Color(0xbe4bdb),
};

/** Per-instance GPU data computed each frame for a single memory block. */
interface InstanceData {
  blockId: string;
  position: THREE.Vector3;
  scale: THREE.Vector3;
  color: THREE.Color;
}

/**
 * Renders the 3D memory visualisation using instanced meshes.
 *
 * Each memory block becomes a coloured cube positioned by its address via
 * calculateFoldedPosition. Historical snapshots are layered behind the current
 * state along the negative Z axis, fading with distance.
 */
export function MemoryScene() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  const stackBlocks = useMemoryStore((state) => state.stackBlocks);
  const heapBlocks = useMemoryStore((state) => state.heapBlocks);
  const history = useMemoryStore((state) => state.history);
  const selectedBlockId = useMemoryStore((state) => state.selectedBlockId);
  const hoveredBlockId = useMemoryStore((state) => state.hoveredBlockId);
  const setSelectedBlock = useMemoryStore((state) => state.setSelectedBlock);
  const setHoveredBlock = useMemoryStore((state) => state.setHoveredBlock);

  const instanceData = useMemo(() => {
    const data: InstanceData[] = [];
    const allBlocks = [...stackBlocks, ...heapBlocks];
    const currentStep = history.length;

    allBlocks.forEach((block) => {
      const pos = calculateFoldedPosition(block.address, block.is_stack);
      data.push({
        blockId: block.id,
        position: new THREE.Vector3(pos.x, pos.y, 0),
        scale: new THREE.Vector3(
          Math.max(1, Math.log2(block.size + 1)),
          Math.max(1, Math.log2(block.size + 1)),
          1
        ),
        color: getBlockColor(block, selectedBlockId, hoveredBlockId),
      });
    });

    history.slice(-MAX_VISIBLE_HISTORY_STEPS).forEach((graph, historyIndex) => {
      const zOffset = (currentStep - graph.step_number) * Z_STEP_UNIT;
      const opacity = 1 - historyIndex / MAX_VISIBLE_HISTORY_STEPS;

      [...graph.stack_blocks, ...graph.heap_blocks].forEach((block) => {
        const pos = calculateFoldedPosition(block.address, block.is_stack);
        const color = getBlockColor(block, null, null);
        color.multiplyScalar(opacity * 0.5); // Fade historical blocks

        data.push({
          blockId: `${block.id}-history-${graph.step_number}`,
          position: new THREE.Vector3(pos.x, pos.y, -zOffset),
          scale: new THREE.Vector3(
            Math.max(1, Math.log2(block.size + 1)),
            Math.max(1, Math.log2(block.size + 1)),
            0.5
          ),
          color,
        });
      });
    });

    return data.slice(0, MAX_INSTANCES);
  }, [stackBlocks, heapBlocks, history, selectedBlockId, hoveredBlockId]);

  useEffect(() => {
    if (!meshRef.current) return;

    const mesh = meshRef.current;
    const colorArray = new Float32Array(MAX_INSTANCES * 3);

    instanceData.forEach((instance, i) => {
      dummy.position.copy(instance.position);
      dummy.scale.copy(instance.scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);

      colorArray[i * 3] = instance.color.r;
      colorArray[i * 3 + 1] = instance.color.g;
      colorArray[i * 3 + 2] = instance.color.b;
    });

    mesh.instanceMatrix.needsUpdate = true;
    mesh.geometry.setAttribute(
      'instanceColor',
      new THREE.InstancedBufferAttribute(colorArray, 3)
    );
    mesh.count = instanceData.length;
  }, [instanceData, dummy]);

  useFrame((_state, _delta) => {
  });

  return (
    <group>
      <gridHelper args={[200, 50, 0x444444, 0x222222]} rotation={[Math.PI / 2, 0, 0]} />

      <instancedMesh
        ref={meshRef}
        args={[undefined, undefined, MAX_INSTANCES]}
        frustumCulled={false}
        onClick={(e) => {
          e.stopPropagation();
          const instanceId = e.instanceId;
          if (instanceId !== undefined && instanceData[instanceId]) {
            setSelectedBlock(instanceData[instanceId].blockId);
          }
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          const instanceId = e.instanceId;
          if (instanceId !== undefined && instanceData[instanceId]) {
            setHoveredBlock(instanceData[instanceId].blockId);
            document.body.style.cursor = 'pointer';
          }
        }}
        onPointerOut={() => {
          setHoveredBlock(null);
          document.body.style.cursor = 'auto';
        }}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial vertexColors toneMapped={false} />
      </instancedMesh>

      <PointerLines />
      <axesHelper args={[50]} />
    </group>
  );
}

/**
 * Returns the display color for a memory block based on its type and interaction state.
 *
 * selectedId / hoveredId – IDs to match against for interaction highlights.
 */
function getBlockColor(
  block: MemoryBlock,
  selectedId: string | null,
  hoveredId: string | null
): THREE.Color {
  if (block.id === selectedId) return COLORS.selected.clone();
  if (block.id === hoveredId) return COLORS.hovered.clone();

  // Color by type
  if (block.kind === 'string') return COLORS.string.clone();
  if (block.kind === 'slice') return COLORS.slice.clone();
  if (block.is_stack) return COLORS.stack.clone();
  return COLORS.heap.clone();
}
