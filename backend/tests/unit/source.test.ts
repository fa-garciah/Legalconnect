/**
 * Unit coverage for buildSource's pure helpers — nothing exercising them before
 * this went beyond the loopback default every HTTP test happens to run under, so
 * `coarseOrigin`'s private/public branches and `clientClass`'s cli/sdk/other
 * branches had never actually run.
 */
import { describe, expect, it } from 'vitest';
import { buildSource, clientClass, coarseOrigin, toChannel } from '../../src/common/audit/source';

describe('toChannel', () => {
  it('defaults to interactive', () => {
    expect(toChannel(undefined)).toBe('interactive');
  });

  it('is automated only for an explicit marker', () => {
    expect(toChannel('automated')).toBe('automated');
    expect(toChannel('something-else')).toBe('interactive');
  });
});

describe('coarseOrigin', () => {
  it('returns undefined for no ip', () => {
    expect(coarseOrigin(undefined)).toBeUndefined();
  });

  it.each(['127.0.0.1', '::1', '::ffff:127.0.0.1'])('classes %s as loopback', (ip) => {
    expect(coarseOrigin(ip)).toBe('loopback');
  });

  it.each(['10.0.0.5', '192.168.1.5', '172.16.0.5', '172.31.255.255'])(
    'classes %s as private',
    (ip) => {
      expect(coarseOrigin(ip)).toBe('private');
    },
  );

  it.each(['203.0.113.5', '8.8.8.8'])('classes %s as public', (ip) => {
    expect(coarseOrigin(ip)).toBe('public');
  });
});

describe('clientClass', () => {
  it('is unknown with no user agent', () => {
    expect(clientClass(undefined)).toBe('unknown');
  });

  it('recognises a browser as web', () => {
    expect(clientClass('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120')).toBe('web');
  });

  it('recognises common CLI tools', () => {
    expect(clientClass('curl/8.4.0')).toBe('cli');
    expect(clientClass('Wget/1.21')).toBe('cli');
  });

  it('recognises common SDK/runtime user agents', () => {
    expect(clientClass('node-fetch/1.0')).toBe('sdk');
    expect(clientClass('python-requests/2.31.0')).toBe('sdk');
  });

  it('falls back to other for anything unrecognised', () => {
    expect(clientClass('SomeInternalBot/1.0')).toBe('other');
  });
});

describe('buildSource', () => {
  it('combines channel, client class and coarse origin', () => {
    expect(buildSource({ channel: 'automated', userAgent: 'curl/8.4.0', ip: '10.0.0.1' })).toEqual({
      channel: 'automated',
      clientClass: 'cli',
      networkOrigin: 'private',
    });
  });
});
