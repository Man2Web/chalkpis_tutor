import { forwardRef } from 'react';
import Svg, { Path, Rect } from 'react-native-svg';
import { qrMatrix } from '../lib/upi';

const QUIET = 2; // light border around the code, in squares

/** A scannable QR code for any text (here a UPI payment link). `ref.toDataURL` gives the PNG bytes in base64 on a phone. */
export const UpiQr = forwardRef<Svg, { value: string; size?: number }>(function UpiQr(
  { value, size = 220 },
  ref,
) {
  const m = qrMatrix(value);
  const n = m.length + QUIET * 2;
  let d = '';
  m.forEach((row, y) =>
    row.forEach((on, x) => {
      if (on) d += `M${x + QUIET} ${y + QUIET}h1v1h-1z`;
    }),
  );
  return (
    <Svg
      ref={ref}
      width={size}
      height={size}
      viewBox={`0 0 ${n} ${n}`}
      accessibilityLabel="UPI QR code"
    >
      <Rect width={n} height={n} fill="#FFFFFF" />
      <Path d={d} fill="#000000" />
    </Svg>
  );
});
