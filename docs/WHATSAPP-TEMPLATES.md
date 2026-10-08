# WhatsApp templates to create

Create these **5 templates** (category **Utility**) in your WhatsApp provider's template manager, in **English** and, if you want Hindi messages, in **Hindi** too. Keep the `{{1}}`, `{{2}}`… placeholders exactly as written: the app fills them in this order. When a template is approved, send me its **template id** (the number your provider shows) for each row below.

Placeholders are always the same per message type:

| Message            | When it is sent               | `{{1}}`     | `{{2}}`   | `{{3}}` | `{{4}}` | `{{5}}`     | `{{6}}`       |
| ------------------ | ----------------------------- | ----------- | --------- | ------- | ------- | ----------- | ------------- |
| `absent`           | a student is marked Absent    | parent name | institute | student | batch   | date        | –             |
| `late`             | a student is marked Late      | parent name | institute | student | batch   | date        | –             |
| `fee_due`          | a few days before the due day | parent name | institute | student | amount  | month       | due date      |
| `fee_overdue`      | the fee is past its due date  | parent name | institute | student | amount  | month       | pending since |
| `payment_received` | you record a payment          | parent name | institute | student | amount  | receipt no. | balance due   |

## English text

**absent**

> Dear {{1}}, {{3}} was marked ABSENT in the {{4}} class at {{2}} on {{5}}. Please contact us if this is a mistake.

**late**

> Dear {{1}}, {{3}} came LATE to the {{4}} class at {{2}} on {{5}}.

**fee_due**

> Dear {{1}}, {{3}}'s fee of {{4}} for {{5}} at {{2}} is due on {{6}}. Please pay on time. Thank you.

**fee_overdue**

> Dear {{1}}, {{3}}'s fee of {{4}} for {{5}} at {{2}} has been pending since {{6}}. Please pay at your earliest convenience. Thank you.

**payment_received**

> Dear {{1}}, we have received {{4}} towards {{3}}'s fee at {{2}}. Receipt no. {{5}}. Balance due: {{6}}. Thank you.

## Hindi text (optional)

**absent**

> प्रिय {{1}}, {{3}} {{5}} को {{2}} की {{4}} कक्षा में अनुपस्थित रहा/रही। यदि यह गलती है तो कृपया हमसे संपर्क करें।

**late**

> प्रिय {{1}}, {{3}} {{5}} को {{2}} की {{4}} कक्षा में देर से पहुँचा/पहुँची।

**fee_due**

> प्रिय {{1}}, {{2}} में {{3}} की {{5}} की फीस {{4}} {{6}} तक देय है। कृपया समय पर भुगतान करें। धन्यवाद।

**fee_overdue**

> प्रिय {{1}}, {{2}} में {{3}} की {{5}} की फीस {{4}} {{6}} से बाकी है। कृपया जल्द भुगतान करें। धन्यवाद।

**payment_received**

> प्रिय {{1}}, {{2}} में {{3}} की फीस के लिए {{4}} प्राप्त हुए। रसीद संख्या {{5}}। बाकी राशि: {{6}}। धन्यवाद।

## How you give me the ids

Send them in this shape (leave a language out if you did not create it):

```
absent:           en = ______   hi = ______
late:             en = ______   hi = ______
fee_due:          en = ______   hi = ______
fee_overdue:      en = ______   hi = ______
payment_received: en = ______   hi = ______
```

They are configuration, not secrets. They go into one setting called `WA_TEMPLATES` (see `docs/SETUP.md`, section 6).

## Notes

- WhatsApp only allows a business to start a conversation with an approved template, which is why the wording is fixed and only the `{{ }}` values change.
- The app sends **only to parents whose "Send updates to parent" switch is on**, and only if you turned that message type on in Settings.
- Templates must not contain promotional wording, or they may be rejected as Marketing instead of Utility.
