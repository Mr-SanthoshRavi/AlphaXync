export interface SheetRow {
  rowReference: string; // e.g. "Sheet1!A2:H2" or row index
  values: Record<string, any>;
}

export interface SheetSchema {
  sheetName: string;
  columns: string[];
  totalRows: number;
}

export interface SyncMetrics {
  rowsRead: number;
  rowsAdded: number;
  rowsUpdated: number;
  rowsSkipped: number;
  rowsInvalid: number;
  rowsConflicted: number;
  rowsDeletedDetected: number;
}

export interface DataSourceAdapter {
  providerName: string;
  connect(credentials: Record<string, any>): Promise<boolean>;
  disconnect(): Promise<void>;
  validateConnection(): Promise<{ healthy: boolean; message?: string }>;
  discover(): Promise<string[]>; // list of sheet/table names
  readSchema(sheetOrTableName: string): Promise<SheetSchema>;
  readRows(sheetOrTableName: string, batchSize?: number, offset?: number): Promise<SheetRow[]>;
  writeRows(sheetOrTableName: string, rows: SheetRow[]): Promise<boolean>;
  updateRow(sheetOrTableName: string, rowReference: string, updates: Record<string, any>): Promise<boolean>;
  createRow(sheetOrTableName: string, values: Record<string, any>): Promise<string>;
}
