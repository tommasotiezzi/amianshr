/**
 * Positions list — sync mount.
 */

import type { PageFactory } from '../lib/page';
import * as q from '../lib/queries';
import { showToast } from '../lib/toast';
import { iconPlus, iconEdit, iconApplications } from '../lib/icons';
import {
  formatDate,
  positionStatusBadge,
  contractLabel,
  salaryRange,
  appPillHtml,
} from '../lib/formatting';
import type { PositionStatus } from '../lib/database-types';

type FilterKey = PositionStatus | 'all';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all',       label: 'Tutte' },
  { key: 'published', label: 'Pubblicate' },
  { key: 'draft',     label: 'Bozze' },
  { key: 'closed',    label: 'Chiuse' },
  { key: 'archived',  label: 'Archiviate' },
];

export const createPositionsListPage: PageFactory = (ctx) => {
  let positions: q.PositionWithCount[] = [];
  let currentFilter: FilterKey = (ctx.query.filter as FilterKey) || 'all';

  // 1. Shell immediately
  ctx.container.innerHTML = shellHtml('Caricamento...');

  // 2. Fire fetch in background
  q.fetchPositions({ signal: ctx.signal })
    .then((res) => {
      if (ctx.signal.aborted) return;
      if (res.error) {
        showToast('Errore nel caricamento delle posizioni', 'error');
        ctx.container.innerHTML = shellHtml('Errore nel caricamento');
        return;
      }
      positions = res.data!;
      renderFull();
    })
    .catch((err) => {
      if (ctx.signal.aborted) return;
      console.error('[positions-list]', err);
    });

  // ── Render ──

  function renderFull() {
    ctx.container.innerHTML = `
      <div class="p-8 max-w-5xl mx-auto">
        <div class="flex items-center justify-between mb-8">
          <div>
            <h1 class="text-2xl font-semibold text-amia-950 tracking-tight">Posizioni</h1>
            <p class="text-amia-500 text-sm mt-1">${positions.length} posizioni totali</p>
          </div>
          <a href="#/positions/new"
            class="inline-flex items-center gap-2 bg-amia-950 text-white px-4 py-2.5 rounded-xl
                   text-sm font-medium hover:bg-amia-900 active:scale-[0.98] transition-all">
            ${iconPlus} Nuova posizione
          </a>
        </div>

        <div class="flex items-center gap-2 mb-6">
          ${FILTERS.map((f) => filterBtnHtml(f.key, f.label, currentFilter)).join('')}
        </div>

        <div class="space-y-3" data-list></div>
      </div>
    `;

    renderList();

    ctx.$$<HTMLButtonElement>('[data-filter]').forEach((btn) => {
      ctx.on(btn, 'click', () => {
        const f = btn.dataset.filter as FilterKey;
        if (f === currentFilter) return;
        currentFilter = f;
        ctx.$$<HTMLButtonElement>('[data-filter]').forEach((b) => {
          b.className = filterBtnClasses(b.dataset.filter === currentFilter);
        });
        renderList();
      });
    });
  }

  function renderList() {
    const listEl = ctx.$<HTMLDivElement>('[data-list]');
    if (!listEl) return;

    const filtered = currentFilter === 'all'
      ? positions
      : positions.filter((p) => p.status === currentFilter);

    if (filtered.length === 0) {
      listEl.innerHTML = `
        <div class="text-center py-16 bg-white rounded-2xl border border-amia-100">
          <p class="text-amia-400 text-sm">Nessuna posizione trovata</p>
        </div>
      `;
      return;
    }

    listEl.innerHTML = filtered.map(positionCard).join('');
  }
};

// ── HTML ──

function shellHtml(statusLine: string): string {
  return `
    <div class="p-8 max-w-5xl mx-auto">
      <div class="flex items-center justify-between mb-8">
        <div>
          <h1 class="text-2xl font-semibold text-amia-950 tracking-tight">Posizioni</h1>
          <p class="text-amia-500 text-sm mt-1">${statusLine}</p>
        </div>
      </div>
      <div class="flex justify-center py-20"><div class="spinner"></div></div>
    </div>
  `;
}

function filterBtnClasses(active: boolean): string {
  return `filter-btn px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
    active
      ? 'bg-amia-950 text-white'
      : 'bg-white text-amia-600 border border-amia-200 hover:border-amia-300'
  }`;
}

function filterBtnHtml(key: FilterKey, label: string, current: FilterKey): string {
  return `<button class="${filterBtnClasses(key === current)}" data-filter="${key}">${label}</button>`;
}

function positionCard(p: q.PositionWithCount): string {
  const ral = salaryRange(p.salary_min, p.salary_max);
  const quizBadges = [
    p.pre_quiz_id  ? 'Logica' : '',
    p.post_quiz_id ? 'Skills' : '',
    p.att_quiz_id  ? 'Att.'   : '',
  ].filter(Boolean).join(' · ');

  return `
    <div class="bg-white rounded-2xl border border-amia-100 p-5
                hover:shadow-card hover:border-amia-200 transition-all">
      <div class="flex items-start justify-between">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-3 mb-2 flex-wrap">
            <h3 class="text-[15px] font-semibold text-amia-950">${p.title}</h3>
            ${positionStatusBadge(p.status)}
            ${appPillHtml(p, 'sm')}
          </div>
          <p class="text-xs text-amia-400">
            ${p.department} · ${p.location} · ${contractLabel(p.contract_type)}
          </p>
          ${ral ? `<p class="text-xs text-amia-400 mt-1">RAL: ${ral}</p>` : ''}
        </div>
        <div class="flex items-center gap-2 ml-4 shrink-0">
          <a href="#/positions/${p.id}/applications"
             class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                    text-amia-600 bg-amia-50 hover:bg-amia-100 transition-colors">
            ${iconApplications} ${p.applications_count}
          </a>
          <a href="#/positions/${p.id}/edit"
             class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                    text-amia-600 bg-amia-50 hover:bg-amia-100 transition-colors">
            ${iconEdit} Modifica
          </a>
        </div>
      </div>
      <div class="flex items-center gap-4 mt-4 pt-3 border-t border-amia-50">
        <span class="text-xs text-amia-400">Creata il ${formatDate(p.created_at)}</span>
        ${p.published_at
          ? `<span class="text-xs text-amia-400">Pubblicata il ${formatDate(p.published_at)}</span>`
          : ''}
        ${quizBadges ? `<span class="text-xs text-accent font-medium">${quizBadges}</span>` : ''}
      </div>
    </div>
  `;
}