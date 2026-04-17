/**
 * Applications list — PageFactory.
 *
 * Shows all applications in a sortable table with:
 *   - Candidate + position
 *   - Logic / Skills quiz score chips
 *   - Attitudinal completion chip
 *   - Composite score (ICP match %) — NEW
 *   - Status badge
 *   - Date
 *
 * Filters: status pipeline + search (candidate name/email or position title).
 * Filter + search are local — data is fetched once on mount.
 */

import type { PageFactory } from '../lib/page';
import * as q from '../lib/queries';
import { showToast } from '../lib/toast';
import { iconSearch, iconChevronRight } from '../lib/icons';
import {
  applicationStatusBadge,
  compositeScoreDisplay,
  pctColor,
  timeAgo,
} from '../lib/formatting';
import type { ApplicationStatus } from '../lib/database-types';

type FilterKey = ApplicationStatus | 'all';

const STATUS_FILTERS: { value: FilterKey; label: string }[] = [
  { value: 'all',       label: 'Tutte' },
  { value: 'applied',   label: 'Candidati' },
  { value: 'interview', label: 'Colloquio' },
  { value: 'hired',     label: 'Assunti' },
  { value: 'rejected',  label: 'Scartati' },
];

export const createApplicationsListPage: PageFactory = (ctx) => {
  // Closure state
  let applications: q.ApplicationRow[] = [];
  let currentFilter: FilterKey = (ctx.query.filter as FilterKey) || 'all';
  let searchQuery: string = ctx.query.search ?? '';

  return {
    async mount() {
      ctx.container.innerHTML = loadingShell();

      const res = await q.fetchApplications({ signal: ctx.signal });
      if (ctx.signal.aborted) return;

      if (res.error) {
        showToast('Errore nel caricamento', 'error');
        ctx.container.innerHTML = errorShell();
        return;
      }

      applications = res.data!;
      renderFull();
    },
  };

  // ── Render ──

  function renderFull() {
    ctx.container.innerHTML = `
      <div class="p-8 max-w-6xl mx-auto">

        <!-- Header -->
        <div class="mb-8">
          <h1 class="text-2xl font-semibold text-amia-950 tracking-tight">Candidature</h1>
          <p class="text-amia-500 text-sm mt-1">${applications.length} candidature totali</p>
        </div>

        <!-- Filters + search -->
        <div class="flex items-center justify-between gap-4 mb-6 flex-wrap">
          <div class="flex items-center gap-2" data-status-filters>
            ${STATUS_FILTERS.map((f) => statusFilterBtn(f.value, f.label, currentFilter)).join('')}
          </div>
          <div class="relative flex-1 max-w-xs">
            <span class="absolute left-3 top-1/2 -translate-y-1/2 text-amia-300">${iconSearch}</span>
            <input type="text" id="search-input"
              value="${escapeAttr(searchQuery)}"
              placeholder="Cerca candidato o posizione..."
              class="w-full pl-9 pr-3 py-2 rounded-lg text-xs border border-amia-200
                     text-amia-900 placeholder:text-amia-300" />
          </div>
        </div>

        <!-- Table (updated in place on filter/search change) -->
        <div data-list></div>
      </div>
    `;

    renderList();
    bindEvents();
  }

  function renderList() {
    const listEl = ctx.$<HTMLDivElement>('[data-list]');
    if (!listEl) return;

    const filtered = applyFilters(applications);

    if (filtered.length === 0) {
      listEl.innerHTML = `
        <div class="text-center py-16 bg-white rounded-2xl border border-amia-100">
          <p class="text-amia-400 text-sm">
            Nessuna candidatura${currentFilter !== 'all' || searchQuery ? ' con questi filtri' : ''}
          </p>
        </div>
      `;
      return;
    }

    listEl.innerHTML = `
      <div class="bg-white rounded-2xl border border-amia-100 overflow-hidden">
        <table class="w-full">
          <thead>
            <tr class="border-b border-amia-100">
              <th class="text-left text-xs font-medium text-amia-400 px-5 py-3">Candidato</th>
              <th class="text-left text-xs font-medium text-amia-400 px-5 py-3">Posizione</th>
              <th class="text-center text-xs font-medium text-amia-400 px-3 py-3">Logica</th>
              <th class="text-center text-xs font-medium text-amia-400 px-3 py-3">Skills</th>
              <th class="text-center text-xs font-medium text-amia-400 px-3 py-3">Att.</th>
              <th class="text-center text-xs font-medium text-amia-400 px-3 py-3">Match</th>
              <th class="text-left text-xs font-medium text-amia-400 px-5 py-3">Status</th>
              <th class="text-right text-xs font-medium text-amia-400 px-5 py-3">Data</th>
              <th class="w-8"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-amia-50">
            ${filtered.map(applicationRow).join('')}
          </tbody>
        </table>
      </div>
    `;

    // Row navigation
    ctx.$$<HTMLElement>('.app-row').forEach((row) => {
      ctx.on(row, 'click', () => {
        const id = row.dataset.id;
        if (id) ctx.router.navigate(`/applications/${id}`);
      });
    });
  }

  function applyFilters(apps: q.ApplicationRow[]): q.ApplicationRow[] {
    let out = apps;
    if (currentFilter !== 'all') {
      out = out.filter((a) => a.status === currentFilter);
    }
    if (searchQuery.trim()) {
      const needle = searchQuery.trim().toLowerCase();
      out = out.filter((a) => {
        const name = `${a.candidate.first_name} ${a.candidate.last_name}`.toLowerCase();
        return (
          name.includes(needle) ||
          a.candidate.email.toLowerCase().includes(needle) ||
          a.position.title.toLowerCase().includes(needle)
        );
      });
    }
    return out;
  }

  // ── Events ──

  function bindEvents() {
    // Status filter buttons
    ctx.$$<HTMLButtonElement>('[data-status-filter]').forEach((btn) => {
      ctx.on(btn, 'click', () => {
        const f = btn.dataset.statusFilter as FilterKey;
        if (f === currentFilter) return;
        currentFilter = f;
        // Update button styles
        ctx.$$<HTMLButtonElement>('[data-status-filter]').forEach((b) => {
          const active = b.dataset.statusFilter === currentFilter;
          b.className = statusFilterClasses(active);
        });
        renderList();
      });
    });

    // Search input (debounced)
    const searchInput = ctx.$<HTMLInputElement>('#search-input');
    let searchTimer: ReturnType<typeof setTimeout> | null = null;
    ctx.on(searchInput, 'input', () => {
      if (!searchInput) return;
      if (searchTimer) clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        searchQuery = searchInput.value;
        renderList();
      }, 150);
    });
    ctx.onCleanup(() => { if (searchTimer) clearTimeout(searchTimer); });
  }
};

