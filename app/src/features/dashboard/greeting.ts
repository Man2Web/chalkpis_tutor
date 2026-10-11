/** Good morning / afternoon / evening, by the time in India. */
export function greetingKey(now: Date = new Date()): 'morning' | 'afternoon' | 'evening' {
  const h = Number(
    new Intl.DateTimeFormat('en-GB', {
      hour: 'numeric',
      hour12: false,
      timeZone: 'Asia/Kolkata',
    }).format(now),
  );
  return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
}
