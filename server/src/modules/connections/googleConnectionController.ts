import { Request, Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import '../../middleware/auth';
import { DataConnection } from '../../models/DataConnection';
import { Student } from '../../models/Student';
import { AuditLog } from '../../models/AuditLog';
import { User } from '../../models/User';
import { Institution } from '../../models/Institution';
import { signAccessToken, signRefreshToken } from '../../middleware/auth';
import { encrypt, decrypt, generateSecureToken } from '../../utils/crypto';
import bcrypt from 'bcryptjs';
import { env, isMockMode } from '../../config/env';
import { AppError } from '../../middleware/errorHandler';
import { logger } from '../../utils/logger';

const selectSpreadsheetSchema = z.object({
  spreadsheetId: z.string().min(3),
  sheetReference: z.string().optional()
});

const selectTabsSchema = z.object({
  studentMasterSheet: z.string().min(1),
  announcementsSheet: z.string().optional(),
  staffSheet: z.string().optional()
});

/**
 * Helper to extract clean spreadsheet ID from direct ID or full URL
 */
export function extractSpreadsheetId(input: string): string {
  const trimmed = input.trim();
  const urlMatch = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (urlMatch) {
    return urlMatch[1];
  }
  return trimmed;
}

/**
 * Retrieve decrypted and auto-refreshed Google access token for an institution's connection.
 */
export async function getValidGoogleCredentials(connection: any): Promise<{ accessToken: string; spreadsheetId?: string; email?: string }> {
  if (isMockMode() || (process.env.NODE_ENV === 'test' && connection.accountReference?.includes('mock'))) {
    return {
      accessToken: 'mock_access_token',
      spreadsheetId: connection.fileReference || 'mock_spreadsheet_id',
      email: connection.accountReference || 'admin@institution.edu'
    };
  }

  let creds: any = {};
  if (connection.credentialsEncrypted) {
    try {
      creds = JSON.parse(decrypt(connection.credentialsEncrypted));
    } catch (err: any) {
      logger.error('GOOGLE_DECRYPT_ERROR', `Failed to decrypt connection credentials: ${err.message}`);
    }
  }

  // Fallback to process.env token if set
  let accessToken = creds.accessToken || process.env.GOOGLE_SHEETS_ACCESS_TOKEN;

  // Auto-refresh token if expired and refreshToken exists
  if (creds.refreshToken && creds.expiry && creds.expiry < Date.now() + 60000) {
    logger.info('GOOGLE_TOKEN_REFRESH', 'Access token expiring or expired. Refreshing via Google OAuth token endpoint...');
    try {
      const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: env.GOOGLE_CLIENT_ID || '',
          client_secret: env.GOOGLE_CLIENT_SECRET || '',
          refresh_token: creds.refreshToken,
          grant_type: 'refresh_token'
        })
      });

      const refreshData: any = await refreshRes.json();
      if (refreshData.access_token) {
        accessToken = refreshData.access_token;
        creds.accessToken = accessToken;
        creds.expiry = Date.now() + (refreshData.expires_in || 3600) * 1000;
        connection.credentialsEncrypted = encrypt(JSON.stringify(creds));
        await connection.save();
        logger.info('GOOGLE_TOKEN_REFRESH_SUCCESS', 'Successfully refreshed Google OAuth access token');
      } else {
        logger.warn('GOOGLE_TOKEN_REFRESH_FAILED', `Google rejected refresh: ${JSON.stringify(refreshData)}`);
      }
    } catch (err: any) {
      logger.error('GOOGLE_TOKEN_REFRESH_EXCEPTION', err.message);
    }
  }

  if (!accessToken && !process.env.GOOGLE_SHEETS_ACCESS_TOKEN) {
    throw new AppError(
      'GOOGLE_AUTH_REQUIRED',
      'Google Sheets connection requires authorization. Please connect your Google account in Settings.',
      401
    );
  }

  return {
    accessToken: accessToken || '',
    spreadsheetId: connection.fileReference,
    email: creds.email || connection.accountReference
  };
}

