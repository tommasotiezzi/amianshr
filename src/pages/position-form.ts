/**
 * Form creazione e modifica posizione.
 * Gestisce: crea nuova, modifica esistente, cambio status, associazione quiz.
 */

import { Router } from '../router';
import { supabase } from '../lib/supabase-client';
import { showToast } from '../lib/toast';
import type { Position, PositionStatus, Quiz } from '../lib/database-types';

export async function renderPositionForm(
  container: HTMLElement,
  router: Router,
  params?: Record<string, string>
) {
  const isEdit = !!params?.id;

  // Loading
  container.innerHTML = `
    <div class="p-8 max-w-3xl mx-auto">
      <div class="flex justify-center py-20"><div class="spinner"></div></div>
    </div>
  `;

  // Fetch position (if editing) and quizzes list
  let position: Position | null = null;
  if (isEdit) {
    const { data, error } = await supabase
      .from('positions')
      .select('*')
      .eq('id', params!.id)
      .single();

    if (error || !data) {
      showToast('Posizione non trovata', 'error');
      router.navigate('/positions');
      return;
    }
    position = data;
  }

  const { data: quizzes } = await supabase
    .from('quizzes')
    .select('id, title')
    .order('title');

  render(container, router, isEdit, position, quizzes ?? [], params);
}

