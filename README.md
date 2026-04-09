# MemViz - Time-Traveling 3D Memory Visualizer for Go

A real-time 3D visualization tool for stepping through Go programs and observing memory state changes over time.

## Architecture

This is a monorepo containing:

- **`/backend`** - Go server that orchestrates the [Delve](https://github.com/go-delve/delve) debugger via RPC
- **`/frontend`** - React web application using [React Three Fiber](https://docs.pmnd.rs/react-three-fiber) for WebGL rendering

## Features

- **Time-Travel Debugging**: Step through Go code and see historical memory states fade into the Z-axis
- **Memory Folding**: Large gaps between stack and heap are mathematically collapsed for navigability
- **Semantic Zoom (LOD)**: Variable names and types progressively hide as you zoom out
- **Pointer Visualization**: Hover on memory blocks to see pointer relationships
- **High Performance**: InstancedMesh rendering for thousands of memory blocks at 60-120fps

## Prerequisites

- Go 1.22+
- Node.js 20+
- [Delve](https://github.com/go-delve/delve) debugger (`go install github.com/go-delve/delve/cmd/dlv@latest`)

## Quick Start

### Backend

```bash
cd backend
go mod download
go run cmd/server/main.go
```

The WebSocket server starts on `http://localhost:8080`.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend starts on `http://localhost:3000`.

## Development

### Running Tests

**Backend:**

```bash
cd backend
go test ./...
```

**Frontend:**

```bash
cd frontend
npm test
```

### Project Structure

```text
MemViz/
├── backend/
│   ├── cmd/server/          # Main entry point
│   ├── internal/
│   │   ├── debugger/        # Delve client interface & mocks
│   │   └── server/          # WebSocket server
│   └── go.mod
├── frontend/
│   ├── src/
│   │   ├── components/      # React Three Fiber components
│   │   ├── store/           # Zustand state management
│   │   ├── types/           # TypeScript interfaces
│   │   ├── utils/           # Memory layout calculations
│   │   └── test/            # Vitest tests
│   ├── package.json
│   └── vite.config.ts
└── README.md
```

## Memory Visualization Layout

- **XY Plane**: Raw hex memory addresses (folded to collapse large gaps)
- **Z-Axis**: Time dimension (older states move backward, newer states at Z=0)
- **Colors**:
  - Blue: Stack memory
  - Red: Heap memory
  - Green: Strings
  - Yellow: Slices

## License

MIT
