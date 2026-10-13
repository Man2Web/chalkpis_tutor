# WhatsApp templates (English only)

Every message is sent from the business number **+91 63840 09225** (WhatsApp account "M2W TECHNOLOGIES PRIVATE
LIMITED", id 1089177487366367) through the **wa.adsme.in** gateway (ValueFirst "unified v2" API). Templates are made and
reviewed in wa.adsme.in > WhatsApp > Templates; each approved template gets a number there (the **Template Id**), and
that number is what the server sends. The app never opens WhatsApp on the teacher's phone to send these.

The set below replaced every older template on 12 Oct 2026 (only the login-code template `tutor_desk` was kept).

## How the texts are written

- **For every kind of class.** No "tuition" or "tutor": the same words work for a karate class, a yoga studio or a
  coaching institute. The class detail comes from the batch ("Kids Beginners class on 12 Oct 2026").
- **"Hello", not "Dear Parent".** Yoga and sports students are often adults who get the messages themselves.
- **Replies do not reach the teacher.** They land in the Chalkpis inbox, so parent messages say "please contact
  {{3}} directly" and carry the footer "Sent via Chalkpis on behalf of your centre". Messages to owners point to
  hello@chalkpis.com.
- **Utility, three variables, never first or last.** Each text keeps the order the server sends: `{{1}}` student,
  `{{2}}` the details, `{{3}}` the centre (see `varsFor` in `server/src/messaging/templates.ts`). Editors number variables
  by position, so they appear left to right as 1, 2, 3.

## To parents and students (sent by the centre)

| App message type | Template | Id | `{{1}}` | `{{2}}` | `{{3}}` | Sent when |
| --- | --- | --- | --- | --- | --- | --- |
| `absent` | `cp_absent_alert` | 1815393 | student | `Kids Beginners class on 12 Oct 2026` | centre | marked absent (today or the last 2 days) |
| `late` | `cp_late_alert` | 1815389 | student | same as absent | centre | marked late |
| `fee_due` | `cp_fee_due_soon` | 1815388 | student | `₹1,500 for Oct 2026, due on 15 Oct 2026` | centre | N days before the due date |
| `fee_overdue` | `cp_fee_overdue` | 1815387 | student | `₹1,500 for Oct 2026, pending since Oct 2026` | centre | day 1, then every N days |
| `payment_received` | `cp_payment_receipt_nf` (no footer; `cp_payment_receipt` 1815390 is the original) | 1815826 | student | `₹1,500 (receipt KKA-00012, balance due ₹0)` | centre | a payment is recorded |
| `fee_reminder` | `cp_fee_qr` (**image header**: the UPI QR) | 1815399 | student | `₹1,500 for Oct 2026` | centre | the teacher taps Send reminder (UPI) |
| `fee_link` | `cp_fee_link` | 1815392 | student | `₹1,500 for Oct 2026` | the centre's payment link | the teacher taps Send reminder (link) |
| `parent_link` | `cp_parent_page` | 1815395 | student | the private parent page link | centre | the teacher shares the parent page |
| `student_welcome` | `cp_student_welcome` | 1815398 | student | `Kids Beginners (Mon, Wed, Fri 5:00 PM)` | centre | a student is added one at a time (never an import) |
| `class_cancelled` | `cp_class_cancelled` | 1815394 | student | `Kids Beginners class on 14 Oct 2026` | centre | today is marked holiday or cancelled for a batch |

The two newest have their own switches in Messages ("A new student is added (welcome)", "Today's class is marked
holiday or cancelled"); like every parent message they follow the master switch and each student's opt-out.

- **cp_absent_alert**: Hello, {{1}} was marked \*absent\* for the {{2}}. / If this is not correct, please contact {{3}} directly. Thank you.
- **cp_late_alert**: Hello, {{1}} arrived \*late\* for the {{2}}. / We are sharing this so that you are aware. Regards, {{3}}. Thank you.
- **cp_fee_due_soon**: Hello, a gentle reminder that the fee for {{1}} is due: {{2}}. / Kindly pay on time. If you have already paid, please ignore this message. Regards, {{3}}. Thank you.
- **cp_fee_overdue**: Hello, the fee for {{1}} is still \*pending\*: {{2}}. / Please pay at the earliest. If you have already paid, please ignore this message. Regards, {{3}}. Thank you.
- **cp_payment_receipt**: Hello, we have received the fee payment for {{1}}: {{2}}. / Please keep this message as your receipt. Regards, {{3}}. Thank you.
- **cp_fee_qr** (header: image): Hello, the fee for {{1}} is pending: {{2}}. / Scan the QR code above with any UPI app (Google Pay, PhonePe, Paytm) to pay {{3}} directly. If you have already paid, please ignore this message. Thank you.
- **cp_fee_link**: Hello, the fee for {{1}} is pending: {{2}}. / You can pay online here: {{3}} / If you have already paid, please ignore this message. Thank you.
- **cp_parent_page**: Hello, you can now check the attendance and fee details of {{1}} anytime on this private page: {{2}} / Please do not share this link outside your family. Regards, {{3}}. Thank you.
- **cp_student_welcome**: Hello, welcome! {{1}} is now enrolled in {{2}}. / Attendance alerts, fee reminders and receipts will come to this number on WhatsApp. Regards, {{3}}. Thank you.
- **cp_class_cancelled**: Hello, please note for {{1}}: the {{2}} is \*cancelled\*. / Classes continue as per the usual schedule after this. Regards, {{3}}. Thank you.

Footer on all of them: "Sent via Chalkpis on behalf of your centre". ("/" marks a blank line.)

## To centre owners and helpers (sent by Chalkpis)

| App message type | Template | Id | `{{1}}` | `{{2}}` | `{{3}}` | Sent when |
| --- | --- | --- | --- | --- | --- | --- |
| `centre_welcome` | `cp_centre_welcome` | 1815396 | owner's name | centre | trial end date | a centre is set up |
| `trial_ending` | `cp_trial_ending` | 1815391 | owner's name | centre | trial end date | daily job: a trial ends within 2 days (once per trial end) |
| `plan_active` | `cp_plan_active` | 1815397 | owner's name | `Standard plan for Kiran Karate Academy` | end date | a plan payment is applied (once per payment) |
| `helper_invite` | `cp_helper_invite` | (in review) | helper's name | owner's name | centre | a helper is added (once per helper) |

These are queued in `centre_messages` in the same transaction as their event and sent by the same worker as parent
messages (with retries); the number is read from the person's account at send time.

- **cp_centre_welcome**: Hi {{1}}, your Chalkpis account for {{2}} is ready. / Your free trial runs until {{3}}. Add your students, take attendance in seconds and send fee reminders to parents on WhatsApp. Need help? Write to hello@chalkpis.com.
- **cp_trial_ending**: Hi {{1}}, the free trial for {{2}} ends on {{3}}. / To keep using attendance, fees and parent messages without a break, choose a plan in the Chalkpis app under Account > Plan. Need help? Write to hello@chalkpis.com.
- **cp_plan_active**: Hi {{1}}, thank you for your payment. The {{2}} is now active until {{3}}. / You can see your plan anytime in the Chalkpis app under Account > Plan.
- **cp_helper_invite**: Hi {{1}}, {{2}} has added you as a helper at {{3}} on Chalkpis. / Install the Chalkpis app and sign in with this WhatsApp number to take attendance for your batches.

Footer: "Chalkpis by M2W Technologies". Meta classed `cp_trial_ending` as **Marketing** (it asks the owner to buy).

## Open problem: text templates are not delivered (13 Oct 2026)

Templates with an image header (`cp_fee_qr`) and the login code (`tutor_desk`) reach the phone. Every template with
only a text body is accepted by the gateway (`{"status":"Success"}` with a guid) and then never delivered, to the same
number that does receive the QR reminder. Ruled out: template approval (all approved), variables (they match), the
footer (`cp_payment_receipt_nf` has none and also fails), and the request format (msgtype 1; msgtype 3 with an empty
`type`; msgtype 3 with `type: "text"` and `templateid` as in the gateway's sample, which is what the server sends now).
The gateway's delivery reports reach `/webhooks/wa-dlr/<secret>` as GET requests without any parameters, so WhatsApp's
reason is not visible to us. Waiting on wa.adsme.in support for the error code and the right payload for a text-only
Utility template.

Every send is logged with the gateway's answer (`wa-send` in Coolify > Chalkpis > Runtime Logs, phone numbers masked).

## Login code

`tutor_desk` (Authentication), template id **1809804**: `WA_TEMPLATE_OTP=1809804`.

## The `WA_TEMPLATES` setting

The server reads the template per app message type from `WA_TEMPLATES` (JSON), parent and centre messages alike.
Through wa.adsme.in use the **Template Id numbers** above (add `helper_invite` once it is approved):

```
{"absent":{"en":"1815393"},"late":{"en":"1815389"},"fee_due":{"en":"1815388"},"fee_overdue":{"en":"1815387"},"payment_received":{"en":"1815826"},"fee_reminder":{"en":"1815399"},"fee_link":{"en":"1815392"},"parent_link":{"en":"1815395"},"student_welcome":{"en":"1815398"},"class_cancelled":{"en":"1815394"},"centre_welcome":{"en":"1815396"},"trial_ending":{"en":"1815391"},"plan_active":{"en":"1815397"}}
```

A message type with no template is skipped and shows in the Message log as "No template for this message".

The fee-reminder picture is a UPI QR for the exact amount, drawn by the server at
`<PUBLIC_BASE_URL>/pay-qr.png?d=…&s=…` (signed, so the server only draws codes it handed out) and passed as the header
image (`mediadata`).

**Sending through Meta directly** (`WA_CLOUD_PHONE_NUMBER_ID` and `WA_CLOUD_TOKEN` set) uses the template **names**
(`cp_absent_alert`, …) instead of the numbers.
