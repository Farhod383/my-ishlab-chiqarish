import { describe, expect, it } from 'vitest';
import { canEditBarcode, validManualBarcode } from './manualBarcode';

describe('explicit barcode editing', () => {
  it('allows warehouse', () => expect(canEditBarcode(['warehouse'])).toBe(true));
  it('allows admin', () => expect(canEditBarcode(['admin'])).toBe(true));
  it('does not widen accountant rights', () => expect(canEditBarcode(['accountant'])).toBe(false));
  it('does not widen worker rights', () => expect(canEditBarcode(['worker'])).toBe(false));
  it('accepts manufacturer codes with leading zeros', () => expect(validManualBarcode('001234567890')).toBe(true));
  it('permits blank for automatic generation only', () => {
    expect(validManualBarcode('', true)).toBe(true);
    expect(validManualBarcode('')).toBe(false);
  });
  it('rejects non-Code128 and control characters', () => {
    expect(validManualBarcode('ШТРИХ')).toBe(false);
    expect(validManualBarcode('12\n34')).toBe(false);
  });
});