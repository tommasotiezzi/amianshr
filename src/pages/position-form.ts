/**
 * Position form — PageFactory.
 *
 * Handles create + edit modes. Includes the ICP Builder: 11 axis sliders
 * (target 1-5 + weight 0-5 per axis) saved to positions.icp_config.
 *
 * ICP section is collapsible to keep the form manageable. Summary line
 * shows how many axes are configured when collapsed.
 */

import type { PageFactory } from '../lib/page';
import { supabase } from '../lib/supabase-client';
import * as q from '../lib/queries';
import { showToast } from '../lib/toast';
import {
  AXES,
  AXIS_LABELS,
  type AxisType,
  type ContractType,
  type IcpConfig,
  type Position,
  type PositionStatus,
  type Quiz,
} from '../lib/database-types';

// ── Static config ──

const DEPARTMENTS = ['Engineering', 'Design', 'Marketing', 'Sales', 'Operations', 'HR', 'Product'];

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

/**
 * ICP presets — placeholders for now. Fill these with real values based on
 * the framework doc (Team MVP, Team Algo, Marketing/Growth).
 */
const ICP_PRESETS: { key: string; label: string; config: IcpConfig }[] = [
  { key: 'custom',   label: 'Personalizzato', config: {} },
  { key: 'mvp',      label: 'Team MVP',       config: {} },
  { key: 'algo',     label: 'Team Algo',      config: {} },
  { key: 'growth',   label: 'Marketing / Growth', config: {} },
];

// ── Factory ──

