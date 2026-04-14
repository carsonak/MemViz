import { useCallback, useEffect, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { MemoryScene } from './components/MemoryScene';
import { UI } from './components/UI';
import { DebuggerControls } from './components/UI';
import { CodeEditor, DEFAULT_CODE } from './components/CodeEditor';
import { ProgramConsole } from './components/ProgramConsole';
import { NavBar } from './components/NavBar';
import { useMemoryStore } from './store/memoryStore';

const MIN_PANE_PCT = 15;
const DEFAULT_SPLIT = 40;

function App() {
  const isConnected = useMemoryStore((state) => state.isConnected);
  const connect = useMemoryStore((state) => state.connect);
  const disconnect = useMemoryStore((state) => state.disconnect);
  const sendCommand = useMemoryStore((state) => state.sendCommand);
  const [code, setCode] = useState(DEFAULT_CODE);
  const lastBuiltCode = useRef('');

  const [panes, setPanes] = useState({ editor: true, canvas: true });
  const [splitPct, setSplitPct] = useState(DEFAULT_SPLIT);
  const dragging = useRef(false);

  const handleStart = useCallback(() => {
    if (code !== lastBuiltCode.current) {
      sendCommand('build_and_start', { code });
      lastBuiltCode.current = code;
    } else {
      sendCommand('restart');
    }
  }, [code, sendCommand]);

  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  const onTogglePane = useCallback((pane: 'editor' | 'canvas') => {
    setPanes((prev) => ({ ...prev, [pane]: !prev[pane] }));
  }, []);

  /* Drag-to-resize logic */
  const onDividerMouseDown = useCallback(() => {
    dragging.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const pct = (e.clientX / window.innerWidth) * 100;
      setSplitPct(Math.max(MIN_PANE_PCT, Math.min(100 - MIN_PANE_PCT, pct)));
    };

    const onUp = () => {
      dragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, []);

  const bothVisible = panes.editor && panes.canvas;

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <NavBar panes={panes} onTogglePane={onTogglePane} />

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* Editor pane */}
        {panes.editor && (
          <div
            style={{
              width: bothVisible ? `${splitPct}%` : '100%',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              background: '#1e1e1e',
              overflow: 'hidden',
            }}
          >
            <DebuggerControls sendCommand={sendCommand} disabled={!isConnected} onStart={handleStart} />
            <div style={{ flex: 1, minHeight: 0 }}>
              <CodeEditor value={code} onChange={setCode} />
            </div>
            <div style={{ height: '30%', minHeight: 80, flexShrink: 0 }}>
              <ProgramConsole />
            </div>
          </div>
        )}

        {/* Resize handle */}
        {bothVisible && (
          <div
            onMouseDown={onDividerMouseDown}
            style={{
              width: 5,
              cursor: 'col-resize',
              background: '#333',
              flexShrink: 0,
              transition: 'background 0.15s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#4a9eff')}
            onMouseLeave={(e) => {
              if (!dragging.current) e.currentTarget.style.background = '#333';
            }}
          />
        )}

        {/* 3D Canvas pane */}
        {panes.canvas && (
          <div style={{ flex: 1, height: '100%', position: 'relative', minWidth: 0 }}>
            <Canvas
              camera={{ position: [50, 50, 50], fov: 60 }}
              gl={{ antialias: true, alpha: false }}
              dpr={[1, 2]}
            >
              <color attach="background" args={['#0a0a0a']} />
              <ambientLight intensity={0.4} />
              <directionalLight position={[10, 20, 10]} intensity={1} />
              <MemoryScene />
              <OrbitControls
                makeDefault
                enableDamping
                dampingFactor={0.05}
                minDistance={5}
                maxDistance={500}
              />
            </Canvas>
            <UI />
            {!isConnected && (
              <div
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  color: '#666',
                  fontSize: '1.2rem',
                  textAlign: 'center',
                }}
              >
                Connecting to MemViz server...
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
