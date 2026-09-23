import { Request, Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { AuditLog } from '../../models/AuditLog';
import { AppError } from '../../middleware/errorHandler';

export async function getAuditLogs(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user?.institutionId) {
      throw new AppError('UNAUTHORIZED', 'Authentication required', 401);
    }

    const institutionId = new Types.ObjectId(req.user.institutionId);

    const {
      page = '1',
      limit = '30',
      role,
      action,
      search,
      startDate,
      endDate
    } = req.query as Record<string, string>;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 30));
    const skip = (pageNum - 1) * limitNum;

    const filter: any = { institutionId };

    if (role && role !== 'ALL') {
      filter.actorRole = role.toUpperCase();
    }

    if (action && action !== 'ALL') {
      filter.action = action;
    }

    if (startDate || endDate) {
      filter.timestamp = {};
      if (startDate) {
        filter.timestamp.$gte = new Date(startDate);
      }
      if (endDate) {
        filter.timestamp.$lte = new Date(endDate);
      }
    }

    if (search && search.trim()) {
      const q = search.trim();
      const regex = new RegExp(q, 'i');
      filter.$or = [
        { action: regex },
        { reason: regex },
        { entityType: regex },
        { entityId: regex }
      ];
    }

    const [logs, total] = await Promise.all([
      AuditLog.find(filter)
        .populate('actorUserId', 'name email role')
        .sort({ timestamp: -1, createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      AuditLog.countDocuments(filter)
    ]);

    // Quick Stats for metrics cards
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const [todayCount, staffCountToday, adminCountToday, paymentActionsToday] = await Promise.all([
      AuditLog.countDocuments({ institutionId, timestamp: { $gte: startOfToday } }),
      AuditLog.countDocuments({ institutionId, actorRole: { $in: ['STAFF', 'CASHIER'] }, timestamp: { $gte: startOfToday } }),
      AuditLog.countDocuments({ institutionId, actorRole: 'ADMIN', timestamp: { $gte: startOfToday } }),
      AuditLog.countDocuments({ institutionId, action: { $regex: /PAYMENT|COLLECT|RECEIPT|FINE|FEE/i }, timestamp: { $gte: startOfToday } })
    ]);

    return res.status(200).json({
      success: true,
      data: {
        logs: logs.map((log: any) => ({
          id: log._id,
          action: log.action,
          entityType: log.entityType,
          entityId: log.entityId,
          actorRole: log.actorRole || 'SYSTEM',
          actor: log.actorUserId
            ? {
                id: log.actorUserId._id,
                name: log.actorUserId.name,
                email: log.actorUserId.email,
                role: log.actorUserId.role
              }
            : null,
          before: log.before || null,
          after: log.after || null,
          reason: log.reason || null,
          ipAddress: log.ipAddress || null,
          timestamp: log.timestamp || log.createdAt
        })),
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(total / limitNum)
        },
        stats: {
          todayCount,
          staffCountToday,
          adminCountToday,
          paymentActionsToday
        }
      }
    });
  } catch (error) {
    next(error);
  }
}
