# WhatsApp templates (English only)

Every parent message is sent from the business number **+91 63840 09225** through the WhatsApp API, using templates
approved in WhatsApp Manager (business "Man 2 Web Technologies", WhatsApp account "M2W TECHNOLOGIES PRIVATE LIMITED",
id 1089177487366367). The app never opens WhatsApp on the tutor's phone to send these.

All parent templates are **Utility**, **English**, and have **exactly 3 variables**, never at the start or the end.

| Message type (app) | Template name | `{{1}}` | `{{2}}` | `{{3}}` | Status (11 Oct 2026) |
| --- | --- | --- | --- | --- | --- |
| `absent` | `chalkpis_absent` | student | `Maths 10 class on 9 Oct 2026` | institute | approved |
| `late` | `tutordesk_late` | student | `Maths 10 class on 9 Oct 2026` | institute | approved |
| `fee_due` | `tutordesk_fee_due` | student | `₹1,500 for Oct 2026, due on 10 Oct 2026` | institute | approved |
| `fee_overdue` | `tutordesk_fee_overdue` | student | `₹1,500 for Oct 2026, pending since Oct 2026` | institute | approved |
| `payment_received` | `tutordesk_payment_received` | student | `₹500 (receipt TD-00001, balance due ₹1,000)` | institute | approved |
| `fee_reminder` | `chalkpis_fee_reminder` (**image header**: the UPI QR) | student | `₹1,500 for Oct 2026` | institute | in review |
| `fee_link` | `chalkpis_fee_link` | student | `₹1,500 for Oct 2026` | the tutor's payment link | approved |
| `parent_link` | `chalkpis_parent_link` | student | the private parent page link | institute | approved |
| login code | `tutor_desk` (Authentication) | the code | | | approved |

`tutordesk_absent` (5 variables) is **not used**: the app sends 3 values, so it would always fail. Use `chalkpis_absent`.

## Texts

- **chalkpis_absent**: Dear Parent, {{1}} was marked ABSENT for {{2}}. Please contact us if this is a mistake. Regards, {{3}}. Thank you.
- **tutordesk_late**: Dear Parent, {{1}} came LATE to the {{2}}. We are sharing this so you are aware. Regards, {{3}}. Thank you.
- **tutordesk_fee_due**: Dear Parent, this is a gentle reminder about the fee for {{1}}: {{2}}. Please pay on time. Regards, {{3}}. Thank you.
- **tutordesk_fee_overdue**: Dear Parent, the fee for {{1}} is still pending: {{2}}. Please pay at your earliest convenience. Regards, {{3}}. Thank you.
- **tutordesk_payment_received**: Dear Parent, the fee payment for {{1}} has been recorded: {{2}}. Regards, {{3}}. Thank you.
- **chalkpis_fee_reminder** (header: image): Dear Parent, the fee for {{1}} is pending: {{2}}. Scan the QR code above with any UPI app (Google Pay, PhonePe, Paytm) to pay {{3}} directly. Please ignore this message if you have already paid. Thank you.
- **chalkpis_fee_link**: Dear Parent, the fee for {{1}} is pending: {{2}}. You can pay online here: {{3}} Please ignore this message if you have already paid. Thank you.
- **chalkpis_parent_link**: Dear Parent, you can now see the attendance and fee details of {{1}} at any time on this private page: {{2}} This link is only for your family, so please do not share it. Regards, {{3}}. Thank you.

The fee-reminder picture is a UPI QR for the exact amount, drawn by the server at
`<PUBLIC_BASE_URL>/pay-qr.png?d=…&s=…`. The link is signed, so the server only draws codes it handed out.

## The `WA_TEMPLATES` setting

**Sending through Meta directly** (`WA_CLOUD_PHONE_NUMBER_ID` and `WA_CLOUD_TOKEN` set): use the template **names**.

```
{"absent":{"en":"chalkpis_absent"},"late":{"en":"tutordesk_late"},"fee_due":{"en":"tutordesk_fee_due"},"fee_overdue":{"en":"tutordesk_fee_overdue"},"payment_received":{"en":"tutordesk_payment_received"},"fee_reminder":{"en":"chalkpis_fee_reminder"},"fee_link":{"en":"chalkpis_fee_link"},"parent_link":{"en":"chalkpis_parent_link"}}
```

and `WA_TEMPLATE_OTP=tutor_desk`.

**Sending through ValueFirst** (the gateway, `WA_CLIENT_ID`/`WA_CLIENT_PASSWORD`): ValueFirst gives each approved
template its own number (e.g. 1809862). Ask ValueFirst for the numbers of the four new `chalkpis_*` templates and put
those numbers in place of the names. Ask them too how an **image header** is passed (the server puts the picture link
in `mediadata`), because the QR reminder needs it.
