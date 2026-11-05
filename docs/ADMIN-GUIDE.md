# Chalkpis admin dashboard: team guide

The dashboard is at **https://tutor.chalkpis.com/admin**. It shows every centre, person, plan, payment and WhatsApp
message in Chalkpis, so treat it like a bank login: your own account only, never shared.

## Who is on the team

| Person | Role | What the role is for |
| --- | --- | --- |
| hello@man2web.com | **Super admin** (product owner) | Everything, plus the **Team** page. Every deletion code is emailed here. Set on the server (`ADMIN_EMAILS`), so nobody can remove or change it from the dashboard. |
| vignesh@man2web.com | **Admin** (runs Chalkpis when the owner is away) | Plans and plan payments, blocking people, announcements, revenue, exports, the WhatsApp wallet, the audit log. Can ask to delete test centres and people; the deletion only goes through with the code emailed to the super admin. |
| sanjaykumar@man2web.com | **Customer support** | Looks up centres and people, login codes, WhatsApp messages and spend, live activity. Signs people out, retries failed messages, resends the welcome, keeps notes and tags. Cannot change plans or payments, block, announce, see revenue, export or delete. |

The super admin adds, changes or removes members on **Admin → Team**. A change works from the member's next click;
removing someone signs them out at once.

## Signing in

1. Open https://tutor.chalkpis.com/admin.
2. **First time:** click **First time? Set a password**, enter your email, and type the 6-digit code we email you.
   Choose a password of at least 12 characters with upper and lower case letters, a number and a symbol.
3. **Every time:** email and password, then a fresh 6-digit code sent to your email (it works for 10 minutes).
4. The session lives in that browser tab only: a new tab or window asks you to sign in again, and you are signed out
   after 30 idle minutes or 8 hours. That is on purpose.
5. Five wrong passwords block your network for 15 minutes and email you. Forgot it? Use the same
   **Forgot password?** link.

## Finding things

- **⌘K** (Ctrl+K on Windows) searches people by name or phone and centres by name, city or the owner's email.
- **Centres**: every centre with its plan, students, last activity and health. Filters include **At risk** and
  **Test or empty** (try-out sign-ups).
- **A centre's page**: Overview (activity, features used, owner details), **Billing** (plan, auto-renew, payments, pay
  link), **People** (owner and helpers), **Activity log**, **WhatsApp** (what its messages cost), **Notes**.
- **People**: every tutor and helper. Click a person for their devices, recent login codes and actions.
- **Login codes**: the latest WhatsApp login codes and what happened to each.
- **Auto-refresh** (top bar) reloads the open page every 30 seconds. Every change you make reloads the lists by itself.

## Everyday support (Customer support and up)

| A tutor says… | Do this |
| --- | --- |
| "The login code does not come" | **Login codes**: find their number. *Sent* but not used → wrong number or WhatsApp not on that phone. Nothing there → they never asked; check the number they type. Many tries → wait an hour (the limit resets). |
| "I'm signed in on a lost phone" | Open the person → **Sign out everywhere**. They sign in again with a new code. |
| "Parents did not get the absent / fee message" | **WhatsApp → Parents**: filter **Failed**. A failure from the last 7 days has **Retry**; older ones cannot be sent again. Check the centre has parent messages switched on (centre page → Setup). |
| "I never got the welcome message" | **WhatsApp → Owners & helpers** → **Send welcome again**. |
| "When does my plan end? / I paid" | Centre page → **Billing**. Support can see it; an Admin records a payment or changes the plan. |
| Anything worth remembering | Centre page → **Notes** (only the team sees them) and **Tags** (VIP, follow-up, churn risk…). |

## Admin work (Admin and Super admin)

- **Plans**: centre page → Billing → *Extend*, *Record a payment* (UPI or cash paid to us), *Change plan*. *End
  subscription now* also stops website auto-renew so the owner is not charged again. Plans bought in the App Store or
  Google Play are changed there, not here.
- **Block** someone abusive: open the person → **Block** (they are signed out and cannot sign in).
- **Announcements**: news in the app's banner and Updates inbox, optionally a push notification.
- **Revenue & growth**, **Payments**, **Subscriptions**, **Retention**, **Audit log** and CSV exports.

## Deleting test and dummy centres or people

1. **Centres → filter "Test or empty"** (names such as test, demo, dummy, or no students two days after sign-up), or
   **People → "No centre yet"**. Tick the ones to delete, or use **Delete centre** on a centre's page / **Delete
   login** on a person.
2. The dialog shows exactly what goes, and warns about anything that looks real (paid plans, many students, used in
   the last 3 days). A centre with website auto-renew on cannot be deleted until auto-renew is stopped.
3. Write why, then **Email the code to the super admin**. A 6-digit code goes to hello@man2web.com only.
4. Type the code. If you are not the super admin, ask them for it: nothing is deleted without them. The code works
   for 10 minutes, once, for that request, with 5 tries.

Deleting a centre removes everything in it (students, batches, attendance, fees, tests, homework, enquiries,
messages) and the owner's and helpers' logins. Plan payment records stay for the accounts. It cannot be undone, and
it is in the audit log; the super admin also gets an email when it is done.

## WhatsApp spend and recharging

**WhatsApp → Spend & balance** shows what WhatsApp costs Chalkpis: today, this month, per day, per kind of message and
per centre (each centre's page shows its own on the WhatsApp tab).

- The money sits in the **wa.adsme.in** wallet ("Currency Left" at the top of the portal).
- The dashboard counts every message the gateway accepts and multiplies by the rate for its WhatsApp category
  (Utility, Authentication for login codes, Marketing for the plan reminders). Set the rates under **Rates & alerts**
  from adsme's price list.
- After a recharge: **I recharged** with the amount. Now and then (and whenever it looks off): **Update balance** with
  the number shown on wa.adsme.in. The same wa.adsme.in account also pays for another system's messages, so only a
  reading from the portal is exact.
- When the balance lasts fewer than 7 days (or is under ₹500) the Overview shows a red banner and the super admin gets
  one email a day until it is recharged. If it runs out, **login codes stop**, so tutors cannot sign in.

## Rules

- Never share your password or a code, never use someone else's account, never paste a code into chat.
- Do not export data unless you need it, and delete exported files when done (exports are in the audit log).
- Owners' and parents' numbers are for Chalkpis support only.
- When in doubt, write a note on the centre and ask the super admin.
