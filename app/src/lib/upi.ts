import QRCode from 'qrcode';

const UPI_ID = /^[a-z0-9._-]{2,50}@[a-z][a-z0-9]{1,30}$/;

/** A valid UPI id (name@bank) in lower case, '' when the input is blank, or null when it is not valid. */
export function cleanUpi(input: string): string | '' | null {
  const v = input.trim().toLowerCase();
  if (v === '') return '';
  return UPI_ID.test(v) ? v : null;
}

export interface UpiPayment {
  upiId: string;
  payeeName: string;
  amountPaise?: number;
  note?: string;
}

/** The standard UPI payment link that every UPI app reads from a QR code. */
export function upiLink(p: UpiPayment): string {
  const q: string[] = [
    `pa=${encodeURIComponent(p.upiId)}`,
    `pn=${encodeURIComponent(p.payeeName.slice(0, 40))}`,
  ];
  if (p.amountPaise && p.amountPaise > 0) q.push(`am=${(p.amountPaise / 100).toFixed(2)}`);
  q.push('cu=INR');
  if (p.note) q.push(`tn=${encodeURIComponent(p.note.slice(0, 50))}`);
  return `upi://pay?${q.join('&')}`;
}

/** The QR as rows of dark/light squares, drawn by the screen with react-native-svg. */
export function qrMatrix(text: string): boolean[][] {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const rows: boolean[][] = [];
  for (let y = 0; y < modules.size; y++) {
    const row: boolean[] = [];
    for (let x = 0; x < modules.size; x++) row.push(!!modules.get(y, x));
    rows.push(row);
  }
  return rows;
}
