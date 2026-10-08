import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { setGlobalOptions } from 'firebase-functions/v2';
import { defineSecret } from 'firebase-functions/params';
import { HttpsError, onCall, onRequest } from 'firebase-functions/v2/https';
import { onDocumentCreated, onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as functionsV1 from 'firebase-functions/v1';
import { deleteAccountForUser } from './lib/account';
import { applyPlanPurchase, expireDueSubscriptions } from './lib/billing';
import { PLANS, isPlanId } from './lib/plans';
import {
  MockProvider,
  RazorpayProvider,
  parsePaymentLinkPaid,
  verifyWebhookSignature,
  type BillingProvider,
} from './lib/razorpay';
import { currentPeriod, generateDuesForInstitute } from './lib/dues';
import { createInstituteForUser, validateCreateInput } from './lib/institute';
import { enforceBatchLimit, enforceStudentLimit } from './lib/stats';
import {
  MESSAGE_TYPES,
  MockMessageProvider,
  WhatsAppUnifiedProvider,
  parseTemplates,
  type TemplateMap,
} from './lib/messaging';
import {
  buildParentView,
  createParentLinkFor,
  parentLinkStatusFor,
  revokeParentLinksFor,
} from './lib/parentLinks';
import { notifyAttendance, notifyPayment, sendFeeReminders, type Deps } from './lib/notify';

initializeApp();
// All functions run in Mumbai (data residency + latency for Indian users).
setGlobalOptions({ region: 'asia-south1', maxInstances: 10 });

const db = () => getFirestore();

/** Daily at 02:00 IST: create this month's missing dues. Idempotent. */
export const generateFeeDues = onSchedule(
  { schedule: '0 2 * * *', timeZone: 'Asia/Kolkata' },
  async () => {
    const period = currentPeriod();
    const institutes = await db().collection('institutes').select().get();
    for (const inst of institutes.docs) {
      const sub = (await inst.ref.collection('subscription').doc('current').get()).data();
      const expired = !sub || sub.status !== 'active' || sub.expiresAt.toMillis() < Date.now();
      if (expired) continue; // read-only mode after expiry
      const n = await generateDuesForInstitute(db(), inst.id, period);
      if (n) console.log(`generateFeeDues: ${inst.id} created ${n}`);
    }
  },
);

export const onStudentWrite = onDocumentWritten(
  'institutes/{instituteId}/students/{studentId}',
  async (event) => {
    const { instituteId, studentId } = event.params;
    await enforceStudentLimit(
      db(),
      instituteId,
      studentId,
      event.data?.before.data(),
      event.data?.after.data(),
    );
  },
);

export const onBatchWrite = onDocumentWritten(
  'institutes/{instituteId}/batches/{batchId}',
  async (event) => {
    const { instituteId, batchId } = event.params;
    await enforceBatchLimit(
      db(),
      instituteId,
      batchId,
      event.data?.before.data(),
      event.data?.after.data(),
    );
  },
);

/** Placeholder: onboarding creates documents through createInstitute. */
export const onAuthCreate = functionsV1
  .region('asia-south1')
  .auth.user()
  .onCreate(() => undefined);

export const createInstitute = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
  let input;
  try {
    input = validateCreateInput(request.data);
  } catch (e) {
    throw new HttpsError('invalid-argument', (e as Error).message);
  }
  const phone = request.auth.token.phone_number as string | undefined;
  return createInstituteForUser(db(), request.auth.uid, phone, input);
});

export const deleteAccount = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
  try {
    await deleteAccountForUser(
      {
        db: db(),
        deleteFiles: async (prefix) => {
          await getStorage().bucket().deleteFiles({ prefix });
        },
        deleteAuthUser: (uid) => getAuth().deleteUser(uid),
      },
      request.auth.uid,
    );
  } catch (e) {
    if ((e as Error).message === 'only-owner')
      throw new HttpsError('permission-denied', 'Only the owner can delete the account.');
    throw new HttpsError('internal', 'Could not delete the account.');
  }
  return { ok: true };
});

// ---------- Plans and billing ----------
const RAZORPAY_KEY_ID = defineSecret('RAZORPAY_KEY_ID');
const RAZORPAY_KEY_SECRET = defineSecret('RAZORPAY_KEY_SECRET');
const RAZORPAY_WEBHOOK_SECRET = defineSecret('RAZORPAY_WEBHOOK_SECRET');
const inEmulator = () => process.env.FUNCTIONS_EMULATOR === 'true';

/** Real Razorpay when keys exist; the mock only ever runs in the emulator, never in production. */
function chooseProvider(): BillingProvider {
  const id = RAZORPAY_KEY_ID.value();
  const secret = RAZORPAY_KEY_SECRET.value();
  // 'unset' is the placeholder stored so the functions can deploy before real keys exist.
  const real = (v: string) => !!v && v !== 'unset';
  if (real(id) && real(secret)) return new RazorpayProvider(id, secret);
  if (inEmulator()) return new MockProvider();
  throw new HttpsError('failed-precondition', 'billing-not-configured');
}

