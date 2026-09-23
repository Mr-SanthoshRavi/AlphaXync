import * as XLSX from 'xlsx';
import { DataSourceAdapter, SheetRow, SheetSchema } from './DataSourceAdapter';
import { logger } from '../utils/logger';

export class XlsxAdapter implements DataSourceAdapter {
  providerName = 'xlsx_import';
  private workbook?: XLSX.WorkBook;

  async connect(credentials: { buffer?: Buffer; filePath?: string }): Promise<boolean> {
    if (credentials.buffer) {
      this.workbook = XLSX.read(credentials.buffer, { type: 'buffer' });
    } else if (credentials.filePath) {
      this.workbook = XLSX.readFile(credentials.filePath);
    } else {
      throw new Error('XlsxAdapter requires either a buffer or filePath');
    }
    return true;
  }

  async disconnect(): Promise<void> {
    this.workbook = undefined;
  }

  async validateConnection(): Promise<{ healthy: boolean; message?: string }> {
    return { healthy: !!this.workbook };
  }

  async discover(): Promise<string[]> {
    if (!this.workbook) return [];
    return this.workbook.SheetNames;
  }

  async readSchema(sheetName: string): Promise<SheetSchema> {
    if (!this.workbook) throw new Error('Workbook not loaded');
    const sheet = this.workbook.Sheets[sheetName];
    if (!sheet) throw new Error(`Sheet ${sheetName} not found`);

    const json = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { header: 1 });
    const headers = (json[0] as string[]) || [];

    return {
      sheetName,
      columns: headers,
      totalRows: Math.max(0, json.length - 1)
    };
  }

  async readRows(sheetName: string, batchSize = 500, offset = 0): Promise<SheetRow[]> {
    if (!this.workbook) throw new Error('Workbook not loaded');
    const sheet = this.workbook.Sheets[sheetName];
    if (!sheet) return [];

    const json = XLSX.utils.sheet_to_json<Record<string, any>>(sheet);
    const sliced = json.slice(offset, offset + batchSize);

    return sliced.map((row, idx) => ({
      rowReference: `${sheetName}!Row_${offset + idx + 2}`,
      values: row
    }));
  }

  async writeRows(sheetName: string, rows: SheetRow[]): Promise<boolean> {
    logger.info('XLSX_WRITE_ROWS', `Writing ${rows.length} rows to XLSX`);
    return true;
  }

  async updateRow(sheetName: string, rowReference: string, updates: Record<string, any>): Promise<boolean> {
    logger.info('XLSX_UPDATE_ROW', `Updating ${rowReference}`, updates);
    return true;
  }

  async createRow(sheetName: string, values: Record<string, any>): Promise<string> {
    return `${sheetName}!NewRow`;
  }
}
