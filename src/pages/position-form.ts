/**
 * Position form — sync mount, with ICP builder.
 */

import type { PageFactory } from '../lib/page';
import { supabase } from '../lib/supabase-client';
import * as q from '../lib/queries';
import { showToast } from '../lib/toast';
import {
  AXES, AXIS_LABELS,
  type AxisType, type Position, type PositionStatus, type ContractType, type Quiz,
} from '../lib/database-types';

const CONTRACT_TYPES: { value: ContractType; label: string }[] = [
  { value: 'full_time',  label: 'Full-time' },
  { value: 'part_time',  label: 'Part-time' },
  { value: 'freelance',  label: 'Freelance' },
  { value: 'internship', label: 'Stage' },
];

const STATUSES: { value: PositionStatus; label: string }[] = [
  { value: 'draft',     label: 'Bozza' },
  { value: 'published', label: 'Pubblicata' },
  { value: 'closed',    label: 'Chiusa' },
  { value: 'archived',  label: 'Archiviata' },
];

type IcpRow = { target: number; weight: number };
type IcpConfig = Partial<Record<AxisType, IcpRow>>;

export const createPositionFormPage: PageFactory = (ctx) => {
  const isEdit = !!ctx.params.id;
  const positionId = ctx.params.id ?? '';

  let position: Partial<Position> = isEdit ? {} : {
    title: '', description: '', department: '', contract_type: 'full_time',
    location: '', salary_min: null, salary_max: null, status: 'draft',
    pre_quiz_id: null, post_quiz_id: null, att_quiz_id: null, icp_config: {},
  };
  let quizzes: Quiz[] = [];
  let icp: IcpConfig = (position.icp_config as IcpConfig) ?? {};
  let isSaving = false;

  ctx.container.innerHTML = loadingShell();

  const fetches = isEdit
    ? Promise.all([q.fetchPosition(positionId, { signal: ctx.signal }), q.fetchQuizzes({ signal: ctx.signal })])
    : Promise.all([Promise.resolve({ data: null, error: null }), q.fetchQuizzes({ signal: ctx.signal })]);

  fetches.then(([posRes, quizRes]: any[]) => {
    if (ctx.signal.aborted) return;
    if (isEdit && (posRes.error || !posRes.data)) {
      showToast('Posizione non trovata', 'error');
      ctx.router.navigate('/positions');
      return;
    }
    if (quizRes.error) {
      showToast('Errore nel caricamento dei quiz', 'error');
    }
    if (isEdit) {
      position = posRes.data;
      icp = (position.icp_config as IcpConfig) ?? {};
    }
    quizzes = quizRes.data ?? [];
    renderFull();
    bindEvents();
  }).catch((err) => {
    if (ctx.signal.aborted) return;
    console.error('[position-form]', err);
  });

  function renderFull() {
    const preQuizzes  = quizzes.filter((q) => q.quiz_type === 'logic');
    const postQuizzes = quizzes.filter((q) => q.quiz_type === 'skills');
    const attQuizzes  = quizzes.filter((q) => q.quiz_type === 'attitudinal');

    ctx.container.innerHTML = `
      <div class="p-8 max-w-3xl mx-auto">
        <a href="#/positions" class="text-xs text-amia-400 hover:text-amia-600 transition-colors mb-3 inline-block">← Torna alle posizioni</a>
        <h1 class="text-2xl font-semibold text-amia-950 tracking-tight mb-8">${isEdit ? 'Modifica posizione' : 'Nuova posizione'}</h1>

        <form id="position-form" class="space-y-6">
          <!-- Title -->
          ${fieldWrap('Titolo *', `<input type="text" name="title" required value="${escapeAttr(position.title ?? '')}" placeholder="es. Senior Data Analyst" class="${inputCls}" />`)}

          <!-- Description -->
          ${fieldWrap('Descrizione *', `<textarea name="description" rows="4" required class="${inputCls} resize-none">${escapeText(position.description ?? '')}</textarea>`)}

          <!-- Dept + Contract -->
          <div class="grid grid-cols-2 gap-4">
            ${fieldWrap('Dipartimento *', `<input type="text" name="department" required value="${escapeAttr(position.department ?? '')}" placeholder="Engineering, Design, Marketing..." class="${inputCls}" />`)}
            ${fieldWrap('Tipo contratto *', `
              <select name="contract_type" required class="${inputCls} bg-white">
                ${CONTRACT_TYPES.map((c) => `<option value="${c.value}" ${position.contract_type === c.value ? 'selected' : ''}>${c.label}</option>`).join('')}
              </select>
            `)}
          </div>

          <!-- Location -->
          ${fieldWrap('Sede *', `<input type="text" name="location" required value="${escapeAttr(position.location ?? '')}" placeholder="es. Remoto, Milano" class="${inputCls}" />`)}

          <!-- Salary -->
          <div class="grid grid-cols-2 gap-4">
            ${fieldWrap('RAL minima (opzionale)', `<input type="number" name="salary_min" value="${position.salary_min ?? ''}" placeholder="30000" class="${inputCls}" />`)}
            ${fieldWrap('RAL massima (opzionale)', `<input type="number" name="salary_max" value="${position.salary_max ?? ''}" placeholder="45000" class="${inputCls}" />`)}
          </div>

          <!-- Quiz -->
          <div class="space-y-3 pt-2">
            <p class="text-xs font-semibold text-amia-700 uppercase tracking-wider">Quiz associati</p>
            <div class="grid grid-cols-3 gap-4">
              ${quizSelect('Logica (pre)',   'pre_quiz_id',  preQuizzes,  position.pre_quiz_id)}
              ${quizSelect('Skills (post)',  'post_quiz_id', postQuizzes, position.post_quiz_id)}
              ${quizSelect('Attitudinale',   'att_quiz_id',  attQuizzes,  position.att_quiz_id)}
            </div>
          </div>

          <!-- ICP -->
          ${icpSection(icp)}

          <!-- Status -->
          ${fieldWrap('Stato', `
            <select name="status" class="${inputCls} bg-white">
              ${STATUSES.map((s) => `<option value="${s.value}" ${position.status === s.value ? 'selected' : ''}>${s.label}</option>`).join('')}
            </select>
          `)}

          <!-- Actions -->
          <div class="flex items-center gap-3 pt-2 border-t border-amia-100 mt-8">
            <button type="submit" class="bg-amia-950 text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-amia-900 active:scale-[0.98] transition-all">
              ${isEdit ? 'Salva modifiche' : 'Crea posizione'}
            </button>
            ${isEdit ? `<button type="button" id="delete-btn" class="px-4 py-2.5 rounded-xl text-sm font-medium text-red-600 hover:bg-red-50 transition-colors">Elimina</button>` : ''}
          </div>
        </form>
      </div>
    `;
  }

  function bindEvents() {
    ctx.on(ctx.$<HTMLFormElement>('#position-form'), 'submit', (e) => {
      e.preventDefault();
      handleSubmit();
    });

    // ICP target/weight inputs
    ctx.$$<HTMLInputElement>('.icp-target, .icp-weight').forEach((input) => {
      ctx.on(input, 'input', () => {
        const axis = input.dataset.axis as AxisType;
        const field = input.classList.contains('icp-target') ? 'target' : 'weight';
        const value = Number(input.value) || 0;

        if (!icp[axis]) icp[axis] = { target: 3, weight: 0 };
        icp[axis]![field] = value;

        const rowEl = ctx.$<HTMLElement>(`[data-icp-row="${axis}"]`);
        if (rowEl) {
          const isActive = (icp[axis]!.weight ?? 0) > 0;
          rowEl.classList.toggle('opacity-40', !isActive);
        }
      });
    });

    ctx.on(ctx.$<HTMLButtonElement>('#delete-btn'), 'click', () => {
      if (!confirm('Eliminare questa posizione?')) return;
      supabase.from('positions').delete().eq('id', positionId).then(({ error }) => {
        if (ctx.signal.aborted) return;
        if (error) { showToast(`Errore: ${error.message}`, 'error'); return; }
        showToast('Posizione eliminata');
        setTimeout(() => ctx.router.navigate('/positions'), 300);
      });
    });
  }

  function handleSubmit() {
    if (isSaving) return;
    isSaving = true;

    const form = ctx.$<HTMLFormElement>('#position-form');
    if (!form) { isSaving = false; return; }
    const data = new FormData(form);

    // Clean ICP: drop weight-0 entries
    const cleanIcp: IcpConfig = {};
    for (const axis of AXES) {
      const row = icp[axis];
      if (row && row.weight > 0) cleanIcp[axis] = row;
    }

    const payload = {
      title: (data.get('title') as string).trim(),
      description: (data.get('description') as string).trim(),
      department: (data.get('department') as string).trim(),
      contract_type: data.get('contract_type') as ContractType,
      location: (data.get('location') as string).trim(),
      salary_min: data.get('salary_min') ? Number(data.get('salary_min')) : null,
      salary_max: data.get('salary_max') ? Number(data.get('salary_max')) : null,
      status: data.get('status') as PositionStatus,
      pre_quiz_id:  (data.get('pre_quiz_id')  as string) || null,
      post_quiz_id: (data.get('post_quiz_id') as string) || null,
      att_quiz_id:  (data.get('att_quiz_id')  as string) || null,
      icp_config: cleanIcp,
      slug: (data.get('title') as string).trim().toLowerCase()
        .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
      published_at: data.get('status') === 'published'
        ? (position.published_at ?? new Date().toISOString())
        : position.published_at ?? null,
    };

    const op = isEdit
      ? supabase.from('positions').update(payload).eq('id', positionId).select().single()
      : supabase.from('positions').insert(payload).select().single();

    op.then(({ data: result, error }) => {
      if (ctx.signal.aborted) return;
      if (error) { showToast(`Errore: ${error.message}`, 'error'); isSaving = false; return; }
      showToast(isEdit ? 'Posizione aggiornata' : 'Posizione creata');
      setTimeout(() => ctx.router.navigate('/positions'), 300);
    });
  }
};

