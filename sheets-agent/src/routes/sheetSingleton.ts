/**
 * Spreadsheet ID singleton — stores and exposes the active Google Sheet ID.
 */

let SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID || ""

export function getSpreadsheetId(): string {
  return SPREADSHEET_ID
}

export function setSpreadsheetId(id: string): void {
  SPREADSHEET_ID = id
}
