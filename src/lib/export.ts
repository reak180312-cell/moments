import { formatDuration } from './time';
import type { MomentEvent } from './types';

/** CSV that opens cleanly in Excel, Numbers and Sheets. */
function escapeCell(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function eventsToCsv(
  events: MomentEvent[],
  lookup: {
    trigger: (id: string) => string;
    helpful: (id: string) => string;
    person: (id: string | null) => string;
  }
): string {
  const header = [
    'Date', 'Start time', 'End time', 'Duration (minutes)', 'Difficulty (1-10)',
    'Triggers', 'Where', 'What happened', 'What helped', 'Notes',
    'Sleep', 'Hungry', 'School day', 'Unusual day',
    'Recorded by', 'Created at', 'Last edited', 'Id',
  ];

  const rows = events.map((e) => {
    const start = new Date(e.start_time);
    return [
      start.toLocaleDateString(),
      start.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
      e.end_time ? new Date(e.end_time).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '',
      e.duration_seconds ? Math.round(e.duration_seconds / 60) : '',
      e.difficulty ?? '',
      e.trigger_ids.map(lookup.trigger).join('; '),
      e.location ?? '',
      e.description ?? '',
      e.helpful_ids.map(lookup.helpful).join('; '),
      e.notes ?? '',
      e.sleep_quality ?? '',
      e.hungry ?? '',
      e.school_day === null ? '' : e.school_day ? 'Yes' : 'No',
      e.unusual_day === null ? '' : e.unusual_day ? 'Yes' : 'No',
      lookup.person(e.created_by),
      new Date(e.created_at).toLocaleString(),
      new Date(e.updated_at).toLocaleString(),
      e.id,
    ].map(escapeCell).join(',');
  });

  // The BOM keeps accented characters correct when Excel opens the file.
  return '﻿' + [header.map(escapeCell).join(','), ...rows].join('\r\n');
}

export function summaryLines(events: MomentEvent[]): string[] {
  const durations = events.map((e) => e.duration_seconds ?? 0).filter(Boolean);
  const total = durations.reduce((a, b) => a + b, 0);
  return [
    `${events.length} moments recorded`,
    durations.length ? `${formatDuration(total)} in total` : 'No durations recorded',
  ];
}

export function download(filename: string, contents: string, type: string): void {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadJson(filename: string, data: unknown): void {
  download(filename, JSON.stringify(data, null, 2), 'application/json');
}
