import { useMemoryStore } from '../store/memoryStore';

/**
 * HUD overlay rendered on top of the 3D canvas.
 * Displays the selected block's details, a colour legend,
 * and camera control hints. All positioned relative to the 3D pane.
 */
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
    <>
      {/* Step / stop state — compact top-left badge */}
      {(currentStep > 0 || stopState) && (
        <div
          style={{
            position: 'absolute',
            top: '0.5rem',
            left: '0.5rem',
            background: 'rgba(0, 0, 0, 0.7)',
            padding: '0.35rem 0.6rem',
            borderRadius: '4px',
            border: '1px solid #333',
            color: '#e0e0e0',
            fontFamily: 'monospace',
            fontSize: '0.75rem',
            pointerEvents: 'none',
            userSelect: 'none',
          }}
        >
          <span style={{ color: '#888' }}>Step {currentStep}</span>
          {stopState && (
            <span style={{ marginLeft: '0.5rem', color: '#4a9eff' }}>
              {stopState.file}:{stopState.line}
            </span>
          )}
        </div>
      )}

      {/* Selected block details */}
      {selectedBlock && (
        <div
          style={{
            position: 'absolute',
            top: '2.5rem',
            left: '0.5rem',
            background: 'rgba(0, 0, 0, 0.8)',
            padding: '0.75rem',
            borderRadius: '4px',
            border: '1px solid #333',
            maxWidth: '280px',
            color: '#e0e0e0',
            fontFamily: 'monospace',
            fontSize: '0.8rem',
            pointerEvents: 'none',
            userSelect: 'none',
          }}
        >
          <div style={{ color: '#fff', fontWeight: 'bold', marginBottom: '0.3rem' }}>
            {selectedBlock.name}
          </div>
          <div style={{ color: '#4a9eff' }}>{selectedBlock.type}</div>
          <div style={{ color: '#888' }}>
            0x{selectedBlock.address.toString(16).toUpperCase()} &middot; {selectedBlock.size}B
          </div>
          {selectedBlock.value && (
            <div style={{ color: '#51cf66', marginTop: '0.2rem' }}>
              {selectedBlock.value}
            </div>
          )}
          <div style={{ color: '#666', fontSize: '0.7rem', marginTop: '0.2rem' }}>
            {selectedBlock.is_stack ? 'Stack' : 'Heap'}
          </div>
        </div>
      )}

      {/* Legend — bottom-left of 3D pane */}
      <div
        style={{
          position: 'absolute',
          bottom: '0.5rem',
          left: '0.5rem',
          display: 'flex',
          gap: '0.75rem',
          fontSize: '0.7rem',
          color: '#e0e0e0',
          fontFamily: 'monospace',
          pointerEvents: 'none',
          userSelect: 'none',
        }}
      >
        <LegendItem color="#4a9eff" label="Stack" />
        <LegendItem color="#ff6b6b" label="Heap" />
        <LegendItem color="#51cf66" label="String" />
        <LegendItem color="#fcc419" label="Slice" />
      </div>

      {/* Hints — bottom-right of 3D pane */}
      <div
        style={{
          position: 'absolute',
          bottom: '0.5rem',
          right: '0.5rem',
          fontSize: '0.65rem',
          color: '#555',
          textAlign: 'right',
          fontFamily: 'monospace',
          pointerEvents: 'none',
          userSelect: 'none',
        }}
      >
        <div>Click to select · Drag to rotate · Scroll to zoom</div>
      </div>
    </>
  );
}

/** A single colour swatch and label used in the scene legend. */
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

const controlButtonStyle: React.CSSProperties = {
  background: 'rgba(255, 255, 255, 0.08)',
  border: '1px solid #444',
  borderRadius: '4px',
  color: '#e0e0e0',
  fontFamily: 'monospace',
  fontSize: '0.8rem',
  padding: '0.4rem 0.75rem',
  cursor: 'pointer',
  transition: 'background 0.15s',
};

const controlButtonDisabledStyle: React.CSSProperties = {
  ...controlButtonStyle,
  opacity: 0.4,
  cursor: 'not-allowed',
};

/** Debugger control buttons wired to sendCommand. */
export function DebuggerControls({
  sendCommand,
  disabled,
  onStart,
}: {
  sendCommand: (action: string, payload?: unknown) => void;
  disabled: boolean;
  onStart: () => void;
}) {
  const actions = [
    { label: '▶️ Start', action: 'start' },
    { label: '⏭️ Step', action: 'step' },
    { label: '⏩ Continue', action: 'continue' },
    { label: '⏹️ Stop', action: 'stop' },
  ] as const;

  return (
    <div
      style={{
        display: 'flex',
        gap: '0.5rem',
        padding: '0.5rem',
        justifyContent: 'center',
      }}
    >
      {actions.map(({ label, action }) => (
        <button
          key={action}
          style={disabled ? controlButtonDisabledStyle : controlButtonStyle}
          disabled={disabled}
          onClick={() =>
            action === 'start'
              ? onStart()
              : sendCommand(action)
          }
          onMouseEnter={(e) => {
            if (!disabled) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)';
          }}
          onMouseLeave={(e) => {
            if (!disabled) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
