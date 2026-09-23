import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { User } from '../../models/User';
import { Institution } from '../../models/Institution';
import { VerificationOtp } from '../../models/VerificationOtp';
import { resendService } from '../../integrations/email/resendClient';
import { signAccessToken, signRefreshToken } from '../../middleware/auth';
import { AppError } from '../../middleware/errorHandler';
import { logger } from '../../utils/logger';
import { AuditLog } from '../../models/AuditLog';
import { captchaService } from './captchaService';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  captchaToken: z.string().optional()
});

const setupSchema = z.object({
  institutionName: z.string().min(2),
  institutionCode: z.string().min(2).toUpperCase(),
  adminName: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6)
});

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, password, captchaToken } = loginSchema.parse(req.body);

    // Enforce CAPTCHA security challenge (exempt only during unit tests)
    const isTest = process.env.NODE_ENV === 'test';
    if (!isTest) {
      const isCaptchaValid = captchaService.verifyCaptchaVerificationToken(captchaToken);
      if (!isCaptchaValid) {
        throw new AppError(
          'CAPTCHA_REQUIRED',
          'Security verification required. Please complete the CAPTCHA image challenge to proceed.',
          403
        );
      }
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      throw new AppError('INVALID_CREDENTIALS', 'Invalid email or password', 401);
    }

    if (user.isLocked()) {
      throw new AppError(
        'ACCOUNT_LOCKED',
        'Account is temporarily locked due to repeated failed login attempts. Please try again later.',
        403
      );
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      user.failedLoginAttempts += 1;
      if (user.failedLoginAttempts >= 5) {
        user.lockoutUntil = new Date(Date.now() + 15 * 60 * 1000); // 15 mins
        logger.warn('AUTH_ACCOUNT_LOCKED', `User ${user.email} locked out after 5 failed attempts`);
      }
      await user.save();
      throw new AppError('INVALID_CREDENTIALS', 'Invalid email or password', 401);
    }

    // Reset failed attempts
    user.failedLoginAttempts = 0;
    user.lockoutUntil = null;
    await user.save();

    // Enforce active status & shift schedule
    const accessCheck = user.isAccessAllowedNow();
    if (!accessCheck.allowed) {
      throw new AppError('ACCESS_RESTRICTED', accessCheck.reason || 'Staff access restricted at this time.', 403);
    }

    // Check if First-Time Login OTP is required (e.g. for newly invited staff)
    if (user.requiresOtpOnFirstLogin) {
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      await VerificationOtp.deleteMany({ email: user.email, purpose: 'STAFF_FIRST_LOGIN' });

      await VerificationOtp.create({
        email: user.email,
        otp,
        purpose: 'STAFF_FIRST_LOGIN',
        metadata: { userId: user._id.toString() },
        expiresAt: new Date(Date.now() + 10 * 60 * 1000)
      });

      const emailResult = await resendService.sendOtpEmail(user.email, otp, 'STAFF_FIRST_LOGIN', user.name);
      if (!emailResult.success) {
        logger.warn('AUTH_STAFF_OTP_EMAIL_FAILED', `Resend error: ${emailResult.error}`);
      }

      logger.info('AUTH_OTP_SENT', `First-time login OTP sent to ${user.email}`);

      return res.status(200).json({
        success: true,
        data: {
          requiresOtp: true,
          email: user.email,
          message: 'First-time security verification code sent to your email.'
        }
      });
    }

    user.lastLoginAt = new Date();
    await user.save();

    const institution = await Institution.findById(user.institutionId);

    const tokenPayload = {
      userId: user._id.toString(),
      institutionId: user.institutionId.toString(),
      role: user.role,
      email: user.email
    };

    const accessToken = signAccessToken(tokenPayload);
    const refreshToken = signRefreshToken(tokenPayload);

    res.cookie('alphaxync_token', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 8 * 60 * 60 * 1000
    });
    res.cookie('campusflow_token', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 8 * 60 * 60 * 1000
    });

    // Record login into AuditLog
    AuditLog.create({
      institutionId: user.institutionId,
      actorUserId: user._id,
      actorRole: user.role,
      action: 'USER_LOGIN',
      entityType: 'AUTH',
      entityId: user._id.toString(),
      after: { email: user.email, role: user.role, name: user.name }
    }).catch((err) => logger.warn('AUDIT_LOGIN_ERR', err.message));

    logger.info('AUTH_LOGIN_SUCCESS', `User ${user.email} logged in with role ${user.role}`);

    return res.status(200).json({
      success: true,
      data: {
        token: accessToken,
        refreshToken,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role
        },
        institution: institution
          ? {
              id: institution._id,
              name: institution.name,
              code: institution.code,
              timezone: institution.timezone,
              logoUrl: institution.logoUrl,
              receiptSettings: institution.receiptSettings
            }
          : null
      }
    });
  } catch (error) {
    next(error);
  }
}

