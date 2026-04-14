import { useState, useRef, useEffect } from 'react';

interface PaneVisibility {
  editor: boolean;
  canvas: boolean;
}

export function NavBar({
  panes,
  onTogglePane,
}: {
  panes: PaneVisibility;
  onTogglePane: (pane: keyof PaneVisibility) => void;
}) {
  const [statsOpen, setStatsOpen] = useState(false);
  const statsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!statsOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (statsRef.current && !statsRef.current.contains(e.target as Node)) {
        setStatsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [statsOpen]);

  return (
    <nav style={navStyle}>
      <span style={titleStyle}>MemViz</span>

      <div style={groupStyle}>
        <ToggleButton
          label="Editor"
          active={panes.editor}
          onClick={() => onTogglePane('editor')}
        />
        <ToggleButton
          label="3D View"
          active={panes.canvas}
          onClick={() => onTogglePane('canvas')}
        />
      </div>

      <div ref={statsRef} style={{ position: 'relative' }}>
        <button
          style={hamburgerStyle}
          onClick={() => setStatsOpen((o) => !o)}
          title="Performance stats"
        >
          ☰
        </button>
        {statsOpen && <StatsDropdown />}
      </div>
    </nav>
  );
}

function ToggleButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        ...toggleBtnStyle,
        background: active ? 'rgba(74, 158, 255, 0.25)' : 'transparent',
        borderColor: active ? '#4a9eff' : '#555',
      }}
    >
      {active ? '☑' : '☐'} {label}
    </button>
  );
}

function StatsDropdown() {
  const [fps, setFps] = useState(0);
  const [memory, setMemory] = useState<{ used: number; total: number } | null>(null);
  const framesRef = useRef<number[]>([]);

  useEffect(() => {
    let raf: number;
    const tick = () => {
      const now = performance.now();
      framesRef.current.push(now);
      // Keep only frames from the last second
      framesRef.current = framesRef.current.filter((t) => now - t < 1000);
      setFps(framesRef.current.length);

      const perf = performance as Performance & {
        memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number };
      };
      if (perf.memory) {
        setMemory({
          used: Math.round(perf.memory.usedJSHeapSize / 1048576),
          total: Math.round(perf.memory.jsHeapSizeLimit / 1048576),
        });
      }

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div style={dropdownStyle}>
      <div style={statRowStyle}>
        <span style={statLabelStyle}>FPS</span>
        <span style={statValueStyle}>{fps}</span>
      </div>
      {memory && (
        <>
          <div style={statRowStyle}>
            <span style={statLabelStyle}>Heap</span>
            <span style={statValueStyle}>{memory.used} MB</span>
          </div>
          <div style={statRowStyle}>
            <span style={statLabelStyle}>Limit</span>
            <span style={statValueStyle}>{memory.total} MB</span>
          </div>
        </>
      )}
      {navigator.hardwareConcurrency && (
        <div style={statRowStyle}>
          <span style={statLabelStyle}>Cores</span>
          <span style={statValueStyle}>{navigator.hardwareConcurrency}</span>
        </div>
      )}
    </div>
  );
}

const NAV_HEIGHT = 36;
export { NAV_HEIGHT };

const navStyle: React.CSSProperties = {
  height: NAV_HEIGHT,
  display: 'flex',
  alignItems: 'center',
  gap: '0.75rem',
  padding: '0 0.75rem',
  background: '#181818',
  borderBottom: '1px solid #333',
  flexShrink: 0,
  fontFamily: 'monospace',
  fontSize: '0.8rem',
  color: '#e0e0e0',
  userSelect: 'none',
};

const titleStyle: React.CSSProperties = {
  fontWeight: 'bold',
  fontSize: '0.9rem',
  color: '#4a9eff',
  marginRight: 'auto',
};

const groupStyle: React.CSSProperties = {
  display: 'flex',
  gap: '0.25rem',
};

const toggleBtnStyle: React.CSSProperties = {
  border: '1px solid #555',
  borderRadius: '4px',
  color: '#e0e0e0',
  fontFamily: 'monospace',
  fontSize: '0.75rem',
  padding: '0.2rem 0.5rem',
  cursor: 'pointer',
  transition: 'background 0.15s',
};

const hamburgerStyle: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid #555',
  borderRadius: '4px',
  color: '#e0e0e0',
  fontSize: '1rem',
  padding: '0.15rem 0.5rem',
  cursor: 'pointer',
  lineHeight: 1,
};

const dropdownStyle: React.CSSProperties = {
  position: 'absolute',
  top: '100%',
  right: 0,
  marginTop: '0.25rem',
  background: '#1e1e1e',
  border: '1px solid #444',
  borderRadius: '6px',
  padding: '0.5rem 0.75rem',
  minWidth: '140px',
  zIndex: 100,
  boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
};

const statRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  padding: '0.15rem 0',
};

const statLabelStyle: React.CSSProperties = {
  color: '#888',
  fontSize: '0.75rem',
};

const statValueStyle: React.CSSProperties = {
  color: '#e0e0e0',
  fontSize: '0.75rem',
  fontWeight: 'bold',
  fontVariantNumeric: 'tabular-nums',
};
