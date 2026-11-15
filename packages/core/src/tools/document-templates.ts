/** Spreadsheet and CSV content shapes (document_manage). The old flat
 *  document templates that lived here were retired on 15 Nov 2026 — prose
 *  documents and their templates belong to document_author. */

export interface SpreadsheetContent {
  sheets: SpreadsheetSheet[];
}

export interface SpreadsheetSheet {
  name: string;
  headers: string[];
  rows: (string | number)[][];
}

/** CSV content structure. */
export interface CsvContent {
  headers: string[];
  rows: string[][];
}
