import { describe, it, expect } from 'vitest';

describe('test harness', () => {
  it('has localStorage', () => {
    localStorage.setItem('a', '1');
    expect(localStorage.getItem('a')).toBe('1');
  });
  it('has web crypto', () => {
    expect(typeof globalThis.crypto?.subtle?.sign).toBe('function');
  });
});
