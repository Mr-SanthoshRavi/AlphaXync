import { Request, Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { Message } from '../../models/Message';
import { Job } from '../../models/Job';
import { AuditLog } from '../../models/AuditLog';
import { AppError } from '../../middleware/errorHandler';

export async function getMessages(req: Request, res: Response, next: NextFunction) {
  try {
    const institutionId = new Types.ObjectId(req.user!.institutionId);
    const { status, search, page = 1, limit = 25 } = req.query;

    const filter: any = { 
      institutionId,
      recipient: { $nin: ['+919876543210', '9876543210'] },
      failureReason: { $nin: ['RECIPIENT_MISMATCH_WITH_SOURCE_SHEET', 'STUDENT_PHONE_MISSING_IN_SOURCE_SHEET', 'INVALID_RECIPIENT'] }
    };
    if (status && status !== 'ALL') {
      filter.status = String(status).toUpperCase();
    }

    if (search) {
      const regex = new RegExp(String(search), 'i');
      filter.$or = [{ recipient: regex }, { templateName: regex }, { body: regex }];
    }

    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.max(1, Math.min(100, Number(limit)));
    const skip = (pageNum - 1) * limitNum;

    const [messages, total] = await Promise.all([
      Message.find(filter)
        .populate('studentId', 'name externalStudentId whatsappNumber status')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Message.countDocuments(filter)
    ]);

    const formatted = messages.map((m: any) => ({
      id: m._id,
      recipient: m.studentId?.whatsappNumber || m.recipient,
      studentName: m.studentId?.name || 'N/A',
      registerNo: m.studentId?.externalStudentId || 'N/A',
      templateName: m.templateName || 'Direct Notice',
      body: m.body,
      status: m.status,
      sentAt: m.sentAt,
      deliveredAt: m.deliveredAt,
      failedAt: m.failedAt,
      failureReason: m.failureReason
    }));

    return res.status(200).json({
      success: true,
      data: {
        messages: formatted,
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          pages: Math.ceil(total / limitNum)
        }
      }
    });
  } catch (error) {
    next(error);
  }
}

export async function getMessageDetail(req: Request, res: Response, next: NextFunction) {
  try {
    const institutionId = new Types.ObjectId(req.user!.institutionId);
    const { id } = req.params;

    const message = await Message.findOne({ _id: id, institutionId })
      .populate('studentId')
      .lean();

    if (!message) {
      throw new AppError('MESSAGE_NOT_FOUND', 'Message log not found', 404);
    }

    return res.status(200).json({
      success: true,
      data: message
    });
  } catch (error) {
    next(error);
  }
}

export async function retryMessage(req: Request, res: Response, next: NextFunction) {
  try {
    const institutionId = new Types.ObjectId(req.user!.institutionId);
    const { id } = req.params;

    const message = await Message.findOne({ _id: id, institutionId });
    if (!message) {
      throw new AppError('MESSAGE_NOT_FOUND', 'Message not found', 404);
    }

    if (message.status !== 'FAILED') {
      throw new AppError('CANNOT_RETRY', 'Only failed messages can be retried', 400);
    }

    message.status = 'QUEUED';
    message.failedAt = undefined;
    message.failureReason = undefined;
    await message.save();

    await Job.create({
      type: 'MESSAGE',
      payload: {
        messageId: message._id.toString(),
        institutionId: institutionId.toString(),
        recipient: message.recipient,
        templateName: message.templateName,
        body: message.body,
        idempotencyKey: `${message.idempotencyKey}_retry_${Date.now()}`
      },
      status: 'QUEUED',
      runAt: new Date()
    });

    await AuditLog.create({
      institutionId,
      actorUserId: req.user!.userId,
      actorRole: req.user!.role,
      action: 'MESSAGE_RETRY_REQUESTED',
      entityType: 'MESSAGE',
      entityId: message._id.toString(),
      reason: 'Manual retry initiated from message activity center'
    });

    return res.status(200).json({
      success: true,
      data: {
        messageId: message._id,
        status: 'QUEUED'
      }
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Send explicit single-recipient test message (Rule 19)
 */
export async function sendTestMessage(req: Request, res: Response, next: NextFunction) {
  try {
    const institutionId = new Types.ObjectId(req.user!.institutionId);
    const { recipient, messageText } = req.body;

    if (!recipient) {
      throw new AppError('MISSING_RECIPIENT', 'Recipient phone number is required', 400);
    }

    const { normalizePhoneNumber } = await import('../sync/validationEngine');
    const canonicalPhone = normalizePhoneNumber(recipient);
    if (!canonicalPhone) {
      throw new AppError('INVALID_RECIPIENT', `Invalid phone number format: "${recipient}"`, 400);
    }

    const testBody = `[TEST] ${messageText || 'This is a test notification from AlphaXync Operations Platform.'}`;
    const idempotencyKey = `manual_test_${institutionId}_${Date.now()}`;

    // Queue into Global Outbound Queue (ensures 10-second pacing gate is respected)
    const job = await Job.create({
      type: 'MESSAGE',
      payload: {
        institutionId: institutionId.toString(),
        recipient: canonicalPhone,
        templateName: 'admin_test_dispatch',
        body: testBody,
        idempotencyKey,
        eventType: 'TEST_SEND',
        source: 'MANUAL'
      },
      status: 'QUEUED',
      runAt: new Date()
    });

    await AuditLog.create({
      institutionId,
      actorUserId: req.user!.userId,
      actorRole: req.user!.role,
      action: 'TEST_MESSAGE_DISPATCHED',
      entityType: 'MESSAGE',
      entityId: job._id.toString(),
      reason: `Admin dispatched manual test message to ${canonicalPhone}`
    });

    return res.status(200).json({
      success: true,
      data: {
        jobId: job._id,
        recipient: canonicalPhone,
        body: testBody,
        status: 'QUEUED',
        message: 'Test message placed in global outbound queue with 10-second pacing gate.'
      }
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get accurate message counts for dashboard counters (Rule 53)
 */
export async function getMessageStats(req: Request, res: Response, next: NextFunction) {
  try {
    const institutionId = new Types.ObjectId(req.user!.institutionId);

    const baseFilter = {
      institutionId,
      recipient: { $nin: ['+919876543210', '9876543210'] },
      failureReason: { $nin: ['RECIPIENT_MISMATCH_WITH_SOURCE_SHEET', 'STUDENT_PHONE_MISSING_IN_SOURCE_SHEET', 'INVALID_RECIPIENT'] }
    };

    const [queued, sending, sent, failed, cancelled, skipped] = await Promise.all([
      Message.countDocuments({ ...baseFilter, status: { $in: ['QUEUED', 'WAITING'] } }),
      Message.countDocuments({ ...baseFilter, status: 'SENDING' }),
      Message.countDocuments({ ...baseFilter, status: { $in: ['SENT', 'DELIVERED', 'READ'] } }),
      Message.countDocuments({ ...baseFilter, status: 'FAILED' }),
      Message.countDocuments({ ...baseFilter, status: 'CANCELLED' }),
      Message.countDocuments({ ...baseFilter, status: 'SKIPPED' })
    ]);

    return res.status(200).json({
      success: true,
      data: {
        queued,
        sending,
        sent,
        failed,
        cancelled,
        skipped,
        total: queued + sending + sent + failed + cancelled + skipped
      }
    });
  } catch (error) {
    next(error);
  }
}

