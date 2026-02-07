/**
 * Lista candidature — pannello admin.
 * Mostra tutte le candidature con stato quiz, score, e status pipeline.
 */

import { Router } from '../router';
import { supabase } from '../lib/supabase-client';
import { showToast } from '../lib/toast';
import { iconSearch, iconChevronRight } from '../lib/icons';
import { formatDate, applicationStatusBadge, scoreDisplay, timeAgo } from '../lib/formatting';
import type { ApplicationStatus } from '../lib/database-types';

interface AppRow {
  id: string;
  status: ApplicationStatus;
  created_at: string;
  pre_quiz_score: number | null;
  pre_quiz_max_score: number | null;
  pre_quiz_completed_at: string | null;
  pre_quiz_over_time: boolean;
  post_quiz_score: number | null;
  post_quiz_max_score: number | null;
  post_quiz_completed_at: string | null;
  post_quiz_over_time: boolean;
  att_quiz_completed_at: string | null;
  candidate: { first_name: string; last_name: string; email: string };
  position: { title: string; department: string };
}

const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: 'all', label: 'Tutte' },
  { value: 'applied', label: 'Candidati' },
  { value: 'interview', label: 'Colloquio' },
  { value: 'hired', label: 'Assunti' },
  { value: 'rejected', label: 'Scartati' },
];

export async function renderApplicationsList(container: HTMLElement, router: Router) {
  container.innerHTML = `
    <div class="p-8 max-w-6xl mx-auto">
      <div class="flex justify-center py-20"><div class="spinner"></div></div>
    </div>
  `;

  const { data, error } = await supabase
    .from('applications')
    .select(`
      id, status, created_at,
      pre_quiz_score, pre_quiz_max_score, pre_quiz_completed_at, pre_quiz_over_time,
      post_quiz_score, post_quiz_max_score, post_quiz_completed_at, post_quiz_over_time,
      att_quiz_completed_at,
      candidate:candidates(first_name, last_name, email),
      position:positions(title, department)
    `)
    .order('created_at', { ascending: false });

  if (error) {
    showToast('Errore nel caricamento', 'error');
    return;
  }

  const applications: AppRow[] = (data ?? []).map((a: any) => ({
    ...a,
    candidate: Array.isArray(a.candidate) ? a.candidate[0] : a.candidate,
    position: Array.isArray(a.position) ? a.position[0] : a.position,
  }));

  let currentFilter = 'all';
  let searchQuery = '';

  function renderList() {
    const filtered = applications.filter((a) => {
      if (currentFilter !== 'all' && a.status !== currentFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const name = `${a.candidate.first_name} ${a.candidate.last_name}`.toLowerCase();
        return name.includes(q) || a.candidate.email.toLowerCase().includes(q) || a.position.title.toLowerCase().includes(q);
      }
      return true;
    });

    container.innerHTML = `
      <div class="p-8 max-w-6xl mx-auto">
        <div class="flex items-center justify-between mb-6">
          <div>
            <h1 class="text-2xl font-semibold text-amia-950 tracking-tight">Candidature</h1>
            <p class="text-amia-500 text-sm mt-1">${applications.length} totali</p>
          </div>
        </div>

        <!-- Filtri + Ricerca -->
        <div class="flex items-center gap-3 mb-6">
          <div class="flex bg-amia-100 rounded-xl p-1 gap-0.5">
            ${STATUS_FILTERS.map((f) => `
              <button class="status-filter px-3 py-1.5 rounded-lg text-xs font-medium transition-all
                ${currentFilter === f.value ? 'bg-white text-amia-950 shadow-sm' : 'text-amia-500 hover:text-amia-700'}"
                data-status="${f.value}">
                ${f.label}
              </button>
            `).join('')}
          </div>
          <div class="relative flex-1 max-w-xs ml-auto">
            <span class="absolute left-3 top-1/2 -translate-y-1/2 text-amia-300">${iconSearch}</span>
            <input type="text" id="search-input" value="${searchQuery}"
              placeholder="Cerca candidato o posizione..."
              class="w-full pl-9 pr-4 py-2 rounded-xl border border-amia-200 text-sm text-amia-900 placeholder:text-amia-300" />
          </div>
        </div>

        <!-- Tabella -->
        ${filtered.length > 0 ? `
          <div class="bg-white rounded-2xl border border-amia-100 overflow-hidden">
            <table class="w-full">
              <thead>
                <tr class="border-b border-amia-100">
                  <th class="text-left text-xs font-medium text-amia-400 px-5 py-3">Candidato</th>
                  <th class="text-left text-xs font-medium text-amia-400 px-5 py-3">Posizione</th>
                  <th class="text-center text-xs font-medium text-amia-400 px-3 py-3">Logica</th>
                  <th class="text-center text-xs font-medium text-amia-400 px-3 py-3">Skills</th>
                  <th class="text-center text-xs font-medium text-amia-400 px-3 py-3">Att.</th>
                  <th class="text-left text-xs font-medium text-amia-400 px-5 py-3">Status</th>
                  <th class="text-right text-xs font-medium text-amia-400 px-5 py-3">Data</th>
                  <th class="w-8"></th>
                </tr>
              </thead>
              <tbody class="divide-y divide-amia-50">
                ${filtered.map((a) => applicationRow(a)).join('')}
              </tbody>
            </table>
          </div>
        ` : `
          <div class="text-center py-16 bg-white rounded-2xl border border-amia-100">
            <p class="text-amia-400 text-sm">Nessuna candidatura${currentFilter !== 'all' ? ' con questo filtro' : ''}</p>
          </div>
        `}
      </div>
    `;

    // Bind events
    container.querySelectorAll('.status-filter').forEach((btn) => {
      btn.addEventListener('click', () => {
        currentFilter = (btn as HTMLElement).dataset.status!;
        renderList();
      });
    });

    container.querySelector('#search-input')?.addEventListener('input', (e) => {
      searchQuery = (e.target as HTMLInputElement).value;
      renderList();
    });

    container.querySelectorAll('.app-row').forEach((row) => {
      row.addEventListener('click', () => {
        const id = (row as HTMLElement).dataset.id;
        router.navigate(`/applications/${id}`);
      });
    });
  }

  renderList();
}

function quizChip(completed: string | null, score: number | null, max: number | null, overTime: boolean): string {
  if (!completed) return '<span class="text-amia-300 text-xs">—</span>';
  const pct = max ? Math.round(((score ?? 0) / max) * 100) : 0;
  const color = pct >= 80 ? 'text-emerald-600' : pct >= 60 ? 'text-amber-600' : 'text-red-600';
  return `
    <span class="font-semibold text-xs ${color}">${pct}%</span>
    ${overTime ? '<span class="text-[10px] text-red-400" title="Over time">⏱</span>' : ''}
  `;
}

function attChip(completed: string | null): string {
  if (!completed) return '<span class="text-amia-300 text-xs">—</span>';
  return '<span class="text-emerald-600 text-xs font-medium">✓</span>';
}

function applicationRow(a: AppRow): string {
  return `
    <tr class="app-row hover:bg-amia-50/50 cursor-pointer transition-colors" data-id="${a.id}">
      <td class="px-5 py-3.5">
        <p class="text-sm font-medium text-amia-950">${a.candidate.first_name} ${a.candidate.last_name}</p>
        <p class="text-xs text-amia-400">${a.candidate.email}</p>
      </td>
      <td class="px-5 py-3.5">
        <p class="text-sm text-amia-700">${a.position.title}</p>
        <p class="text-xs text-amia-400">${a.position.department}</p>
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