export async function verifyLoginOtp(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, otp } = z.object({
      email: z.string().email(),
      otp: z.string().min(6).max(6)
    }).parse(req.body);

    const otpRecord = await VerificationOtp.findOne({
      email: email.toLowerCase(),
      otp: otp.trim(),
      purpose: 'STAFF_FIRST_LOGIN'
    });

    if (!otpRecord) {
      throw new AppError('INVALID_OTP', 'Invalid or expired verification code. Please check your email.', 400);
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      throw new AppError('USER_NOT_FOUND', 'User account not found.', 404);
    }

    user.isEmailVerified = true;
    user.requiresOtpOnFirstLogin = false;
    user.lastLoginAt = new Date();
    await user.save();

    await VerificationOtp.deleteMany({ email: email.toLowerCase(), purpose: 'STAFF_FIRST_LOGIN' });

    const institution = await Institution.findById(user.institutionId);

    const tokenPayload = {
      userId: user._id.toString(),
      institutionId: user.institutionId.toString(),
      role: user.role,
      email: user.email
    };

    const accessToken = signAccessToken(tokenPayload);
    const refreshToken = signRefreshToken(tokenPayload);

    res.cookie('alphaxync_token', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 8 * 60 * 60 * 1000
    });
    res.cookie('campusflow_token', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 8 * 60 * 60 * 1000
    });

    logger.info('AUTH_STAFF_OTP_VERIFIED', `Staff ${user.email} verified OTP and logged in.`);

    return res.status(200).json({
      success: true,
      data: {
        token: accessToken,
        refreshToken,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role
        },
        institution: institution
          ? {
              id: institution._id,
              name: institution.name,
              code: institution.code,
              timezone: institution.timezone,
              logoUrl: institution.logoUrl,
              receiptSettings: institution.receiptSettings
            }
          : null
      }
    });
  } catch (error) {
    next(error);
  }
}

export async function logout(req: Request, res: Response, next: NextFunction) {
  res.clearCookie('alphaxync_token');
  res.clearCookie('campusflow_token');
  return res.status(200).json({
    success: true,
    data: { message: 'Logged out successfully' }
  });
}

export async function getCurrentUser(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) {
      throw new AppError('UNAUTHORIZED', 'Not authenticated', 401);
    }

    const user = await User.findById(req.user.userId).select('-passwordHash');
    if (!user) {
      throw new AppError('USER_NOT_FOUND', 'User profile not found', 404);
    }

    let institution = await Institution.findById(req.user.institutionId);
    if (!institution) {
      institution = (await Institution.findOne({ active: true })) || (await Institution.findOne());
      if (institution) {
        user.institutionId = institution._id as any;
        await user.save();
      }
    }

    return res.status(200).json({
      success: true,
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          isEmailVerified: user.isEmailVerified,
          lastLoginAt: user.lastLoginAt
        },
        institution: institution
          ? {
              id: institution._id,
              name: institution.name,
              code: institution.code,
              timezone: institution.timezone,
              logoUrl: institution.logoUrl,
              receiptSettings: institution.receiptSettings
            }
          : null
      }
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Step 1: Send Resend Email OTP for initial Admin Setup
 */