// ── HTML fragments ──

function loadingShell(): string {
  return `
    <div class="p-8 max-w-6xl mx-auto">
      <div class="mb-8">
        <h1 class="text-2xl font-semibold text-amia-950 tracking-tight">Candidature</h1>
        <p class="text-amia-500 text-sm mt-1">Caricamento...</p>
      </div>
      <div class="flex justify-center py-20"><div class="spinner"></div></div>
    </div>
  `;
}

function errorShell(): string {
  return `
    <div class="p-8 max-w-6xl mx-auto">
      <div class="mb-8">
        <h1 class="text-2xl font-semibold text-amia-950 tracking-tight">Candidature</h1>
        <p class="text-amia-500 text-sm mt-1">Errore nel caricamento</p>
      </div>
    </div>
  `;
}

function statusFilterClasses(active: boolean): string {
  return `px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
    active
      ? 'bg-amia-950 text-white'
      : 'bg-white text-amia-600 border border-amia-200 hover:border-amia-300'
  }`;
}

function statusFilterBtn(key: FilterKey, label: string, current: FilterKey): string {
  return `
    <button
      class="${statusFilterClasses(key === current)}"
      data-status-filter="${key}"
    >${label}</button>
  `;
}

function applicationRow(a: q.ApplicationRow): string {
  return `
    <tr class="app-row hover:bg-amia-50/50 cursor-pointer transition-colors" data-id="${a.id}">
      <td class="px-5 py-3.5">
        <p class="text-sm font-medium text-amia-950">${escapeText(a.candidate.first_name)} ${escapeText(a.candidate.last_name)}</p>
        <p class="text-xs text-amia-400">${escapeText(a.candidate.email)}</p>
      </td>
      <td class="px-5 py-3.5">
        <p class="text-sm text-amia-700">${escapeText(a.position.title)}</p>
        <p class="text-xs text-amia-400">${escapeText(a.position.department)}</p>
      </td>
      <td class="px-3 py-3.5 text-center">
        ${quizChip(a.pre_quiz_completed_at, a.pre_quiz_score, a.pre_quiz_max_score, a.pre_quiz_over_time)}
      </td>
      <td class="px-3 py-3.5 text-center">
        ${quizChip(a.post_quiz_completed_at, a.post_quiz_score, a.post_quiz_max_score, a.post_quiz_over_time)}
      </td>
      <td class="px-3 py-3.5 text-center">
        ${attChip(a.att_quiz_completed_at)}
      </td>
      <td class="px-3 py-3.5 text-center">
        ${compositeChip(a.composite_score)}
      </td>
      <td class="px-5 py-3.5">
        ${applicationStatusBadge(a.status)}
      </td>
      <td class="px-5 py-3.5 text-right">
        <span class="text-xs text-amia-400">${timeAgo(a.created_at)}</span>
      </td>
      <td class="pr-4">
        <span class="text-amia-300">${iconChevronRight}</span>
      </td>
    </tr>
  `;
}

function quizChip(
  completed: string | null,
  score: number | null,
  max: number | null,
  overTime: boolean,
): string {
  if (!completed) return '<span class="text-amia-300 text-xs">—</span>';
  const pct = max ? Math.round(((score ?? 0) / max) * 100) : 0;
  return `
    <span class="font-semibold text-xs ${pctColor(pct)}">${pct}%</span>
    ${overTime ? '<span class="text-[10px] text-red-400" title="Sforato">⏱</span>' : ''}
  `;
}

function attChip(completed: string | null): string {
  if (!completed) return '<span class="text-amia-300 text-xs">—</span>';
  return '<span class="text-emerald-600 text-xs font-medium">✓</span>';
}

function compositeChip(composite: number | null): string {
  return compositeScoreDisplay(composite);
}

function escapeAttr(s: string): string {
  return s.replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function escapeText(s: string): string {
  return s.replace(/</g, '&lt;').replace(/>/g, '&gt;');
}