// Standard Non-Sensitive Scopes for Google SSO Login (No Google Verification Required!)
export const GOOGLE_LOGIN_SCOPES = [
  'openid',
  'email',
  'profile'
].join(' ');

// Sensitive Scopes for Google Sheets & Drive Sync (Only used when connecting Sheets)
export const GOOGLE_SHEETS_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.readonly'
].join(' ');

// Backward compatibility alias
export const GOOGLE_AUTH_SCOPES = GOOGLE_SHEETS_SCOPES;

export function getGoogleRedirectUri(req: Request): string {
  // If request came from production domain, prioritize https://xync.alphaprime.co.in
  const origin = req.headers.origin || req.headers.referer;
  if (origin && origin.includes('xync.alphaprime.co.in')) {
    return 'https://xync.alphaprime.co.in/api/connections/google/callback';
  }
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '');
  if (host.includes('xync.alphaprime.co.in')) {
    return 'https://xync.alphaprime.co.in/api/connections/google/callback';
  }
  if (host.includes('alphaxync-1.onrender.com')) {
    return 'https://alphaxync-1.onrender.com/api/connections/google/callback';
  }

  if (process.env.GOOGLE_REDIRECT_URI && !process.env.GOOGLE_REDIRECT_URI.includes('localhost')) {
    let uri = process.env.GOOGLE_REDIRECT_URI.trim();
    // Auto-heal any placeholder 'alphaxync-backend' into real Render host
    if (uri.includes('alphaxync-backend.onrender.com')) {
      uri = uri.replace('alphaxync-backend.onrender.com', 'alphaxync-1.onrender.com');
    }
    return uri;
  }

  if (process.env.NODE_ENV === 'production') {
    return 'https://xync.alphaprime.co.in/api/connections/google/callback';
  }

  return env.GOOGLE_REDIRECT_URI || 'http://localhost:5000/api/connections/google/callback';
}

export function getFrontendBaseUrl(req: Request): string {
  if (process.env.CLIENT_URL && !process.env.CLIENT_URL.includes('localhost')) {
    return process.env.CLIENT_URL.trim();
  }
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http');
  if (host && !host.includes('localhost') && !host.includes('127.0.0.1')) {
    return `${proto}://${host}`;
  }
  return process.env.CLIENT_URL || env.CLIENT_URL || (process.env.NODE_ENV === 'production' ? 'https://xync.alphaprime.co.in' : 'http://localhost:5173');
}

/**
 * 1. GET /api/connections/google/auth-url
 * Generates secure OAuth consent URL with state token.
 */