export const createPositionFormPage: PageFactory = (ctx) => {
  const isEdit = !!ctx.params.id;
  const positionId = ctx.params.id ?? '';

  let position: Position | null = null;
  let quizzes: Pick<Quiz, 'id' | 'title' | 'quiz_type'>[] = [];
  let icpConfig: IcpConfig = {};
  let isSaving = false;
  let isIcpOpen = isEdit;  // expanded by default when editing

  return {
    async mount() {
      ctx.container.innerHTML = loadingShell();

      // Fetch position (if editing) + quizzes
      const [positionRes, quizzesRes] = await Promise.all([
        isEdit ? q.fetchPosition(positionId, { signal: ctx.signal }) : Promise.resolve(null),
        q.fetchQuizzesMinimal({ signal: ctx.signal }),
      ]);
      if (ctx.signal.aborted) return;

      if (positionRes && positionRes.error) {
        showToast('Posizione non trovata', 'error');
        ctx.router.navigate('/positions');
        return;
      }
      if (quizzesRes.error) {
        showToast('Errore nel caricamento dei quiz', 'error');
        return;
      }

      position = positionRes ? positionRes.data : null;
      quizzes = quizzesRes.data!;
      icpConfig = (position?.icp_config as IcpConfig) ?? {};

      renderForm();
      bindFormEvents();
      bindIcpEvents();
      bindDeleteButton();
    },
  };

  // ── Render ──

  function renderForm() {
    ctx.container.innerHTML = `
      <div class="p-8 max-w-3xl mx-auto">

        <a href="#/positions" class="text-xs text-amia-400 hover:text-amia-600 transition-colors mb-3 inline-block">
          ← Torna alle posizioni
        </a>

        <div class="flex items-center justify-between mb-8">
          <h1 class="text-2xl font-semibold text-amia-950 tracking-tight">
            ${isEdit ? 'Modifica posizione' : 'Nuova posizione'}
          </h1>
          ${isEdit ? `
            <select id="status-select"
              class="px-3 py-1.5 rounded-lg text-xs font-medium border border-amia-200 bg-white text-amia-700">
              ${STATUSES.map((s) => `
                <option value="${s.value}" ${position?.status === s.value ? 'selected' : ''}>${s.label}</option>
              `).join('')}
            </select>
          ` : ''}
        </div>

        <form id="position-form" class="space-y-6">

          <!-- Title -->
          <div>
            <label class="block text-xs font-medium text-amia-600 mb-1.5">Titolo *</label>
            <input type="text" name="title" required
              value="${escapeAttr(position?.title ?? '')}"
              placeholder="es. Frontend Developer"
              class="w-full px-4 py-3 rounded-xl border border-amia-200 text-sm
                     text-amia-900 placeholder:text-amia-300" />
          </div>

          <!-- Description -->
          <div>
            <label class="block text-xs font-medium text-amia-600 mb-1.5">Descrizione *</label>
            <textarea name="description" required rows="6"
              placeholder="Descrivi il ruolo, le responsabilità e i requisiti..."
              class="w-full px-4 py-3 rounded-xl border border-amia-200 text-sm
                     text-amia-900 placeholder:text-amia-300 resize-none"
            >${escapeText(position?.description ?? '')}</textarea>
          </div>

          <!-- Department + Contract -->
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-xs font-medium text-amia-600 mb-1.5">Dipartimento *</label>
              <select name="department" required
                class="w-full px-4 py-3 rounded-xl border border-amia-200 text-sm text-amia-900 bg-white">
                <option value="">Seleziona...</option>
                ${DEPARTMENTS.map((d) => `
                  <option value="${d}" ${position?.department === d ? 'selected' : ''}>${d}</option>
                `).join('')}
              </select>
            </div>
            <div>
              <label class="block text-xs font-medium text-amia-600 mb-1.5">Tipo contratto *</label>
              <select name="contract_type" required
                class="w-full px-4 py-3 rounded-xl border border-amia-200 text-sm text-amia-900 bg-white">
                ${CONTRACT_TYPES.map((c) => `
                  <option value="${c.value}" ${position?.contract_type === c.value ? 'selected' : ''}>${c.label}</option>
                `).join('')}
              </select>
            </div>
          </div>

          <!-- Location -->
          <div>
            <label class="block text-xs font-medium text-amia-600 mb-1.5">Sede *</label>
            <input type="text" name="location" required
              value="${escapeAttr(position?.location ?? '')}"
              placeholder="es. Remoto, Milano, Darfo Boario Terme"
              class="w-full px-4 py-3 rounded-xl border border-amia-200 text-sm
                     text-amia-900 placeholder:text-amia-300" />
          </div>

          <!-- Salary -->
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-xs font-medium text-amia-600 mb-1.5">RAL minima (opzionale)</label>
              <input type="number" name="salary_min"
                value="${position?.salary_min ?? ''}"
                placeholder="30000"
                class="w-full px-4 py-3 rounded-xl border border-amia-200 text-sm
                       text-amia-900 placeholder:text-amia-300" />
            </div>
            <div>
              <label class="block text-xs font-medium text-amia-600 mb-1.5">RAL massima (opzionale)</label>
              <input type="number" name="salary_max"
                value="${position?.salary_max ?? ''}"
                placeholder="45000"
                class="w-full px-4 py-3 rounded-xl border border-amia-200 text-sm
                       text-amia-900 placeholder:text-amia-300" />
            </div>
          </div>

          <!-- Quizzes -->
          <div class="space-y-4">
            <p class="text-xs font-medium text-amia-600">Quiz associati</p>
            <div class="grid grid-cols-3 gap-4">
              ${quizSelectHtml('pre_quiz_id',  'Quiz Logica',   position?.pre_quiz_id,  'logic')}
              ${quizSelectHtml('post_quiz_id', 'Quiz Skills',   position?.post_quiz_id, 'skills')}
              ${quizSelectHtml('att_quiz_id',  'Attitudinale',  position?.att_quiz_id,  'attitudinal')}
            </div>
          </div>

          <!-- ICP Builder -->
          ${icpSectionHtml()}

          <!-- Actions -->
          <div class="flex items-center gap-3 pt-4 border-t border-amia-100">
            <button type="submit" id="submit-btn"
              class="bg-amia-950 text-white px-6 py-3 rounded-xl text-sm font-medium
                     hover:bg-amia-900 active:scale-[0.98] transition-all
                     flex items-center gap-2">
              <span id="submit-text">${isEdit ? 'Salva modifiche' : 'Crea posizione'}</span>
              <div id="submit-spinner" class="spinner hidden"></div>
            </button>
            <a href="#/positions"
               class="px-6 py-3 rounded-xl text-sm font-medium text-amia-600 hover:bg-amia-50 transition-colors">
              Annulla
            </a>
            ${isEdit ? `
              <button type="button" id="delete-btn"
                class="ml-auto px-4 py-3 rounded-xl text-sm font-medium text-red-600
                       hover:bg-red-50 transition-colors">
                Elimina
              </button>
            ` : ''}
          </div>
        </form>
      </div>
    `;
  }

  function quizSelectHtml(name: string, label: string, currentId: string | null | undefined, filterType: string): string {
    const options = quizzes.filter((qz) => qz.quiz_type === filterType);
    return `
      <div>
        <label class="block text-[11px] font-medium text-amia-500 mb-1">${label}</label>
        <select name="${name}"
          class="w-full px-3 py-2.5 rounded-xl border border-amia-200 text-sm text-amia-900 bg-white">
          <option value="">Nessuno</option>
          ${options.map((qz) => `
            <option value="${qz.id}" ${currentId === qz.id ? 'selected' : ''}>${escapeText(qz.title)}</option>
          `).join('')}
        </select>
      </div>
    `;
  }

  // ── ICP section ──

  function icpSectionHtml(): string {
    const configuredCount = Object.values(icpConfig).filter((c) => c && c.weight > 0).length;
    const summary = configuredCount > 0
      ? `${configuredCount} ${configuredCount === 1 ? 'asse configurato' : 'assi configurati'}, ${AXES.length - configuredCount} ignorati`
      : 'Nessun asse configurato';

    return `
      <div class="border border-amia-100 rounded-2xl overflow-hidden">
        <button type="button" id="icp-toggle"
          class="w-full px-5 py-4 flex items-center justify-between bg-white hover:bg-amia-50/50 transition-colors text-left">
          <div>
            <p class="text-sm font-semibold text-amia-950">ICP — Ideal Candidate Profile</p>
            <p class="text-xs text-amia-400 mt-0.5">${summary}</p>
          </div>
          <span class="text-amia-400 text-lg" id="icp-chevron">${isIcpOpen ? '▾' : '▸'}</span>
        </button>

        <div id="icp-body" class="${isIcpOpen ? '' : 'hidden'} px-5 pb-5 pt-1 border-t border-amia-50 bg-amia-50/30">
          <div class="flex items-center gap-3 mb-5 mt-4">
            <label class="text-xs font-medium text-amia-600 shrink-0">Preset:</label>
            <select id="icp-preset"
              class="px-3 py-2 rounded-lg border border-amia-200 text-xs text-amia-900 bg-white">
              ${ICP_PRESETS.map((p) => `<option value="${p.key}">${p.label}</option>`).join('')}
            </select>
            <p class="text-[11px] text-amia-400">
              Target = punteggio desiderato (1-5). Peso = importanza (0 = ignora).
            </p>
          </div>

          <div class="space-y-2" id="icp-sliders">
            ${AXES.map((axis) => axisRowHtml(axis, icpConfig[axis])).join('')}
          </div>
        </div>
      </div>
    `;
  }

function axisRowHtml(axis: AxisType, cfg: { target: number; weight: number } | undefined): string {
  const target = cfg?.target ?? 3;
  const weight = cfg?.weight ?? 0;
  const isActive = weight > 0;
  return `
    <div class="axis-row flex items-center gap-5 py-2.5 px-3 rounded-xl bg-white border border-amia-50
                ${isActive ? '' : 'opacity-50'}" data-axis="${axis}">

      <!-- Axis name -->
      <div class="flex-1 min-w-0">
        <p class="text-xs font-medium text-amia-900 truncate">${AXIS_LABELS[axis]}</p>
      </div>

      <!-- Target slider -->
      <div class="flex items-center gap-2 w-44 shrink-0">
        <span class="text-[10px] font-medium text-amia-400 w-8 shrink-0">Target</span>
        <input type="range" min="1" max="5" step="1" value="${target}"
          data-role="target" data-axis="${axis}"
          class="flex-1 min-w-0 accent-amia-950" />
        <span class="text-xs font-semibold text-amia-900 w-4 text-right shrink-0" data-readout="target" data-axis="${axis}">${target}</span>
      </div>

      <!-- Weight slider -->
      <div class="flex items-center gap-2 w-44 shrink-0">
        <span class="text-[10px] font-medium text-amia-400 w-8 shrink-0">Peso</span>
        <input type="range" min="0" max="5" step="1" value="${weight}"
          data-role="weight" data-axis="${axis}"
          class="flex-1 min-w-0 accent-accent" />
        <span class="text-xs font-semibold text-amia-900 w-4 text-right shrink-0" data-readout="weight" data-axis="${axis}">${weight}</span>
      </div>
    </div>
  `;
}

  // ── Events ──

  function bindFormEvents() {
    const form = ctx.$<HTMLFormElement>('#position-form');
    if (!form) return;

    ctx.on(form, 'submit', async (e) => {
      e.preventDefault();
      if (isSaving) return;
      await handleSubmit(form);
    });
  }

  function bindIcpEvents() {
    // Collapse toggle
    const toggle = ctx.$<HTMLButtonElement>('#icp-toggle');
    ctx.on(toggle, 'click', () => {
      isIcpOpen = !isIcpOpen;
      const body = ctx.$<HTMLElement>('#icp-body');
      const chevron = ctx.$<HTMLElement>('#icp-chevron');
      body?.classList.toggle('hidden', !isIcpOpen);
      if (chevron) chevron.textContent = isIcpOpen ? '▾' : '▸';
    });

    // Preset selector
    const preset = ctx.$<HTMLSelectElement>('#icp-preset');
    ctx.on(preset, 'change', () => {
      if (!preset) return;
      const found = ICP_PRESETS.find((p) => p.key === preset.value);
      if (!found || found.key === 'custom') return;
      icpConfig = { ...found.config };
      refreshIcpSliders();
    });

    // Sliders (delegated via individual inputs — 22 total, fine)
    ctx.$$<HTMLInputElement>('#icp-sliders input[type="range"]').forEach((input) => {
      ctx.on(input, 'input', () => {
        const axis = input.dataset.axis as AxisType;
        const role = input.dataset.role as 'target' | 'weight';
        const value = parseInt(input.value, 10);

        // Update the closure state
        const existing = icpConfig[axis] ?? { target: 3, weight: 0 };
        icpConfig[axis] = { ...existing, [role]: value };

        // Update the readout
        const readout = ctx.$<HTMLElement>(`[data-readout="${role}"][data-axis="${axis}"]`);
        if (readout) readout.textContent = String(value);

        // Update row dimming if weight changed
        if (role === 'weight') {
          const row = ctx.$<HTMLElement>(`.axis-row[data-axis="${axis}"]`);
          row?.classList.toggle('opacity-50', value === 0);
        }

        // Update the summary count
        updateIcpSummary();
      });
    });
  }

  function refreshIcpSliders() {
    AXES.forEach((axis) => {
      const cfg = icpConfig[axis] ?? { target: 3, weight: 0 };
      const tInput = ctx.$<HTMLInputElement>(`input[data-role="target"][data-axis="${axis}"]`);
      const wInput = ctx.$<HTMLInputElement>(`input[data-role="weight"][data-axis="${axis}"]`);
      const tRead  = ctx.$<HTMLElement>(`[data-readout="target"][data-axis="${axis}"]`);
      const wRead  = ctx.$<HTMLElement>(`[data-readout="weight"][data-axis="${axis}"]`);
      const row    = ctx.$<HTMLElement>(`.axis-row[data-axis="${axis}"]`);

      if (tInput) tInput.value = String(cfg.target);
      if (wInput) wInput.value = String(cfg.weight);
      if (tRead)  tRead.textContent = String(cfg.target);
      if (wRead)  wRead.textContent = String(cfg.weight);
      row?.classList.toggle('opacity-50', cfg.weight === 0);
    });
    updateIcpSummary();
  }

  function updateIcpSummary() {
    const toggle = ctx.$<HTMLElement>('#icp-toggle');
    const summaryEl = toggle?.querySelector<HTMLElement>('p.text-xs');
    if (!summaryEl) return;
    const configuredCount = Object.values(icpConfig).filter((c) => c && c.weight > 0).length;
    summaryEl.textContent = configuredCount > 0
      ? `${configuredCount} ${configuredCount === 1 ? 'asse configurato' : 'assi configurati'}, ${AXES.length - configuredCount} ignorati`
      : 'Nessun asse configurato';
  }

  function bindDeleteButton() {
    if (!isEdit) return;
    const btn = ctx.$<HTMLButtonElement>('#delete-btn');
    ctx.on(btn, 'click', async () => {
      if (!confirm('Sei sicuro di voler eliminare questa posizione? Verranno eliminate anche tutte le candidature associate.')) return;

      const { error } = await supabase.from('positions').delete().eq('id', positionId);
      if (ctx.signal.aborted) return;
      if (error) { showToast(`Errore: ${error.message}`, 'error'); return; }

      showToast('Posizione eliminata');
      setTimeout(() => ctx.router.navigate('/positions'), 400);
    });
  }

  // ── Submit ──

  async function handleSubmit(form: HTMLFormElement) {
    const submitBtn = ctx.$<HTMLButtonElement>('#submit-btn');
    const submitText = ctx.$('#submit-text');
    const submitSpinner = ctx.$('#submit-spinner');

    if (!submitBtn || !submitText || !submitSpinner) return;

    isSaving = true;
    submitBtn.disabled = true;
    submitText.textContent = 'Salvataggio...';
    submitSpinner.classList.remove('hidden');

    const formData = new FormData(form);
    const title = (formData.get('title') as string).trim();

    // Strip out axes where weight = 0 (keep payload tight)
    const cleanedIcp: IcpConfig = {};
    for (const axis of AXES) {
      const cfg = icpConfig[axis];
      if (cfg && cfg.weight > 0) cleanedIcp[axis] = cfg;
    }

    const payload: Record<string, unknown> = {
      title,
      description: (formData.get('description') as string).trim(),
      department: formData.get('department'),
      contract_type: formData.get('contract_type'),
      location: (formData.get('location') as string).trim(),
      salary_min: formData.get('salary_min') ? Number(formData.get('salary_min')) : null,
      salary_max: formData.get('salary_max') ? Number(formData.get('salary_max')) : null,
      pre_quiz_id:  (formData.get('pre_quiz_id')  as string) || null,
      post_quiz_id: (formData.get('post_quiz_id') as string) || null,
      att_quiz_id:  (formData.get('att_quiz_id')  as string) || null,
      icp_config: cleanedIcp,
      slug: generateSlug(title),
    };

    let error: { message: string } | null = null;

    if (isEdit) {
      const statusSelect = ctx.$<HTMLSelectElement>('#status-select');
      const status = (statusSelect?.value ?? 'draft') as PositionStatus;
      // Stamp published_at when going to published
      const withStatus = { ...payload, status } as Record<string, unknown>;
      if (status === 'published' && position?.status !== 'published') {
        withStatus.published_at = new Date().toISOString();
      }
      ({ error } = await supabase.from('positions').update(withStatus).eq('id', positionId));
    } else {
      ({ error } = await supabase.from('positions').insert(payload));
    }

    if (ctx.signal.aborted) return;

    if (error) {
      showToast(`Errore: ${error.message}`, 'error');
      isSaving = false;
      submitBtn.disabled = false;
      submitText.textContent = isEdit ? 'Salva modifiche' : 'Crea posizione';
      submitSpinner.classList.add('hidden');
      return;
    }

    showToast(isEdit ? 'Posizione aggiornata' : 'Posizione creata');
    setTimeout(() => ctx.router.navigate('/positions'), 400);
  }
};

// ── Helpers ──

function loadingShell(): string {
  return `
    <div class="p-8 max-w-3xl mx-auto">
      <div class="flex justify-center py-20"><div class="spinner"></div></div>
    </div>
  `;
}

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function escapeAttr(s: string): string {
  return s.replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function escapeText(s: string): string {
  return s.replace(/</g, '&lt;').replace(/>/g, '&gt;');
}