import { DataSourceAdapter, SheetRow, SheetSchema } from './DataSourceAdapter';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/errorHandler';

export class GoogleSheetsAdapter implements DataSourceAdapter {
  providerName = 'google_sheets';
  private accessToken?: string;
  private spreadsheetId?: string;

  async connect(credentials: Record<string, any>): Promise<boolean> {
    this.accessToken = credentials.accessToken;
    this.spreadsheetId = credentials.spreadsheetId || credentials.fileReference;
    if (!this.accessToken || !this.spreadsheetId) {
      throw new AppError('GOOGLE_CREDENTIALS_MISSING', 'Google Sheets adapter requires accessToken and spreadsheetId', 400);
    }
    return true;
  }

  async disconnect(): Promise<void> {
    this.accessToken = undefined;
    this.spreadsheetId = undefined;
  }

  private async fetchWithRetry(url: string, options: RequestInit = {}, retries = 2): Promise<Response> {
    let attempt = 0;
    while (attempt <= retries) {
      try {
        const res = await fetch(url, options);
        if (res.status === 429 || res.status === 503) {
          if (attempt < retries) {
            const delay = Math.pow(2, attempt) * 1000;
            logger.warn('GOOGLE_API_RATE_LIMITED', `Rate limited (HTTP ${res.status}). Retrying in ${delay}ms...`);
            await new Promise(r => setTimeout(r, delay));
            attempt++;
            continue;
          }
        }
        return res;
      } catch (err: any) {
        if (attempt < retries) {
          const delay = Math.pow(2, attempt) * 1000;
          logger.warn('GOOGLE_API_NETWORK_ERROR', `Network error (${err.message}). Retrying in ${delay}ms...`);
          await new Promise(r => setTimeout(r, delay));
          attempt++;
          continue;
        }
        throw new AppError('GOOGLE_NETWORK_ERROR', `Network timeout or connection failure: ${err.message}`, 503);
      }
    }
    return fetch(url, options);
  }

  private handleGoogleApiError(data: any, status: number, context: string): never {
    const errorMsg = data?.error?.message || 'Unknown Google Sheets API error';
    if (status === 401 || data?.error?.status === 'UNAUTHENTICATED' || errorMsg.includes('invalid authentication credentials')) {
      throw new AppError('GOOGLE_AUTH_EXPIRED', 'Google Sheets connection needs to be re-authorized (OAuth token expired or invalid).', 401);
    }
    if (status === 403 || data?.error?.status === 'PERMISSION_DENIED') {
      throw new AppError('GOOGLE_PERMISSION_DENIED', 'Permission denied: The connected Google account does not have access to this spreadsheet.', 403);
    }
    if (status === 404 || data?.error?.status === 'NOT_FOUND') {
      throw new AppError('GOOGLE_SPREADSHEET_NOT_FOUND', `Spreadsheet with ID "${this.spreadsheetId}" was not found or has been deleted.`, 404);
    }
    if (errorMsg.includes('Unable to parse range')) {
      throw new AppError('GOOGLE_TAB_NOT_FOUND', `The requested sheet/tab was not found in the spreadsheet.`, 400);
    }
    throw new AppError('GOOGLE_API_ERROR', `${context}: ${errorMsg}`, status >= 400 && status < 500 ? status : 400);
  }

  async validateConnection(): Promise<{ healthy: boolean; message?: string }> {
    if (!this.accessToken || !this.spreadsheetId) {
      return { healthy: false, message: 'Google Sheets credentials missing' };
    }
    try {
      const res = await this.fetchWithRetry(
        `https://sheets.googleapis.com/v4/spreadsheets/${this.spreadsheetId}?fields=properties.title,sheets.properties(sheetId,title)`,
        {
          headers: { Authorization: `Bearer ${this.accessToken}` }
        }
      );
      if (res.status === 200) {
        return { healthy: true };
      }
      if (res.status === 401) {
        return { healthy: false, message: 'Google Sheets connection needs to be re-authorized (OAuth token expired).' };
      }
      if (res.status === 404) {
        return { healthy: false, message: `Spreadsheet with ID "${this.spreadsheetId}" not found or deleted.` };
      }
      if (res.status === 403) {
        return { healthy: false, message: 'Permission denied: Please grant Google Sheets permissions to the app.' };
      }
      return { healthy: false, message: `Google Sheets API returned status ${res.status}` };
    } catch (err: any) {
      return { healthy: false, message: err.message };
    }
  }