async function requireOwner(uid: string | undefined) {
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  const user = (await db().doc(`users/${uid}`).get()).data();
  if (!user?.instituteId || user.role !== 'owner')
    throw new HttpsError('permission-denied', 'Only the owner can manage billing.');
  return { instituteId: user.instituteId as string, phone: user.phone as string | undefined };
}

/** Owner picks a plan; we return a payment link (price comes from the server catalogue, never the app). */
export const createPlanLink = onCall(
  { secrets: [RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET] },
  async (request) => {
    const { instituteId, phone } = await requireOwner(request.auth?.uid);
    const planId = request.data?.planId;
    if (!isPlanId(planId)) throw new HttpsError('invalid-argument', 'unknown-plan');
    const plan = PLANS[planId];
    const referenceId = `${instituteId}_${planId}_${Date.now()}`;
    const provider = chooseProvider();
    const link = await provider.createPaymentLink({
      amountPaise: plan.pricePaise,
      description: `TutorDesk ${plan.name} plan (${plan.months} months)`,
      referenceId,
      notes: { instituteId, planId },
      customerPhone: phone,
    });
    return { url: link.url, referenceId, provider: provider.name };
  },
);

/** Emulator only: pretend the payment succeeded, through the same code the real webhook uses. */
export const mockCompletePayment = onCall(async (request) => {
  if (!inEmulator())
    throw new HttpsError('permission-denied', 'Test payments only work in the emulator.');
  const { instituteId } = await requireOwner(request.auth?.uid);
  const ref = String(request.data?.referenceId ?? '');
  const [refInstitute, planId] = ref.split('_');
  if (refInstitute !== instituteId || !isPlanId(planId))
    throw new HttpsError('invalid-argument', 'bad-reference');
  const result = await applyPlanPurchase(db(), {
    instituteId,
    planId,
    paymentId: `mockpay_${ref}`,
    amountPaise: PLANS[planId].pricePaise,
    provider: 'mock',
  });
  return { result };
});

/** Razorpay calls this when a payment link is paid. The signature proves it came from Razorpay. */
export const razorpayWebhook = onRequest(
  { secrets: [RAZORPAY_WEBHOOK_SECRET] },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).send('method-not-allowed');
      return;
    }
    if (
      !verifyWebhookSignature(
        req.rawBody,
        req.get('x-razorpay-signature'),
        RAZORPAY_WEBHOOK_SECRET.value(),
      )
    ) {
      res.status(400).send('bad-signature');
      return;
    }
    const paid = parsePaymentLinkPaid(req.body);
    if (!paid) {
      res.status(200).send('ignored');
      return;
    }
    const result = await applyPlanPurchase(db(), {
      instituteId: paid.instituteId,
      planId: paid.planId,
      paymentId: paid.paymentId,
      amountPaise: paid.amountPaise,
      provider: 'razorpay',
    });
    if (result === 'invalid')
      console.warn(
        `razorpayWebhook: refused payment ${paid.paymentId} for institute ${paid.instituteId}`,
      );
    res.status(200).send(result);
  },
);

/** Daily at 03:00 IST: plans past their end date become read-only (nothing is deleted). */
export const expireSubscriptions = onSchedule(
  { schedule: '0 3 * * *', timeZone: 'Asia/Kolkata' },
  async () => {
    const n = await expireDueSubscriptions(db());
    if (n) console.log(`expireSubscriptions: expired ${n}`);
  },
);

// ---------- Parent messages (WhatsApp) ----------
const WA_CLIENT_ID = defineSecret('WA_CLIENT_ID');
const WA_CLIENT_PASSWORD = defineSecret('WA_CLIENT_PASSWORD');
// Plain (non-secret) settings come from environment variables, loaded from functions/.env (see .env.example).
// Not defineString: the emulator stops and prompts for any such parameter that has no value in a .env file.
const env = (name: string, fallback: string) => process.env[name]?.trim() || fallback;
const waSecrets = [WA_CLIENT_ID, WA_CLIENT_PASSWORD];

/** In the emulator with nothing configured, every message type has a stand-in template so the flow can be tried. */
const MOCK_TEMPLATES: TemplateMap = Object.fromEntries(
  MESSAGE_TYPES.map((t) => [t, { en: `mock-${t}` }]),
);