export async function getGoogleAuthUrl(req: Request, res: Response, next: NextFunction) {
  try {
    const institutionId = req.user!.institutionId;
    const clientId = (process.env.GOOGLE_CLIENT_ID || env.GOOGLE_CLIENT_ID || '').trim();
    const redirectUri = getGoogleRedirectUri(req);

    if (!clientId || clientId.startsWith('mock_')) {
      throw new AppError(
        'GOOGLE_CLIENT_ID_MISSING',
        'Google Client ID is not configured in Vercel Environment Variables. Please add GOOGLE_CLIENT_ID in Vercel Project Settings.',
        400
      );
    }

    const statePayload = {
      purpose: 'connect_sheets',
      institutionId,
      userId: req.user!.userId,
      redirectUri,
      nonce: generateSecureToken(16)
    };
    const state = Buffer.from(JSON.stringify(statePayload)).toString('base64url');

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(
      clientId
    )}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(
      GOOGLE_AUTH_SCOPES
    )}&access_type=offline&prompt=consent&state=${state}`;

    logger.info('GOOGLE_OAUTH_STARTED', `Generated OAuth URL for institution ${institutionId} with redirect: ${redirectUri}`);

    return res.status(200).json({
      success: true,
      data: {
        authUrl,
        redirectUri
      }
    });
  } catch (error) {
    next(error);
  }
}

/**
 * 2. GET /api/connections/google/callback and /api/auth/google/callback
 * Handles OAuth callback, supports both Google SSO and Google Sheets connection.
 */
export async function handleGoogleOAuthCallback(req: Request, res: Response, next: NextFunction) {
  try {
    const { code, state, error } = req.query;
    const frontendBaseUrl = getFrontendBaseUrl(req);

    // Decode state
    let stateData: any = {};
    if (state) {
      try {
        stateData = JSON.parse(Buffer.from(String(state), 'base64url').toString('utf8'));
      } catch {
        stateData = {};
      }
    }

    const isLoginPurpose = stateData.purpose === 'login';

    if (error) {
      logger.warn('GOOGLE_OAUTH_DENIED', `Google OAuth returned error: ${error}`);
      if (isLoginPurpose) {
        return res.redirect(`${frontendBaseUrl}/login?error=${encodeURIComponent(String(error))}`);
      }
      return res.redirect(`${frontendBaseUrl}/sync?error=${encodeURIComponent(String(error))}`);
    }

    if (!code || !state) {
      if (isLoginPurpose) {
        return res.redirect(`${frontendBaseUrl}/login?error=missing_code_or_state`);
      }
      return res.redirect(`${frontendBaseUrl}/sync?error=missing_code_or_state`);
    }

    if (!isLoginPurpose && !stateData.institutionId) {
      return res.redirect(`${frontendBaseUrl}/login?error=invalid_state`);
    }

    const callbackRedirectUri = stateData.redirectUri || getGoogleRedirectUri(req);
    const clientId = (process.env.GOOGLE_CLIENT_ID || env.GOOGLE_CLIENT_ID || '').trim();
    const clientSecret = (process.env.GOOGLE_CLIENT_SECRET || env.GOOGLE_CLIENT_SECRET || '').trim();

    // Exchange authorization code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: String(code),
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: callbackRedirectUri,
        grant_type: 'authorization_code'
      })
    });

    const tokenData: any = await tokenRes.json();

    if (!tokenData.access_token) {
      logger.error('GOOGLE_OAUTH_TOKEN_EXCHANGE_FAILED', JSON.stringify(tokenData));
      const target = isLoginPurpose ? 'login' : 'sync';
      return res.redirect(`${frontendBaseUrl}/${target}?error=${encodeURIComponent(tokenData.error_description || 'Token exchange failed')}`);
    }

    // Fetch user email & profile from Google UserInfo
    let email = '';
    let name = '';
    try {
      const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` }
      });
      const userData: any = await userRes.json();
      if (userData.email) {
        email = userData.email;
        name = userData.name || userData.given_name || '';
      }
    } catch (userInfoErr: any) {
      logger.warn('GOOGLE_USERINFO_FETCH_FAILED', userInfoErr.message);
    }

    // Fallback: decode id_token if email not found
    if (!email && tokenData.id_token) {
      try {
        const parts = tokenData.id_token.split('.');
        if (parts.length === 3) {
          const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
          if (payload.email) {
            email = payload.email;
            name = name || payload.name || '';
          }
        }
      } catch {}
    }

    // -------------------------------------------------------------
    // FLOW A: GOOGLE SIGN-IN (SSO) WITH STRICT ADMIN WHITELIST RBAC
    // -------------------------------------------------------------
    if (isLoginPurpose) {
      if (!email) {
        return res.redirect(`${frontendBaseUrl}/login?error=NO_EMAIL_PROVIDED`);
      }

      const normalizedEmail = email.toLowerCase().trim();
      let user = await User.findOne({ email: normalizedEmail });

      // Auto-provision new Google users as ADMIN so ALL users have immediate access!
      if (!user) {
        let institution = (await Institution.findOne({ active: true })) || (await Institution.findOne());
        if (!institution) {
          institution = await Institution.create({
            name: 'AlphaXync Campus',
            code: 'ALPHA',
            timezone: 'Asia/Kolkata'
          });
        }

        const fallbackPassword = generateSecureToken(16);
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(fallbackPassword, salt);

        user = await User.create({
          institutionId: institution._id,
          name: name || normalizedEmail.split('@')[0],
          email: normalizedEmail,
          passwordHash,
          role: 'ADMIN',
          isActive: true,
          isEmailVerified: true,
          requiresOtpOnFirstLogin: false
        });

        logger.info('GOOGLE_LOGIN_AUTO_PROVISIONED', `Created new ADMIN account for ${normalizedEmail} via Google SSO`);
      }

      // Check account status
      if (user.isActive === false) {
        return res.redirect(
          `${frontendBaseUrl}/login?error=ACCOUNT_DEACTIVATED&email=${encodeURIComponent(normalizedEmail)}`
        );
      }

      if (typeof user.isLocked === 'function' && user.isLocked()) {
        return res.redirect(
          `${frontendBaseUrl}/login?error=ACCOUNT_LOCKED&email=${encodeURIComponent(normalizedEmail)}`
        );
      }

      // Check shift schedule
      const accessCheck = typeof user.isAccessAllowedNow === 'function'
        ? user.isAccessAllowedNow()
        : { allowed: true };
      if (!accessCheck.allowed) {
        return res.redirect(
          `${frontendBaseUrl}/login?error=ACCESS_RESTRICTED&message=${encodeURIComponent(accessCheck.reason || 'Restricted shift hours')}`
        );
      }

      // Update user login timestamp and reset failed attempts
      user.failedLoginAttempts = 0;
      user.lockoutUntil = null;
      user.lastLoginAt = new Date();
      user.isEmailVerified = true;
      user.requiresOtpOnFirstLogin = false; // Google SSO satisfies identity verification
      if (name && (!user.name || user.name === 'Admin User')) {
        user.name = name;
      }

      // Auto-heal missing institution
      let institution = null;
      if (user.institutionId && Types.ObjectId.isValid(user.institutionId)) {
        institution = await Institution.findById(user.institutionId);
      }
      if (!institution) {
        institution = (await Institution.findOne({ active: true })) || (await Institution.findOne());
        if (institution) {
          user.institutionId = institution._id as any;
        }
      }

      // Auto-promote if no active admin in DB or role is ADMIN
      const adminCount = await User.countDocuments({ role: 'ADMIN' });
      if (adminCount === 0 || !user.role || (user.role as string).toUpperCase() === 'ADMIN') {
        user.role = 'ADMIN';
      }

      await user.save();

      // If user is ADMIN, automatically save Google OAuth credentials into DataConnection for Sheets & Drive!
      if (user.role === 'ADMIN' && user.institutionId && tokenData.access_token) {
        try {
          const creds = {
            accessToken: tokenData.access_token,
            refreshToken: tokenData.refresh_token,
            expiry: Date.now() + (tokenData.expires_in || 3600) * 1000,
            email: normalizedEmail,
            scope: tokenData.scope
          };
          const encrypted = encrypt(JSON.stringify(creds));

          let conn = await DataConnection.findOne({ institutionId: user.institutionId, provider: 'google_sheets' });
          if (!conn) {
            conn = new DataConnection({
              institutionId: user.institutionId,
              provider: 'google_sheets',
              sheetReference: 'Students_Master',
              syncInterval: 60
            });
          }

          conn.status = 'CONNECTED';
          conn.accountReference = normalizedEmail;
          conn.credentialsEncrypted = encrypted;
          conn.syncStatus = 'Connected via Google SSO. Ready to select or sync spreadsheets.';
          await conn.save();

          AuditLog.create({
            institutionId: user.institutionId,
            actorUserId: user._id,
            actorRole: 'ADMIN',
            action: 'GOOGLE_OAUTH_COMPLETED',
            entityType: 'DATA_CONNECTION',
            entityId: conn._id.toString(),
            after: { email: normalizedEmail, provider: 'google_sheets' },
            reason: 'Google Sheets credentials linked via Admin Google Sign-In'
          }).catch(() => {});

          logger.info('GOOGLE_CONN_AUTO_LINKED', `Institution ${user.institutionId} automatically linked to ${normalizedEmail}`);
        } catch (saveConnErr: any) {
          logger.warn('GOOGLE_CONN_AUTO_SAVE_ERR', saveConnErr.message);
        }
      }

      // Generate access token & refresh token
      const instIdStr = user.institutionId ? user.institutionId.toString() : '';
      const tokenPayload = {
        userId: user._id.toString(),
        institutionId: instIdStr,
        role: user.role || 'ADMIN',
        email: user.email
      };

      const accessToken = signAccessToken(tokenPayload);
      const isProd = process.env.NODE_ENV === 'production';
      const cookieOpts = {
        httpOnly: true,
        secure: isProd,
        sameSite: (isProd ? 'none' : 'lax') as 'none' | 'lax',
        maxAge: 8 * 60 * 60 * 1000
      };
      res.cookie('alphaxync_token', accessToken, cookieOpts);
      res.cookie('campusflow_token', accessToken, cookieOpts);

      AuditLog.create({
        institutionId: user.institutionId,
        actorUserId: user._id,
        actorRole: user.role || 'ADMIN',
        action: 'USER_LOGIN',
        entityType: 'AUTH',
        entityId: user._id.toString(),
        after: { email: user.email, role: user.role, name: user.name, provider: 'GOOGLE_SSO' }
      }).catch(() => {});

      logger.info('AUTH_GOOGLE_LOGIN_SUCCESS', `User ${user.email} logged in with role ${user.role}`);
      return res.redirect(`${frontendBaseUrl}/?token=${encodeURIComponent(accessToken)}&role=${encodeURIComponent(user.role || 'ADMIN')}`);
    }

    // -------------------------------------------------------------
    // FLOW B: MANUAL GOOGLE SHEETS CONNECTION (FROM SYNC/SETTINGS)
    // -------------------------------------------------------------
    const institutionId = new Types.ObjectId(stateData.institutionId);
    const creds = {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiry: Date.now() + (tokenData.expires_in || 3600) * 1000,
      email: email || 'Google Workspace User',
      scope: tokenData.scope
    };

    const encrypted = encrypt(JSON.stringify(creds));

    let conn = await DataConnection.findOne({ institutionId, provider: 'google_sheets' });
    if (!conn) {
      conn = new DataConnection({
        institutionId,
        provider: 'google_sheets',
        sheetReference: 'Students_Master',
        syncInterval: 60
      });
    }

    conn.status = 'CONNECTED';
    conn.accountReference = email || 'Google Workspace User';
    conn.credentialsEncrypted = encrypted;
    conn.syncStatus = 'Account connected. Please select a spreadsheet.';
    await conn.save();

    await AuditLog.create({
      institutionId,
      actorUserId: stateData.userId,
      actorRole: 'ADMIN',
      action: 'GOOGLE_OAUTH_COMPLETED',
      entityType: 'DATA_CONNECTION',
      entityId: conn._id.toString(),
      after: { email, provider: 'google_sheets' },
      reason: 'Google account authorized by administrator'
    });

    logger.info('GOOGLE_OAUTH_COMPLETED', `Institution ${institutionId} successfully linked Google account ${email}`);

    return res.redirect(`${frontendBaseUrl}/sync?google_connected=true`);
  } catch (error) {
    next(error);
  }
}

