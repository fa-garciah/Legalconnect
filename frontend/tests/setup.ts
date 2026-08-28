import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

/*
 * 018/T013 — jsdom capability gaps.
 *
 * The ported components sit on Radix, embla, vaul, recharts and react-resizable-panels,
 * all of which reach for browser APIs that jsdom does not implement. Without these a
 * component does not render wrong, it throws on mount — so this is the difference between
 * a smoke test that covers 49 components and one that covers about thirty.
 *
 * These are environment shims, not behaviour. Each is the minimum that lets a component
 * mount; none of them simulates layout, and no test should assert against them. Anything
 * that genuinely depends on measured geometry belongs in `tests/e2e/`, where there is a
 * real engine underneath.
 *
 * Everything below is defined only when absent, so a future jsdom that ships the real
 * thing takes precedence automatically.
 */
if (!('ResizeObserver' in globalThis)) {
  // Radix popper, embla, recharts and the resizable panels all observe their container.
  globalThis.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  } as unknown as typeof ResizeObserver;
}

if (!('IntersectionObserver' in globalThis)) {
  globalThis.IntersectionObserver = class {
    readonly root = null;
    readonly rootMargin = '';
    readonly thresholds: readonly number[] = [];
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
  } as unknown as typeof IntersectionObserver;
}

if (typeof window !== 'undefined' && !window.matchMedia) {
  // `use-mobile`, `sidebar` and `drawer` all branch on viewport width. Reports desktop:
  // a component that only renders its mobile arm would otherwise silently go untested.
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

if (typeof Element !== 'undefined') {
  // Radix Select and Command scroll the active item into view on mount.
  Element.prototype.scrollIntoView ??= function scrollIntoView(): void {};

  // Radix Select's trigger checks pointer capture before opening.
  Element.prototype.hasPointerCapture ??= function hasPointerCapture(): boolean {
    return false;
  };
  Element.prototype.setPointerCapture ??= function setPointerCapture(): void {};
  Element.prototype.releasePointerCapture ??= function releasePointerCapture(): void {};
}

afterEach(() => {
  cleanup();
});
