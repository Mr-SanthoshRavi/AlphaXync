import { Request, Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { DataConnection } from '../../models/DataConnection';
import { SyncConflict } from '../../models/SyncConflict';
import { runSync, getAdapterForConnection } from './syncEngine';
import { resolveConflict } from './conflictEngine';
import { suggestMapping, validateCriticalMappings } from './mappingEngine';
import { AppError } from '../../middleware/errorHandler';
import { AuditLog } from '../../models/AuditLog';

const mappingSchema = z.object({
  mapping: z.record(z.string())
});

const resolveConflictSchema = z.object({
  resolution: z.enum(['KEEP_VERIFIED_VALUE', 'ACCEPT_SOURCE_CHANGE']),
  notes: z.string().optional()
});

const DEFAULT_MAPPING = {
  'Register Number': 'externalStudentId',
  'Register No': 'externalStudentId',
  'Student Name': 'name',
  'Father Name': 'fatherName',
  'Mother Name': 'motherName',
  'Parent Name': 'fatherName',
  'WhatsApp Number': 'whatsappNumber',
  'Parent Mobile': 'whatsappNumber',
  'Course': 'course',
  'Department': 'department',
  'Year': 'year',
  'Section': 'section',
  'Total Fee': 'totalFee',
  'Paid Amount': 'paidAmount',
  'Due Date': 'dueDate',
  'Fine Date': 'dueDate',
  'Fine Amount': 'fineAmount'
};

export async function getSyncStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const institutionId = new Types.ObjectId(req.user!.institutionId);
    let connections = await DataConnection.find({ institutionId });

    // Default connections if none exist
    if (connections.length === 0) {
      const defaultConn = await DataConnection.create({
        institutionId,
        provider: 'google_sheets',
        status: 'CONNECTED',
        accountReference: 'mock_google_sheets@institution.edu',
        sheetReference: 'Students_Master',
        syncInterval: 60,
        columnMapping: DEFAULT_MAPPING
      });
      connections = [defaultConn];
    } else if (!connections[0].columnMapping || Object.keys(connections[0].columnMapping).length === 0) {
      connections[0].columnMapping = DEFAULT_MAPPING as any;
      await connections[0].save();
    }

    const openConflictsCount = await SyncConflict.countDocuments({ institutionId, status: 'OPEN' });

    return res.status(200).json({
      success: true,
      data: {
        connections: connections.map((c) => ({
          id: c._id,
          provider: c.provider,
          status: c.status,
          accountReference: c.accountReference,
          sheetReference: c.sheetReference,
          lastSyncAt: c.lastSyncAt,
          nextSyncAt: c.nextSyncAt,
          syncStatus: c.syncStatus,
          metrics: c.metrics,
          columnMapping: c.columnMapping
        })),
        openConflictsCount
      }
    });
  } catch (error) {
    next(error);
  }
}

export async function triggerManualSync(req: Request, res: Response, next: NextFunction) {
  try {
    const institutionId = new Types.ObjectId(req.user!.institutionId);
    let connection = await DataConnection.findOne({ institutionId });
    if (!connection) {
      connection = await DataConnection.create({
        institutionId,
        provider: 'google_sheets',
        status: 'CONNECTED',
        accountReference: 'mock_google_sheets@institution.edu',
        sheetReference: 'Students_Master',
        columnMapping: DEFAULT_MAPPING
      });
    } else if (!connection.columnMapping || Object.keys(connection.columnMapping).length === 0) {
      connection.columnMapping = DEFAULT_MAPPING as any;
      connection.status = 'CONNECTED';
      await connection.save();
    }

    const metrics = await runSync(connection._id.toString());

    await AuditLog.create({
      institutionId,
      actorUserId: req.user!.userId,
      actorRole: req.user!.role,
      action: 'MANUAL_SYNC_TRIGGERED',
      entityType: 'DATA_CONNECTION',
      entityId: connection._id.toString(),
      after: metrics as any,
      reason: 'Manual sync triggered by staff'
    });

    return res.status(200).json({
      success: true,
      data: {
        message: 'Sync completed successfully',
        metrics
      }
    });
  } catch (error) {
    next(error);
  }
}

