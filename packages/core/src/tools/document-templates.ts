import { todayLocal } from '../core/dates.js';
/** Format-agnostic document content structure. */
export interface DocumentContent {
  title?: string;
  sections: DocumentSection[];
}

export interface DocumentSection {
  heading?: string;
  text?: string;
  list?: string[];
  table?: { headers: string[]; rows: string[][] };
}

/** Spreadsheet content structure. */
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

// ── Templates ────────────────────────────────────────────────────────────────

export const TEMPLATES = ['proposal', 'report', 'invoice', 'letter', 'meeting_notes', 'resume'] as const;
export type TemplateName = typeof TEMPLATES[number];

export function getTemplate(name: TemplateName, data?: Record<string, unknown>): DocumentContent {
  switch (name) {
    case 'proposal': return proposalTemplate(data);
    case 'report': return reportTemplate(data);
    case 'invoice': return invoiceTemplate(data);
    case 'letter': return letterTemplate(data);
    case 'meeting_notes': return meetingNotesTemplate(data);
    case 'resume': return resumeTemplate(data);
  }
}

function proposalTemplate(data?: Record<string, unknown>): DocumentContent {
  const title = String(data?.title ?? 'Project Proposal');
  const author = String(data?.author ?? '');
  const date = String(data?.date ?? todayLocal());
  return {
    title,
    sections: [
      { heading: 'Executive Summary', text: String(data?.summary ?? 'Provide a brief overview of the project, its objectives, and expected outcomes.') },
      { heading: 'Project Details', text: `Author: ${author}\nDate: ${date}` },
      { heading: 'Objectives', list: (data?.objectives as string[]) ?? ['Define the primary goals of this project', 'Outline key deliverables', 'Establish success criteria'] },
      { heading: 'Timeline', table: { headers: ['Phase', 'Duration', 'Deliverables'], rows: (data?.timeline as string[][]) ?? [['Planning', '2 weeks', 'Requirements document'], ['Development', '6 weeks', 'Working prototype'], ['Testing', '2 weeks', 'Test results and fixes'], ['Launch', '1 week', 'Production deployment']] } },
      { heading: 'Budget', table: { headers: ['Item', 'Cost'], rows: (data?.budget as string[][]) ?? [['Development', 'TBD'], ['Infrastructure', 'TBD'], ['Testing', 'TBD'], ['Total', 'TBD']] } },
      { heading: 'Next Steps', list: ['Review and approve this proposal', 'Allocate resources', 'Begin Phase 1'] },
    ],
  };
}

function reportTemplate(data?: Record<string, unknown>): DocumentContent {
  const title = String(data?.title ?? 'Status Report');
  const date = String(data?.date ?? todayLocal());
  return {
    title,
    sections: [
      { heading: 'Report Details', text: `Date: ${date}\nPeriod: ${String(data?.period ?? 'This week')}` },
      { heading: 'Executive Summary', text: String(data?.summary ?? 'Provide a high-level summary of progress, key achievements, and any blockers.') },
      { heading: 'Progress', list: (data?.progress as string[]) ?? ['Completed item 1', 'Completed item 2', 'In progress: item 3'] },
      { heading: 'Issues & Risks', list: (data?.issues as string[]) ?? ['No critical issues at this time'] },
      { heading: 'Next Steps', list: (data?.nextSteps as string[]) ?? ['Continue development', 'Schedule review meeting'] },
    ],
  };
}

function invoiceTemplate(data?: Record<string, unknown>): DocumentContent {
  const invoiceNum = String(data?.invoiceNumber ?? 'INV-001');
  const date = String(data?.date ?? todayLocal());
  return {
    title: `Invoice ${invoiceNum}`,
    sections: [
      { heading: 'Invoice Details', text: `Invoice Number: ${invoiceNum}\nDate: ${date}\nDue Date: ${String(data?.dueDate ?? 'TBD')}` },
      { heading: 'From', text: String(data?.from ?? 'Your Company Name\nYour Address\nYour Email') },
      { heading: 'To', text: String(data?.to ?? 'Client Name\nClient Address\nClient Email') },
      { heading: 'Items', table: { headers: ['Description', 'Quantity', 'Unit Price', 'Total'], rows: (data?.items as string[][]) ?? [['Service 1', '1', '£0.00', '£0.00'], ['Service 2', '1', '£0.00', '£0.00']] } },
      { heading: 'Payment Terms', text: String(data?.terms ?? 'Payment due within 30 days of invoice date.\nBank transfer or PayPal accepted.') },
    ],
  };
}

function letterTemplate(data?: Record<string, unknown>): DocumentContent {
  const date = String(data?.date ?? todayLocal());
  return {
    title: String(data?.subject ?? 'Letter'),
    sections: [
      { text: date },
      { text: String(data?.recipient ?? 'Dear [Recipient Name],') },
      { text: String(data?.body ?? 'I am writing to...\n\nPlease do not hesitate to contact me if you have any questions.') },
      { text: String(data?.closing ?? 'Kind regards,\n\n[Your Name]') },
    ],
  };
}

function meetingNotesTemplate(data?: Record<string, unknown>): DocumentContent {
  const date = String(data?.date ?? todayLocal());
  return {
    title: String(data?.title ?? 'Meeting Notes'),
    sections: [
      { heading: 'Meeting Details', text: `Date: ${date}\nAttendees: ${String(data?.attendees ?? 'TBD')}\nLocation: ${String(data?.location ?? 'TBD')}` },
      { heading: 'Agenda', list: (data?.agenda as string[]) ?? ['Topic 1', 'Topic 2', 'Any other business'] },
      { heading: 'Discussion Notes', text: String(data?.notes ?? 'Key points discussed during the meeting.') },
      { heading: 'Action Items', table: { headers: ['Action', 'Owner', 'Due Date'], rows: (data?.actions as string[][]) ?? [['Action 1', 'TBD', 'TBD'], ['Action 2', 'TBD', 'TBD']] } },
      { heading: 'Next Meeting', text: String(data?.nextMeeting ?? 'Date and time TBD') },
    ],
  };
}

function resumeTemplate(data?: Record<string, unknown>): DocumentContent {
  return {
    title: String(data?.name ?? 'Your Name'),
    sections: [
      { heading: 'Contact', text: String(data?.contact ?? 'Email: your@email.com\nPhone: +44 000 000 0000\nLocation: City, Country') },
      { heading: 'Professional Summary', text: String(data?.summary ?? 'Experienced professional with expertise in...') },
      { heading: 'Experience', list: (data?.experience as string[]) ?? ['Job Title — Company (Year–Year)\n  Key achievements and responsibilities', 'Job Title — Company (Year–Year)\n  Key achievements and responsibilities'] },
      { heading: 'Education', list: (data?.education as string[]) ?? ['Degree — University (Year)', 'Certification — Provider (Year)'] },
      { heading: 'Skills', list: (data?.skills as string[]) ?? ['Skill 1', 'Skill 2', 'Skill 3'] },
    ],
  };
}
