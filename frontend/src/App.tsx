import { useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Stats } from '@react-three/drei';
import { MemoryScene } from './components/MemoryScene';
import { UI } from './components/UI';
import { DebuggerControls } from './components/UI';
import { CodeEditor } from './components/CodeEditor';
import { useMemoryStore } from './store/memoryStore';

function App() {
  const isConnected = useMemoryStore((state) => state.isConnected);
  const connect = useMemoryStore((state) => state.connect);
  const disconnect = useMemoryStore((state) => state.disconnect);
  const sendCommand = useMemoryStore((state) => state.sendCommand);

  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  return (
    <div style={{ display: 'flex', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      {/* Left pane – code editor & controls */}
      <div
        style={{
          width: '40%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: '#1e1e1e',
          borderRight: '1px solid #333',
        }}
      >
        <DebuggerControls sendCommand={sendCommand} disabled={!isConnected} />
        <div style={{ flex: 1, minHeight: 0 }}>
          <CodeEditor />
        </div>
      </div>

      {/* Right pane – 3D canvas */}
      <div style={{ width: '60%', height: '100%', position: 'relative' }}>
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
          <Stats />
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
    </div>
  );
}

export default App;
