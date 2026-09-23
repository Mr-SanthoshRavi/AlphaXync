import { IJob } from '../models/Job';
import { Message, MessageStatus } from '../models/Message';
import { FeeAccount } from '../models/FeeAccount';
import { Student } from '../models/Student';
import { Staff } from '../models/Staff';
import { Automation } from '../models/Automation';
import { WhatsAppProvider } from '../integrations/whatsapp/WhatsAppProvider';
import { MockWhatsAppProvider } from '../integrations/whatsapp/MockWhatsAppProvider';
import { WhatsAppCloudApiProvider } from '../integrations/whatsapp/WhatsAppCloudApiProvider';
import { getBaileysWhatsAppProvider, BaileysWhatsAppProvider } from '../integrations/whatsapp/BaileysWhatsAppProvider';
import { renderTemplate, TemplateRenderError } from '../integrations/whatsapp/templateEngine';
import { normalizePhoneNumber } from '../modules/sync/validationEngine';
import { broadcastEvent } from '../modules/events/eventStream';
import { env, isMockMode } from '../config/env';
import { logger } from '../utils/logger';

// Concurrency control: Strictly 1 outbound WhatsApp send at a time
let isSendingLocked = false;
const sendLockQueue: Array<() => void> = [];

// Pacing Gate state: enforce MIN_SEND_INTERVAL_MS (default 10,000ms / 10s)
let lastOutboundSendTimestamp = 0;

// Circuit Breaker state: count consecutive provider-level failures
let consecutiveProviderFailures = 0;

/**
 * Acquire concurrency lock ensuring only 1 dispatch runs at any given moment.
 */
async function acquireSendLock(): Promise<void> {
  if (!isSendingLocked) {
    isSendingLocked = true;
    return;
  }
  return new Promise<void>((resolve) => {
    sendLockQueue.push(resolve);
  });
}

/**
 * Release concurrency lock and wake up next pending dispatch.
 */
function releaseSendLock(): void {
  if (sendLockQueue.length > 0) {
    const next = sendLockQueue.shift();
    if (next) next();
  } else {
    isSendingLocked = false;
  }
}

/**
 * Enforce minimum gap between consecutive outbound messages.
 */
async function enforcePacingGate(minIntervalMs: number): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastOutboundSendTimestamp;
  if (lastOutboundSendTimestamp > 0 && elapsed < minIntervalMs) {
    const waitMs = minIntervalMs - elapsed;
    logger.info('PACING_GATE_WAIT', `Waiting ${waitMs}ms to maintain global minimum send interval (${minIntervalMs}ms)`);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
  lastOutboundSendTimestamp = Date.now();
}

/**
 * Get configured WhatsApp provider.
 */
export function getWhatsAppProvider(): WhatsAppProvider {
  if (isMockMode()) {
    return new MockWhatsAppProvider();
  }
  if (env.WHATSAPP_PROVIDER === 'baileys') {
    return getBaileysWhatsAppProvider();
  }
  return new WhatsAppCloudApiProvider();
}

export function getConsecutiveProviderFailures(): number {
  return consecutiveProviderFailures;
}

export function resetCircuitBreaker(): void {
  consecutiveProviderFailures = 0;
}

export function getLastOutboundSendTimestamp(): number {
  return lastOutboundSendTimestamp;
}

/**
 * Central Outbound WhatsApp Message Dispatcher.
 * Passes through: Eligibility -> Idempotency -> Balance -> Template -> Pacing Gate -> Provider -> Log.
 */
