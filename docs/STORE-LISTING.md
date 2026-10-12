# Store listing (Google Play and App Store)

Everything to paste into Play Console and App Store Connect. Graphics are in `marketing/store/`.

## Status

Both submitted for review on 13 Oct 2026, free, India only.

| | Google Play | App Store |
| --- | --- | --- |
| Account | Man2web organisation (m2wtechnologies@gmail.com) | M2W Technologies Private Limited, team 3G6UV3S378 |
| App | Chalkpis: Class & Fee Manager, `in.chalkpis.tutors` | Chalkpis: Class & Fee Manager, Apple ID 6822059424 |
| First build | versionCode 4 (1.0.0), production track | 1.0.0 build 3, released automatically once approved |

Next builds: `eas build -p android|ios --profile production`, then `eas submit -p ios` (no Apple sign-in needed: the
App Store app id is in `app/eas.json` and EAS holds an App Store Connect API key). Android bundles are uploaded in
Play Console (Test and release > Production > Create new release) until a Play service account is added for
`eas submit -p android`.

## Identity

| Field | Value |
| --- | --- |
| App name (both stores, max 30) | **Chalkpis: Class & Fee Manager** |
| Package / bundle id | `in.chalkpis.tutors` |
| Developer | M2W Technologies Private Limited |
| Category | Play: **Business**. App Store: primary **Business**, secondary **Education** |
| Price | Free (no in-app purchases in the store apps; plans are not sold inside the app) |
| Contains ads | No |
| Support email | hello@chalkpis.com |
| Website / support URL | https://tutor.chalkpis.com |
| Privacy policy URL | https://tutor.chalkpis.com/privacy |
| Terms URL (App Store "EULA" can stay Apple's standard one) | https://tutor.chalkpis.com/terms |
| Account deletion URL (Play) | https://tutor.chalkpis.com/delete-account |

## Short texts

- **Play short description (max 80):** **`Attendance, fees & parent updates on WhatsApp for every kind of class`** (69)
- **App Store subtitle (max 30):** **`Attendance, fees & parents`** (26)
- **App Store promotional text (max 170):** `Built for every kind of class: tuition, coaching, abacus, karate, dance, yoga and sports. Sign in with WhatsApp in seconds.`
- **App Store keywords (max 100, no spaces after commas):**
  `tuition,coaching,attendance,fees,abacus,karate,dance,yoga,academy,tutor,institute,receipt,upi` (93)

## Full description (both stores, max 4000)

```
Chalkpis puts your class on your phone: students, batches, attendance, fees and WhatsApp updates to parents, in one simple app.

Made for every kind of class in India: tuition centres, coaching institutes, abacus institutes, karate and martial arts classes, dance and yoga classes, sports academies, and music, art or chess classes too. Pick what you teach when you start, and the app speaks your language: a karate batch has belts, a sports batch has age groups, a tuition batch has subjects and classes.

ATTENDANCE IN SECONDS
• Everyone starts present: tap only the ones who are absent or late
• Mark a holiday or a cancelled class
• Attendance reports by day and by month

FEES WITHOUT CHASING
• Monthly dues are created for every student automatically
• Record cash, UPI or bank payments, part payments, discounts and advances
• See who is pending or overdue at a glance
• Receipts and a clear ledger for every student

PARENTS STAY IN THE LOOP ON WHATSAPP
• Absent and late alerts, sent automatically
• Fee reminders with your own UPI QR code or payment link, so parents pay you directly
• Payment receipts, a welcome when a student joins, and a note when a class is cancelled
• A private page where parents can see attendance and fees

STUDENTS AND BATCHES
• A profile for every student: batch, level or belt, parent, monthly fee, due day
• Import students from your contacts or an Excel sheet
• One tap to call or WhatsApp a parent

REPORTS AND GROWTH
• Monthly report: billed, collected, pending, and attendance
• Export to Excel, CSV and PDF
• Make posters for WhatsApp status and Instagram: toppers or champions, admissions, festivals

HELPERS
• Add helpers who can take attendance for their own batches only

SIMPLE AND SAFE
• Sign up and sign in with a code on WhatsApp. No passwords.
• Fees go straight from parents to you. Chalkpis never touches your money.
• Your data is kept private to your centre and encrypted in transit. Delete your account any time.

Questions? Write to hello@chalkpis.com.
```

## Review access (both stores)

Reviewers cannot receive a WhatsApp code, so while a review runs set in Coolify (then redeploy):

- `REVIEW_PHONE` = a 10-digit number you own that nobody else uses (e.g. a spare SIM)
- `REVIEW_CODE` = a 6-digit code

Notes for the reviewer (paste into Play "App access" and App Store "App Review Information > Notes"):

```
Chalkpis is a class-management app for teachers (tuition, coaching, dance, karate, yoga, sports).
Sign-in uses a one-time code sent on WhatsApp. For review, use:
  Mobile number: <REVIEW_PHONE>
  Code: <REVIEW_CODE>
Tap "Continue with WhatsApp", enter the mobile number, then the code. No WhatsApp message is sent to this review number.
After signing in, choose what you teach, enter a name and a class name, create a batch and add a student to see attendance, fees and reports.
There are no purchases in the app.
```

Remove the two settings again when the review is over.

## Google Play: Data safety

- Data collected: **yes**. Shared with third parties: **no** (WhatsApp delivery and hosting are service providers acting for us).
- Encrypted in transit: **yes**. Users can ask for deletion: **yes** (in the app, and the URL above).

None of it is processed ephemerally. Account creation: "Username and other authentication" (mobile number + WhatsApp
code), deletion link https://tutor.chalkpis.com/delete-account.

| Data type | Collected | Why | Optional |
| --- | --- | --- | --- |
| Personal info: Name | yes | App functionality, Account management | no |
| Personal info: User IDs (the Chalkpis account id) | yes | App functionality, Account management | no |
| Personal info: Address (the institute address on receipts) | yes | App functionality | yes |
| Personal info: Phone number | yes | App functionality, Developer communications (welcome, trial and plan messages on WhatsApp), Account management | no |
| Personal info: Other info (institute name, student date of birth and gender) | yes | App functionality | yes |
| Financial info: Other financial info (the teacher's UPI id, fee records) | yes | App functionality | yes |
| Photos | yes | App functionality (logo, student photos) | yes |
| Contacts | yes (only the contacts the teacher picks to add as students) | App functionality | yes |
| App activity: Other user-generated content (student records, attendance, fees) | yes | App functionality | no |

Not collected: location, card or bank details, health, messages, audio, files, calendar, app interactions, web browsing,
device ids, crash logs, diagnostics (the app has no analytics, crash-reporting or push SDK).

Other Play forms: **Content rating** (IARC questionnaire): no violence, sexuality, language, drugs, gambling, no user-to-user
chat or sharing with strangers → expected rating Everyone / 3+. **Target audience:** 18 and over (the app is for teachers;
it is not for children). **Ads:** no. **Government app:** no. **Financial features:** none (the app records payments but
does not move money). **Health:** no. **News:** no.

## App Store: App Privacy

Tracking: **no**. All of the following are **linked to the user** and used only for **App Functionality**:

- Contact Info: Name, Phone Number, Physical Address (the institute address)
- Financial Info: Other Financial Info (the teacher's UPI id, fee records)
- User Content: Photos or Videos, Other User Content (student records, attendance, fees)
- Contacts (only the contacts the teacher picks)
- Identifiers: User ID
- Other Data: student date of birth and gender (optional)

The welcome, trial-ending and plan messages on WhatsApp are about the person's own account, so Phone Number stays
under App Functionality, not Developer's Advertising or Marketing.

Age rating: answer "None" to every content question → **4+**. Encryption: the app uses only standard HTTPS
(`ITSAppUsesNonExemptEncryption = false` is already in the build).

## Screenshots

- Play: `marketing/store/play/phone-01.png` … `phone-08.png` (1080x1920), feature graphic `feature-graphic-1024x500.png`,
  icon `icon-512.png`.
- App Store: `marketing/store/appstore/6.9/` (1320x2868) — Apple scales these down for smaller iPhones;
  `marketing/store/appstore/6.5/` (1284x2778) if App Store Connect asks for 6.5" separately. No iPad (the app is
  iPhone-only).
