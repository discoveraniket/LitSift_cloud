import '@testing-library/jest-dom';

// Polyfill ResizeObserver for JSDOM / react-resizable-panels testing
if (typeof window !== 'undefined' && !window.ResizeObserver) {
  window.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