function render(
  container: HTMLElement,
  router: Router,
  isEdit: boolean,
  position: Position | null,
  quizzes: Pick<Quiz, 'id' | 'title'>[],
  params?: Record<string, string>
) {
  const positionId = params?.id ?? '';
  const departments = ['Engineering', 'Design', 'Marketing', 'Sales', 'Operations', 'HR', 'Product'];
  const contractTypes = [
    { value: 'full-time', label: 'Full-time' },
    { value: 'part-time', label: 'Part-time' },
    { value: 'freelance', label: 'Freelance' },
    { value: 'stage', label: 'Stage' },
  ];
  const statuses = [
    { value: 'draft', label: 'Bozza' },
    { value: 'published', label: 'Pubblicata' },
    { value: 'closed', label: 'Chiusa' },
    { value: 'archived', label: 'Archiviata' },
  ];

  container.innerHTML = `
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
            ${statuses.map((s) => `
              <option value="${s.value}" ${position?.status === s.value ? 'selected' : ''}>${s.label}</option>
            `).join('')}
          </select>
        ` : ''}
      </div>

      <form id="position-form" class="space-y-6">

        <!-- Titolo -->
        <div>
          <label class="block text-xs font-medium text-amia-600 mb-1.5">Titolo *</label>
          <input type="text" name="title" required
            value="${position?.title ?? ''}"
            placeholder="es. Frontend Developer"
            class="w-full px-4 py-3 rounded-xl border border-amia-200 text-sm
                   text-amia-900 placeholder:text-amia-300" />
        </div>

        <!-- Descrizione -->
        <div>
          <label class="block text-xs font-medium text-amia-600 mb-1.5">Descrizione *</label>
          <textarea name="description" required rows="6"
            placeholder="Descrivi il ruolo, le responsabilità e i requisiti..."
            class="w-full px-4 py-3 rounded-xl border border-amia-200 text-sm
                   text-amia-900 placeholder:text-amia-300 resize-none"
          >${position?.description ?? ''}</textarea>
        </div>

        <!-- Dipartimento + Contratto -->
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-xs font-medium text-amia-600 mb-1.5">Dipartimento *</label>
            <select name="department" required
              class="w-full px-4 py-3 rounded-xl border border-amia-200 text-sm text-amia-900 bg-white">
              <option value="">Seleziona...</option>
              ${departments.map((d) => `
                <option value="${d}" ${position?.department === d ? 'selected' : ''}>${d}</option>
              `).join('')}
            </select>
          </div>
          <div>
            <label class="block text-xs font-medium text-amia-600 mb-1.5">Tipo contratto *</label>
            <select name="contract_type" required
              class="w-full px-4 py-3 rounded-xl border border-amia-200 text-sm text-amia-900 bg-white">
              ${contractTypes.map((c) => `
                <option value="${c.value}" ${position?.contract_type === c.value ? 'selected' : ''}>${c.label}</option>
              `).join('')}
            </select>
          </div>
        </div>

        <!-- Sede -->
        <div>
          <label class="block text-xs font-medium text-amia-600 mb-1.5">Sede *</label>
          <input type="text" name="location" required
            value="${position?.location ?? ''}"
            placeholder="es. Remoto, Milano, Darfo Boario Terme"
            class="w-full px-4 py-3 rounded-xl border border-amia-200 text-sm
                   text-amia-900 placeholder:text-amia-300" />
        </div>

        <!-- RAL -->
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

        <!-- Quiz -->
        <div class="space-y-4">
          <p class="text-xs font-medium text-amia-600">Quiz associati</p>
          <div class="grid grid-cols-3 gap-4">
            <div>
              <label class="block text-[11px] font-medium text-amia-500 mb-1">Quiz Logica (25 min)</label>
              <select name="pre_quiz_id"
                class="w-full px-3 py-2.5 rounded-xl border border-amia-200 text-sm text-amia-900 bg-white">
                <option value="">Nessuno</option>
                ${quizzes.map((q) => `
                  <option value="${q.id}" ${position?.pre_quiz_id === q.id ? 'selected' : ''}>${q.title}</option>
                `).join('')}
              </select>
            </div>
            <div>
              <label class="block text-[11px] font-medium text-amia-500 mb-1">Quiz Skills (35 min)</label>
              <select name="post_quiz_id"
                class="w-full px-3 py-2.5 rounded-xl border border-amia-200 text-sm text-amia-900 bg-white">
                <option value="">Nessuno</option>
                ${quizzes.map((q) => `
                  <option value="${q.id}" ${position?.post_quiz_id === q.id ? 'selected' : ''}>${q.title}</option>
                `).join('')}
              </select>
            </div>
            <div>
              <label class="block text-[11px] font-medium text-amia-500 mb-1">Attitudinale (opzionale)</label>
              <select name="att_quiz_id"
                class="w-full px-3 py-2.5 rounded-xl border border-amia-200 text-sm text-amia-900 bg-white">
                <option value="">Nessuno</option>
                ${quizzes.map((q) => `
                  <option value="${q.id}" ${position?.att_quiz_id === q.id ? 'selected' : ''}>${q.title}</option>
                `).join('')}
              </select>
            </div>
          </div>
        </div>

        <!-- Azioni -->
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

  // ── Form submit ──

  const form = document.getElementById('position-form') as HTMLFormElement;
  const submitBtn = document.getElementById('submit-btn') as HTMLButtonElement;
  const submitText = document.getElementById('submit-text')!;
  const submitSpinner = document.getElementById('submit-spinner')!;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    submitBtn.disabled = true;
    submitText.textContent = 'Salvataggio...';
    submitSpinner.classList.remove('hidden');

    const formData = new FormData(form);
    const title = formData.get('title') as string;

    const payload = {
      title,
      description: formData.get('description') as string,
      department: formData.get('department') as string,
      contract_type: formData.get('contract_type') as string,
      location: formData.get('location') as string,
      salary_min: formData.get('salary_min') ? Number(formData.get('salary_min')) : null,
      salary_max: formData.get('salary_max') ? Number(formData.get('salary_max')) : null,
      pre_quiz_id: (formData.get('pre_quiz_id') as string) || null,
      post_quiz_id: (formData.get('post_quiz_id') as string) || null,
      att_quiz_id: (formData.get('att_quiz_id') as string) || null,
      slug: generateSlug(title),
    };

    let error;

    if (isEdit) {
      // Includi anche lo status dal dropdown
      const status = (document.getElementById('status-select') as HTMLSelectElement)?.value as PositionStatus;
      ({ error } = await supabase
        .from('positions')
        .update({ ...payload, status })
        .eq('id', positionId));
    } else {
      ({ error } = await supabase
        .from('positions')
        .insert(payload));
    }

    if (error) {
      showToast(`Errore: ${error.message}`, 'error');
      submitBtn.disabled = false;
      submitText.textContent = isEdit ? 'Salva modifiche' : 'Crea posizione';
      submitSpinner.classList.add('hidden');
      return;
    }

    showToast(isEdit ? 'Posizione aggiornata' : 'Posizione creata');
    setTimeout(() => router.navigate('/positions'), 400);
  });

  // ── Delete ──

  document.getElementById('delete-btn')?.addEventListener('click', async () => {
    if (!confirm('Sei sicuro di voler eliminare questa posizione? Verranno eliminate anche tutte le candidature associate.')) {
      return;
    }

    const { error } = await supabase
      .from('positions')
      .delete()
      .eq('id', positionId);

    if (error) {
      showToast(`Errore: ${error.message}`, 'error');
      return;
    }

    showToast('Posizione eliminata');
    setTimeout(() => router.navigate('/positions'), 400);
  });
}

// ── Helpers ──

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}