export async function getConflicts(req: Request, res: Response, next: NextFunction) {
  try {
    const institutionId = new Types.ObjectId(req.user!.institutionId);
    const conflicts = await SyncConflict.find({ institutionId })
      .populate('studentId', 'name externalStudentId course')
      .sort({ detectedAt: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      data: conflicts.map((c: any) => ({
        id: c._id,
        studentId: c.studentId?._id,
        studentName: c.studentId?.name || 'Unknown',
        registerNo: c.studentId?.externalStudentId || 'N/A',
        course: c.studentId?.course || '',
        field: c.field,
        applicationValue: c.applicationValue,
        sourceValue: c.sourceValue,
        status: c.status,
        detectedAt: c.detectedAt,
        resolution: c.resolution
      }))
    });
  } catch (error) {
    next(error);
  }
}

export async function resolveConflictEndpoint(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const { resolution, notes } = resolveConflictSchema.parse(req.body);
    const adminUserId = new Types.ObjectId(req.user!.userId);

    const conflict = await resolveConflict(id, resolution, adminUserId, notes);

    return res.status(200).json({
      success: true,
      data: {
        id: conflict._id,
        status: conflict.status,
        resolution: conflict.resolution
      }
    });
  } catch (error) {
    next(error);
  }
}

export async function discoverColumns(req: Request, res: Response, next: NextFunction) {
  try {
    const institutionId = new Types.ObjectId(req.user!.institutionId);
    const connection = await DataConnection.findOne({ institutionId });
    if (!connection) {
      throw new AppError('CONNECTION_NOT_FOUND', 'Connection not configured', 404);
    }

    const adapter = await getAdapterForConnection(connection);
    if (connection.provider === 'google_sheets') {
      const { getValidGoogleCredentials } = await import('../connections/googleConnectionController');
      const googleCreds = await getValidGoogleCredentials(connection);
      await adapter.connect({
        accessToken: googleCreds.accessToken,
        spreadsheetId: googleCreds.spreadsheetId || connection.fileReference || connection.sheetReference
      });
    }

    const sheets = await adapter.discover();
    const requestedSheet = req.query.sheet as string;
    const activeSheet = requestedSheet || connection.sheetReference || sheets[0] || 'Students_Master';
    const schema = await adapter.readSchema(activeSheet);
    const suggestions = suggestMapping(schema.columns);

    return res.status(200).json({
      success: true,
      data: {
        sheets,
        activeSheet,
        columns: schema.columns,
        suggestedMapping: suggestions
      }
    });
  } catch (error) {
    next(error);
  }
}

export async function saveMapping(req: Request, res: Response, next: NextFunction) {
  try {
    const institutionId = new Types.ObjectId(req.user!.institutionId);
    const { mapping } = mappingSchema.parse(req.body);

    const validation = validateCriticalMappings(mapping);
    if (!validation.valid) {
      throw new AppError(
        'CRITICAL_MAPPING_MISSING',
        `Critical fields must be mapped before saving: ${validation.missing.join(', ')}`,
        400
      );
    }

    let connection = await DataConnection.findOne({ institutionId });
    if (!connection) {
      connection = new DataConnection({ institutionId, provider: 'google_sheets' });
    }

    connection.columnMapping = mapping;
    await connection.save();

    await AuditLog.create({
      institutionId,
      actorUserId: req.user!.userId,
      actorRole: req.user!.role,
      action: 'COLUMN_MAPPING_UPDATED',
      entityType: 'DATA_CONNECTION',
      entityId: connection._id.toString(),
      after: mapping,
      reason: 'Admin updated and confirmed column mapping'
    });

    return res.status(200).json({
      success: true,
      data: {
        message: 'Column mapping saved and verified',
        mapping: connection.columnMapping
      }
    });
  } catch (error) {
    next(error);
  }
}

export async function simulateSourceSheetUpdate(req: Request, res: Response, next: NextFunction) {
  try {
    const institutionId = new Types.ObjectId(req.user!.institutionId);
    const connection = await DataConnection.findOne({ institutionId });
    if (!connection) {
      throw new AppError('CONNECTION_NOT_FOUND', 'Data connection not found', 404);
    }
    const adapter: any = await getAdapterForConnection(connection);
    const { sheetName = connection.sheetReference || 'Students_Master', regNo, updates, newRow } = req.body;

    if (newRow) {
      await adapter.createRow(sheetName, newRow);
    } else if (regNo && updates) {
      for (const [k, v] of Object.entries(updates)) {
        if (typeof adapter.setCellDirectly === 'function') {
          adapter.setCellDirectly(sheetName, regNo, k, v);
        }
      }
    }

    return res.status(200).json({
      success: true,
      data: { message: 'Source sheet updated in adapter' }
    });
  } catch (error) {
    next(error);
  }
}

