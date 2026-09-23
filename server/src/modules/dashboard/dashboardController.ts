import { Request, Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { Student } from '../../models/Student';
import { FeeAccount } from '../../models/FeeAccount';
import { Payment } from '../../models/Payment';
import { Message } from '../../models/Message';
import { SyncConflict } from '../../models/SyncConflict';
import { AuditLog } from '../../models/AuditLog';
import { DataConnection } from '../../models/DataConnection';
import { isMockMode } from '../../config/env';

export async function getDashboardSummary(req: Request, res: Response, next: NextFunction) {
  try {
    const institutionId = new Types.ObjectId(req.user!.institutionId);
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    // 1. Top Cards (Strictly active students from connected source of truth)
    const totalStudents = await Student.countDocuments({ institutionId, status: 'ACTIVE' });

    const activeStudents = await Student.find({ institutionId, status: 'ACTIVE' }).select('_id');
    const activeStudentIds = activeStudents.map((s) => s._id);

    const feeAccounts = await FeeAccount.find({ institutionId, studentId: { $in: activeStudentIds } });
    let totalDue = 0;
    let totalCollected = 0;
    let totalPending = 0;
    let totalOverdue = 0;

    for (const fa of feeAccounts) {
      totalDue += fa.totalAmount;
      totalCollected += fa.paidAmount;
      totalPending += fa.balance;
      if (fa.status === 'OVERDUE') {
        totalOverdue += fa.balance;
      }
    }

    const paymentsToday = await Payment.find({
      institutionId,
      status: 'CAPTURED',
      verifiedAt: { $gte: startOfDay }
    });
    const paidToday = paymentsToday.reduce((sum, p) => sum + p.amount, 0);

    const messagesToday = await Message.countDocuments({
      institutionId,
      status: { $in: ['SENT', 'DELIVERED', 'READ'] },
      sentAt: { $gte: startOfDay }
    });

    // 2. Automation Activity
    const greetingsCount = await Message.countDocuments({ institutionId, templateName: /greeting/i });
    const feeRemindersCount = await Message.countDocuments({ institutionId, templateName: /fee/i });
    const announcementsCount = await Message.countDocuments({ institutionId, templateName: /announcement/i });
    const staffMessagesCount = await Message.countDocuments({ institutionId, templateName: /staff/i });

    // 3. Needs Attention
    const missingWhatsapp = await Student.countDocuments({
      institutionId,
      status: 'ACTIVE',
      $or: [{ whatsappNumber: { $exists: false } }, { whatsappNumber: '' }, { validationStatus: 'INVALID' }]
    });

    const openConflicts = await SyncConflict.countDocuments({ institutionId, status: 'OPEN' });

    const failedMessages = await Message.countDocuments({ institutionId, status: 'FAILED' });

    const attentionItems = [];
    if (missingWhatsapp > 0) {
      attentionItems.push({
        id: 'missing-whatsapp',
        type: 'WARNING',
        title: `${missingWhatsapp} students missing WhatsApp number`,
        description: 'These students cannot receive greeting or fee automated reminders.',
        actionLabel: 'Review Students',
        actionUrl: '/students?whatsappStatus=invalid'
      });
    }

    if (openConflicts > 0) {
      attentionItems.push({
        id: 'open-conflicts',
        type: 'ERROR',
        title: `${openConflicts} payment data conflicts detected`,
        description: 'Spreadsheet values differ from verified payment ledger. Review required.',
        actionLabel: 'Resolve Conflicts',
        actionUrl: '/sync'
      });
    }

    if (failedMessages > 0) {
      attentionItems.push({
        id: 'failed-messages',
        type: 'WARNING',
        title: `${failedMessages} failed WhatsApp communications`,
        description: 'Network or template delivery issues detected.',
        actionLabel: 'View Messages',
        actionUrl: '/messages?status=FAILED'
      });
    }

    // 4. Recent Activity (Latest 10 audit logs & payments)
    const recentLogs = await AuditLog.find({ institutionId })
      .sort({ timestamp: -1 })
      .limit(10);

    const connection = await DataConnection.findOne({ institutionId });

    return res.status(200).json({
      success: true,
      data: {
        cards: {
          totalStudents,
          pendingFees: totalPending,
          paidToday,
          messagesSentToday: messagesToday
        },
        paymentOverview: {
          totalDue,
          totalCollected,
          totalPending,
          totalOverdue
        },
        automationActivity: {
          greetings: greetingsCount,
          feeReminders: feeRemindersCount,
          announcements: announcementsCount,
          staffMessages: staffMessagesCount
        },
        needsAttention: attentionItems,
        recentActivity: recentLogs.map((log) => ({
          id: log._id,
          action: log.action,
          entityType: log.entityType,
          reason: log.reason,
          timestamp: log.timestamp
        })),
        syncHealth: {
          status: connection ? connection.status : 'DISCONNECTED',
          lastSyncAt: connection?.lastSyncAt,
          syncStatus: connection?.syncStatus || 'Not configured'
        },
        mockMode: isMockMode()
      }
    });
  } catch (error) {
    next(error);
  }
}
