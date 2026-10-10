# Chalkpis Tutor v2: match TuitionPilot

Goal: close the gap with https://tuitionpilot.in (explored 2026-10-10) while keeping what v1 already does better (staff role, parent page, queued messages, tenant isolation).

## Gap list

| #   | Feature                                                                                                    | v1 today                                    | Size   |
| --- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ------ |
| 1   | UPI QR code on fee reminders (teacher's own UPI id; parents pay the teacher directly)                      | none                                        | small  |
| 2   | "Paid" tap on a reminder sends the receipt automatically                                                   | payments + receipts exist, not linked       | small  |
| 3   | Excel/CSV download of fee reports                                                                          | CSV/PDF in old design; check server version | small  |
| 4   | SMS fallback per parent (teacher picks the channel)                                                        | wired in code, no provider                  | medium |
| 5   | Import from Excel, Google Sheets, CSV, Notion                                                              | CSV + contacts                              | small  |
| 6   | Plans: Free (10 students, 50 msgs/month), Plus (20), Pro (50), custom; message cap; limits enforced        | one plan + trial; payment switched off      | medium |
| 7   | AI Assistant: question papers, homework, worksheets, parent progress notes (CBSE/ICSE/State Board)         | none                                        | large  |
| 8   | Paper Checking (Plus+): photo of answer sheet, suggested mark per answer, teacher edits                    | none                                        | large  |
| 9   | Google / email login                                                                                       | WhatsApp code only                          | medium |
| 10  | iPhone app + Apple In-App Purchase                                                                         | Android only                                | large  |
| 11  | Public website: pricing, about, legal pages, SEO pages (fee reminder templates, receipt format, and so on) | none                                        | medium |

## Suggested order

1. **v2.0 quick wins:** 1, 2, 3, 5. Small server and app changes, visible to teachers at once.
2. **v2.1 messaging and plans:** 4, 6. Needs an SMS provider and the message counter.
3. **v2.2 AI:** 7, then 8. Needs an AI provider, a cost model and per-plan limits.
4. **v2.3 reach:** 9, 11, then 10.

## Decisions needed from the owner

- **UPI:** one UPI id per institute, stored in settings. The QR is generated from a `upi://pay?pa=...&pn=...&am=...` link. Reminder images must be sent as a WhatsApp template with an image header (needs a new approved template).
- **SMS provider:** which one (MSG91, Fast2SMS...)? India needs DLT-registered templates.
- **Pricing:** copy TuitionPilot (Free 0 / Plus 299 / Pro 499) or choose different prices and limits? Payment is switched off today (decision 90).
- **AI provider and budget:** the Claude API (see model ids in the repo notes) for papers and notes; vision for paper checking. Monthly cost per teacher must stay under the plan price.
- **Login:** keep the WhatsApp code, or add Google and email as well?
- **iPhone:** in or out of v2? Apple's In-App Purchase rules affect the plan design.

## Rules for v2 work

- Same engineering rules as v1: every row belongs to an institute, money is integer paise, messages are queued in the same transaction as the event, tests for every business rule.
- Each shipped feature gets a numbered entry in `docs/DECISIONS.md` and a line in `docs/TASKS.md`.
