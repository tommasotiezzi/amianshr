/**
 * Applications list — sync mount.
 *
 * Features in this revision:
 *   - Default tab is "Candidati" (status=applied), not "Tutte"
 *   - Filter bar: position, test-completion, location, sort
 *   - Per-row flag toggles: Screened, Standby
 *   - Multi-select with sticky action bar to bulk-change status
 *   - Sort + filter choices persist in localStorage
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
type TestFilter = 'all' | 'none' | 'some' | 'all_done';
type LocationFilter = 'all' | 'milan' | 'remote';
type TierFilter = 'all' | 'best' | 'high' | 'medium' | 'none';
type ScreenedFilter = 'all' | 'yes' | 'no';
type StandbyFilter = 'all' | 'yes' | 'no';
type Tier = 'best' | 'high' | 'medium' | null;

// Every sortable column has an _asc and _desc variant.
// First click convention: numeric/binary/date → desc (best first), text → asc (A→Z).
type SortKey =
  | 'date_desc'      | 'date_asc'
  | 'match_desc'     | 'match_asc'
  | 'logic_desc'     | 'logic_asc'
  | 'skills_desc'    | 'skills_asc'
  | 'att_desc'       | 'att_asc'
  | 'screened_desc'  | 'screened_asc'
  | 'standby_desc'   | 'standby_asc'
  | 'tier_desc'      | 'tier_asc'
  | 'name_asc'       | 'name_desc'
  | 'position_asc'   | 'position_desc'
  | 'location_asc'   | 'location_desc'
  | 'status_asc'     | 'status_desc';

// Which "first click" direction to use for each column.
type SortColumn = 'date' | 'match' | 'logic' | 'skills' | 'att' | 'screened' | 'standby' | 'tier' | 'name' | 'position' | 'location' | 'status';
const FIRST_CLICK_DIR: Record<SortColumn, 'asc' | 'desc'> = {
  date:     'desc',
  match:    'desc',
  logic:    'desc',
  skills:   'desc',
  att:      'desc',
  screened: 'desc',
  standby:  'desc',
  tier:     'desc',  // best first
  name:     'asc',
  position: 'asc',
  location: 'asc',
  status:   'asc',
};

// Ranks the manual tier for sorting. Higher = better. null = worst.
function tierRank(t: Tier): number {
  switch (t) {
    case 'best':   return 3;
    case 'high':   return 2;
    case 'medium': return 1;
    default:       return 0;
  }
}

function columnFromSort(s: SortKey): SortColumn {
  return s.replace(/_(asc|desc)$/, '') as SortColumn;
}
function dirFromSort(s: SortKey): 'asc' | 'desc' {
  return s.endsWith('_desc') ? 'desc' : 'asc';
}
function buildSort(col: SortColumn, dir: 'asc' | 'desc'): SortKey {
  return `${col}_${dir}` as SortKey;
}

const STATUS_FILTERS: { value: FilterKey; label: string }[] = [
  { value: 'applied',   label: 'Candidati' },
  { value: 'all',       label: 'Tutte' },
  { value: 'interview', label: 'Colloquio' },
  { value: 'hired',     label: 'Assunti' },
  { value: 'rejected',  label: 'Scartati' },
];

const TEST_OPTIONS: { value: TestFilter; label: string }[] = [
  { value: 'all',      label: 'Tutti i test' },
  { value: 'none',     label: 'Nessun test completato' },
  { value: 'some',     label: 'Almeno un test completato' },
  { value: 'all_done', label: 'Tutti i test completati' },
];

const LOCATION_OPTIONS: { value: LocationFilter; label: string }[] = [
  { value: 'all',    label: 'Tutte le locations' },
  { value: 'milan',  label: 'Milano' },
  { value: 'remote', label: 'Remote' },
];

const TIER_OPTIONS: { value: TierFilter; label: string }[] = [
  { value: 'all',    label: 'Tutti i tier' },
  { value: 'best',   label: '⭐ Best' },
  { value: 'high',   label: '▲ High' },
  { value: 'medium', label: '◆ Medium' },
  { value: 'none',   label: 'Non valutati' },
];

const SCREENED_OPTIONS: { value: ScreenedFilter; label: string }[] = [
  { value: 'all', label: 'Screened: tutti' },
  { value: 'yes', label: '👁 Screened' },
  { value: 'no',  label: 'Non screened' },
];

const STANDBY_OPTIONS: { value: StandbyFilter; label: string }[] = [
  { value: 'all', label: 'Standby: tutti' },
  { value: 'yes', label: '⏸ In standby' },
  { value: 'no',  label: 'Non in standby' },
];

const TIER_LABEL: Record<'best' | 'high' | 'medium', { icon: string; full: string }> = {
  best:   { icon: '⭐', full: 'Best one' },
  high:   { icon: '▲', full: 'High potential' },
  medium: { icon: '◆', full: 'Medium potential' },
};

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'date_desc',   label: 'Più recenti' },
  { value: 'date_asc',    label: 'Meno recenti' },
  { value: 'match_desc',  label: 'Match più alto' },
  { value: 'logic_desc',  label: 'Logica più alta' },
  { value: 'skills_desc', label: 'Skills più alti' },
  { value: 'name_asc',    label: 'Nome A→Z' },
  { value: 'name_desc',   label: 'Nome Z→A' },
];

const STATUS_OPTIONS_FOR_BULK: { value: ApplicationStatus; label: string }[] = [
  { value: 'applied',   label: 'Candidato' },
  { value: 'interview', label: 'Colloquio' },
  { value: 'hired',     label: 'Assunto' },
  { value: 'rejected',  label: 'Scartato' },
];

const LS_KEY = 'amia-admin:applications-list:prefs';
interface Prefs {
  sort: SortKey;
  testFilter: TestFilter;
  locationFilter: LocationFilter;
  tierFilter: TierFilter;
  screenedFilter: ScreenedFilter;
  standbyFilter: StandbyFilter;
  positionFilter: string;
}
const DEFAULT_PREFS: Prefs = {
  sort: 'date_desc',
  testFilter: 'all',
  locationFilter: 'all',
  tierFilter: 'all',
  screenedFilter: 'all',
  standbyFilter: 'all',
  positionFilter: 'all',
};

function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_PREFS, ...parsed };
  } catch {
    return DEFAULT_PREFS;
  }
}
function savePrefs(p: Prefs) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(p)); } catch {}
}

export const createApplicationsListPage: PageFactory = (ctx) => {
  let applications: q.ApplicationRow[] = [];
  let positions: q.PositionFilterOption[] = [];
  let prefs = loadPrefs();
  let currentFilter: FilterKey = (ctx.query.filter as FilterKey) || 'applied';
  let searchQuery: string = ctx.query.search ?? '';
  const selected = new Set<string>();

  // ── Reset filters helpers (used across multiple bind callbacks) ──
  function resetFilters() {
    prefs = { ...DEFAULT_PREFS };
    savePrefs(prefs);
    currentFilter = 'applied';
    searchQuery = '';
    renderFull();
  }
  function updateResetVisibility() {
    const btn = ctx.$<HTMLButtonElement>('#reset-filters');
    const active = hasActiveFilters(prefs, currentFilter, searchQuery);
    if (active && !btn) {
      const bar = ctx.container.querySelector('.filter-bar');
      if (bar) {
        const html = `<button id="reset-filters" class="px-2.5 py-1.5 rounded-lg text-xs font-medium text-amia-500 hover:text-amia-900 hover:bg-amia-50 transition-colors inline-flex items-center gap-1" title="Reset filters">✕ Reset</button>`;
        bar.insertAdjacentHTML('beforeend', html);
        const newBtn = ctx.$<HTMLButtonElement>('#reset-filters');
        ctx.on(newBtn, 'click', resetFilters);
      }
    } else if (!active && btn) {
      btn.remove();
    }
  }

  ctx.container.innerHTML = loadingShell();

  Promise.all([
    q.fetchApplications({ signal: ctx.signal }),
    q.fetchPositionsForFilter({ signal: ctx.signal }),
  ])
    .then(([appsRes, posRes]) => {
      if (ctx.signal.aborted) return;
      if (appsRes.error) {
        showToast('Errore nel caricamento candidature', 'error');
        ctx.container.innerHTML = errorShell();
        return;
      }
      applications = appsRes.data!;
      positions = posRes.error ? [] : posRes.data!;
      renderFull();
    })
    .catch((err) => {
      if (ctx.signal.aborted) return;
      console.error('[applications-list]', err);
    });

  function renderFull() {
    ctx.container.innerHTML = `
      <div class="p-8 max-w-6xl mx-auto pb-32">
        <div class="mb-6">
          <h1 class="text-2xl font-semibold text-amia-950 tracking-tight">Candidature</h1>
          <p class="text-amia-500 text-sm mt-1">${applications.length} candidature totali</p>
        </div>

        <div class="flex items-center gap-2 mb-4 flex-wrap">
          ${STATUS_FILTERS.map((f) => statusFilterBtn(f.value, f.label, currentFilter, countForStatus(f.value, applications))).join('')}
        </div>

        <div class="filter-bar bg-white border border-amia-100 rounded-xl p-3 mb-4 flex items-center gap-3 flex-wrap">
          ${selectDropdown('position-filter', 'Posizione', [{ value: 'all', label: 'Tutte le posizioni' }, ...positions.map((p) => ({ value: p.id, label: p.title }))], prefs.positionFilter)}
          ${selectDropdown('test-filter',     'Test',      TEST_OPTIONS,     prefs.testFilter)}
          ${selectDropdown('location-filter', 'Location',  LOCATION_OPTIONS, prefs.locationFilter)}
          ${selectDropdown('tier-filter',     'Tier',      TIER_OPTIONS,     prefs.tierFilter)}
          ${selectDropdown('screened-filter', 'Screened',  SCREENED_OPTIONS, prefs.screenedFilter)}
          ${selectDropdown('standby-filter',  'Standby',   STANDBY_OPTIONS,  prefs.standbyFilter)}
          ${selectDropdown('sort-by',         'Ordina',    SORT_OPTIONS,     prefs.sort)}

          <div class="relative ml-auto flex-1 max-w-xs min-w-[180px]">
            <span class="absolute left-3 top-1/2 -translate-y-1/2 text-amia-300">${iconSearch}</span>
            <input type="text" id="search-input"
              value="${escapeAttr(searchQuery)}"
              placeholder="Cerca candidato o posizione..."
              class="w-full pl-9 pr-3 py-2 rounded-lg text-xs border border-amia-200
                     text-amia-900 placeholder:text-amia-300" />
          </div>

          ${hasActiveFilters(prefs, currentFilter, searchQuery) ? `
            <button id="reset-filters" class="px-2.5 py-1.5 rounded-lg text-xs font-medium text-amia-500 hover:text-amia-900 hover:bg-amia-50 transition-colors inline-flex items-center gap-1" title="Reset filters">
              ✕ Reset
            </button>
          ` : ''}
        </div>

        <div data-list></div>
      </div>

      <div id="bulk-bar" class="fixed bottom-0 left-0 right-0 bg-white border-t border-amia-200 shadow-lg px-6 py-3 hidden z-20">
        <div class="max-w-6xl mx-auto flex items-center gap-3">
          <span class="text-sm text-amia-700"><span id="bulk-count">0</span> selezionate</span>
          <div class="flex-1"></div>
          <select id="bulk-status" class="px-3 py-2 rounded-lg text-xs border border-amia-200 bg-white">
            <option value="">Cambia stato...</option>
            ${STATUS_OPTIONS_FOR_BULK.map((o) => `<option value="${o.value}">→ ${o.label}</option>`).join('')}
          </select>
          <select id="bulk-tier" class="px-3 py-2 rounded-lg text-xs border border-amia-200 bg-white">
            <option value="">Imposta tier...</option>
            <option value="best">⭐ Best</option>
            <option value="high">▲ High</option>
            <option value="medium">◆ Medium</option>
            <option value="__clear__">Rimuovi tier</option>
          </select>
          <button id="bulk-apply" class="px-3 py-2 rounded-lg text-xs font-medium bg-amia-950 text-white hover:bg-amia-900">
            Applica
          </button>
          <button id="bulk-cancel" class="px-3 py-2 rounded-lg text-xs font-medium bg-amia-100 text-amia-700 hover:bg-amia-200">
            Annulla
          </button>
        </div>
      </div>
    `;

    renderList();
    bindEvents();
    updateBulkBar();
  }

  function renderList() {
    const listEl = ctx.$<HTMLDivElement>('[data-list]');
    if (!listEl) return;

    const filtered = applyFiltersAndSort(applications);

    if (filtered.length === 0) {
      listEl.innerHTML = `
        <div class="text-center py-16 bg-white rounded-2xl border border-amia-100">
          <p class="text-amia-400 text-sm">Nessuna candidatura con questi filtri</p>
        </div>
      `;
      return;
    }

    listEl.innerHTML = `
      <div class="bg-white rounded-2xl border border-amia-100 overflow-hidden">
        <table class="w-full">
          <thead>
            <tr class="border-b border-amia-100">
              <th class="w-8 pl-4">
                <input type="checkbox" id="select-all" class="rounded border-amia-300" />
              </th>
              ${sortableHeader('name',     'Candidato', prefs.sort)}
              ${sortableHeader('position', 'Posizione', prefs.sort)}
              ${sortableHeader('location', '📍',        prefs.sort, { align: 'center' })}
              ${sortableHeader('logic',    'Logica',    prefs.sort, { align: 'center' })}
              ${sortableHeader('skills',   'Skills',    prefs.sort, { align: 'center' })}
              ${sortableHeader('att',      'Att.',      prefs.sort, { align: 'center' })}
              ${sortableHeader('match',    'Match',     prefs.sort, { align: 'center' })}
              ${sortableHeader('status',   'Status',    prefs.sort)}
              ${sortableHeader('tier',     'Tier',      prefs.sort, { align: 'center' })}
              ${sortableHeader('screened', '👁',        prefs.sort, { align: 'center' })}
              ${sortableHeader('standby',  '⏸',         prefs.sort, { align: 'center' })}
              ${sortableHeader('date',     'Data',      prefs.sort, { align: 'right' })}
              <th class="w-8"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-amia-50">
            ${filtered.map(applicationRow).join('')}
          </tbody>
        </table>
      </div>
    `;

    ctx.$$<HTMLElement>('.app-row').forEach((row) => {
      ctx.on(row, 'click', (e: Event) => {
        const t = e.target as HTMLElement;
        if (t.closest('input, button, label, .flag-toggle, .row-checkbox, .tier-pill')) return;
        const id = row.dataset.id;
        if (id) ctx.router.navigate(`/applications/${id}?from=list`);
      });
    });

    bindRowControls();
    syncSelectAllCheckbox();
  }

  function applyFiltersAndSort(apps: q.ApplicationRow[]): q.ApplicationRow[] {
    let out = apps;

    if (currentFilter !== 'all') {
      out = out.filter((a) => a.status === currentFilter);
    }
    if (prefs.positionFilter !== 'all') {
      out = out.filter((a) => a.position.id === prefs.positionFilter);
    }
    if (prefs.locationFilter !== 'all') {
      out = out.filter((a) => a.candidate.work_location === prefs.locationFilter);
    }
    if (prefs.tierFilter !== 'all') {
      out = out.filter((a) => {
        if (prefs.tierFilter === 'none') return a.tier == null;
        return a.tier === prefs.tierFilter;
      });
    }
    if (prefs.screenedFilter !== 'all') {
      out = out.filter((a) => prefs.screenedFilter === 'yes' ? a.screened : !a.screened);
    }
    if (prefs.standbyFilter !== 'all') {
      out = out.filter((a) => prefs.standbyFilter === 'yes' ? a.standby : !a.standby);
    }
    if (prefs.testFilter !== 'all') {
      out = out.filter((a) => {
        const done =
          (a.pre_quiz_completed_at  ? 1 : 0) +
          (a.post_quiz_completed_at ? 1 : 0) +
          (a.att_quiz_completed_at  ? 1 : 0);
        if (prefs.testFilter === 'none')     return done === 0;
        if (prefs.testFilter === 'some')     return done >= 1 && done < 3;
        if (prefs.testFilter === 'all_done') return done === 3;
        return true;
      });
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

    out = [...out].sort((a, b) => sortCompare(a, b, prefs.sort));

    return out;
  }

  function bindEvents() {
    ctx.$$<HTMLButtonElement>('[data-status-filter]').forEach((btn) => {
      ctx.on(btn, 'click', () => {
        const f = btn.dataset.statusFilter as FilterKey;
        if (f === currentFilter) return;
        currentFilter = f;
        ctx.$$<HTMLButtonElement>('[data-status-filter]').forEach((b) => {
          b.className = statusFilterClasses(b.dataset.statusFilter === currentFilter);
        });
        renderList();
        updateResetVisibility();
      });
    });

    const bindSelect = (id: string, set: (val: string) => void) => {
      const el = ctx.$<HTMLSelectElement>('#' + id);
      if (!el) return;
      ctx.on(el, 'change', () => {
        set(el.value);
        savePrefs(prefs);
        renderList();
        updateResetVisibility();
      });
    };
    bindSelect('position-filter', (v) => { prefs.positionFilter = v; });
    bindSelect('test-filter',     (v) => { prefs.testFilter     = v as TestFilter; });
    bindSelect('location-filter', (v) => { prefs.locationFilter = v as LocationFilter; });
    bindSelect('tier-filter',     (v) => { prefs.tierFilter     = v as TierFilter; });
    bindSelect('screened-filter', (v) => { prefs.screenedFilter = v as ScreenedFilter; });
    bindSelect('standby-filter',  (v) => { prefs.standbyFilter  = v as StandbyFilter; });
    bindSelect('sort-by',         (v) => { prefs.sort           = v as SortKey; });

    // Initial bind for reset button (if it's already in the DOM at first render)
    ctx.on(ctx.$<HTMLButtonElement>('#reset-filters'), 'click', resetFilters);

    const searchInput = ctx.$<HTMLInputElement>('#search-input');
    let searchTimer: ReturnType<typeof setTimeout> | null = null;
    ctx.on(searchInput, 'input', () => {
      if (!searchInput) return;
      if (searchTimer) clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        searchQuery = searchInput.value;
        renderList();
        updateResetVisibility();
      }, 150);
    });
    ctx.onCleanup(() => { if (searchTimer) clearTimeout(searchTimer); });

    const bulkApply  = ctx.$<HTMLButtonElement>('#bulk-apply');
    const bulkCancel = ctx.$<HTMLButtonElement>('#bulk-cancel');
    const bulkStatus = ctx.$<HTMLSelectElement>('#bulk-status');
    const bulkTier   = ctx.$<HTMLSelectElement>('#bulk-tier');
    ctx.on(bulkApply, 'click', async () => {
      const ids = Array.from(selected);
      if (ids.length === 0) return;
      const statusVal = bulkStatus?.value || '';
      const tierVal   = bulkTier?.value   || '';
      if (!statusVal && !tierVal) {
        showToast('Seleziona uno stato o un tier', 'error');
        return;
      }

      // Confirm dialog summarizes both changes when set
      const parts: string[] = [];
      if (statusVal) parts.push(`stato → ${statusVal}`);
      if (tierVal) {
        const tierLabel = tierVal === '__clear__' ? 'nessun tier' : tierVal;
        parts.push(`tier → ${tierLabel}`);
      }
      if (!confirm(`Applicare ${parts.join(' e ')} a ${ids.length} candidature?`)) return;

      // Run the two updates sequentially (server-side)
      if (statusVal) {
        const status = statusVal as ApplicationStatus;
        const res = await q.bulkUpdateApplicationStatus(ids, status);
        if (res.error) { showToast('Errore status: ' + res.error, 'error'); return; }
        applications = applications.map((a) => ids.includes(a.id) ? { ...a, status } : a);
      }
      if (tierVal) {
        const tier = tierVal === '__clear__' ? null : (tierVal as 'best' | 'high' | 'medium');
        const res = await q.bulkUpdateApplicationTier(ids, tier);
        if (res.error) { showToast('Errore tier: ' + res.error, 'error'); return; }
        applications = applications.map((a) => ids.includes(a.id) ? { ...a, tier } : a);
      }

      // Reset selects + selection
      if (bulkStatus) bulkStatus.value = '';
      if (bulkTier)   bulkTier.value   = '';
      selected.clear();
      showToast(`${ids.length} candidature aggiornate`);
      renderList();
      updateBulkBar();
    });
    ctx.on(bulkCancel, 'click', () => {
      selected.clear();
      renderList();
      updateBulkBar();
    });
  }

  function bindRowControls() {
    // Sortable column headers — every column with a [data-sort-col] button.
    // Lives inside the table header, re-rendered on every renderList().
    // Click cycles: not-sorting-this-col → first-click direction → opposite → first → ...
    ctx.$$<HTMLButtonElement>('[data-sort-col]').forEach((btn) => {
      ctx.on(btn, 'click', () => {
        const col = btn.dataset.sortCol as SortColumn;
        const currentCol = columnFromSort(prefs.sort);
        let nextSort: SortKey;
        if (currentCol === col) {
          const curDir = dirFromSort(prefs.sort);
          nextSort = buildSort(col, curDir === 'asc' ? 'desc' : 'asc');
        } else {
          nextSort = buildSort(col, FIRST_CLICK_DIR[col]);
        }
        prefs.sort = nextSort;
        savePrefs(prefs);
        const sortDropdown = ctx.$<HTMLSelectElement>('#sort-by');
        if (sortDropdown) {
          const matches = SORT_OPTIONS.some((o) => o.value === nextSort);
          sortDropdown.value = matches ? nextSort : '';
        }
        renderList();
        updateResetVisibility();
      });
    });

    ctx.$$<HTMLInputElement>('.row-checkbox').forEach((cb) => {
      ctx.on(cb, 'change', () => {
        const id = cb.dataset.id!;
        if (cb.checked) selected.add(id);
        else            selected.delete(id);
        updateBulkBar();
        syncSelectAllCheckbox();
      });
    });

    const selectAll = ctx.$<HTMLInputElement>('#select-all');
    ctx.on(selectAll, 'change', () => {
      if (!selectAll) return;
      ctx.$$<HTMLInputElement>('.row-checkbox').forEach((cb) => {
        cb.checked = selectAll.checked;
        const id = cb.dataset.id!;
        if (selectAll.checked) selected.add(id);
        else                   selected.delete(id);
      });
      updateBulkBar();
    });

    ctx.$$<HTMLButtonElement>('.flag-toggle').forEach((btn) => {
      ctx.on(btn, 'click', async (e: Event) => {
        e.stopPropagation();
        const id   = btn.dataset.id!;
        const flag = btn.dataset.flag! as 'screened' | 'standby';
        const cur  = btn.dataset.value === 'true';
        const next = !cur;
        btn.dataset.value = String(next);
        btn.className = flagToggleClasses(next);
        btn.textContent = next ? (flag === 'screened' ? '✓' : '⏸') : '○';
        const res = await q.updateApplicationFlag(id, flag, next);
        if (res.error) {
          btn.dataset.value = String(cur);
          btn.className = flagToggleClasses(cur);
          btn.textContent = cur ? (flag === 'screened' ? '✓' : '⏸') : '○';
          showToast('Errore: ' + res.error, 'error');
          return;
        }
        const target = applications.find((a) => a.id === id);
        if (target) target[flag] = next;
      });
    });

    // Tier picker pills — click to set, click the active one to unset.
    ctx.$$<HTMLButtonElement>('.tier-pill').forEach((btn) => {
      ctx.on(btn, 'click', async (e: Event) => {
        e.stopPropagation();
        const id   = btn.dataset.id!;
        const t    = btn.dataset.tier! as 'best' | 'high' | 'medium';
        const isActive = btn.dataset.active === 'true';
        const nextTier: Tier = isActive ? null : t;
        // Optimistic: re-render the whole tier cell so the 3 pills sync
        const target = applications.find((a) => a.id === id);
        if (!target) return;
        const prev = target.tier;
        target.tier = nextTier;
        const cell = btn.closest('td');
        if (cell) cell.innerHTML = tierPickerCell(id, nextTier);
        // Re-bind: the cell's pills are new nodes
        const res = await q.updateApplicationTier(id, nextTier);
        if (res.error) {
          target.tier = prev;
          if (cell) cell.innerHTML = tierPickerCell(id, prev);
          showToast('Errore: ' + res.error, 'error');
        }
        // Always rebind the pills in this cell after the swap
        bindRowControls();
      });
    });
  }

  function updateBulkBar() {
    const bar = ctx.$<HTMLDivElement>('#bulk-bar');
    const count = ctx.$<HTMLSpanElement>('#bulk-count');
    if (!bar || !count) return;
    count.textContent = String(selected.size);
    if (selected.size > 0) bar.classList.remove('hidden');
    else                   bar.classList.add('hidden');
  }

  function syncSelectAllCheckbox() {
    const selectAll = ctx.$<HTMLInputElement>('#select-all');
    if (!selectAll) return;
    const visible = ctx.$$<HTMLInputElement>('.row-checkbox');
    if (visible.length === 0) { selectAll.checked = false; return; }
    selectAll.checked = visible.every((cb) => cb.checked);
  }
};

// ── HTML helpers ──

/** Compare two applications according to a SortKey. */
function sortCompare(a: q.ApplicationRow, b: q.ApplicationRow, sort: SortKey): number {
  const col = columnFromSort(sort);
  const flip = dirFromSort(sort) === 'asc' ? 1 : -1;

  switch (col) {
    case 'date':
      return flip * (new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    case 'match':
      return flip * ((b.composite_score ?? -1) - (a.composite_score ?? -1));

    case 'logic': {
      const ap = a.pre_quiz_max_score  ? (a.pre_quiz_score  ?? 0) / a.pre_quiz_max_score  : -1;
      const bp = b.pre_quiz_max_score  ? (b.pre_quiz_score  ?? 0) / b.pre_quiz_max_score  : -1;
      return flip * (bp - ap);
    }
    case 'skills': {
      const ap = a.post_quiz_max_score ? (a.post_quiz_score ?? 0) / a.post_quiz_max_score : -1;
      const bp = b.post_quiz_max_score ? (b.post_quiz_score ?? 0) / b.post_quiz_max_score : -1;
      return flip * (bp - ap);
    }
    case 'att':
      return flip * ((b.att_quiz_completed_at ? 1 : 0) - (a.att_quiz_completed_at ? 1 : 0));

    case 'screened':
      return flip * ((b.screened ? 1 : 0) - (a.screened ? 1 : 0));

    case 'standby':
      return flip * ((b.standby ? 1 : 0) - (a.standby ? 1 : 0));

    case 'tier':
      return flip * (tierRank(b.tier) - tierRank(a.tier));

    case 'name': {
      const an = `${a.candidate.first_name} ${a.candidate.last_name}`;
      const bn = `${b.candidate.first_name} ${b.candidate.last_name}`;
      const cmp = an.localeCompare(bn);
      return dirFromSort(sort) === 'asc' ? cmp : -cmp;
    }
    case 'position': {
      const cmp = a.position.title.localeCompare(b.position.title);
      return dirFromSort(sort) === 'asc' ? cmp : -cmp;
    }
    case 'location': {
      // null last regardless of direction
      const av = a.candidate.work_location;
      const bv = b.candidate.work_location;
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      const cmp = av.localeCompare(bv);
      return dirFromSort(sort) === 'asc' ? cmp : -cmp;
    }
    case 'status': {
      const cmp = a.status.localeCompare(b.status);
      return dirFromSort(sort) === 'asc' ? cmp : -cmp;
    }

    default:
      return 0;
  }
}

/** Render a column header with sort affordance.
 *  Click cycles: neutral → first-click direction → opposite → neutral. */
function sortableHeader(col: SortColumn, label: string, currentSort: SortKey, opts: { align?: 'left' | 'center' | 'right' } = {}): string {
  const align = opts.align ?? 'left';
  const currentCol = columnFromSort(currentSort);
  const isActive = currentCol === col;
  const dir = isActive ? dirFromSort(currentSort) : null;
  const arrow = dir === 'asc' ? '▲' : dir === 'desc' ? '▼' : '<span class="text-amia-200">↕</span>';
  const activeCls = isActive ? 'text-amia-900' : '';
  const justify = align === 'center' ? 'justify-center' : align === 'right' ? 'justify-end' : '';
  const textAlign = align === 'center' ? 'text-center' : align === 'right' ? 'text-right' : 'text-left';
  return `
    <th class="${textAlign} text-xs font-medium text-amia-400 px-2 py-3">
      <button data-sort-col="${col}" class="inline-flex items-center gap-1 ${justify} hover:text-amia-700 transition-colors ${activeCls}">
        ${label}
        <span class="text-[10px] leading-none">${arrow}</span>
      </button>
    </th>
  `;
}

function applicationRow(a: q.ApplicationRow): string {
  return `
    <tr class="app-row hover:bg-amia-50/50 cursor-pointer transition-colors" data-id="${a.id}">
      <td class="pl-4">
        <input type="checkbox" class="row-checkbox rounded border-amia-300" data-id="${a.id}" />
      </td>
      <td class="px-3 py-3">
        <p class="text-sm font-medium text-amia-950">${escapeText(a.candidate.first_name)} ${escapeText(a.candidate.last_name)}</p>
        <p class="text-xs text-amia-400">${escapeText(a.candidate.email)}</p>
      </td>
      <td class="px-3 py-3">
        <p class="text-sm text-amia-700">${escapeText(a.position.title)}</p>
        <p class="text-xs text-amia-400">${escapeText(a.position.department)}</p>
      </td>
      <td class="px-2 py-3 text-center">${locationBadge(a.candidate.work_location)}</td>
      <td class="px-2 py-3 text-center">${quizChip(a.pre_quiz_completed_at,  a.pre_quiz_score,  a.pre_quiz_max_score,  a.pre_quiz_over_time)}</td>
      <td class="px-2 py-3 text-center">${quizChip(a.post_quiz_completed_at, a.post_quiz_score, a.post_quiz_max_score, a.post_quiz_over_time)}</td>
      <td class="px-2 py-3 text-center">${attChip(a.att_quiz_completed_at)}</td>
      <td class="px-2 py-3 text-center">${compositeScoreDisplay(a.composite_score)}</td>
      <td class="px-3 py-3">${applicationStatusBadge(a.status)}</td>
      <td class="px-2 py-3 text-center">${tierPickerCell(a.id, a.tier)}</td>
      <td class="px-2 py-3 text-center">
        <button class="${flagToggleClasses(a.screened)}" data-id="${a.id}" data-flag="screened" data-value="${a.screened}" title="Screened (portfolio/LinkedIn reviewed)">
          ${a.screened ? '✓' : '○'}
        </button>
      </td>
      <td class="px-2 py-3 text-center">
        <button class="${flagToggleClasses(a.standby)}" data-id="${a.id}" data-flag="standby" data-value="${a.standby}" title="Standby (on hold)">
          ${a.standby ? '⏸' : '○'}
        </button>
      </td>
      <td class="px-3 py-3 text-right">
        <span class="text-xs text-amia-400">${timeAgo(a.created_at)}</span>
      </td>
      <td class="pr-4"><span class="text-amia-300">${iconChevronRight}</span></td>
    </tr>
  `;
}

function flagToggleClasses(active: boolean): string {
  return `flag-toggle inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold transition-colors ${
    active
      ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
      : 'bg-amia-50 text-amia-300 hover:bg-amia-100 hover:text-amia-500'
  }`;
}

/** Three small pill buttons per row: ⭐ ▲ ◆. Active = filled. Click to set,
 *  click the active one to unset. */
function tierPickerCell(appId: string, tier: Tier): string {
  return `
    <div class="inline-flex items-center gap-1 justify-center">
      ${tierPill(appId, 'best',   tier === 'best',   '⭐')}
      ${tierPill(appId, 'high',   tier === 'high',   '▲')}
      ${tierPill(appId, 'medium', tier === 'medium', '◆')}
    </div>
  `;
}

function tierPill(appId: string, t: 'best' | 'high' | 'medium', active: boolean, icon: string): string {
  const palette = {
    best:   { on: 'bg-amber-100 text-amber-700 hover:bg-amber-200',         off: 'text-amia-300 hover:text-amber-500 hover:bg-amber-50' },
    high:   { on: 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200',   off: 'text-amia-300 hover:text-emerald-500 hover:bg-emerald-50' },
    medium: { on: 'bg-sky-100 text-sky-700 hover:bg-sky-200',               off: 'text-amia-300 hover:text-sky-500 hover:bg-sky-50' },
  }[t];
  const cls = active ? palette.on : palette.off;
  return `<button class="tier-pill inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] transition-colors ${cls}" data-id="${appId}" data-tier="${t}" data-active="${active}" title="${TIER_LABEL[t].full}">${icon}</button>`;
}

function locationBadge(loc: 'milan' | 'remote' | null): string {
  if (loc === 'milan')  return '<span class="text-xs text-amia-700" title="Based in Milan">📍 MI</span>';
  if (loc === 'remote') return '<span class="text-xs text-amia-700" title="Remote">🌍 RE</span>';
  return '<span class="text-amia-300 text-xs">—</span>';
}

function quizChip(completed: string | null, score: number | null, max: number | null, overTime: boolean): string {
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
  return `px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
    active
      ? 'bg-amia-950 text-white'
      : 'bg-white text-amia-600 border border-amia-200 hover:border-amia-300'
  }`;
}

function statusFilterBtn(key: FilterKey, label: string, current: FilterKey, count: number): string {
  return `<button class="${statusFilterClasses(key === current)}" data-status-filter="${key}">${label}<span class="${key === current ? 'text-amia-200' : 'text-amia-400'} font-normal">${count}</span></button>`;
}

function countForStatus(key: FilterKey, apps: q.ApplicationRow[]): number {
  if (key === 'all') return apps.length;
  return apps.filter((a) => a.status === key).length;
}

function selectDropdown(id: string, label: string, options: { value: string; label: string }[], current: string): string {
  return `
    <label class="flex items-center gap-1.5 text-xs">
      <span class="text-amia-500 font-medium">${label}:</span>
      <select id="${id}" class="px-2.5 py-1.5 rounded-lg text-xs border border-amia-200 bg-white text-amia-900">
        ${options.map((o) => `<option value="${escapeAttr(o.value)}" ${o.value === current ? 'selected' : ''}>${escapeText(o.label)}</option>`).join('')}
      </select>
    </label>
  `;
}

function escapeAttr(s: string): string { return s.replace(/"/g, '&quot;').replace(/</g, '&lt;'); }
function escapeText(s: string): string { return s.replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function hasActiveFilters(prefs: Prefs, currentFilter: FilterKey, search: string): boolean {
  return (
    prefs.positionFilter !== DEFAULT_PREFS.positionFilter ||
    prefs.testFilter     !== DEFAULT_PREFS.testFilter ||
    prefs.locationFilter !== DEFAULT_PREFS.locationFilter ||
    prefs.tierFilter     !== DEFAULT_PREFS.tierFilter ||
    prefs.screenedFilter !== DEFAULT_PREFS.screenedFilter ||
    prefs.standbyFilter  !== DEFAULT_PREFS.standbyFilter ||
    prefs.sort           !== DEFAULT_PREFS.sort ||
    currentFilter !== 'applied' ||
    !!search.trim()
  );
}