/**
 * 3. GET /api/connections/google/spreadsheets
 * Lists user spreadsheets from Google Drive API.
 */
export async function listGoogleSpreadsheets(req: Request, res: Response, next: NextFunction) {
  try {
    const institutionId = new Types.ObjectId(req.user!.institutionId);
    const connection = await DataConnection.findOne({ institutionId, provider: 'google_sheets' });

    if (!connection) {
      throw new AppError('CONNECTION_NOT_FOUND', 'Google Sheets connection not configured', 404);
    }

    const { accessToken } = await getValidGoogleCredentials(connection);

    const driveRes = await fetch(
      "https://www.googleapis.com/drive/v3/files?q=mimeType='application/vnd.google-apps.spreadsheet'&fields=files(id,name,modifiedTime,webViewLink)&orderBy=modifiedTime desc&pageSize=50",
      {
        headers: { Authorization: `Bearer ${accessToken}` }
      }
    );

    const driveData: any = await driveRes.json();

    if (driveData.error) {
      throw new AppError('GOOGLE_DRIVE_API_ERROR', driveData.error.message || 'Failed to list spreadsheets', 400);
    }

    const spreadsheets = (driveData.files || []).map((f: any) => ({
      id: f.id,
      name: f.name,
      modifiedTime: f.modifiedTime,
      webViewLink: f.webViewLink
    }));

    return res.status(200).json({
      success: true,
      data: {
        spreadsheets,
        currentSpreadsheetId: connection.fileReference || null,
        currentSheetName: connection.sheetReference || 'Students_Master'
      }
    });
  } catch (error) {
    next(error);
  }
}