// ── HTML ──

const inputCls = 'w-full px-4 py-3 rounded-xl border border-amia-200 text-sm text-amia-900 placeholder:text-amia-300';

function fieldWrap(label: string, field: string): string {
  return `<div><label class="block text-xs font-medium text-amia-600 mb-1.5">${label}</label>${field}</div>`;
}

function quizSelect(label: string, name: string, options: Quiz[], current: string | null | undefined): string {
  return `
    <div>
      <label class="block text-[11px] font-medium text-amia-500 mb-1">${label}</label>
      <select name="${name}" class="w-full px-3 py-2.5 rounded-xl border border-amia-200 text-sm text-amia-900 bg-white">
        <option value="">Nessuno</option>
        ${options.map((q) => `<option value="${q.id}" ${current === q.id ? 'selected' : ''}>${escapeText(q.title)}</option>`).join('')}
      </select>
    </div>
  `;
}

function icpSection(icp: IcpConfig): string {
  return `
    <div class="space-y-3 pt-2">
      <div>
        <p class="text-xs font-semibold text-amia-700 uppercase tracking-wider mb-1">Profilo ICP</p>
        <p class="text-xs text-amia-500">Target = valore ideale (1-5). Peso = importanza dell'asse (0 = ignora, 5 = massimo).</p>
      </div>
      <div class="bg-white rounded-2xl border border-amia-100 overflow-hidden">
        <div class="grid grid-cols-[1fr_auto_auto] gap-3 px-4 py-2 bg-amia-50 border-b border-amia-100 text-[11px] font-medium text-amia-400">
          <span>Asse</span>
          <span class="text-center w-20">Target</span>
          <span class="text-center w-20">Peso</span>
        </div>
        ${AXES.map((axis) => {
          const row = icp[axis] ?? { target: 3, weight: 0 };
          const isActive = row.weight > 0;
          return `
            <div class="grid grid-cols-[1fr_auto_auto] gap-3 px-4 py-2.5 border-b border-amia-50 last:border-b-0 ${isActive ? '' : 'opacity-40'}" data-icp-row="${axis}">
              <span class="text-xs text-amia-700">${AXIS_LABELS[axis]}</span>
              <input type="number" min="1" max="5" value="${row.target}" data-axis="${axis}"
                class="icp-target w-20 px-2 py-1 rounded-lg border border-amia-200 text-xs text-center text-amia-900" />
              <input type="number" min="0" max="5" value="${row.weight}" data-axis="${axis}"
                class="icp-weight w-20 px-2 py-1 rounded-lg border border-amia-200 text-xs text-center text-amia-900" />
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

function loadingShell(): string {
  return `<div class="p-8 max-w-3xl mx-auto"><div class="flex justify-center py-20"><div class="spinner"></div></div></div>`;
}

function escapeAttr(s: string): string { return s.replace(/"/g, '&quot;').replace(/</g, '&lt;'); }
function escapeText(s: string): string { return s.replace(/</g, '&lt;').replace(/>/g, '&gt;'); }