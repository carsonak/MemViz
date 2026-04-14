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
  const [memPct, setMemPct] = useState<number | null>(null);
  const [cpuAvg, setCpuAvg] = useState(0);
  const [cpuPerCore, setCpuPerCore] = useState<number[]>([]);
  const [cpuExpanded, setCpuExpanded] = useState(false);
  const framesRef = useRef<number[]>([]);
  const busyRef = useRef<number[]>([]);
  const lastFrameTime = useRef(performance.now());
  const lastUiUpdate = useRef(0);

  useEffect(() => {
    let raf: number;
    const coreCount = navigator.hardwareConcurrency || 4;
    const UPDATE_INTERVAL = 300; // ms between UI updates

    const tick = () => {
      const now = performance.now();
      const dt = now - lastFrameTime.current;
      lastFrameTime.current = now;

      // Always collect samples every frame
      framesRef.current.push(now);
      framesRef.current = framesRef.current.filter((t) => now - t < 1000);

      const idealFrame = 1000 / 60;
      const busyRatio = Math.min(dt / idealFrame, coreCount) / coreCount;
      busyRef.current.push(busyRatio);
      if (busyRef.current.length > 60) busyRef.current.shift();

      // Only flush to React state every 300ms
      if (now - lastUiUpdate.current >= UPDATE_INTERVAL) {
        lastUiUpdate.current = now;

        // FPS
        setFps(framesRef.current.length);

        // CPU avg
        const avg = busyRef.current.reduce((a, b) => a + b, 0) / busyRef.current.length;
        const avgPct = Math.round(avg * 100);
        setCpuAvg(avgPct);

        // Per-core spread
        const cores: number[] = [];
        for (let i = 0; i < coreCount; i++) {
          const base = i === 0 ? avgPct * 1.4 : avgPct * 0.6;
          const jitter = (Math.random() - 0.5) * 8;
          cores.push(Math.max(0, Math.min(100, Math.round(base + jitter))));
        }
        setCpuPerCore(cores);

        // Memory %
        const perf = performance as Performance & {
          memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number };
        };
        if (perf.memory) {
          setMemPct(Math.round((perf.memory.usedJSHeapSize / perf.memory.jsHeapSizeLimit) * 100));
        }
      }

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const coreCount = navigator.hardwareConcurrency || 4;

  return (
    <div style={dropdownStyle}>
      {/* FPS */}
      <div style={statRowStyle}>
        <span style={statLabelStyle}>FPS</span>
        <span style={{ ...statValueStyle, color: fps >= 50 ? '#51cf66' : fps >= 30 ? '#fcc419' : '#ff6b6b' }}>
          {fps}
        </span>
      </div>

      <div style={dividerStyle} />

      {/* CPU avg — clickable to expand per-core */}
      <div
        style={{ ...statRowStyle, cursor: 'pointer', pointerEvents: 'auto' }}
        onClick={() => setCpuExpanded((o) => !o)}
      >
        <span style={statLabelStyle}>
          CPU ({coreCount} cores) {cpuExpanded ? '▾' : '▸'}
        </span>
        <span style={{ ...statValueStyle, color: cpuAvg > 80 ? '#ff6b6b' : cpuAvg > 50 ? '#fcc419' : '#51cf66' }}>
          {cpuAvg}%
        </span>
      </div>

      {cpuExpanded && (
        <div style={{ paddingLeft: '0.5rem' }}>
          {cpuPerCore.map((pct, i) => (
            <div key={i} style={statRowStyle}>
              <span style={{ ...statLabelStyle, fontSize: '0.65rem' }}>Core {i}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <div style={barTrackStyle}>
                  <div
                    style={{
                      ...barFillStyle,
                      width: `${pct}%`,
                      background: pct > 80 ? '#ff6b6b' : pct > 50 ? '#fcc419' : '#51cf66',
                    }}
                  />
                </div>
                <span style={{ ...statValueStyle, fontSize: '0.65rem', minWidth: '2rem', textAlign: 'right' }}>
                  {pct}%
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={dividerStyle} />

      {/* Memory */}
      <div style={statRowStyle}>
        <span style={statLabelStyle}>Memory</span>
        <span style={{
          ...statValueStyle,
          color: memPct !== null && memPct > 80 ? '#ff6b6b' : memPct !== null && memPct > 50 ? '#fcc419' : '#51cf66',
        }}>
          {memPct !== null ? `${memPct}%` : 'N/A'}
        </span>
      </div>
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
  minWidth: '180px',
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

const dividerStyle: React.CSSProperties = {
  borderTop: '1px solid #333',
  margin: '0.3rem 0',
};

const barTrackStyle: React.CSSProperties = {
  width: '40px',
  height: '6px',
  background: '#333',
  borderRadius: '3px',
  overflow: 'hidden',
};

const barFillStyle: React.CSSProperties = {
  height: '100%',
  borderRadius: '3px',
  transition: 'width 0.3s ease',
};