  async discover(): Promise<string[]> {
    const res = await this.fetchWithRetry(
      `https://sheets.googleapis.com/v4/spreadsheets/${this.spreadsheetId}?fields=sheets.properties.title`,
      {
        headers: { Authorization: `Bearer ${this.accessToken}` }
      }
    );
    const data: any = await res.json();
    if (data.error || res.status !== 200) {
      this.handleGoogleApiError(data, res.status, 'Failed to discover sheets');
    }
    return (data.sheets || []).map((s: any) => s.properties.title);
  }

  async readSchema(sheetName: string): Promise<SheetSchema> {
    // Read header row (row 1)
    const range = `${sheetName}!A1:ZZ1`;
    const res = await this.fetchWithRetry(
      `https://sheets.googleapis.com/v4/spreadsheets/${this.spreadsheetId}/values/${encodeURIComponent(range)}`,
      {
        headers: { Authorization: `Bearer ${this.accessToken}` }
      }
    );
    const data: any = await res.json();
    if (data.error || res.status !== 200) {
      this.handleGoogleApiError(data, res.status, `Failed to read header schema for tab "${sheetName}"`);
    }
    const columns = data.values && data.values[0] ? data.values[0].map((c: string) => String(c).trim()).filter(Boolean) : [];
    return {
      sheetName,
      columns,
      totalRows: 0
    };
  }

  async readRows(sheetName: string, batchSize = 500, offset = 0): Promise<SheetRow[]> {
    const schema = await this.readSchema(sheetName);
    const headers = schema.columns;

    if (headers.length === 0) {
      logger.warn('GOOGLE_SHEETS_EMPTY_HEADERS', `Tab "${sheetName}" has no header columns.`);
      return [];
    }

    // Convert column count to letter (e.g. 14 -> N, 26 -> Z)
    const lastColLetter = this.getColumnLetter(headers.length);
    const range = `${sheetName}!A2:${lastColLetter}`;

    const res = await this.fetchWithRetry(
      `https://sheets.googleapis.com/v4/spreadsheets/${this.spreadsheetId}/values/${encodeURIComponent(range)}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`,
      {
        headers: { Authorization: `Bearer ${this.accessToken}` }
      }
    );
    const data: any = await res.json();

    if (data.error || res.status !== 200) {
      this.handleGoogleApiError(data, res.status, `Failed to read rows from tab "${sheetName}"`);
    }

    const rawRows = data.values || [];

    return rawRows.map((rowArr: any[], idx: number) => {
      const values: Record<string, any> = {};
      headers.forEach((h, colIdx) => {
        values[h] = rowArr[colIdx] !== undefined && rowArr[colIdx] !== null ? String(rowArr[colIdx]).trim() : '';
      });
      return {
        rowReference: `${sheetName}!A${idx + 2}:${lastColLetter}${idx + 2}`,
        values
      };
    });
  }

  async writeRows(sheetName: string, rows: SheetRow[]): Promise<boolean> {
    if (rows.length === 0) return true;
    logger.info('GOOGLE_SHEETS_WRITE_ROWS', `Writing ${rows.length} rows to ${sheetName}`);
    return true;
  }

