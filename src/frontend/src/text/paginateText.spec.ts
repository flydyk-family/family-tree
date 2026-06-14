import { describe, it, expect } from 'vitest';
import { paginate } from './paginateText';

describe('paginate', () => {
  it('returns a single page when everything fits', () => {
    expect(paginate(5, () => true)).toEqual([{ start: 0, end: 5 }]);
  });

  it('returns no pages for an empty token list', () => {
    expect(paginate(0, () => true)).toEqual([]);
  });

  it('breaks greedily at the largest fitting prefix (capacity 3)', () => {
    const fits = (start: number, end: number) => end - start <= 3;
    expect(paginate(7, fits)).toEqual([
      { start: 0, end: 3 },
      { start: 3, end: 6 },
      { start: 6, end: 7 }
    ]);
  });

  it('always advances by at least one token when a single token overflows', () => {
    const fits = (start: number, end: number) => end - start <= 1;
    expect(paginate(3, fits)).toEqual([
      { start: 0, end: 1 },
      { start: 1, end: 2 },
      { start: 2, end: 3 }
    ]);
  });

  it('respects an exact-fit boundary', () => {
    const fits = (start: number, end: number) => end - start <= 4;
    expect(paginate(4, fits)).toEqual([{ start: 0, end: 4 }]);
  });
});
