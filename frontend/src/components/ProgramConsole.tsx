import { useEffect, useRef } from 'react';
import { useMemoryStore } from '../store/memoryStore';

export function ProgramConsole() {
  const output = useMemoryStore((s) => s.programOutput);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [output]);

  return (
    <div
      style={{
        height: '100%',
        background: '#0d0d0d',
        color: '#d4d4d4',
        fontFamily: 'monospace',
        fontSize: 13,
        padding: '8px 12px',
        overflowY: 'auto',
        borderTop: '1px solid #333',
        boxSizing: 'border-box',
      }}
    >
      {output.length === 0 && (
        <span style={{ color: '#555' }}>Program output will appear here…</span>
      )}
      {output.map((line, i) => (
        <div key={i} style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
          {line}
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
