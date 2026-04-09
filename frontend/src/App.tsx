import { Canvas } from '@react-three/fiber';
import { OrbitControls, Stats } from '@react-three/drei';
import { MemoryScene } from './components/MemoryScene';
import { UI } from './components/UI';
import { useMemoryStore } from './store/memoryStore';

function App() {
  const isConnected = useMemoryStore((state) => state.isConnected);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
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
  );
}

export default App;
