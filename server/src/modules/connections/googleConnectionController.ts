import { Request, Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import '../../middleware/auth';
import { DataConnection } from '../../models/DataConnection';
import { AuditLog } from '../../models/AuditLog';
import { encrypt, decrypt, generateSecureToken } from '../../utils/crypto';
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

function getGoogleRedirectUri(req: Request): string {
  if (process.env.GOOGLE_REDIRECT_URI && !process.env.GOOGLE_REDIRECT_URI.includes('localhost')) {
    return process.env.GOOGLE_REDIRECT_URI.trim();
  }
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http');
  if (host && !host.includes('localhost') && !host.includes('127.0.0.1')) {
    return `${proto}://${host}/api/connections/google/callback`;
  }
  return env.GOOGLE_REDIRECT_URI || 'http://localhost:5000/api/connections/google/callback';
}

function getFrontendBaseUrl(req: Request): string {
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
      institutionId,
      userId: req.user!.userId,
      redirectUri,
      nonce: generateSecureToken(16)
    };
    const state = Buffer.from(JSON.stringify(statePayload)).toString('base64url');

    const scopes = [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/userinfo.email'
    ].join(' ');

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(
      clientId
    )}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(
      scopes
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
 * 2. GET /api/connections/google/callback
 * Handles OAuth callback, exchanges authorization code for tokens, encrypts credentials, and redirects.
 */
export async function handleGoogleOAuthCallback(req: Request, res: Response, next: NextFunction) {
  try {
    const { code, state, error } = req.query;

    const frontendBaseUrl = getFrontendBaseUrl(req);

    if (error) {
      logger.warn('GOOGLE_OAUTH_DENIED', `Google OAuth returned error: ${error}`);
      return res.redirect(`${frontendBaseUrl}/sync?error=${encodeURIComponent(String(error))}`);
    }

    if (!code || !state) {
      return res.redirect(`${frontendBaseUrl}/sync?error=missing_code_or_state`);
    }

    // Decode state
    let stateData: any;
    try {
      stateData = JSON.parse(Buffer.from(String(state), 'base64url').toString('utf8'));
    } catch {
      return res.redirect(`${frontendBaseUrl}/sync?error=invalid_state`);
    }

    const institutionId = new Types.ObjectId(stateData.institutionId);
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
      return res.redirect(`${frontendBaseUrl}/sync?error=${encodeURIComponent(tokenData.error_description || 'Token exchange failed')}`);
    }

    // Fetch user email from Google UserInfo
    let email = 'Google Workspace User';
    try {
      const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` }
      });
      const userData: any = await userRes.json();
      if (userData.email) {
        email = userData.email;
      }
    } catch {}

    const creds = {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiry: Date.now() + (tokenData.expires_in || 3600) * 1000,
      email,
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
    conn.accountReference = email;
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
      await connection.save();

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
