# WhatsApp templates to create

Create these **5 templates** (category **Utility**) in your WhatsApp provider's template manager, in **English** and, if you want Hindi messages, in **Hindi** too. When a template is approved, send me its **template id** (the number your provider shows) for each row below.

## Why only 3 variables

WhatsApp (Meta) often rejects templates that have many `{{ }}` variables compared with the amount of text. So every message here has **exactly 3 variables**, never starts or ends with one, and never puts two next to each other. The details (class and date, amount and month, receipt and balance) are folded into the third variable, which the app builds for you.

Placeholders are always, in this order (and in every template they appear in the text left to right as 1, 2, 3, because template editors number them by position, so you never need to reorder anything):

| Variable | Meaning                       |
| -------- | ----------------------------- |
| `{{1}}`  | student name                  |
| `{{2}}`  | what happened (see the table) |
| `{{3}}`  | institute name                |

| Message            | When it is sent               | `{{2}}` looks like                              |
| ------------------ | ----------------------------- | ----------------------------------------------- |
| `absent`           | a student is marked Absent    | `Maths 10 class on 8 Oct 2026`                  |
| `late`             | a student is marked Late      | `Maths 10 class on 8 Oct 2026`                  |
| `fee_due`          | a few days before the due day | `₹1,000 for Oct 2026, due on 10 Oct 2026`       |
| `fee_overdue`      | the fee is past its due date  | `₹1,000 for Oct 2026, pending since 1 Oct 2026` |
| `payment_received` | you record a payment          | `₹400 (receipt TD-00001, balance due ₹600)`     |

When you submit each template, WhatsApp asks for an **example value** for each variable. Use the examples in the table (and for `{{1}}` something like `Asha Rao`, for `{{3}}` something like `Alpha Academy`). Real examples help approval.

## English text

**absent**

> Dear Parent, {{1}} was marked ABSENT in the {{2}}. If this is a mistake, please contact {{3}}. Thank you.

**late**

> Dear Parent, {{1}} came LATE to the {{2}}. We are sharing this so you are aware. Regards, {{3}}. Thank you.

**fee_due**

> Dear Parent, this is a gentle reminder about the fee for {{1}}: {{2}}. Please pay on time. Regards, {{3}}. Thank you.

**fee_overdue**

> Dear Parent, the fee for {{1}} is still pending: {{2}}. Please pay at your earliest convenience. Regards, {{3}}. Thank you.

**payment_received**

> Dear Parent, the fee payment for {{1}} has been recorded: {{2}}. Regards, {{3}}. Thank you.

## Hindi text (optional)

**absent**

> प्रिय अभिभावक, {{1}} को {{2}} में अनुपस्थित दर्ज किया गया। यदि यह गलती है तो कृपया {{3}} से संपर्क करें। धन्यवाद।

**late**

> प्रिय अभिभावक, {{1}} कक्षा में देर से पहुँचा/पहुँची: {{2}}। आपकी जानकारी के लिए यह संदेश भेजा गया है। सादर, {{3}}। धन्यवाद।

**fee_due**

> प्रिय अभिभावक, {{1}} की फीस के बारे में एक विनम्र स्मरण: {{2}}। कृपया समय पर भुगतान करें। सादर, {{3}}। धन्यवाद।

**fee_overdue**

> प्रिय अभिभावक, {{1}} की फीस अभी बाकी है: {{2}}। कृपया जल्द भुगतान करें। सादर, {{3}}। धन्यवाद।

**payment_received**

> प्रिय अभिभावक, {{1}} की फीस का भुगतान दर्ज किया गया: {{2}}। सादर, {{3}}। धन्यवाद।

(In the Hindi texts the app still fills `{{2}}` with English-style details, for example `Maths 10 class on 8 Oct 2026`; the date is written in the language you choose in Settings.)

## How you give me the ids

Send them in this shape (leave a language out if you did not create it; English is used when a Hindi id is missing):

```
absent:           en = ______   hi = ______
late:             en = ______   hi = ______
fee_due:          en = ______   hi = ______
fee_overdue:      en = ______   hi = ______
payment_received: en = ______   hi = ______
```

They are configuration, not secrets. They go into one setting called `WA_TEMPLATES` (see `server/.env.example`).

## If WhatsApp still rejects one

Tell me the rejection reason. The usual fixes, which I can apply without changing anything else:

- **"Too many variables for the text"**: I can drop to 2 variables (student and details) and put the institute name into the fixed text.
- **"Marketing content"**: remove words like "gentle reminder" or "please pay on time" from `fee_due` / `fee_overdue` and keep only the facts.
- **Variable at the start or end**: the texts above already avoid it.

## Notes

- WhatsApp only allows a business to start a conversation with an approved template, which is why the wording is fixed and only the `{{ }}` values change.
- The app sends **only to parents whose "Send updates to parent" switch is on**, and only if you turned that message type on in Settings.
- The login-code message uses its own authentication template (id `1809804`) and is not part of this list.