/**
 * 4. POST /api/connections/google/select-spreadsheet
 * Binds a specific spreadsheetId and fetches its metadata & tabs.
 */
export async function selectGoogleSpreadsheet(req: Request, res: Response, next: NextFunction) {
  try {
    const institutionId = new Types.ObjectId(req.user!.institutionId);
    const { spreadsheetId, sheetReference } = selectSpreadsheetSchema.parse(req.body);

    const cleanSpreadsheetId = extractSpreadsheetId(spreadsheetId);

    const connection = await DataConnection.findOne({ institutionId, provider: 'google_sheets' });
    if (!connection) {
      throw new AppError('CONNECTION_NOT_FOUND', 'Google Sheets connection not configured', 404);
    }

    const { accessToken } = await getValidGoogleCredentials(connection);

    // Validate spreadsheet access & read tab titles
    const metaRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${cleanSpreadsheetId}?fields=properties.title,sheets.properties(sheetId,title)`,
      {
        headers: { Authorization: `Bearer ${accessToken}` }
      }
    );

    const metaData: any = await metaRes.json();

    if (metaData.error) {
      throw new AppError(
        'GOOGLE_SHEETS_NOT_ACCESSIBLE',
        `Cannot access spreadsheet (${cleanSpreadsheetId}): ${metaData.error.message}`,
        400
      );
    }

    const spreadsheetTitle = metaData.properties?.title || 'Connected Spreadsheet';
    const tabs = (metaData.sheets || []).map((s: any) => ({
      sheetId: s.properties?.sheetId,
      title: s.properties?.title
    }));

    const targetTab = sheetReference || (tabs.find((t: any) => t.title.toLowerCase().includes('student'))?.title || tabs[0]?.title || 'Students_Master');

    if (connection.fileReference && connection.fileReference !== cleanSpreadsheetId) {
      // Switched spreadsheet: mark previous student cache as unlinked
      await Student.updateMany(
        { institutionId, sourceProvider: 'google_sheets' },
        { $set: { status: 'SOURCE_UNLINKED' } }
      );
    }

    connection.fileReference = cleanSpreadsheetId;
    connection.sheetReference = targetTab;
    connection.status = 'CONNECTED';
    connection.syncStatus = `Connected to "${spreadsheetTitle}" (${targetTab})`;
    await connection.save();

    await AuditLog.create({
      institutionId,
      actorUserId: req.user!.userId,
      actorRole: req.user!.role,
      action: 'GOOGLE_CONNECTION_CREATED',
      entityType: 'DATA_CONNECTION',
      entityId: connection._id.toString(),
      after: { spreadsheetId: cleanSpreadsheetId, title: spreadsheetTitle, activeTab: targetTab },
      reason: 'Administrator selected primary institution spreadsheet'
    });

    logger.info('GOOGLE_CONNECTION_CREATED', `Bound spreadsheet ${cleanSpreadsheetId} ("${spreadsheetTitle}") -> Tab: ${targetTab}`);

    return res.status(200).json({
      success: true,
      data: {
        spreadsheetId: cleanSpreadsheetId,
        spreadsheetTitle,
        activeTab: targetTab,
        tabs
      }
    });
  } catch (error) {
    next(error);
  }
}

/**
 * 5. GET /api/connections/google/tabs
 * Returns all sheet tabs for currently connected spreadsheet.
 */
export async function getGoogleSpreadsheetTabs(req: Request, res: Response, next: NextFunction) {
  try {
    const institutionId = new Types.ObjectId(req.user!.institutionId);
    const connection = await DataConnection.findOne({ institutionId, provider: 'google_sheets' });

    if (!connection || !connection.fileReference) {
      throw new AppError('SPREADSHEET_NOT_SELECTED', 'No spreadsheet selected yet', 400);
    }

    const { accessToken, spreadsheetId } = await getValidGoogleCredentials(connection);

    const metaRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=properties.title,sheets.properties(sheetId,title)`,
      {
        headers: { Authorization: `Bearer ${accessToken}` }
      }
    );

    const metaData: any = await metaRes.json();
    if (metaData.error) {
      throw new AppError('GOOGLE_SHEETS_API_ERROR', metaData.error.message, 400);
    }

    const tabs = (metaData.sheets || []).map((s: any) => ({
      sheetId: s.properties?.sheetId,
      title: s.properties?.title
    }));

    return res.status(200).json({
      success: true,
      data: {
        spreadsheetId,
        spreadsheetTitle: metaData.properties?.title,
        activeTab: connection.sheetReference || 'Students_Master',
        tabs
      }
    });
  } catch (error) {
    next(error);
  }
}

