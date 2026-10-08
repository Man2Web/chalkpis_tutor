# Manual test checklist (real Android phone)

The server must be running and reachable from the phone (see SETUP.md); set `EXPO_PUBLIC_API_URL` for the build.

Automated tests and the browser preview cover logic and flows, but not the phone itself. Run this on an Android 8+ phone after a build (see SETUP.md). Tick what you checked; write down anything odd with the screen name.

## Sign-in and setup

- [ ] Language screen: switch English / Hindi; text changes everywhere afterwards
- [ ] Enter your real mobile number; the WhatsApp code arrives; wrong code shows a friendly message; "Resend" works after 60 s
- [ ] Onboarding: name, institute, optional logo (pick a photo), first batch, add a student; close the app halfway and reopen: it resumes
- [ ] Log out and log back in on the same phone

## Students and batches

- [ ] Add a student with a photo; edit; deactivate; reactivate
- [ ] Search by name and by phone digits; filters (batch, class, fees pending)
- [ ] Call parent opens the dialer; WhatsApp opens WhatsApp with the parent's number
- [ ] Import from a CSV file (from Files / Drive) and from phone contacts (permission prompt); preview shows problems; "Share error report" works
- [ ] Batch: create, edit, add several students, remove one, archive and restore
- [ ] Text scales when you raise the phone's font size (Settings > Display > Font size) and nothing is cut off

## Attendance

- [ ] Open a batch: everyone Present; tap a student: Absent; tap again: Late; again: Present
- [ ] Mark all present; Holiday and Class cancelled; undo; Save; reopen shows what you saved
- [ ] Go back a day, edit, save. Future days are blocked
- [ ] A batch of 30+ students scrolls smoothly
- [ ] Reports: This month / Last month / 30 days; students below 75% listed

## Fees

- [ ] Collect a full payment and a part payment (UPI/cash); receipt number increases by one each time
- [ ] **Share receipt PDF**: the Android share sheet opens; the PDF shows institute name, logo, amount, balance; try sending it on WhatsApp
- [ ] Reverse a payment: ledger shows the reversing entry and the due is open again
- [ ] Discount a due; waive a balance; add a one-off charge (Books)
- [ ] Remind: message is pre-filled in English and Hindi; "Send on WhatsApp" and "Send as SMS" open the right app with the text
- [ ] Turn on airplane mode and try to record a payment: you get a clear message (offline payments are Phase 2)

## Home, reports, settings

- [ ] Home numbers agree with the Students, Attendance and Fees tabs
- [ ] Reports: change month; **Export CSV** opens the share sheet and the file opens in Sheets/Excel with Hindi names intact; **Export PDF** works
- [ ] Settings: change institute name and receipt prefix; the next receipt uses the new prefix; change language
- [ ] Privacy policy link opens (set `EXPO_PUBLIC_PRIVACY_POLICY_URL`)
- [ ] Delete account (use a throw-away account!): needs typing DELETE; afterwards you are signed out and cannot log back into the old data

## Performance (note the numbers)

- [ ] Cold start to the home screen on your slowest phone: ____ seconds (target under 3)
- [ ] Attendance screen with ~100 students opens in: ____ seconds (target under 1)
- [ ] Release APK size: ____ MB (target under 50)
