/**
 * T013 — how a figure reaches the screen. 015/FR-008, FR-010, Decision 8.
 *
 * EVERY ASSERTION HERE IS ABOUT NOT LYING. A dashboard's failure mode is not a crash, it is a
 * plausible wrong number — so the formatter's job is to render "no data" as absence rather than
 * as zero, and to render a missing delta as nothing rather than as a confident arrow.
 */
import { describe, expect, it } from 'vitest';
import { formatMonths, formatPercent, formatCount, formatDelta, formatSample } from '../../src/kpi/format';

describe('formatMonths', () => {
  it('renders one decimal and a unit', () => {
    expect(formatMonths(8.3)).toBe('8.3 m');
    expect(formatMonths(0.04)).toBe('0.0 m');
  });

  it('renders NO DATA as "Sin datos", never as zero', () => {
    // The single most misleading thing this screen could say: a matter resolved in no time.
    expect(formatMonths(null)).toBe('Sin datos');
  });
});

describe('formatPercent', () => {
  it('renders a proportion with no decimals', () => {
    expect(formatPercent(0.87)).toBe('87 %');
    expect(formatPercent(1)).toBe('100 %');
    expect(formatPercent(0)).toBe('0 %');
  });

  it('renders an absent rate as "Sin datos"', () => {
    expect(formatPercent(null)).toBe('Sin datos');
  });
});

describe('formatCount', () => {
  it('renders a whole number', () => {
    expect(formatCount(127)).toBe('127');
    expect(formatCount(0)).toBe('0');
  });

  it('distinguishes "none" from "unknown"', () => {
    // A count of zero IS data — a firm with no active matters. Null is the absence of an answer.
    expect(formatCount(null)).toBe('Sin datos');
  });
});

describe('formatDelta', () => {
  it('signs a positive change', () => {
    expect(formatDelta(0.99, 'months')).toBe('+1.0 m');
    expect(formatDelta(5, 'count')).toBe('+5');
  });

  it('signs a negative change with a real minus sign, not a hyphen', () => {
    expect(formatDelta(-0.5, 'months')).toBe('−0.5 m');
    expect(formatDelta(-0.12, 'percent')).toBe('−12 pp');
  });

  it('renders a percentage-point change as points, not as a percentage', () => {
    // "the success rate rose 12%" is ambiguous between points and proportion; "pp" is not.
    expect(formatDelta(0.12, 'percent')).toBe('+12 pp');
  });

  it('renders NOTHING when there is no comparison', () => {
    // FR-010: no delta against nothing. An empty string so the caller renders no element.
    expect(formatDelta(null, 'months')).toBe('');
    expect(formatDelta(null, 'percent')).toBe('');
    expect(formatDelta(null, 'count')).toBe('');
  });

  it('renders an exact zero as a change of zero, not as absence', () => {
    expect(formatDelta(0, 'count')).toBe('0');
  });
});

describe('formatSample', () => {
  it('names how many the figure came from (Decision 8)', () => {
    expect(formatSample(7)).toBe('7 asuntos');
    expect(formatSample(1)).toBe('1 asunto');
  });

  it('says so plainly when there are none', () => {
    expect(formatSample(0)).toBe('Sin asuntos en el periodo');
  });
});