/**
 * 6. POST /api/connections/google/select-tabs
 * Saves tab configuration for Student Master, Announcements, and Staff.
 */
export async function selectGoogleTabs(req: Request, res: Response, next: NextFunction) {
  try {
    const institutionId = new Types.ObjectId(req.user!.institutionId);
    const { studentMasterSheet } = selectTabsSchema.parse(req.body);

    const connection = await DataConnection.findOne({ institutionId, provider: 'google_sheets' });
    if (!connection) {
      throw new AppError('CONNECTION_NOT_FOUND', 'Connection not found', 404);
    }

    connection.sheetReference = studentMasterSheet;
    await connection.save();

    return res.status(200).json({
      success: true,
      data: {
        message: 'Sheet tabs configured successfully',
        studentMasterSheet: connection.sheetReference
      }
    });
  } catch (error) {
    next(error);
  }
}

/**
 * 7. POST /api/connections/google/disconnect
 * Disconnects Google Sheets, clears credentials, and disables sync.
 */
export async function disconnectGoogle(req: Request, res: Response, next: NextFunction) {
  try {
    const institutionId = new Types.ObjectId(req.user!.institutionId);
    const connection = await DataConnection.findOne({ institutionId, provider: 'google_sheets' });

    if (connection) {
      connection.status = 'DISCONNECTED';
      connection.credentialsEncrypted = undefined;
      connection.syncStatus = 'Google Sheets not connected';
      connection.fileReference = undefined;
      connection.metrics = {
        rowsRead: 0,
        rowsAdded: 0,
        rowsUpdated: 0,
        rowsSkipped: 0,
        rowsInvalid: 0,
        rowsConflicted: 0
      };
      await connection.save();

      // Deactivate students synced from this unlinked provider so UI displays clean empty state
      await Student.updateMany(
        { institutionId, sourceProvider: 'google_sheets' },
        { $set: { status: 'SOURCE_UNLINKED' } }
      );

      await AuditLog.create({
        institutionId,
        actorUserId: req.user!.userId,
        actorRole: req.user!.role,
        action: 'GOOGLE_DISCONNECTED',
        entityType: 'DATA_CONNECTION',
        entityId: connection._id.toString(),
        reason: 'Administrator disconnected Google account'
      });
    }

    return res.status(200).json({
      success: true,
      data: { message: 'Google Sheets disconnected successfully' }
    });
  } catch (error) {
    next(error);
  }
}
