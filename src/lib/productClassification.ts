/** Historical products keep their ID after their stock moves to Instruments. */
export function isWarehouseProduct(product: { instrument_id?: string | null }): boolean {
  return !product.instrument_id;
}