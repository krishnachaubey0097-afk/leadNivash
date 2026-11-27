import crypto from 'crypto';
import { env } from '../../config/env.js';
import { getPlanLimits } from '../../config/plans.js';
import { User } from '../users/user.model.js';
import { PaymentRecord, type PaymentFlowMode, type PaymentRecordStatus, type PlanCode } from './paymentRecord.model.js';
import { logger } from '../../services/logger.service.js';

export interface PlanCatalogEntry {
  planCode: PlanCode;
  tier: 'lite' | 'pro';
  name: string;
  amountINR: number;
  durationDays: number;
  cfPlanId: string;
  cfPlanName: string;
  intervalType: 'MONTH' | 'YEAR';
  intervals: number;
}

export const PAYMENT_PLAN_CATALOG: Record<PlanCode, PlanCatalogEntry> = {
  monthly_399: {
    planCode: 'monthly_399',
    tier: 'lite',
    name: 'Monthly Plan',
    amountINR: 399,
    durationDays: 30,
    cfPlanId: 'leadnivash_monthly_399',
    cfPlanName: 'LeadNivash Monthly Plan',
    intervalType: 'MONTH',
    intervals: 1,
  },
  yearly_trial_3299: {
    planCode: 'yearly_trial_3299',
    tier: 'pro',
    name: 'Yearly Trial Upgrade Offer',
    amountINR: 3299,
    durationDays: 365,
    cfPlanId: 'leadnivash_yearly_trial_3299',
    cfPlanName: 'LeadNivash Yearly Trial Offer',
    intervalType: 'YEAR',
    intervals: 1,
  },
  yearly_3999: {
    planCode: 'yearly_3999',
    tier: 'pro',
    name: 'Yearly Plan',
    amountINR: 3999,
    durationDays: 365,
    cfPlanId: 'leadnivash_yearly_3999',
    cfPlanName: 'LeadNivash Yearly Plan',
    intervalType: 'YEAR',
    intervals: 1,
  },
};

function sanitizePhone10(rawPhone?: string): string {
  const digits = (rawPhone || '').replace(/\D/g, '');
  if (digits.length >= 10) {
    return digits.slice(-10);
  }
  return '9876543210';
}

function getSafeReturnOrigin(requestedOrigin?: string): string {
  const defaultProd = 'https://lead-nivash-frontend.vercel.app';
  const fallback =
    env.CLIENT_URL && !env.CLIENT_URL.includes('localhost')
      ? env.CLIENT_URL
      : env.NODE_ENV === 'production'
      ? defaultProd
      : env.CLIENT_URL || 'http://localhost:5173';

  if (!requestedOrigin) return fallback.replace(/\/+$/, '');
  try {
    const u = new URL(requestedOrigin);
    if (
      u.hostname.endsWith('.vercel.app') ||
      u.hostname.includes('leadnivash') ||
      u.hostname.includes('leadnivesh') ||
      u.hostname === 'localhost' ||
      u.hostname === '127.0.0.1'
    ) {
      return `${u.protocol}//${u.host}`;
    }
  } catch {
    // Ignore invalid URL and use default
  }
  return fallback.replace(/\/+$/, '');
}

export class CashfreeService {
  static getCredentials() {
    const appId = (env.CASHFREE_APP_ID || env.CASHFREE_CLIENT_ID || '').trim();
    const secretKey = (env.CASHFREE_SECRET_KEY || env.CASHFREE_CLIENT_SECRET || '').trim();
    const webhookSecret = (env.CASHFREE_WEBHOOK_SECRET || secretKey).trim();
    const explicitEnv = env.CASHFREE_ENV;
    const mode: 'sandbox' | 'production' = explicitEnv
      ? explicitEnv
      : appId.toUpperCase().startsWith('TEST')
      ? 'sandbox'
      : env.NODE_ENV === 'production'
      ? 'production'
      : 'sandbox';
    const baseUrl =
      mode === 'production' ? 'https://api.cashfree.com/pg' : 'https://sandbox.cashfree.com/pg';

    return {
      configured: Boolean(appId && secretKey),
      appId,
      secretKey,
      webhookSecret,
      mode,
      baseUrl,
      apiVersion: env.CASHFREE_API_VERSION || '2023-08-01',
    };
  }

