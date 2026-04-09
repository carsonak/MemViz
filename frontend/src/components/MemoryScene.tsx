import { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useMemoryStore } from '../store/memoryStore';
import { calculateFoldedPosition } from '../utils/memoryLayout';
import type { MemoryBlock } from '../types';

/** Maximum number of memory blocks to render with instancing */
const MAX_INSTANCES = 10000;

/** Color palette for different memory types */
const COLORS = {
  stack: new THREE.Color(0x4a9eff), // Blue for stack
  heap: new THREE.Color(0xff6b6b),  // Red for heap
  string: new THREE.Color(0x51cf66), // Green for strings
  slice: new THREE.Color(0xfcc419),  // Yellow for slices
  selected: new THREE.Color(0xffffff), // White for selected
  hovered: new THREE.Color(0xbe4bdb), // Purple for hovered
};

interface InstanceData {
  blockId: string;
  position: THREE.Vector3;
  scale: THREE.Vector3;
  color: THREE.Color;
}

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

  // Calculate instance data for all blocks
  const instanceData = useMemo(() => {
    const data: InstanceData[] = [];
    const allBlocks = [...stackBlocks, ...heapBlocks];
    const currentStep = history.length;

    // Current memory state (Z = 0)
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

    // Historical states (Z > 0, fading into the past)
    history.slice(-20).forEach((graph, historyIndex) => {
      const zOffset = (currentStep - graph.step_number) * 2; // Each step is 2 units back
      const opacity = 1 - historyIndex / 20; // Fade older states

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

  // Update instanced mesh matrices
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

  // Animate (optional subtle animations)
  useFrame((_state, _delta) => {
    // Future: Add subtle pulsing or floating animation
  });

  return (
    <group>
      {/* Grid helper for spatial reference */}
      <gridHelper args={[200, 50, 0x444444, 0x222222]} rotation={[Math.PI / 2, 0, 0]} />

      {/* Instanced memory blocks */}
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

      {/* Axes helper */}
      <axesHelper args={[50]} />
    </group>
  );
}

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
