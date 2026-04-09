import { useMemoryStore } from '../store/memoryStore';

export function UI() {
  const stopState = useMemoryStore((state) => state.stopState);
  const currentStep = useMemoryStore((state) => state.currentStepNumber);
  const selectedBlockId = useMemoryStore((state) => state.selectedBlockId);
  const stackBlocks = useMemoryStore((state) => state.stackBlocks);
  const heapBlocks = useMemoryStore((state) => state.heapBlocks);

  const selectedBlock = [...stackBlocks, ...heapBlocks].find(
    (b) => b.id === selectedBlockId
  );

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        padding: '1rem',
        color: '#e0e0e0',
        fontFamily: 'monospace',
        fontSize: '0.85rem',
        pointerEvents: 'none',
        userSelect: 'none',
      }}
    >
      {/* Debugger state */}
      <div style={{ marginBottom: '1rem' }}>
        <div style={{ color: '#888' }}>Step: {currentStep}</div>
        {stopState && (
          <>
            <div>
              {stopState.file}:{stopState.line}
            </div>
            <div style={{ color: '#4a9eff' }}>{stopState.function}</div>
          </>
        )}
      </div>

      {/* Selected block info */}
      {selectedBlock && (
        <div
          style={{
            background: 'rgba(0, 0, 0, 0.8)',
            padding: '0.75rem',
            borderRadius: '4px',
            border: '1px solid #333',
            maxWidth: '300px',
          }}
        >
          <div style={{ color: '#fff', fontWeight: 'bold', marginBottom: '0.5rem' }}>
            {selectedBlock.name}
          </div>
          <div style={{ color: '#4a9eff' }}>{selectedBlock.type}</div>
          <div style={{ color: '#888' }}>
            Address: 0x{selectedBlock.address.toString(16).toUpperCase()}
          </div>
          <div style={{ color: '#888' }}>Size: {selectedBlock.size} bytes</div>
          {selectedBlock.value && (
            <div style={{ color: '#51cf66', marginTop: '0.25rem' }}>
              Value: {selectedBlock.value}
            </div>
          )}
          <div style={{ color: '#666', fontSize: '0.75rem', marginTop: '0.25rem' }}>
            {selectedBlock.is_stack ? 'Stack' : 'Heap'}
          </div>
        </div>
      )}

      {/* Legend */}
      <div
        style={{
          position: 'fixed',
          bottom: '1rem',
          left: '1rem',
          display: 'flex',
          gap: '1rem',
          fontSize: '0.75rem',
        }}
      >
        <LegendItem color="#4a9eff" label="Stack" />
        <LegendItem color="#ff6b6b" label="Heap" />
        <LegendItem color="#51cf66" label="String" />
        <LegendItem color="#fcc419" label="Slice" />
      </div>

      {/* Controls hint */}
      <div
        style={{
          position: 'fixed',
          bottom: '1rem',
          right: '1rem',
          fontSize: '0.7rem',
          color: '#666',
          textAlign: 'right',
        }}
      >
        <div>Click block to select</div>
        <div>Mouse drag to rotate</div>
        <div>Scroll to zoom</div>
      </div>
    </div>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
      <div
        style={{
          width: '10px',
          height: '10px',
          backgroundColor: color,
          borderRadius: '2px',
        }}
      />
      <span>{label}</span>
    </div>
  );
}
