/**
 * Vitest global test setup.
 * Installs lightweight browser-API stubs (WebGL, ResizeObserver, rAF)
 * required by Three.js and React Three Fiber in a jsdom environment.
 */
import "@testing-library/jest-dom";

// Mock WebGL context for Three.js tests
class WebGLRenderingContext {}

// @ts-expect-error - Mocking for tests
globalThis.WebGLRenderingContext = WebGLRenderingContext;

// Mock ResizeObserver
globalThis.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Mock requestAnimationFrame
globalThis.requestAnimationFrame = (callback: FrameRequestCallback) => {
  return setTimeout(callback, 16) as unknown as number;
};

globalThis.cancelAnimationFrame = (id: number) => {
  clearTimeout(id);
};
