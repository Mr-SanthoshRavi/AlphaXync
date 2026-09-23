import { DataSourceAdapter, SheetRow, SheetSchema } from './DataSourceAdapter';
import { logger } from '../utils/logger';

export class MockGoogleSheetsAdapter implements DataSourceAdapter {
  providerName = 'google_sheets_mock';
  private connected = false;
  private sheets: Record<string, SheetRow[]> = {};
  private columns = [
    'Register No',
    'Student Name',
    'Parent Name',
    'Parent Mobile',
    'Course',
    'Department',
    'Year',
    'Section',
    'Total Fee',
    'Paid Amount',
    'Balance',
    'Due Date',
    'Fine Amount',
    'Payment Status'
  ];

  constructor() {
    this.seedMockData();
  }

  private seedMockData() {
    const firstNames = ['Arun', 'Kavitha', 'Vijay', 'Priya', 'Deepak', 'Ananya', 'Suresh', 'Meena', 'Karthik', 'Divya'];
    const lastNames = ['Kumar', 'Rajan', 'Chandran', 'Sundaram', 'Natarajan', 'Subramanian', 'Balaji', 'Iyer', 'Menon', 'Venkatesh'];
    const courses = ['B.Tech Computer Science', 'B.Tech Information Tech', 'B.Tech Mechanical', 'BCA', 'MCA'];
    
    const rows: SheetRow[] = [];

    // Seed 50 students with varied payment & phone conditions
    for (let i = 1; i <= 50; i++) {
      const regNo = `ST2026-${1000 + i}`;
      const fName = firstNames[(i - 1) % firstNames.length];
      const lName = lastNames[Math.floor((i - 1) / 5) % lastNames.length];
      const name = `${fName} ${lName}`;
      const parentName = `${lastNames[(i + 2) % lastNames.length]} ${fName[0]}.`;

      // Conditions:
      // Rows 1-35: Valid WhatsApp
      // Rows 36-38: Missing WhatsApp
      // Rows 39-40: Invalid WhatsApp format
      let mobile = `+9198765${(10000 + i).toString().slice(0, 5)}`;
      if (i >= 36 && i <= 38) {
        mobile = ''; // Missing
      } else if (i === 39) {
        mobile = '9876'; // Too short
      } else if (i === 40) {
        mobile = 'abcd12345'; // Not a phone
      }

      // Financial status distribution
      let totalFee = 50000;
      let paidAmount = 0;
      let balance = 50000;
      let status = 'PENDING';
      let fine = 0;

      if (i % 5 === 0) {
        // Fully Paid
        paidAmount = 50000;
        balance = 0;
        status = 'PAID';
      } else if (i % 3 === 0) {
        // Partial
        paidAmount = 25000;
        balance = 25000;
        status = 'PARTIAL';
      } else if (i % 7 === 0) {
        // Overdue with fine
        paidAmount = 0;
        balance = 50000;
        status = 'OVERDUE';
        fine = 500;
      }

      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + (i % 4 === 0 ? -5 : 15)); // Some past, some future

      rows.push({
        rowReference: `Students_Master!A${i + 1}:N${i + 1}`,
        values: {
          'Register No': regNo,
          'Student Name': name,
          'Parent Name': parentName,
          'Parent Mobile': mobile,
          'Course': courses[i % courses.length],
          'Department': courses[i % courses.length].includes('Tech') ? 'Engineering' : 'Computer Applications',
          'Year': `${(i % 4) + 1}`,
          'Section': i % 2 === 0 ? 'A' : 'B',
          'Total Fee': totalFee,
          'Paid Amount': paidAmount,
          'Balance': balance,
          'Due Date': dueDate.toISOString().split('T')[0],
          'Fine Amount': fine,
          'Payment Status': status
        }
      });
    }

    this.sheets['Students_Master'] = rows;
  }

  async connect(credentials: Record<string, any>): Promise<boolean> {
    this.connected = true;
    logger.info('MOCK_SHEETS_CONNECTED', 'Connected to Mock Google Sheets Adapter');
    return true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  async validateConnection(): Promise<{ healthy: boolean; message?: string }> {
    return { healthy: true, message: 'Mock Google Sheets connected and healthy' };
  }

  async discover(): Promise<string[]> {
    return Object.keys(this.sheets);
  }

  async readSchema(sheetOrTableName: string): Promise<SheetSchema> {
    const rows = this.sheets[sheetOrTableName] || [];
    return {
      sheetName: sheetOrTableName,
      columns: this.columns,
      totalRows: rows.length
    };
  }

  async readRows(sheetOrTableName: string, batchSize = 100, offset = 0): Promise<SheetRow[]> {
    const rows = this.sheets[sheetOrTableName] || [];
    return rows.slice(offset, offset + batchSize);
  }

  async writeRows(sheetOrTableName: string, rows: SheetRow[]): Promise<boolean> {
    if (!this.sheets[sheetOrTableName]) {
      this.sheets[sheetOrTableName] = [];
    }
    this.sheets[sheetOrTableName].push(...rows);
    return true;
  }

  async updateRow(sheetOrTableName: string, rowReference: string, updates: Record<string, any>): Promise<boolean> {
    const rows = this.sheets[sheetOrTableName];
    if (!rows) return false;

    const target = rows.find((r) => r.rowReference === rowReference);
    if (target) {
      Object.assign(target.values, updates);
      logger.info('MOCK_SHEET_ROW_UPDATED', `Updated ${rowReference}`, updates);
      return true;
    }
    return false;
  }

  async createRow(sheetOrTableName: string, values: Record<string, any>): Promise<string> {
    const rows = this.sheets[sheetOrTableName] || [];
    const newRef = `${sheetOrTableName}!A${rows.length + 2}:N${rows.length + 2}`;
    rows.push({ rowReference: newRef, values });
    this.sheets[sheetOrTableName] = rows;
    return newRef;
  }

  // Test helper: directly manipulate sheet cell to simulate external changes (for conflict testing)
  setCellDirectly(sheetName: string, regNo: string, field: string, value: any) {
    const row = this.sheets[sheetName]?.find((r) => r.values['Register No'] === regNo);
    if (row) {
      row.values[field] = value;
    }
  }
}