export async function sendSetupOtp(req: Request, res: Response, next: NextFunction) {
  try {
    const body = setupSchema.parse(req.body);

    const existingUser = await User.findOne({ email: body.email.toLowerCase() });
    if (existingUser) {
      throw new AppError(
        'EMAIL_EXISTS',
        'An account with this email address already exists. Please go to Login or use another email.',
        409
      );
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(body.password, salt);

    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    await VerificationOtp.deleteMany({ email: body.email.toLowerCase(), purpose: 'INITIAL_SETUP' });

    await VerificationOtp.create({
      email: body.email.toLowerCase(),
      otp,
      purpose: 'INITIAL_SETUP',
      metadata: {
        institutionName: body.institutionName,
        institutionCode: body.institutionCode.toUpperCase(),
        adminName: body.adminName,
        passwordHash
      },
      expiresAt: new Date(Date.now() + 10 * 60 * 1000)
    });

    const emailResult = await resendService.sendOtpEmail(body.email, otp, 'INITIAL_SETUP', body.adminName);
    if (!emailResult.success) {
      throw new AppError('EMAIL_SEND_FAILED', `Failed to deliver verification email: ${emailResult.error}`, 502);
    }

    logger.info('SETUP_OTP_SENT', `Setup OTP sent via Resend to ${body.email}`);

    return res.status(200).json({
      success: true,
      data: {
        message: `Verification code sent to ${body.email}`,
        email: body.email
      }
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Step 2: Verify Setup OTP and activate Admin + Institution
 */
export async function verifySetupOtp(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, otp } = z.object({
      email: z.string().email(),
      otp: z.string().min(6).max(6)
    }).parse(req.body);

    const otpRecord = await VerificationOtp.findOne({
      email: email.toLowerCase(),
      otp: otp.trim(),
      purpose: 'INITIAL_SETUP'
    });

    if (!otpRecord) {
      throw new AppError('INVALID_OTP', 'Invalid or expired verification code. Please check your inbox or request a new code.', 400);
    }

    if (otpRecord.expiresAt && otpRecord.expiresAt < new Date()) {
      throw new AppError('OTP_EXPIRED', 'Verification code has expired. Please request a new one.', 400);
    }

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      throw new AppError('EMAIL_EXISTS', 'An account with this email address already exists. Please log in.', 409);
    }

    const meta = otpRecord.metadata || {};

    let institution = await Institution.findOne({ code: meta.institutionCode });
    if (!institution) {
      institution = await Institution.create({
        name: meta.institutionName,
        code: meta.institutionCode
      });
    } else if (meta.institutionName && meta.institutionName !== institution.name) {
      institution.name = meta.institutionName;
      await institution.save();
    }

    const adminUser = await User.create({
      institutionId: institution._id,
      name: meta.adminName,
      email: email.toLowerCase(),
      passwordHash: meta.passwordHash,
      role: 'ADMIN',
      isEmailVerified: true,
      requiresOtpOnFirstLogin: false
    });

    await VerificationOtp.deleteMany({ email: email.toLowerCase() });

    await AuditLog.create({
      institutionId: institution._id,
      actorUserId: adminUser._id,
      actorRole: 'ADMIN',
      action: 'INITIAL_SYSTEM_SETUP',
      entityType: 'INSTITUTION',
      entityId: institution._id.toString(),
      after: { institutionName: institution.name, adminEmail: adminUser.email, verifiedVia: 'RESEND_EMAIL_OTP' }
    });

    const tokenPayload = {
      userId: adminUser._id.toString(),
      institutionId: institution._id.toString(),
      role: adminUser.role,
      email: adminUser.email
    };

    const accessToken = signAccessToken(tokenPayload);
    const refreshToken = signRefreshToken(tokenPayload);

    res.cookie('alphaxync_token', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 8 * 60 * 60 * 1000
    });
    res.cookie('campusflow_token', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 8 * 60 * 60 * 1000
    });

    logger.info('SETUP_COMPLETED', `Admin created via Resend OTP: ${adminUser.email}`);

    return res.status(201).json({
      success: true,
      data: {
        token: accessToken,
        refreshToken,
        message: 'Institution and Admin account successfully verified and initialized.',
        institution: {
          id: institution._id,
          name: institution.name,
          code: institution.code
        },
        user: {
          id: adminUser._id,
          name: adminUser.name,
          email: adminUser.email,
          role: adminUser.role
        }
      }
    });
  } catch (error) {
    next(error);
  }
}