export async function processMessageJob(job: IJob, customProvider?: WhatsAppProvider): Promise<void> {
  const {
    institutionId,
    studentId,
    staffId,
    automationId,
    recipient,
    templateName,
    body,
    mediaUrl,
    variables,
    idempotencyKey,
    eventType,
    eventReference,
    source = 'AUTOMATION'
  } = job.payload;

  const provider = customProvider || getWhatsAppProvider();

  // 1. Check if Automations are paused or Circuit Breaker is active
  if (automationId) {
    const automation = await Automation.findById(automationId);
    if (automation?.isPaused) {
      logger.warn('AUTOMATION_PAUSED_SKIP', `Outbound queue is paused for automation ${automationId}. Retaining job.`);
      job.status = 'WAITING';
      job.runAt = new Date(Date.now() + 30000); // Check again in 30s
      await job.save();
      return;
    }
  }

  // 2. Check Provider Connection State (if Baileys)
  if (provider instanceof BaileysWhatsAppProvider) {
    const connState = provider.getConnectionState();
    if (connState !== 'CONNECTED') {
      logger.warn('WHATSAPP_PROVIDER_NOT_CONNECTED', `Baileys state is ${connState}. Holding message in queue.`);
      job.status = 'WAITING';
      job.runAt = new Date(Date.now() + 15000);
      await job.save();
      return;
    }
  }

  // 3. Recipient Phone Normalization & Validation (Rule 8 & 9)
  const canonicalRecipient = normalizePhoneNumber(recipient);
  if (!canonicalRecipient) {
    logger.warn('INVALID_RECIPIENT_SKIPPED', `Skipping invalid recipient phone number: "${recipient}". No log recorded.`);
    await Message.deleteMany({ institutionId, idempotencyKey });
    job.status = 'CANCELLED';
    job.lastError = 'INVALID_RECIPIENT';
    await job.save();
    return;
  }

  // 4. Source-of-Truth & Opt-Out Handling Check (Strict Google Sheet Integrity)
  if (studentId) {
    const student = await Student.findById(studentId);

    // Strict Guard 1: Student must exist and be ACTIVE in the connected Google Sheet
    if (!student || student.status !== 'ACTIVE') {
      logger.warn('STUDENT_NOT_ACTIVE_SKIP', `Student ${studentId} is not ACTIVE in source sheet. Skipping dispatch.`);
      await Message.deleteMany({ institutionId, idempotencyKey });
      job.status = 'CANCELLED';
      job.lastError = 'STUDENT_NOT_ACTIVE_IN_SOURCE_SHEET';
      await job.save();
      return;
    }

    // Strict Guard 2: Student must have a valid WhatsApp number in Google Sheet
    if (!student.whatsappNumber || student.validationStatus === 'INVALID') {
      logger.warn('STUDENT_PHONE_MISSING_SKIP', `Student ${student.name} (${student.externalStudentId}) has missing/invalid WhatsApp number in Google Sheet. Skipping dispatch.`);
      await Message.deleteMany({ institutionId, idempotencyKey });
      job.status = 'CANCELLED';
      job.lastError = 'STUDENT_PHONE_MISSING_IN_SOURCE_SHEET';
      await job.save();
      return;
    }

    // Strict Guard 3: Recipient phone must strictly match student's normalized Google Sheet phone
    const studentPhoneNorm = normalizePhoneNumber(student.whatsappNumber);
    if (!studentPhoneNorm || studentPhoneNorm !== canonicalRecipient) {
      logger.warn('RECIPIENT_MISMATCH_SKIP', `Recipient ${canonicalRecipient} does not match student sheet phone ${studentPhoneNorm}. Skipping dispatch without fake log.`);
      await Message.deleteMany({ institutionId, idempotencyKey });
      job.status = 'CANCELLED';
      job.lastError = 'RECIPIENT_MISMATCH_WITH_SOURCE_SHEET';
      await job.save();
      return;
    }

    // Strict Guard 4: Student communication opt-out
    if (student.communicationOptOut) {
      logger.info('RECIPIENT_OPTED_OUT_SKIP', `Student ${student.name} (${canonicalRecipient}) has opted out.`);
      await Message.findOneAndUpdate(
        { institutionId, idempotencyKey },
        {
          institutionId,
          studentId,
          recipient: canonicalRecipient,
          status: 'SKIPPED',
          source,
          failureReason: 'RECIPIENT_OPTED_OUT',
          communicationOptOut: true,
          idempotencyKey
        },
        { upsert: true }
      );
      job.status = 'SKIPPED';
      job.lastError = 'RECIPIENT_OPTED_OUT';
      await job.save();
      return;
    }
  } else if (staffId) {
    const staff = await Staff.findById(staffId);
    if (staff?.communicationOptOut) {
      logger.info('STAFF_OPTED_OUT_SKIP', `Staff ${staff.name} (${canonicalRecipient}) has opted out.`);
      await Message.findOneAndUpdate(
        { institutionId, idempotencyKey },
        {
          institutionId,
          staffId,
          recipient: canonicalRecipient,
          status: 'SKIPPED',
          source,
          failureReason: 'RECIPIENT_OPTED_OUT',
          communicationOptOut: true,
          idempotencyKey
        },
        { upsert: true }
      );
      job.status = 'SKIPPED';
      job.lastError = 'RECIPIENT_OPTED_OUT';
      await job.save();
      return;
    }
  }

  // 5. Dynamic Fee Balance Re-Check (Rule 12 & 44: Never send reminders to paid students)
  if (eventType && eventType.startsWith('FEE_REMINDER') && studentId) {
    const feeAccount = await FeeAccount.findOne({ institutionId, studentId });
    if (feeAccount && feeAccount.balance <= 0) {
      logger.info(
        'FEE_REMINDER_CANCELLED_PAID',
        `Student fee balance is ₹${feeAccount.balance}. Cancelling fee reminder for ${canonicalRecipient}`
      );
      await Message.findOneAndUpdate(
        { institutionId, idempotencyKey },
        {
          institutionId,
          studentId,
          recipient: canonicalRecipient,
          status: 'CANCELLED',
          source,
          failureReason: 'PAYMENT_RECEIVED',
          idempotencyKey
        },
        { upsert: true }
      );
      job.status = 'CANCELLED';
      job.lastError = 'PAYMENT_RECEIVED';
      await job.save();
      return;
    }
  }

  // 6. Template Strict Rendering & Variable Validation (Rule 18 & 43)
  let renderedBody = body || '';
  if (variables) {
    try {
      renderedBody = renderTemplate(renderedBody, variables, true);
    } catch (err: any) {
      if (err instanceof TemplateRenderError) {
        logger.error('TEMPLATE_RENDER_ERROR', `Template validation failed: ${err.message}`);
        await Message.findOneAndUpdate(
          { institutionId, idempotencyKey },
          {
            institutionId,
            studentId,
            staffId,
            automationId,
            recipient: canonicalRecipient,
            templateName,
            body: renderedBody,
            status: 'FAILED',
            source,
            failureReason: 'TEMPLATE_RENDER_ERROR',
            idempotencyKey
          },
          { upsert: true }
        );
        job.status = 'FAILED';
        job.lastError = 'TEMPLATE_RENDER_ERROR';
        await job.save();
        return; // Do NOT retry unrenderable template
      }
      throw err;
    }
  }

  // 7. Idempotency Check (Rule 6: Prevent duplicate sends across syncs, restarts, or retries)
  let existing = await Message.findOne({ institutionId, idempotencyKey });

  if (existing && (existing.status === 'SENT' || existing.status === 'DELIVERED' || existing.status === 'READ')) {
    logger.info('WHATSAPP_IDEMPOTENCY_SKIP', `Message with key ${idempotencyKey} was already sent. Skipping duplicate.`);
    job.status = 'COMPLETED';
    await job.save();
    return;
  }

  if (!existing) {
    try {
      existing = await Message.create({
        jobId: job._id,
        institutionId,
        studentId,
        staffId,
        automationId,
        recipient: canonicalRecipient,
        templateName,
        body: renderedBody,
        payload: variables,
        provider: provider.providerName,
        status: 'SENDING',
        source,
        idempotencyKey
      });
    } catch (err: any) {
      if (err.code === 11000) {
        existing = await Message.findOne({ institutionId, idempotencyKey });
        if (existing && (existing.status === 'SENT' || existing.status === 'DELIVERED' || existing.status === 'READ')) {
          logger.info('WHATSAPP_IDEMPOTENCY_SKIP', `Concurrent worker already sent message with key ${idempotencyKey}`);
          job.status = 'COMPLETED';
          await job.save();
          return;
        }
      } else {
        throw err;
      }
    }
  } else {
    existing.status = 'SENDING';
    existing.recipient = canonicalRecipient;
    existing.body = renderedBody;
    await existing.save();
  }

  // 8. Concurrency Control & Pacing Gate (Rule 2, 4, 21: 1 active send, min 10s gap)
  await acquireSendLock();
  try {
    const minInterval = env.MIN_SEND_INTERVAL_MS || 10000;
    await enforcePacingGate(minInterval);

    // 9. Dispatch to Provider
    const result = await provider.sendMessage({
      recipient: canonicalRecipient,
      templateName,
      body: renderedBody,
      mediaUrl,
      variables,
      idempotencyKey
    });

    if (result.success) {
      consecutiveProviderFailures = 0; // Reset circuit breaker
      if (existing) {
        existing.status = 'SENT';
        existing.sentAt = new Date();
        existing.providerMessageId = result.providerMessageId;
        await existing.save();
      }

      job.status = 'COMPLETED';
      job.completedAt = new Date();
      await job.save();

      // Broadcast live event to Admin Panel
      broadcastEvent(institutionId.toString(), 'MESSAGE_SENT', {
        messageId: existing?._id,
        recipient: canonicalRecipient,
        status: 'SENT',
        sentAt: new Date()
      });

      logger.info('WHATSAPP_DISPATCH_SUCCESS', `Message sent to ${canonicalRecipient} via ${provider.providerName}`);
    } else {
      consecutiveProviderFailures++;
      logger.error(
        'WHATSAPP_DISPATCH_FAILED',
        `Delivery to ${canonicalRecipient} failed: ${result.error} (Consecutive failures: ${consecutiveProviderFailures})`
      );

      if (existing) {
        existing.status = 'FAILED';
        existing.failedAt = new Date();
        existing.failureReason = result.error || 'Provider rejected message';
        await existing.save();
      }

      // Check Failure Circuit Breaker (Rule 22)
      if (consecutiveProviderFailures >= env.CIRCUIT_BREAKER_FAILURES) {
        logger.error(
          'CIRCUIT_BREAKER_TRIGGERED',
          `Circuit breaker tripped after ${consecutiveProviderFailures} consecutive failures. Pausing outbound queue.`
        );
        await Automation.updateMany(
          { institutionId },
          { isPaused: true, pauseReason: 'WHATSAPP_PROVIDER_FAILURE' }
        );
        broadcastEvent(institutionId.toString(), 'AUTOMATION_PAUSED', {
          reason: 'WHATSAPP_PROVIDER_FAILURE',
          consecutiveFailures: consecutiveProviderFailures
        });
      }

      // Non-retryable permanent errors
      if (
        result.error?.includes('Invalid recipient') ||
        result.error?.includes('format') ||
        result.error?.includes('TEMPLATE_RENDER_ERROR')
      ) {
        job.status = 'FAILED';
        job.lastError = result.error;
        await job.save();
        return;
      }

      throw new Error(result.error || 'WhatsApp delivery failed');
    }
  } finally {
    releaseSendLock();
  }
}

