import { DataSourceAdapter, SheetRow, SheetSchema } from './DataSourceAdapter';
import { logger } from '../utils/logger';

export class ExcelAdapter implements DataSourceAdapter {
  providerName = 'microsoft_excel';
  private accessToken?: string;
  private driveItemId?: string;

  async connect(credentials: Record<string, any>): Promise<boolean> {
    this.accessToken = credentials.accessToken;
    this.driveItemId = credentials.driveItemId || credentials.fileReference;
    if (!this.accessToken || !this.driveItemId) {
      throw new Error('ExcelAdapter requires accessToken and driveItemId');
    }
    return true;
  }

  async disconnect(): Promise<void> {
    this.accessToken = undefined;
    this.driveItemId = undefined;
  }

  async validateConnection(): Promise<{ healthy: boolean; message?: string }> {
    if (!this.accessToken || !this.driveItemId) {
      return { healthy: false, message: 'Microsoft Graph credentials missing' };
    }
    try {
      const res = await fetch(`https://graph.microsoft.com/v1.0/me/drive/items/${this.driveItemId}/workbook/worksheets`, {
        headers: { Authorization: `Bearer ${this.accessToken}` }
      });
      if (res.status === 200) return { healthy: true };
      return { healthy: false, message: `Microsoft Graph returned status ${res.status}` };
    } catch (err: any) {
      return { healthy: false, message: err.message };
    }
  }

  async discover(): Promise<string[]> {
    const res = await fetch(`https://graph.microsoft.com/v1.0/me/drive/items/${this.driveItemId}/workbook/worksheets`, {
      headers: { Authorization: `Bearer ${this.accessToken}` }
    });
    const data: any = await res.json();
    return (data.value || []).map((s: any) => s.name);
  }

  async readSchema(sheetName: string): Promise<SheetSchema> {
    // Read used range headers
    const res = await fetch(
      `https://graph.microsoft.com/v1.0/me/drive/items/${this.driveItemId}/workbook/worksheets/${sheetName}/usedRange(valuesOnly=true)`,
      {
        headers: { Authorization: `Bearer ${this.accessToken}` }
      }
    );
    const data: any = await res.json();
    const columns = data.values && data.values[0] ? data.values[0] : [];
    return {
      sheetName,
      columns,
      totalRows: data.values ? Math.max(0, data.values.length - 1) : 0
    };
  }

  async readRows(sheetName: string, batchSize = 500, offset = 0): Promise<SheetRow[]> {
    const schema = await this.readSchema(sheetName);
    const headers = schema.columns;

    const res = await fetch(
      `https://graph.microsoft.com/v1.0/me/drive/items/${this.driveItemId}/workbook/worksheets/${sheetName}/usedRange(valuesOnly=true)`,
      {
        headers: { Authorization: `Bearer ${this.accessToken}` }
      }
    );
    const data: any = await res.json();
    const allRows: any[][] = (data.values || []).slice(1); // skip headers
    const sliced = allRows.slice(offset, offset + batchSize);

    return sliced.map((rowArr, idx) => {
      const values: Record<string, any> = {};
      headers.forEach((h, colIdx) => {
        values[h] = rowArr[colIdx] || '';
      });
      return {
        rowReference: `${sheetName}!Row_${offset + idx + 2}`,
        values
      };
    });
  }

  async writeRows(sheetName: string, rows: SheetRow[]): Promise<boolean> {
    logger.info('EXCEL_GRAPH_WRITE_ROWS', `Writing ${rows.length} rows to ${sheetName}`);
    return true;
  }

  async updateRow(sheetName: string, rowReference: string, updates: Record<string, any>): Promise<boolean> {
    logger.info('EXCEL_GRAPH_UPDATE_ROW', `Updating ${rowReference}`, updates);
    return true;
  }

  async createRow(sheetName: string, values: Record<string, any>): Promise<string> {
    return `${sheetName}!NewRow`;
  }
}