export async function resendSetupOtp(req: Request, res: Response, next: NextFunction) {
  try {
    const { email } = z.object({ email: z.string().email() }).parse(req.body);

    const pending = await VerificationOtp.findOne({
      email: email.toLowerCase(),
      purpose: 'INITIAL_SETUP'
    });

    if (!pending) {
      throw new AppError('NO_PENDING_SETUP', 'No pending setup found for this email. Please restart setup.', 404);
    }

    const newOtp = Math.floor(100000 + Math.random() * 900000).toString();
    pending.otp = newOtp;
    pending.expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await pending.save();

    const emailResult = await resendService.sendOtpEmail(email, newOtp, 'INITIAL_SETUP', pending.metadata?.adminName);
    if (!emailResult.success) {
      throw new AppError('EMAIL_SEND_FAILED', `Failed to deliver verification email: ${emailResult.error}`, 502);
    }

    return res.status(200).json({
      success: true,
      data: { message: `New verification code sent to ${email}` }
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Backward compatibility direct setup
 */
export async function initialSetup(req: Request, res: Response, next: NextFunction) {
  try {
    const body = setupSchema.parse(req.body);

    const existingUser = await User.findOne({ email: body.email.toLowerCase() });
    if (existingUser) {
      throw new AppError('EMAIL_EXISTS', 'An account with this email address already exists. Please log in.', 409);
    }

    let institution = await Institution.findOne({ code: body.institutionCode });
    if (!institution) {
      institution = await Institution.create({
        name: body.institutionName,
        code: body.institutionCode
      });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(body.password, salt);

    const adminUser = await User.create({
      institutionId: institution._id,
      name: body.adminName,
      email: body.email.toLowerCase(),
      passwordHash,
      role: 'ADMIN',
      isEmailVerified: true,
      requiresOtpOnFirstLogin: false
    });

    await AuditLog.create({
      institutionId: institution._id,
      actorUserId: adminUser._id,
      actorRole: 'ADMIN',
      action: 'INITIAL_SYSTEM_SETUP',
      entityType: 'INSTITUTION',
      entityId: institution._id.toString(),
      after: { institutionName: institution.name, adminEmail: adminUser.email }
    });

    return res.status(201).json({
      success: true,
      data: {
        message: 'System successfully initialized',
        institution: {
          id: institution._id,
          name: institution.name,
          code: institution.code
        },
        admin: {
          id: adminUser._id,
          name: adminUser.name,
          email: adminUser.email,
          role: adminUser.role
        }
      }
    });
  } catch (error) {
    next(error);
  }
}

export async function getSetupStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const adminCount = await User.countDocuments({ role: 'ADMIN' });
    return res.status(200).json({
      success: true,
      data: {
        setupRequired: adminCount === 0
      }
    });
  } catch (error) {
    next(error);
  }
}

// -------------------------------------------------------------
// Staff Accounts Management (ADMIN-ONLY)
// -------------------------------------------------------------

export async function getStaffUsers(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user?.institutionId) {
      throw new AppError('UNAUTHORIZED', 'Authentication required', 401);
    }

    const users = await User.find({ institutionId: req.user.institutionId })
      .select('-passwordHash')
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      data: {
        users: users.map((u) => ({
          id: u._id,
          name: u.name,
          email: u.email,
          role: u.role,
          isActive: u.isActive !== false,
          accessSchedule: u.accessSchedule || { mode: 'ALWAYS', shiftStart: '09:00', shiftEnd: '18:00', expiresAt: null },
          permissions: u.permissions || ['COLLECT_PAYMENTS', 'RECORD_OFFLINE', 'VIEW_STUDENTS'],
          isEmailVerified: u.isEmailVerified,
          requiresOtpOnFirstLogin: u.requiresOtpOnFirstLogin,
          lastLoginAt: u.lastLoginAt,
          createdAt: u.createdAt
        }))
      }
    });
  } catch (error) {
    next(error);
  }
}