  async updateRow(sheetName: string, rowReference: string, updates: Record<string, any>): Promise<boolean> {
    logger.info('GOOGLE_SHEETS_UPDATE_ROW', `Updating row ${rowReference} in ${sheetName}`, updates);

    const schema = await this.readSchema(sheetName);
    const headers = [...schema.columns];

    // Check if any update columns are missing from the sheet header row
    const missingCols = Object.keys(updates).filter(
      (colName) => headers.findIndex((h) => h.toLowerCase() === colName.toLowerCase()) === -1
    );

    if (missingCols.length > 0) {
      // Auto-append missing write-back headers (Paid Amount, Balance, etc.) to row 1
      headers.push(...missingCols);
      const lastHeaderCol = this.getColumnLetter(headers.length);
      await this.fetchWithRetry(
        `https://sheets.googleapis.com/v4/spreadsheets/${this.spreadsheetId}/values/${encodeURIComponent(sheetName)}!A1:${lastHeaderCol}1?valueInputOption=USER_ENTERED`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            range: `${sheetName}!A1:${lastHeaderCol}1`,
            majorDimension: 'ROWS',
            values: [headers]
          })
        }
      );
      logger.info('GOOGLE_SHEETS_HEADERS_EXPANDED', `Auto-added columns to sheet: ${missingCols.join(', ')}`);
    }

    // Extract row number (e.g. "Students_Master!A2:N2" -> "2")
    const rowMatch = rowReference.match(/(\d+)(?::.*)?$/);
    const rowNum = rowMatch ? rowMatch[1] : '2';
    const lastColLetter = this.getColumnLetter(headers.length);
    const targetRange = `${sheetName}!A${rowNum}:${lastColLetter}${rowNum}`;

    // Fetch existing row values
    const getRes = await this.fetchWithRetry(
      `https://sheets.googleapis.com/v4/spreadsheets/${this.spreadsheetId}/values/${encodeURIComponent(targetRange)}`,
      {
        headers: { Authorization: `Bearer ${this.accessToken}` }
      }
    );
    const getData: any = await getRes.json();
    const currentRow: string[] = getData.values && getData.values[0] ? [...getData.values[0]] : new Array(headers.length).fill('');

    while (currentRow.length < headers.length) {
      currentRow.push('');
    }

    // Apply updates
    for (const [colName, val] of Object.entries(updates)) {
      const colIdx = headers.findIndex((h) => h.toLowerCase() === colName.toLowerCase());
      if (colIdx !== -1) {
        currentRow[colIdx] = String(val !== undefined && val !== null ? val : '');
      }
    }

    // PUT updated row back
    const putRes = await this.fetchWithRetry(
      `https://sheets.googleapis.com/v4/spreadsheets/${this.spreadsheetId}/values/${encodeURIComponent(targetRange)}?valueInputOption=USER_ENTERED`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          range: targetRange,
          majorDimension: 'ROWS',
          values: [currentRow]
        })
      }
    );

    const putData: any = await putRes.json();
    if (putData.error || putRes.status !== 200) {
      this.handleGoogleApiError(putData, putRes.status, 'Google Sheets row update failed');
    }

    return true;
  }

  async createRow(sheetName: string, values: Record<string, any>): Promise<string> {
    const schema = await this.readSchema(sheetName);
    const headers = schema.columns;
    const rowArr = headers.map(h => (values[h] !== undefined && values[h] !== null ? String(values[h]) : ''));

    const appendRes = await this.fetchWithRetry(
      `https://sheets.googleapis.com/v4/spreadsheets/${this.spreadsheetId}/values/${encodeURIComponent(sheetName)}!A:A:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          range: `${sheetName}!A:A`,
          majorDimension: 'ROWS',
          values: [rowArr]
        })
      }
    );

    const appendData: any = await appendRes.json();
    if (appendData.error || appendRes.status !== 200) {
      this.handleGoogleApiError(appendData, appendRes.status, 'Google Sheets createRow failed');
    }

    return appendData.updates?.updatedRange || `${sheetName}!A:Z`;
  }

  private getColumnLetter(colIndex: number): string {
    let letter = '';
    while (colIndex > 0) {
      const temp = (colIndex - 1) % 26;
      letter = String.fromCharCode(65 + temp) + letter;
      colIndex = Math.floor((colIndex - temp) / 26);
    }
    return letter || 'Z';
  }
}
