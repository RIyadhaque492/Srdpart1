'use client';

import { useState, useRef, useCallback } from 'react';
import { stageSheet, orderSheets, type ParsedSheet } from '@/lib/parse';
import { detectTarget } from '@/lib/columns';

const TARGET_BYTES = 60 * 1024;
const MAX_ROWS = 500;

function splitBySize<T>(rows: T[]): T[][] {
  if (!rows.length) return [];
  const perRow = new Blob([JSON.stringify(rows)]).size / rows.length;
  const size = Math.max(1, Math.min(MAX_ROWS, Math.floor(TARGET_BYTES / perRow)));
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

interface Err { row: number; problem: string }
interface Line {
  sheet: string; target: string; label: string; total: number; sent: number; ok: number;
  failed: number; errors: Err[]; notes: string[]; done: boolean; use: boolean;
}

export default function ImportPage() {
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [staged, setStaged] = useState<ParsedSheet[]>([]);
  const [fileName, setFileName] = useState('');