export async function createStaffUser(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user?.institutionId) {
      throw new AppError('UNAUTHORIZED', 'Authentication required', 401);
    }

    const { name, email, password, role, accessSchedule, permissions } = z.object({
      name: z.string().min(2),
      email: z.string().email(),
      password: z.string().min(6),
      role: z.enum(['STAFF', 'CASHIER']).default('STAFF'),
      accessSchedule: z.object({
        mode: z.enum(['ALWAYS', 'SHIFT_WINDOW', 'EXPIRING']).default('ALWAYS'),
        shiftStart: z.string().optional(),
        shiftEnd: z.string().optional(),
        expiresAt: z.string().nullable().optional()
      }).optional(),
      permissions: z.array(z.string()).optional()
    }).parse(req.body);

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      throw new AppError('EMAIL_EXISTS', 'A user with this email address already exists.', 409);
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const parsedSchedule = {
      mode: accessSchedule?.mode || 'ALWAYS',
      shiftStart: accessSchedule?.shiftStart || '09:00',
      shiftEnd: accessSchedule?.shiftEnd || '18:00',
      expiresAt: accessSchedule?.expiresAt ? new Date(accessSchedule.expiresAt) : null
    };

    const parsedPermissions = permissions && permissions.length > 0
      ? permissions
      : ['COLLECT_PAYMENTS', 'RECORD_OFFLINE', 'VIEW_STUDENTS'];

    const newStaff = await User.create({
      institutionId: req.user.institutionId,
      name,
      email: email.toLowerCase(),
      passwordHash,
      role,
      isActive: true,
      accessSchedule: parsedSchedule,
      permissions: parsedPermissions,
      isEmailVerified: false,
      requiresOtpOnFirstLogin: true
    });

    const institution = await Institution.findById(req.user.institutionId);

    // Send welcome / onboarding notification email via Resend
    resendService.sendStaffInvitationEmail(
      email.toLowerCase(),
      name,
      role,
      password,
      institution?.name
    ).catch((err) => logger.warn('RESEND_INVITE_BG_ERROR', err.message));

    await AuditLog.create({
      institutionId: req.user.institutionId,
      actorUserId: req.user.userId,
      actorRole: req.user.role,
      action: 'CREATE_STAFF_USER',
      entityType: 'USER',
      entityId: newStaff._id.toString(),
      after: {
        name,
        email: newStaff.email,
        role,
        accessSchedule: parsedSchedule,
        permissions: parsedPermissions
      }
    });

    logger.info('STAFF_USER_CREATED', `Admin ${req.user.email} created staff account ${newStaff.email} (${role})`);

    return res.status(201).json({
      success: true,
      data: {
        user: {
          id: newStaff._id,
          name: newStaff.name,
          email: newStaff.email,
          role: newStaff.role,
          isActive: newStaff.isActive,
          accessSchedule: newStaff.accessSchedule,
          permissions: newStaff.permissions,
          isEmailVerified: newStaff.isEmailVerified,
          requiresOtpOnFirstLogin: newStaff.requiresOtpOnFirstLogin,
          createdAt: newStaff.createdAt
        },
        message: 'Staff member account successfully created. Notification email dispatched.'
      }
    });
  } catch (error) {
    next(error);
  }
}

