import { describe, expect, it } from 'vitest';
import { employeeBadgeCode } from './employeeBadgeAccess';

describe('employee badge edits', () => {
  it('retains MCT identity and normalizes scanner input', () => {
    expect(employeeBadgeCode('  ьсе00101\r\n')).toBe('MCT00101');
  });
  it('rejects a product code to keep employee scans distinct', () => {
    expect(() => employeeBadgeCode('ERP000000123')).toThrow();
  });
  it('rejects an empty badge rather than creating a new one', () => {
    expect(() => employeeBadgeCode('')).toThrow();
  });
});