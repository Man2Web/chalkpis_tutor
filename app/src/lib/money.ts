/** Money is stored as integer paise. */
export const rupeesToPaise = (rupees: number) => Math.round(rupees * 100);
export const paiseToRupees = (paise: number) => paise / 100;

/** ₹1,23,456 (Indian digit grouping); decimals only when paise are non-zero. */
export function formatINR(paise: number): string {
  const rupees = paise / 100;
  const hasPaise = Math.abs(paise) % 100 !== 0;
  const body = new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: hasPaise ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(Math.abs(rupees));
  return `${paise < 0 ? '-' : ''}₹${body}`;
}

/** Parses user input like "1,500" or "1500.50" into paise; null if not a valid non-negative amount. */
export function parseRupeesToPaise(input: string): number | null {
  const clean = input.replace(/[,\s₹]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  return rupeesToPaise(Number(clean));
}