/** Real WhatsApp when fully configured; a mock in the emulator; otherwise nothing is sent and messages are logged as skipped. */
function notifyDeps(): Deps {
  const real = (v: string) => !!v && v !== 'unset';
  const templates = parseTemplates(env('WA_TEMPLATES', '{}'));
  const baseUrl = env('WA_API_URL', 'unset');
  if (
    real(WA_CLIENT_ID.value()) &&
    real(WA_CLIENT_PASSWORD.value()) &&
    real(baseUrl) &&
    real(env('WA_FROM', 'unset'))
  ) {
    return {
      templates,
      provider: new WhatsAppUnifiedProvider({
        baseUrl,
        clientId: WA_CLIENT_ID.value(),
        clientPassword: WA_CLIENT_PASSWORD.value(),
        from: env('WA_FROM', 'unset'),
        method: env('WA_API_METHOD', 'POST') === 'GET' ? 'GET' : 'POST',
      }),
    };
  }
  if (inEmulator())
    return {
      provider: new MockMessageProvider(),
      templates: Object.keys(templates).length ? templates : MOCK_TEMPLATES,
    };
  return { provider: null, templates };
}

/** A student marked Absent or Late: tell the parent (once). */
export const onAttendanceWrite = onDocumentWritten(
  { document: 'institutes/{instituteId}/attendance/{attendanceId}', secrets: waSecrets },
  async (event) => {
    const { instituteId, attendanceId } = event.params;
    await notifyAttendance(
      db(),
      notifyDeps(),
      instituteId,
      attendanceId,
      event.data?.before.data(),
      event.data?.after.data(),
    );
  },
);

/** A payment recorded: thank the parent (once). */
export const onPaymentCreated = onDocumentCreated(
  { document: 'institutes/{instituteId}/payments/{paymentId}', secrets: waSecrets },
  async (event) => {
    const data = event.data?.data();
    if (!data) return;
    await notifyPayment(
      db(),
      notifyDeps(),
      event.params.instituteId,
      event.params.paymentId,
      data as Parameters<typeof notifyPayment>[4],
    );
  },
);

/** Daily at 09:00 IST: "fee due soon" and "overdue" reminders for every institute that switched them on. */
export const dailyFeeReminders = onSchedule(
  { schedule: '0 9 * * *', timeZone: 'Asia/Kolkata', secrets: waSecrets },
  async () => {
    const deps = notifyDeps();
    const institutes = await db().collection('institutes').select().get();
    for (const inst of institutes.docs) {
      const t = await sendFeeReminders(db(), deps, inst.id);
      if (t.sent || t.failed)
        console.log(`dailyFeeReminders: ${inst.id} sent ${t.sent}, failed ${t.failed}`);
    }
  },
);

// ---------- Parent view (read-only page for parents) ----------
const parentBaseUrl = () =>
  env(
    'PARENT_VIEW_BASE_URL',
    inEmulator() ? 'http://127.0.0.1:5002' : `https://${process.env.GCLOUD_PROJECT}.web.app`,
  ).replace(/\/$/, '');

/** Owner makes a private link for one student's parents. The token appears only in the returned URL. */
export const createParentLink = onCall(async (request) => {
  const { instituteId } = await requireOwner(request.auth?.uid);
  const studentId = request.data?.studentId;
  if (typeof studentId !== 'string' || !studentId)
    throw new HttpsError('invalid-argument', 'student-required');
  const link = await createParentLinkFor(db(), {
    instituteId,
    studentId,
    createdBy: request.auth!.uid,
    days: request.data?.days,
  });
  if (!link) throw new HttpsError('not-found', 'student-not-found');
  return { url: `${parentBaseUrl()}/p/${link.token}`, expiresAt: link.expiresAt.toISOString() };
});

/** Switches off every link of a student (for example if a link was shared by mistake). */
export const revokeParentLinks = onCall(async (request) => {
  const { instituteId } = await requireOwner(request.auth?.uid);
  const studentId = request.data?.studentId;
  if (typeof studentId !== 'string' || !studentId)
    throw new HttpsError('invalid-argument', 'student-required');
  return { revoked: await revokeParentLinksFor(db(), instituteId, studentId) };
});

export const parentLinkStatus = onCall(async (request) => {
  const { instituteId } = await requireOwner(request.auth?.uid);
  const studentId = request.data?.studentId;
  if (typeof studentId !== 'string' || !studentId)
    throw new HttpsError('invalid-argument', 'student-required');
  const s = await parentLinkStatusFor(db(), instituteId, studentId);
  return { active: s.active, latestExpiresAt: s.latestExpiresAt?.toISOString() ?? null };
});

/**
 * The parent page calls this with the link's token. No login: the 256-bit token is the key. Unknown, expired
 * and revoked links all answer the same 404, so nobody can probe which tokens exist.
 */
export const parentView = onRequest(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method-not-allowed' });
    return;
  }
  const view = await buildParentView(db(), req.body?.token);
  if (!view) {
    res.status(404).json({ error: 'not-found' });
    return;
  }
  res.status(200).json(view);
});
