/**
 * Funzioni di formattazione: date, badge status, score.
 */

import type { PositionStatus, ApplicationStatus } from './database-types';

// ── Date ──

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('it-IT', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('it-IT', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function timeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return 'ora';
  if (diff < 3600) return `${Math.floor(diff / 60)} min fa`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h fa`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}g fa`;
  return formatDate(dateStr);
}

// ── Position status badge ──

const POSITION_STATUS: Record<PositionStatus, { label: string; classes: string }> = {
  draft:     { label: 'Bozza',      classes: 'bg-gray-100 text-gray-600' },
  published: { label: 'Pubblicata', classes: 'bg-emerald-50 text-emerald-700' },
  closed:    { label: 'Chiusa',     classes: 'bg-amber-50 text-amber-700' },
  archived:  { label: 'Archiviata', classes: 'bg-gray-100 text-gray-500' },
};

export function positionStatusBadge(status: PositionStatus): string {
  const s = POSITION_STATUS[status] ?? { label: status, classes: 'bg-gray-100 text-gray-600' };
  return `<span class="inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${s.classes}">${s.label}</span>`;
}

// ── Application status badge ──

const APP_STATUS: Record<ApplicationStatus, { label: string; classes: string; dot: string }> = {
  applied:   { label: 'Candidato',  classes: 'bg-blue-50 text-blue-700',      dot: 'bg-blue-500' },
  interview: { label: 'Colloquio',  classes: 'bg-orange-50 text-orange-700',  dot: 'bg-orange-500' },
  rejected:  { label: 'Scartato',   classes: 'bg-red-50 text-red-700',        dot: 'bg-red-500' },
  hired:     { label: 'Assunto',    classes: 'bg-emerald-50 text-emerald-700',dot: 'bg-emerald-500' },
};

export function applicationStatusBadge(status: ApplicationStatus): string {
  const s = APP_STATUS[status] ?? { label: status, classes: 'bg-gray-100 text-gray-600', dot: 'bg-gray-400' };
  return `
    <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${s.classes}">
      <span class="w-1.5 h-1.5 rounded-full ${s.dot}"></span>
      ${s.label}
    </span>
  `;
}

export function applicationStatusLabel(status: ApplicationStatus): string {
  return APP_STATUS[status]?.label ?? status;
}

// ── Score ──

export function scoreDisplay(score?: number | null, max?: number | null): string {
  if (score == null || max == null) return '<span class="text-amia-400 text-xs">—</span>';
  const pct = Math.round((score / max) * 100);
  const color = pct >= 80 ? 'text-emerald-600' : pct >= 60 ? 'text-amber-600' : 'text-red-600';
  return `<span class="font-semibold text-sm ${color}">${pct}%</span>`;
}