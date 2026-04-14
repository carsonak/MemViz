import { useMemoryStore } from '../store/memoryStore';

/**
 * HUD overlay rendered on top of the 3D canvas.
 * Displays the current debugger stop location, the selected block's details,
 * a colour legend, and camera control hints.
 */
export function UI() {
  const stopState = useMemoryStore((state) => state.stopState);
  const currentStep = useMemoryStore((state) => state.currentStepNumber);
  const selectedBlockId = useMemoryStore((state) => state.selectedBlockId);
  const stackBlocks = useMemoryStore((state) => state.stackBlocks);
  const heapBlocks = useMemoryStore((state) => state.heapBlocks);
  const sendCommand = useMemoryStore((state) => state.sendCommand);
  const isConnected = useMemoryStore((state) => state.isConnected);

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
}: {
  sendCommand: (action: string, payload?: unknown) => void;
  disabled: boolean;
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
          onClick={() => sendCommand(action)}
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
