import { describe, expect, it } from 'vitest';
import { formatTime } from './formatTime';

describe('formatTime', () => {
  it('formats zero', () => {
    expect(formatTime(0)).toBe('0:00');
  });

  it('pads seconds to two digits', () => {
    expect(formatTime(5)).toBe('0:05');
    expect(formatTime(65)).toBe('1:05');
  });

  it('floors fractional seconds', () => {
    expect(formatTime(59.99)).toBe('0:59');
  });

  it('does not wrap minutes into hours', () => {
    expect(formatTime(75 * 60 + 3)).toBe('75:03');
  });

  it('returns 0:00 for negative or non-finite input', () => {
    expect(formatTime(-1)).toBe('0:00');
    expect(formatTime(Number.NaN)).toBe('0:00');
    expect(formatTime(Number.POSITIVE_INFINITY)).toBe('0:00');
  });
});
