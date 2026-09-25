/**
 * T013 — the grid/list toggle survives a hostile browser. 023/FR-011, Decision 8.
 *
 * `localStorage` is not a reliable store and pretending otherwise is how a preference
 * becomes a crash: in a private window, with site data blocked, or during a prerender, the
 * accessor itself THROWS rather than returning null. A view toggle is not worth a broken
 * page, so every read and write is wrapped and every failure resolves to the default.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { VIEW_MODE_STORAGE_KEY, readViewMode, writeViewMode } from '../../src/documents/view-mode';

function withStorage(impl: Partial<Storage>): void {
  vi.stubGlobal('localStorage', impl as Storage);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('readViewMode', () => {
  it('defaults to grid when nothing is stored', () => {
    withStorage({ getItem: () => null });
    expect(readViewMode()).toBe('grid');
  });

  it('returns a stored, valid mode', () => {
    withStorage({ getItem: () => 'list' });
    expect(readViewMode()).toBe('list');
    withStorage({ getItem: () => 'grid' });
    expect(readViewMode()).toBe('grid');
  });

  it('ignores a stored value that is not a mode', () => {
    withStorage({ getItem: () => 'carousel' });
    expect(readViewMode()).toBe('grid');
  });

  it('survives a getItem that throws (private window, blocked site data)', () => {
    withStorage({
      getItem: () => {
        throw new DOMException('denied');
      },
    });
    expect(() => readViewMode()).not.toThrow();
    expect(readViewMode()).toBe('grid');
  });

  it('survives localStorage being absent entirely (server render)', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(readViewMode()).toBe('grid');
  });
});

describe('writeViewMode', () => {
  it('stores the mode under the documented key', () => {
    const setItem = vi.fn();
    withStorage({ setItem });
    writeViewMode('list');
    expect(setItem).toHaveBeenCalledWith(VIEW_MODE_STORAGE_KEY, 'list');
  });

  it('never throws when setItem does (quota, private window)', () => {
    withStorage({
      setItem: () => {
        throw new DOMException('quota');
      },
    });
    expect(() => writeViewMode('grid')).not.toThrow();
  });

  it('never throws when localStorage is absent', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(() => writeViewMode('grid')).not.toThrow();
  });
});

describe('the key', () => {
  it('is namespaced, so it cannot collide with another screen\'s preference', () => {
    expect(VIEW_MODE_STORAGE_KEY).toContain('documentos');
  });
});