export async function updateStaffUser(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    if (!req.user?.institutionId) {
      throw new AppError('UNAUTHORIZED', 'Authentication required', 401);
    }

    const user = await User.findOne({ _id: id, institutionId: req.user.institutionId });
    if (!user) {
      throw new AppError('USER_NOT_FOUND', 'Staff member not found in this institution', 404);
    }

    const { name, role, isActive, accessSchedule, permissions, password } = z.object({
      name: z.string().min(2).optional(),
      role: z.enum(['STAFF', 'CASHIER', 'ADMIN']).optional(),
      isActive: z.boolean().optional(),
      accessSchedule: z.object({
        mode: z.enum(['ALWAYS', 'SHIFT_WINDOW', 'EXPIRING']),
        shiftStart: z.string().optional(),
        shiftEnd: z.string().optional(),
        expiresAt: z.string().nullable().optional()
      }).optional(),
      permissions: z.array(z.string()).optional(),
      password: z.string().min(6).optional()
    }).parse(req.body);

    // Prevent deactivating own admin account
    if (req.user.userId === id && isActive === false) {
      throw new AppError('CANNOT_SUSPEND_SELF', 'You cannot deactivate your own active session.', 400);
    }

    const beforeSnapshot = {
      name: user.name,
      role: user.role,
      isActive: user.isActive,
      accessSchedule: user.accessSchedule,
      permissions: user.permissions
    };

    if (name) user.name = name;
    if (role) user.role = role;
    if (isActive !== undefined) user.isActive = isActive;
    if (permissions) user.permissions = permissions;

    if (accessSchedule) {
      user.accessSchedule = {
        mode: accessSchedule.mode,
        shiftStart: accessSchedule.shiftStart || '09:00',
        shiftEnd: accessSchedule.shiftEnd || '18:00',
        expiresAt: accessSchedule.expiresAt ? new Date(accessSchedule.expiresAt) : null
      };
      user.markModified('accessSchedule');
    }

    if (password) {
      const salt = await bcrypt.genSalt(10);
      user.passwordHash = await bcrypt.hash(password, salt);
    }

    await user.save();

    const afterSnapshot = {
      name: user.name,
      role: user.role,
      isActive: user.isActive,
      accessSchedule: user.accessSchedule,
      permissions: user.permissions
    };

    await AuditLog.create({
      institutionId: req.user.institutionId,
      actorUserId: req.user.userId,
      actorRole: req.user.role,
      action: 'UPDATE_STAFF_ACCESS',
      entityType: 'USER',
      entityId: user._id.toString(),
      before: beforeSnapshot,
      after: afterSnapshot,
      reason: 'Admin updated staff permissions/shift configuration'
    });

    logger.info('STAFF_USER_UPDATED', `Admin ${req.user.email} updated staff account ${user.email}`);

    return res.status(200).json({
      success: true,
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          isActive: user.isActive,
          accessSchedule: user.accessSchedule,
          permissions: user.permissions,
          isEmailVerified: user.isEmailVerified,
          requiresOtpOnFirstLogin: user.requiresOtpOnFirstLogin,
          updatedAt: user.updatedAt
        },
        message: 'Staff account successfully updated.'
      }
    });
  } catch (error) {
    next(error);
  }
}

export async function deleteStaffUser(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;

    if (req.user?.userId === id) {
      throw new AppError('CANNOT_DELETE_SELF', 'You cannot delete your own administrator account.', 400);
    }

    const user = await User.findOne({ _id: id, institutionId: req.user?.institutionId });
    if (!user) {
      throw new AppError('USER_NOT_FOUND', 'User account not found in this institution.', 404);
    }

    if (user.role === 'ADMIN') {
      const adminCount = await User.countDocuments({ institutionId: req.user?.institutionId, role: 'ADMIN' });
      if (adminCount <= 1) {
        throw new AppError('LAST_ADMIN', 'Cannot delete the sole institution administrator.', 400);
      }
    }

    await User.findByIdAndDelete(id);

    await AuditLog.create({
      institutionId: req.user?.institutionId,
      actorUserId: req.user?.userId,
      actorRole: req.user?.role,
      action: 'DELETE_STAFF_USER',
      entityType: 'USER',
      entityId: id,
      before: { name: user.name, email: user.email, role: user.role }
    });

    logger.info('STAFF_USER_DELETED', `Admin ${req.user?.email} deleted account ${user.email}`);

    return res.status(200).json({
      success: true,
      data: { message: `Account ${user.email} successfully removed.` }
    });
  } catch (error) {
    next(error);
  }
}
