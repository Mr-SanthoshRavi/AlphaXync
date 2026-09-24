import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { User, UserRole } from '../models/User';
import { Types } from 'mongoose';

export interface AuthPayload {
  userId: string;
  institutionId: string;
  role: UserRole;
  email: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

export function signAccessToken(payload: AuthPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: '8h' });
}

export function signRefreshToken(payload: AuthPayload): string {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, { expiresIn: '7d' });
}

export async function authenticate(req: Request, res: Response, next: NextFunction) {
  try {
    let token: string | undefined;

    // Check Authorization header, cookies, or query param (for SSE live-stream)
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (req.cookies && (req.cookies.alphaxync_token || req.cookies.campusflow_token)) {
      token = req.cookies.alphaxync_token || req.cookies.campusflow_token;
    } else if (req.query && typeof req.query.token === 'string') {
      token = req.query.token;
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication token required'
        }
      });
    }

    const decoded = jwt.verify(token, env.JWT_SECRET) as AuthPayload;
    req.user = decoded;

    // For non-admin accounts (STAFF / CASHIER), enforce active status & shift schedule
    if (decoded.role !== 'ADMIN') {
      const userDoc = await User.findById(decoded.userId);
      if (!userDoc) {
        return res.status(401).json({
          success: false,
          error: { code: 'USER_NOT_FOUND', message: 'User account does not exist or was removed' }
        });
      }

      const accessCheck = userDoc.isAccessAllowedNow();
      if (!accessCheck.allowed) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'ACCESS_RESTRICTED',
            message: accessCheck.reason || 'Staff access restricted at this time.'
          }
        });
      }
    }

    next();
  } catch (error: any) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'TOKEN_INVALID',
        message: 'Invalid or expired authentication token'
      }
    });
  }
}

export function requirePermission(permission: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' }
      });
    }

    if (req.user.role === 'ADMIN') {
      return next();
    }

    const userDoc = await User.findById(req.user.userId);
    if (!userDoc || !userDoc.permissions?.includes(permission)) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN_PERMISSION',
          message: `Action requires permission: ${permission}`
        }
      });
    }

    next();
  };
}

export function requireRole(allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' }
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: `Access denied. Requires one of: [${allowedRoles.join(', ')}]`
        }
      });
    }

    next();
  };
}

export const requireAdmin = requireRole(['ADMIN']);
