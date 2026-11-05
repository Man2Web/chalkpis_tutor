# Chalkpis Admin guide

For: Vignesh (vignesh@man2web.com), role **Admin**. You run Chalkpis day to day, and fully when the owner is away.
Dashboard: https://tutor.chalkpis.com/admin

## 1. Your role

You **can** do everything Customer support does, and also:
- Change plans: extend, record a payment, change plan or dates, end a subscription, stop website auto-renew
- Block and unblock people
- Send announcements to tutors (in-app banner, Updates inbox, push notification)
- See revenue, payments, subscriptions, analytics and retention
- Export centres and people as CSV, and read the audit log
- Manage the WhatsApp wallet: record recharges, update the balance, set rates
- Ask to delete test or dummy centres and people (the owner must give you the code)

You **cannot**: add, change or remove team members (only the owner, on the Team page), or delete anything without the code the owner receives by email.

Sanjay Kumar (sanjaykumar@man2web.com) is Customer support. He handles calls and simple fixes and passes payments, plans, blocks, deletions and bugs to you.

## 2. First sign-in (do this today)

1. Open https://tutor.chalkpis.com/admin on your laptop.
2. Click **First time? Set a password**.
3. Enter vignesh@man2web.com and click **Send code**.
4. Type the 6-digit code from your email, choose a password (at least 12 characters with capital and small letters, a number and a symbol), and save.
5. Sign in with your email and password. Every sign-in also asks for a fresh code sent to your email.

The sign-in lasts only in that browser tab and ends after 30 minutes of no use or 8 hours. Five wrong passwords block your network for 15 minutes.

## 3. Your routine

**Every morning (15 minutes)**
1. **Overview**: any red banner? The WhatsApp balance banner means recharge now (see section 6).
2. **Subscriptions → Ending soon**: centres whose trial or plan ends in the next 7 days. Call the owner or send the payment link (centre → Billing → pay link → WhatsApp).
3. **Payments**: new payments since yesterday. Check each centre's plan is active.
4. **WhatsApp → Parents → Failed**: many failures with the same reason mean a gateway or template problem. Check **System health**.
5. Whatever Sanjay passed to you (centres tagged **follow-up**, his notes).

**Every week**
1. **WhatsApp → Spend & balance**: update the balance from wa.adsme.in and check the spend per centre.
2. **Centres → At risk** and **Retention**: who stopped using Chalkpis; ask Sanjay to call them.
3. **Centres → Test or empty**: collect dummy sign-ups to delete (section 8).
4. **Audit log**: a quick look at what the team changed.
5. **Revenue & growth**: MRR, new paying centres, churn. Share a two-line update with the owner.

## 4. Plans and money

Prices: Starter ₹199 a month (50 students, 3 batches), Standard ₹299 (100 students, 5 batches), Pro ₹499 (unlimited). Yearly ₹1,999 / ₹2,999 / ₹4,999. New centres get a 14-day free trial. When a plan ends the app is read-only until they pay; nothing is deleted.

On a centre → **Billing**:
- **Extend**: add days to the current plan (a goodwill extension, or a trial extension for a serious centre).
- **Record a payment**: when a centre pays us directly by UPI or cash. Enter the amount, plan and cycle, the UPI reference in the note, and choose **Start the plan now**; the owner gets the "plan active" WhatsApp. Check with the owner before using a special price.
- **Change plan or dates**: set the plan, status, end date and limits exactly. Use it carefully.
- **End subscription now**: the centre becomes read-only today. It also stops website auto-renew, so they are not charged again.
- **Stop auto-renew**: for website (Razorpay) auto-renew only. Plans bought in the App Store or Google Play renew through Apple or Google; the owner cancels them there, and we cannot change them here.
- **Payment link**: while a centre has not paid, its Billing tab shows a pay link to send on WhatsApp.

How the numbers count: a centre is **paying** (and part of MRR and ARR) only while a real payment covers today. A plan you give with Extend or Change plan is not counted as paying. Store test purchases never count.

Refunds: do not promise refunds. Note the request on the centre and ask the owner.

## 5. People

- **Sign out everywhere**: for a lost phone or a shared login.
- **Block**: for abuse, fraud or a clear misuse. Write the reason; they are signed out at once and cannot sign in. **Unblock** undoes it. Tell the owner about every block.

## 6. WhatsApp: spend and recharging

All login codes and parent messages go through the **wa.adsme.in** WhatsApp wallet. If it runs out, **tutors cannot sign in**. This is the most important thing to watch.

- **WhatsApp → Spend & balance** shows spend today, this month, per day, per message type and per centre, the balance, how many days it lasts, and when to recharge.
- After every recharge on wa.adsme.in: click **I recharged** and enter the amount.
- Once a week, or whenever it looks wrong: **Update balance** with the "Currency Left" number on wa.adsme.in. The same adsme account also pays for another system's messages, so only the portal number is exact.
- **Rates & alerts**: what adsme charges per message (Utility, Authentication for login codes, Marketing for plan reminders). Fill these from adsme's price list once.
- When the balance lasts fewer than 7 days or is under ₹500, the Overview shows a red banner and the owner gets a daily email. Recharge the same day. Ask the owner before recharging if you do not have the payment access.

## 7. Announcements

**Announcements** sends news to tutors: a banner in the app, a message in their Updates inbox, and optionally a push notification. You can send it to everyone, or only to owners or helpers, only to centres on trial, paying or ended, or only to one kind of centre (tuition, karate…). Pushes sent at night wait until 8 am, unless marked Critical (for outages only). Send a test push to your own phone first. Keep it short and useful; do not send more than one or two a week. Check the wording with the owner for anything about prices or plans.

## 8. Deleting test and dummy accounts

1. **Centres → filter "Test or empty"** (names like test, demo, dummy, or no students two days after sign-up), or **People → "No centre yet"**.
2. Tick the ones to delete (or use **Delete centre** on a centre / **Delete login** on a person) and click Delete.
3. Read the list carefully, especially any warning (paid plan, many students, used recently). A centre with website auto-renew on must have auto-renew stopped first.
4. Write the reason and click **Email the code to the super admin**. The owner gets a 6-digit code by email.
5. Ask the owner for the code and type it within 10 minutes. Nothing is deleted without it.

Deleting a centre removes everything in it (students, attendance, fees, tests, messages) and the owner's and helpers' logins. It cannot be undone. Plan payment records are kept.

## 9. When the owner is away

- You decide: plan extensions, recording payments, blocks for clear abuse, announcements about the app, recharging WhatsApp (if you have access).
- Wait for the owner: deleting data, team changes, refunds, price changes or special offers, anything legal or about security, and anything you are unsure of.
- Keep a short log for the owner: what happened, what you decided, what is waiting.

## 10. Rules

- Use only your own login. Never share your password or email codes, and never ask a tutor for theirs.
- Export data only when needed, keep it off personal devices, and delete the file when done. Every export is in the audit log.
- Owners' and parents' numbers are for Chalkpis work only.
- Write a note on the centre for every important change, so Sanjay and the owner can see why.

The full team handbook (all roles) is docs/ADMIN-GUIDE.md in the Chalkpis code, and the owner can send it to you.