  static getPublicConfig() {
    const creds = this.getCredentials();
    return {
      cashfreeEnabled: creds.configured,
      mode: creds.mode,
      subscriptionsEnabled: creds.configured,
      plans: Object.values(PAYMENT_PLAN_CATALOG).map((p) => ({
        planCode: p.planCode,
        tier: p.tier,
        name: p.name,
        amountINR: p.amountINR,
        intervalType: p.intervalType,
      })),
    };
  }

  private static async cfRequest<T = any>(
    method: 'GET' | 'POST',
    endpoint: string,
    body?: Record<string, unknown>
  ): Promise<{ ok: boolean; status: number; data: T }> {
    const creds = this.getCredentials();
    if (!creds.configured) {
      const err: any = new Error(
        'Cashfree Payment Gateway is not configured on the backend yet. Please add CASHFREE_APP_ID and CASHFREE_SECRET_KEY.'
      );
      err.statusCode = 503;
      err.code = 'PAYMENT_GATEWAY_NOT_CONFIGURED';
      throw err;
    }

    const res = await fetch(`${creds.baseUrl}${endpoint}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'x-client-id': creds.appId,
        'x-client-secret': creds.secretKey,
        'x-api-version': creds.apiVersion,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
    });

    const data = (await res.json().catch(() => ({}))) as T;
    return { ok: res.ok, status: res.status, data };
  }

  private static async ensureCashfreePlan(plan: PlanCatalogEntry): Promise<{ ok: boolean; error?: string }> {
    const check = await this.cfRequest('GET', `/plans/${encodeURIComponent(plan.cfPlanId)}`);
    if (check.ok) return { ok: true };

    const createRes = await this.cfRequest<any>('POST', '/plans', {
      plan_id: plan.cfPlanId,
      plan_name: plan.cfPlanName,
      plan_type: 'PERIODIC',
      plan_currency: 'INR',
      plan_recurring_amount: plan.amountINR,
      plan_max_amount: plan.amountINR,
      plan_intervals: plan.intervals,
      plan_interval_type: plan.intervalType,
      plan_note: `LeadNivash ${plan.name} (AutoPay)`,
    });

    if (createRes.ok || createRes.status === 409) {
      return { ok: true };
    }
    return {
      ok: false,
      error: createRes.data?.message || `Failed to initialize Cashfree plan (${createRes.status})`,
    };
  }

  static async createCheckoutSession(
    userId: string,
    params: { planCode: PlanCode; mode: PaymentFlowMode; returnOrigin?: string }
  ) {
    const creds = this.getCredentials();
    if (!creds.configured) {
      const err: any = new Error(
        'Cashfree credentials (CASHFREE_APP_ID / CASHFREE_SECRET_KEY) are missing on backend server.'
      );
      err.statusCode = 503;
      err.code = 'PAYMENT_GATEWAY_NOT_CONFIGURED';
      throw err;
    }

    const user = await User.findOne({ _id: userId, isDeleted: false });
    if (!user) {
      const err: any = new Error('User not found');
      err.statusCode = 404;
      err.code = 'NOT_FOUND';
      throw err;
    }

    let resolvedPlanCode = params.planCode;
    // Enforce server-side trial pricing integrity: non-trial users on standard yearly plan get ₹3,999
    if (resolvedPlanCode === 'yearly_trial_3299' && user.plan?.tier === 'pro') {
      resolvedPlanCode = 'yearly_3999';
    }

    const plan = PAYMENT_PLAN_CATALOG[resolvedPlanCode];
    const origin = getSafeReturnOrigin(params.returnOrigin);
    const backendBase = (env.PUBLIC_BASE_URL || 'https://leadnivash.onrender.com').replace(/\/+$/, '');
    const customerPhone = sanitizePhone10(user.phone);
    const customerName = (user.name || 'LeadNivash Broker').replace(/[^a-zA-Z0-9 ._-]/g, '').slice(0, 60) || 'Broker';
    const customerId = `ln_${user._id.toString().slice(-12)}`;

    // Try AutoPay Subscription flow first when mode === 'autopay'
    if (params.mode === 'autopay') {
      const subscriptionId = `sub_${user._id.toString().slice(-6)}_${Date.now()}`;
      const planSync = await this.ensureCashfreePlan(plan);

      if (planSync.ok) {
        const subRes = await this.cfRequest<any>('POST', '/subscriptions', {
          subscription_id: subscriptionId,
          customer_details: {
            customer_id: customerId,
            customer_name: customerName,
            customer_email: user.email,
            customer_phone: customerPhone,
          },
          plan_details: {
            plan_id: plan.cfPlanId,
          },
          authorization_details: {
            authorization_amount: plan.amountINR,
            authorization_amount_type: 'FIXED',
            payment_methods: ['upi', 'enach', 'card'],
          },
          subscription_meta: {
            return_url: `${origin}/app/settings?section=subscription&cf_sub_id=${encodeURIComponent(subscriptionId)}`,
            notification_channel: ['EMAIL', 'SMS'],
          },
        });

        if (subRes.ok && (subRes.data?.subscription_session_id || subRes.data?.cf_subscription_id)) {
          await PaymentRecord.create({
            userId: user._id,
            planCode: plan.planCode,
            planTier: plan.tier,
            mode: 'autopay',
            amountINR: plan.amountINR,
            currency: 'INR',
            cashfreeId: subscriptionId,
            cfReferenceId: subRes.data.cf_subscription_id ? String(subRes.data.cf_subscription_id) : undefined,
            sessionId: subRes.data.subscription_session_id,
            status: 'INITIATED',
            autopayEnabled: true,
          });

          return {
            flow: 'subscription' as const,
            mode: 'autopay' as const,
            checkoutMode: creds.mode,
            subscriptionId,
            cfSubscriptionId: subRes.data.cf_subscription_id,
            sessionId: subRes.data.subscription_session_id,
            planCode: plan.planCode,
            amountINR: plan.amountINR,
          };
        }

        logger.warn(
          `Cashfree Subscriptions checkout unavailable (${subRes.status}: ${subRes.data?.message || 'unknown'}), falling back to Cashfree PG Order`
        );
      } else {
        logger.warn(`Cashfree plan init unavailable (${planSync.error}), falling back to Cashfree PG Order`);
      }
    }

    // Standard Cashfree Payment Gateway Order (UPI / Cards / NetBanking)
    const orderId = `ord_${user._id.toString().slice(-6)}_${Date.now()}`;
    const orderRes = await this.cfRequest<any>('POST', '/orders', {
      order_id: orderId,
      order_amount: plan.amountINR,
      order_currency: 'INR',
      customer_details: {
        customer_id: customerId,
        customer_name: customerName,
        customer_email: user.email,
        customer_phone: customerPhone,
      },
      order_meta: {
        return_url: `${origin}/app/settings?section=subscription&cf_order_id=${encodeURIComponent(orderId)}`,
        notify_url: `${backendBase}/api/v1/payments/cashfree/webhook`,
      },
      order_note: `${plan.name} (${plan.planCode})`,
    });

    if (!orderRes.ok || !orderRes.data?.payment_session_id) {
      const err: any = new Error(
        orderRes.data?.message || 'Cashfree rejected payment session creation. Please verify API keys & account status.'
      );
      err.statusCode = orderRes.status >= 400 && orderRes.status < 500 ? orderRes.status : 502;
      err.code = 'CASHFREE_ORDER_ERROR';
      throw err;
    }

    await PaymentRecord.create({
      userId: user._id,
      planCode: plan.planCode,
      planTier: plan.tier,
      mode: 'one_time',
      amountINR: plan.amountINR,
      currency: 'INR',
      cashfreeId: orderId,
      cfReferenceId: orderRes.data.cf_order_id ? String(orderRes.data.cf_order_id) : undefined,
      sessionId: orderRes.data.payment_session_id,
      status: 'INITIATED',
      autopayEnabled: false,
    });

    return {
      flow: 'order' as const,
      mode: 'one_time' as const,
      checkoutMode: creds.mode,
      orderId,
      cfOrderId: orderRes.data.cf_order_id,
      sessionId: orderRes.data.payment_session_id,
      planCode: plan.planCode,
      amountINR: plan.amountINR,
    };
  }

  private static async activateRecordAndUserPlan(
    record: any,
    nextStatus: PaymentRecordStatus,
    paymentId?: string
  ) {
    const planMeta = PAYMENT_PLAN_CATALOG[record.planCode as PlanCode] || PAYMENT_PLAN_CATALOG.yearly_3999;
    const now = new Date();
    const user = await User.findById(record.userId);
    if (!user) return null;

    const currentExpiry = user.plan?.expiresAt ? new Date(user.plan.expiresAt) : null;
    const baseDate = currentExpiry && currentExpiry > now ? currentExpiry : now;
    const periodEnd = new Date(baseDate.getTime() + planMeta.durationDays * 24 * 60 * 60 * 1000);

    record.status = nextStatus;
    record.periodStart = record.periodStart || now;
    record.periodEnd = periodEnd;
    if (record.mode === 'autopay') {
      record.nextBillingAt = periodEnd;
      record.autopayEnabled = true;
    }
    if (paymentId) {
      record.lastPaymentId = paymentId;
    }
    await record.save();

    user.plan = {
      tier: record.planTier,
      trialEndsAt: user.plan?.trialEndsAt || now,
      expiresAt: periodEnd,
      limits: getPlanLimits(record.planTier),
    };
    await user.save();

    return { record, user };
  }

  static async verifyCheckoutReturn(
    userId: string,
    params: { subscriptionId?: string; orderId?: string }
  ) {
    const cashfreeId = params.subscriptionId || params.orderId || '';
    const record = await PaymentRecord.findOne({ cashfreeId, userId });
    if (!record) {
      const err: any = new Error('Payment record not found for your account.');
      err.statusCode = 404;
      err.code = 'NOT_FOUND';
      throw err;
    }

    if (params.subscriptionId || record.mode === 'autopay') {
      const subRes = await this.cfRequest<any>(
        'GET',
        `/subscriptions/${encodeURIComponent(record.cashfreeId)}`
      );
      if (!subRes.ok) {
        const err: any = new Error(subRes.data?.message || 'Unable to verify subscription status.');
        err.statusCode = 502;
        err.code = 'CASHFREE_VERIFY_ERROR';
        throw err;
      }

      const rawStatus = String(
        subRes.data?.subscription_status || subRes.data?.status || ''
      ).toUpperCase();

      if (rawStatus === 'ACTIVE' || rawStatus === 'INITIALIZED') {
        const isActuallyActive = rawStatus === 'ACTIVE';
        if (isActuallyActive) {
          await this.activateRecordAndUserPlan(record, 'ACTIVE');
          return {
            activated: true,
            status: 'ACTIVE',
            planTier: record.planTier,
            autopayEnabled: true,
            expiresAt: record.periodEnd,
          };
        }
      }

      if (rawStatus === 'BANK_APPROVAL_PENDING') {
        record.status = 'BANK_APPROVAL_PENDING';
        await record.save();
      } else if (rawStatus === 'CANCELLED' || rawStatus === 'FAILED' || rawStatus === 'EXPIRED') {
        record.status = rawStatus as PaymentRecordStatus;
        record.autopayEnabled = false;
        await record.save();
      }

      return {
        activated: record.status === 'ACTIVE',
        status: record.status,
        planTier: record.planTier,
        autopayEnabled: record.autopayEnabled,
        expiresAt: record.periodEnd,
      };
    }

    // One-time PG Order verification
    const ordRes = await this.cfRequest<any>(
      'GET',
      `/orders/${encodeURIComponent(record.cashfreeId)}`
    );
    if (!ordRes.ok) {
      const err: any = new Error(ordRes.data?.message || 'Unable to verify order status.');
      err.statusCode = 502;
      err.code = 'CASHFREE_VERIFY_ERROR';
      throw err;
    }

    const orderStatus = String(ordRes.data?.order_status || '').toUpperCase();
    if (orderStatus === 'PAID') {
      await this.activateRecordAndUserPlan(
        record,
        'PAID',
        ordRes.data?.cf_order_id ? String(ordRes.data.cf_order_id) : undefined
      );
      return {
        activated: true,
        status: 'PAID',
        planTier: record.planTier,
        autopayEnabled: false,
        expiresAt: record.periodEnd,
      };
    }

    if (orderStatus === 'EXPIRED' || orderStatus === 'TERMINATED') {
      record.status = 'EXPIRED';
      await record.save();
    }

    return {
      activated: false,
      status: orderStatus || record.status,
      planTier: record.planTier,
      autopayEnabled: false,
    };
  }

  static verifyWebhookSignature(rawBody: string, signature?: string, timestamp?: string): boolean {
    const creds = this.getCredentials();
    if (!creds.webhookSecret || !signature || !timestamp) return false;
    const expected = crypto
      .createHmac('sha256', creds.webhookSecret)
      .update(`${timestamp}${rawBody}`)
      .digest('base64');

    const sigBuf = Buffer.from(signature, 'utf8');
    const expBuf = Buffer.from(expected, 'utf8');
    if (sigBuf.length !== expBuf.length) return false;
    return crypto.timingSafeEqual(sigBuf, expBuf);
  }

  static async handleWebhook(rawBody: string, signature?: string, timestamp?: string) {
    if (!this.verifyWebhookSignature(rawBody, signature, timestamp)) {
      const err: any = new Error('Invalid Cashfree webhook signature.');
      err.statusCode = 401;
      err.code = 'INVALID_WEBHOOK_SIGNATURE';
      throw err;
    }

    const payload = JSON.parse(rawBody || '{}') as any;
    const eventType = String(payload.type || payload.event || '').toUpperCase();
    const data = payload.data || {};
    const subId = data.subscription_details?.subscription_id || data.subscription_id;
    const orderId = data.order?.order_id || data.order_id;
    const cashfreeId = subId || orderId;

    if (!cashfreeId) {
      return { processed: false, reason: 'No subscription_id or order_id in webhook payload' };
    }

    const record = await PaymentRecord.findOne({ cashfreeId });
    if (!record) {
      return { processed: false, reason: 'Matching payment record not found' };
    }

    const incomingStatus = String(
      data.subscription_details?.subscription_status ||
        data.payment?.payment_status ||
        data.order?.order_status ||
        ''
    ).toUpperCase();

    record.webhookEvents.push({
      eventType: eventType || 'UNKNOWN',
      receivedAt: new Date(),
      status: incomingStatus,
    });

    if (
      eventType.includes('SUBSCRIPTION_PAYMENT_SUCCESS') ||
      (eventType.includes('SUBSCRIPTION_STATUS_CHANGED') && incomingStatus === 'ACTIVE') ||
      eventType.includes('PAYMENT_SUCCESS') ||
      incomingStatus === 'SUCCESS' ||
      incomingStatus === 'PAID'
    ) {
      const paymentId = data.payment?.cf_payment_id ? String(data.payment.cf_payment_id) : undefined;
      // Avoid double-extending period if the exact same paymentId was already processed
      if (paymentId && record.lastPaymentId === paymentId) {
        await record.save();
        return { processed: true, duplicate: true };
      }
      await this.activateRecordAndUserPlan(
        record,
        record.mode === 'autopay' ? 'ACTIVE' : 'PAID',
        paymentId
      );
      return { processed: true, status: record.status };
    }

    if (incomingStatus === 'CANCELLED' || eventType.includes('CANCEL')) {
      record.status = 'CANCELLED';
      record.autopayEnabled = false;
      await record.save();
      return { processed: true, status: 'CANCELLED' };
    }

    if (incomingStatus === 'FAILED' || eventType.includes('FAILED')) {
      record.status = 'FAILED';
      record.failureReason = data.payment?.payment_message || 'Payment failed';
      await record.save();
      return { processed: true, status: 'FAILED' };
    }

    await record.save();
    return { processed: true, status: record.status };
  }

  static async cancelSubscription(userId: string, subscriptionId: string) {
    const record = await PaymentRecord.findOne({
      cashfreeId: subscriptionId,
      userId,
      mode: 'autopay',
    });
    if (!record) {
      const err: any = new Error('Active AutoPay subscription not found.');
      err.statusCode = 404;
      err.code = 'NOT_FOUND';
      throw err;
    }

    const res = await this.cfRequest<any>(
      'POST',
      `/subscriptions/${encodeURIComponent(subscriptionId)}/manage`,
      { subscription_id: subscriptionId, action: 'CANCEL' }
    );

    if (!res.ok) {
      const err: any = new Error(res.data?.message || 'Could not cancel AutoPay on Cashfree.');
      err.statusCode = 502;
      err.code = 'CASHFREE_CANCEL_ERROR';
      throw err;
    }

    record.status = 'CANCELLED';
    record.autopayEnabled = false;
    await record.save();

    return { cancelled: true, subscriptionId, status: 'CANCELLED' };
  }

  static async getHistory(userId: string) {
    const records = await PaymentRecord.find({ userId })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();
    return records;
  }
}
