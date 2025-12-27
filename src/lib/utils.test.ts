import { describe, it, expect } from 'vitest';
import { trunc_n } from './utils';

describe('trunc_n', () => {
  it('handles small integer with padding: trunc_n(1, 4) -> 1.00', () => {
    expect(trunc_n(1, 4)).toBe('1.00');
  });

  it('handles decimal truncation: trunc_n(1.2345, 4) -> 1.23', () => {
    expect(trunc_n(1.2345, 4)).toBe('1.23');
  });

  it('handles large numbers with suffix: trunc_n(12345, 4) -> 12k', () => {
    // 12345 -> 12.345 k. 
    // n=4. suffix k (1). width=3. 
    // 12 take 2. remaining 1. -1 for dot = 0.
    // so no decimals. "12k"
    expect(trunc_n(12345, 4)).toBe('12k');
  });

  it('handles rounding edge case: trunc_n(9.99, 3) -> 10', () => {
    // 9.99 -> 10. n=3.
    // 9.99 -> 9.99. int="9". suffix="". width=3.
    // decimalsSpace = 3 - 1 - 1 = 1.
    // toFixed(1) -> "10.0". Length 4 > 3.
    // Fallback to toFixed(0) -> "10". Length 2 <= 3. OK.
    expect(trunc_n(9.99, 3)).toBe('10');
  });

  it('handles negative numbers: trunc_n(-1, 4) -> -1.0', () => {
      // -1. n=4. sign "-". width=3.
      // -1 -> 1. int="1". suffix="". width=3.
      // decimalsSpace = 3 - 1 - 1 = 1.
      // toFixed(1) -> "1.0".
      // out = "-" + "1.0" + "" = "-1.0". Length 4.
      expect(trunc_n(-1, 4)).toBe('-1.0');
  });
  
  it('handles tight constraints: trunc_n(12345, 3) -> 12k', () => {
      // 12345 -> 12.345 k. n=3.
      // suffix k. width=2.
      // int="12". len 2. width 2.
      // decimalsSpace = 2 - 2 - 1 = -1.
      // formattedDigits = toFixed(0) -> "12".
      // out = "12k". Length 3.
      expect(trunc_n(12345, 3)).toBe('12k');
  });

   it('handles very tight constraints: trunc_n(12345, 2) -> 12k trimmed', () => {
       // 12345 -> 12.345 k. n=2.
       // suffix k. width=1.
       // int="12". len 2 > width 1.
       // Math.round(12.345) -> "12".
       // "12" > width 1.
       // slice(0, 1) -> "1".
       // out = "1" + "k" = "1k".
       expect(trunc_n(12345, 2)).toBe('1k');
   });
});
