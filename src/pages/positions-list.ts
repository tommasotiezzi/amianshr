/**
 * Pagina lista posizioni.
 * Mostra tutte le posizioni con filtri per status, conteggio candidature,
 * e azioni rapide (modifica, vedi candidature).
 */

import { Router } from '../router';
import { supabase } from '../lib/supabase-client';
import { iconPlus, iconEdit, iconApplications } from '../lib/icons';
import { showToast } from '../lib/toast';
import type { Position, PositionStatus } from '../lib/database-types';
import { formatDate, positionStatusBadge } from '../lib/formatting';

interface PositionWithCount extends Position {
  applications_count: number;
}

let currentFilter: PositionStatus | 'all' = 'all';

export async function renderPositionsList(container: HTMLElement, router: Router) {
  // Loading state
  container.innerHTML = `
    <div class="p-8 max-w-5xl mx-auto">
      <div class="flex items-center justify-between mb-8">
        <div>
          <h1 class="text-2xl font-semibold text-amia-950 tracking-tight">Posizioni</h1>
          <p class="text-amia-500 text-sm mt-1">Caricamento...</p>
        </div>
      </div>
      <div class="flex justify-center py-20"><div class="spinner"></div></div>
    </div>
  `;

  // Fetch positions with application count
  const { data: positions, error } = await supabase
    .from('positions')
    .select('*, applications(count)')
    .order('created_at', { ascending: false });

  if (error) {
    showToast('Errore nel caricamento delle posizioni', 'error');
    return;
  }

  // Map the count from Supabase's nested response
  const positionsWithCount: PositionWithCount[] = (positions ?? []).map((p: any) => ({
    ...p,
    applications_count: p.applications?.[0]?.count ?? 0,
  }));

  render(container, router, positionsWithCount);
}

function render(container: HTMLElement, router: Router, positions: PositionWithCount[]) {
  const filtered = currentFilter === 'all'
    ? positions
    : positions.filter((p) => p.status === currentFilter);

  const filters: { key: PositionStatus | 'all'; label: string }[] = [
    { key: 'all', label: 'Tutte' },
    { key: 'published', label: 'Pubblicate' },
    { key: 'draft', label: 'Bozze' },
    { key: 'closed', label: 'Chiuse' },
    { key: 'archived', label: 'Archiviate' },
  ];

  container.innerHTML = `
    <div class="p-8 max-w-5xl mx-auto">

      <!-- Header -->
      <div class="flex items-center justify-between mb-8">
        <div>
          <h1 class="text-2xl font-semibold text-amia-950 tracking-tight">Posizioni</h1>
          <p class="text-amia-500 text-sm mt-1">${positions.length} posizioni totali</p>
        </div>
        <a
          href="#/positions/new"
          class="inline-flex items-center gap-2 bg-amia-950 text-white px-4 py-2.5 rounded-xl
                 text-sm font-medium hover:bg-amia-900 active:scale-[0.98] transition-all"
        >
          ${iconPlus} Nuova posizione
        </a>
      </div>

      <!-- Filtri -->
      <div class="flex items-center gap-2 mb-6">
        ${filters.map((f) => `
          <button
            class="filter-btn px-3 py-1.5 rounded-lg text-xs font-medium transition-all
              ${currentFilter === f.key
                ? 'bg-amia-950 text-white'
                : 'bg-white text-amia-600 border border-amia-200 hover:border-amia-300'
              }"
            data-filter="${f.key}"
          >${f.label}</button>
        `).join('')}
      </div>

      <!-- Lista -->
      <div class="space-y-3" id="positions-list">
        ${filtered.length > 0
          ? filtered.map((p) => positionCard(p)).join('')
          : `<div class="text-center py-16 bg-white rounded-2xl border border-amia-100">
               <p class="text-amia-400 text-sm">Nessuna posizione trovata</p>
             </div>`
        }
      </div>
    </div>
  `;

  // Bind filtri
  container.querySelectorAll('.filter-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      currentFilter = (btn as HTMLElement).dataset.filter as PositionStatus | 'all';
      render(container, router, positions);
    });
  });
}

function positionCard(p: PositionWithCount): string {
  return `
    <div class="bg-white rounded-2xl border border-amia-100 p-5
                hover:shadow-card hover:border-amia-200 transition-all">
      <div class="flex items-start justify-between">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-3 mb-2">
            <h3 class="text-[15px] font-semibold text-amia-950">${p.title}</h3>
            ${positionStatusBadge(p.status)}
          </div>
          <p class="text-xs text-amia-400">
            ${p.department} · ${p.location} · ${p.contract_type}
          </p>
          ${p.salary_min ? `
            <p class="text-xs text-amia-400 mt-1">
              RAL: €${p.salary_min.toLocaleString('it-IT')} — €${(p.salary_max ?? p.salary_min).toLocaleString('it-IT')}
            </p>
          ` : ''}
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
          : ''
        }
        ${p.pre_quiz_id || p.post_quiz_id || p.att_quiz_id
          ? `<span class="text-xs text-accent font-medium">
              ${[p.pre_quiz_id ? 'Logica' : '', p.post_quiz_id ? 'Skills' : '', p.att_quiz_id ? 'Attitudinale' : ''].filter(Boolean).join(' + ')}
            </span>`
          : '<span class="text-xs text-amia-300">Nessun quiz</span>'
        }
      </div>
    </div>
  `;
}