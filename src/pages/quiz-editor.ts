/**
 * Editor Quiz — crea/modifica quiz con gestione domande inline.
 *
 * Layout:
 *   [Header quiz: titolo, tipo, durata]
 *   [Lista domande con edit inline]
 *   [+ Aggiungi domanda]
 */

import { Router } from '../router';
import { supabase } from '../lib/supabase-client';
import { showToast } from '../lib/toast';
import { iconPlus } from '../lib/icons';
import type { Quiz, QuizQuestion, QuizType, QuestionType, QuestionConfig } from '../lib/database-types';

// ── State ──

let quiz: Partial<Quiz> = {};
let questions: QuizQuestion[] = [];
let isEdit = false;
let quizId = '';
let isSaving = false;

export async function renderQuizEditor(
  container: HTMLElement,
  router: Router,
  params?: Record<string, string>
) {
  isEdit = !!params?.id;
  quizId = params?.id ?? '';

  // Loading
  container.innerHTML = `
    <div class="p-8 max-w-4xl mx-auto">
      <div class="flex justify-center py-20"><div class="spinner"></div></div>
    </div>
  `;

  if (isEdit) {
    const [quizRes, questionsRes] = await Promise.all([
      supabase.from('quizzes').select('*').eq('id', quizId).single(),
      supabase.from('quiz_questions').select('*').eq('quiz_id', quizId).order('sort_order'),
    ]);

    if (quizRes.error || !quizRes.data) {
      showToast('Quiz non trovato', 'error');
      router.navigate('/quizzes');
      return;
    }

    quiz = quizRes.data;
    questions = questionsRes.data ?? [];
  } else {
    quiz = { title: '', description: '', quiz_type: 'logic', duration_minutes: 25 };
    questions = [];
  }

  render(container, router);
}

function render(container: HTMLElement, router: Router) {
  const types: { value: QuizType; label: string }[] = [
    { value: 'logic', label: 'Logica (pre-screening)' },
    { value: 'skills', label: 'Skills (post-screening)' },
    { value: 'attitudinal', label: 'Attitudinale (opzionale)' },
  ];

  container.innerHTML = `
    <div class="p-8 max-w-4xl mx-auto">

      <a href="#/quizzes" class="text-xs text-amia-400 hover:text-amia-600 transition-colors mb-3 inline-block">
        ← Torna ai quiz
      </a>

      <h1 class="text-2xl font-semibold text-amia-950 tracking-tight mb-8">
        ${isEdit ? 'Modifica quiz' : 'Nuovo quiz'}
      </h1>

      <!-- ── Quiz Info ── -->
      <div class="bg-white rounded-2xl border border-amia-100 p-6 mb-6">
        <div class="space-y-4">
          <div>
            <label class="block text-xs font-medium text-amia-600 mb-1.5">Titolo *</label>
            <input type="text" id="quiz-title"
              value="${quiz.title ?? ''}"
              placeholder="es. Quiz Logica e Ragionamento"
              class="w-full px-4 py-3 rounded-xl border border-amia-200 text-sm text-amia-900 placeholder:text-amia-300" />
          </div>
          <div>
            <label class="block text-xs font-medium text-amia-600 mb-1.5">Descrizione</label>
            <textarea id="quiz-description" rows="2"
              placeholder="Breve descrizione del quiz..."
              class="w-full px-4 py-3 rounded-xl border border-amia-200 text-sm text-amia-900 placeholder:text-amia-300 resize-none"
            >${quiz.description ?? ''}</textarea>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-xs font-medium text-amia-600 mb-1.5">Tipo *</label>
              <select id="quiz-type"
                class="w-full px-4 py-3 rounded-xl border border-amia-200 text-sm text-amia-900 bg-white">
                ${types.map((t) => `
                  <option value="${t.value}" ${quiz.quiz_type === t.value ? 'selected' : ''}>${t.label}</option>
                `).join('')}
              </select>
            </div>
            <div>
              <label class="block text-xs font-medium text-amia-600 mb-1.5">Durata (minuti)</label>
              <input type="number" id="quiz-duration"
                value="${quiz.duration_minutes ?? ''}"
                placeholder="25"
                class="w-full px-4 py-3 rounded-xl border border-amia-200 text-sm text-amia-900 placeholder:text-amia-300" />
            </div>
          </div>
          <div class="flex items-center gap-3 pt-2">
            <button id="save-quiz-btn"
              class="bg-amia-950 text-white px-5 py-2.5 rounded-xl text-sm font-medium
                     hover:bg-amia-900 active:scale-[0.98] transition-all">
              ${isEdit ? 'Salva quiz' : 'Crea quiz'}
            </button>
            ${isEdit ? `
              <button id="delete-quiz-btn"
                class="px-4 py-2.5 rounded-xl text-sm font-medium text-red-600 hover:bg-red-50 transition-colors">
                Elimina quiz
              </button>
            ` : ''}
          </div>
        </div>
      </div>

      <!-- ── Domande ── -->
      ${isEdit ? `
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-lg font-semibold text-amia-950">Domande (${questions.length})</h2>
        </div>

        <div id="questions-list" class="space-y-3">
          ${questions.map((q, i) => questionCard(q, i)).join('')}
        </div>

        <button id="add-question-btn"
          class="mt-4 w-full py-4 rounded-2xl border-2 border-dashed border-amia-200
                 text-sm font-medium text-amia-400 hover:border-amia-300 hover:text-amia-600
                 transition-colors flex items-center justify-center gap-2">
          ${iconPlus} Aggiungi domanda
        </button>
      ` : `
        <div class="text-center py-12 bg-white rounded-2xl border border-dashed border-amia-200">
          <p class="text-amia-400 text-sm">Salva il quiz per iniziare ad aggiungere domande</p>
        </div>
      `}
    </div>
  `;

  // ── Bind events ──
  bindQuizSave(container, router);
  if (isEdit) {
    bindQuestionEvents(container, router);
  }
}

// ── Question card ──

function questionCard(q: QuizQuestion, index: number): string {
  const typeLabels: Record<QuestionType, string> = {
    multiple_choice: 'Scelta multipla',
    open_text: 'Risposta aperta',
    file_upload: 'Upload file',
  };
  const config = q.config as QuestionConfig;
  const options = config?.options ?? [];

  return `
    <div class="bg-white rounded-2xl border border-amia-100 p-5 question-card" data-id="${q.id}">
      <div class="flex items-start justify-between mb-3">
        <div class="flex items-center gap-2">
          <span class="text-xs font-mono text-amia-300 bg-amia-50 px-2 py-1 rounded">${index + 1}</span>
          <span class="text-xs font-medium text-amia-500">${typeLabels[q.question_type]}</span>
          <span class="text-xs text-amia-400">${q.points} pt</span>
        </div>
        <div class="flex items-center gap-1">
          <button class="edit-question-btn p-1.5 rounded-lg text-amia-400 hover:text-amia-600 hover:bg-amia-50 transition-colors"
                  data-id="${q.id}" title="Modifica">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
            </svg>
          </button>
          <button class="delete-question-btn p-1.5 rounded-lg text-amia-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                  data-id="${q.id}" title="Elimina">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
            </svg>
          </button>
        </div>
      </div>

      <p class="text-sm text-amia-900 mb-2">${q.question_text}</p>

      ${q.question_type === 'multiple_choice' && options.length > 0 ? `
        <div class="space-y-1 mt-3">
          ${options.map((opt: string, i: number) => {
            const isCorrect = (config?.correct ?? []).includes(i);
            return `
              <div class="flex items-center gap-2 text-xs ${isCorrect ? 'text-emerald-700 font-medium' : 'text-amia-500'}">
                <span class="w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0
                  ${isCorrect ? 'border-emerald-500 bg-emerald-50' : 'border-amia-200'}">
                  ${isCorrect ? '<span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>' : ''}
                </span>
                ${opt}
              </div>
            `;
          }).join('')}
        </div>
      ` : ''}

      ${q.ideal_answer ? `
        <div class="mt-3 p-3 rounded-xl bg-amber-50 border border-amber-100">
          <p class="text-[11px] font-medium text-amber-700 mb-1">💡 Risposta ideale</p>
          <p class="text-xs text-amber-800">${q.ideal_answer}</p>
        </div>
      ` : ''}
    </div>
  `;
}

// ── Quiz save ──

function bindQuizSave(container: HTMLElement, router: Router) {
  document.getElementById('save-quiz-btn')?.addEventListener('click', async () => {
    if (isSaving) return;
    isSaving = true;

    const title = (document.getElementById('quiz-title') as HTMLInputElement).value.trim();
    if (!title) {
      showToast('Inserisci un titolo', 'error');
      isSaving = false;
      return;
    }

    const payload = {
      title,
      description: (document.getElementById('quiz-description') as HTMLTextAreaElement).value.trim() || null,
      quiz_type: (document.getElementById('quiz-type') as HTMLSelectElement).value as QuizType,
      duration_minutes: (document.getElementById('quiz-duration') as HTMLInputElement).value
        ? Number((document.getElementById('quiz-duration') as HTMLInputElement).value)
        : null,
    };

    let error;
    if (isEdit) {
      ({ error } = await supabase.from('quizzes').update(payload).eq('id', quizId));
    } else {
      const { data, error: insertError } = await supabase.from('quizzes').insert(payload).select().single();
      error = insertError;
      if (data) {
        // Redirect to edit mode to add questions
        showToast('Quiz creato');
        setTimeout(() => router.navigate(`/quizzes/${data.id}/edit`), 300);
        isSaving = false;
        return;
      }
    }

    if (error) {
      showToast(`Errore: ${error.message}`, 'error');
    } else {
      showToast('Quiz salvato');
      quiz = { ...quiz, ...payload };
    }
    isSaving = false;
  });

  document.getElementById('delete-quiz-btn')?.addEventListener('click', async () => {
    if (!confirm('Eliminare questo quiz e tutte le sue domande?')) return;
    const { error } = await supabase.from('quizzes').delete().eq('id', quizId);
    if (error) {
      showToast(`Errore: ${error.message}`, 'error');
      return;
    }
    showToast('Quiz eliminato');
    setTimeout(() => router.navigate('/quizzes'), 300);
  });
}

// ── Question events ──

function bindQuestionEvents(container: HTMLElement, router: Router) {
  // Add question
  document.getElementById('add-question-btn')?.addEventListener('click', () => {
    showQuestionModal(container, router, null);
  });

  // Edit question
  container.querySelectorAll('.edit-question-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const id = (btn as HTMLElement).dataset.id!;
      const question = questions.find((q) => q.id === id);
      if (question) showQuestionModal(container, router, question);
    });
  });

  // Delete question
  container.querySelectorAll('.delete-question-btn').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const id = (btn as HTMLElement).dataset.id!;
      if (!confirm('Eliminare questa domanda?')) return;
      const { error } = await supabase.from('quiz_questions').delete().eq('id', id);
      if (error) {
        showToast(`Errore: ${error.message}`, 'error');
        return;
      }
      questions = questions.filter((q) => q.id !== id);
      showToast('Domanda eliminata');
      render(container, router);
    });
  });
}

// ── Question Modal ──

function showQuestionModal(container: HTMLElement, router: Router, existing: QuizQuestion | null) {
  const isNew = !existing;
  const q = existing ?? {
    question_type: 'multiple_choice' as QuestionType,
    question_text: '',
    points: 10,
    config: { options: ['', '', '', ''], correct: [0], allow_multiple: false },
    ideal_answer: null,
    sort_order: questions.length,
  };
  const config = (q.config ?? {}) as QuestionConfig;

  // Create modal overlay
  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4';
  modal.innerHTML = `
    <div class="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] overflow-y-auto">
      <div class="p-6">
        <h3 class="text-lg font-semibold text-amia-950 mb-6">${isNew ? 'Nuova domanda' : 'Modifica domanda'}</h3>

        <div class="space-y-4">
          <!-- Tipo -->
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-xs font-medium text-amia-600 mb-1.5">Tipo domanda</label>
              <select id="q-type" class="w-full px-4 py-3 rounded-xl border border-amia-200 text-sm text-amia-900 bg-white">
                <option value="multiple_choice" ${q.question_type === 'multiple_choice' ? 'selected' : ''}>Scelta multipla</option>
                <option value="open_text" ${q.question_type === 'open_text' ? 'selected' : ''}>Risposta aperta</option>
                <option value="file_upload" ${q.question_type === 'file_upload' ? 'selected' : ''}>Upload file</option>
              </select>
            </div>
            <div>
              <label class="block text-xs font-medium text-amia-600 mb-1.5">Punti</label>
              <input type="number" id="q-points" value="${q.points}" min="0"
                class="w-full px-4 py-3 rounded-xl border border-amia-200 text-sm text-amia-900" />
            </div>
          </div>

          <!-- Testo domanda -->
          <div>
            <label class="block text-xs font-medium text-amia-600 mb-1.5">Domanda *</label>
            <textarea id="q-text" rows="3" required
              class="w-full px-4 py-3 rounded-xl border border-amia-200 text-sm text-amia-900 resize-none"
            >${q.question_text}</textarea>
          </div>

          <!-- MC options (visibile solo per multiple_choice) -->
          <div id="mc-section" class="${q.question_type !== 'multiple_choice' ? 'hidden' : ''}">
            <label class="block text-xs font-medium text-amia-600 mb-1.5">
              Opzioni di risposta
              <span class="text-amia-400 font-normal">(spunta le risposte corrette)</span>
            </label>
            <div id="mc-options" class="space-y-2">
              ${(config.options ?? ['', '', '', '']).map((opt: string, i: number) => `
                <div class="flex items-center gap-2">
                  <input type="checkbox" class="mc-correct w-4 h-4 rounded accent-emerald-600"
                    ${(config.correct ?? []).includes(i) ? 'checked' : ''} />
                  <input type="text" class="mc-option flex-1 px-3 py-2 rounded-lg border border-amia-200 text-sm"
                    value="${opt}" placeholder="Opzione ${i + 1}" />
                  <button class="mc-remove p-1 text-amia-300 hover:text-red-500 transition-colors" title="Rimuovi">✕</button>
                </div>
              `).join('')}
            </div>
            <button id="mc-add-option"
              class="mt-2 text-xs text-accent hover:underline">+ Aggiungi opzione</button>
          </div>

          <!-- Risposta ideale -->
          <div>
            <label class="block text-xs font-medium text-amia-600 mb-1.5">
              Risposta ideale
              <span class="text-amia-400 font-normal">(visibile solo all'admin come riferimento)</span>
            </label>
            <textarea id="q-ideal" rows="2"
              placeholder="Una buona risposta dovrebbe menzionare..."
              class="w-full px-4 py-3 rounded-xl border border-amia-200 text-sm text-amia-900 resize-none"
            >${q.ideal_answer ?? ''}</textarea>
          </div>
        </div>

        <!-- Actions -->
        <div class="flex items-center gap-3 mt-6 pt-4 border-t border-amia-100">
          <button id="save-question-btn"
            class="bg-amia-950 text-white px-5 py-2.5 rounded-xl text-sm font-medium
                   hover:bg-amia-900 active:scale-[0.98] transition-all">
            ${isNew ? 'Aggiungi' : 'Salva'}
          </button>
          <button id="cancel-question-btn"
            class="px-5 py-2.5 rounded-xl text-sm font-medium text-amia-600 hover:bg-amia-50 transition-colors">
            Annulla
          </button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Toggle MC section on type change
  const typeSelect = modal.querySelector('#q-type') as HTMLSelectElement;
  const mcSection = modal.querySelector('#mc-section') as HTMLElement;
  typeSelect.addEventListener('change', () => {
    mcSection.classList.toggle('hidden', typeSelect.value !== 'multiple_choice');
  });

  // Add MC option
  modal.querySelector('#mc-add-option')?.addEventListener('click', () => {
    const optionsContainer = modal.querySelector('#mc-options')!;
    const count = optionsContainer.children.length;
    const div = document.createElement('div');
    div.className = 'flex items-center gap-2';
    div.innerHTML = `
      <input type="checkbox" class="mc-correct w-4 h-4 rounded accent-emerald-600" />
      <input type="text" class="mc-option flex-1 px-3 py-2 rounded-lg border border-amia-200 text-sm"
        value="" placeholder="Opzione ${count + 1}" />
      <button class="mc-remove p-1 text-amia-300 hover:text-red-500 transition-colors" title="Rimuovi">✕</button>
    `;
    optionsContainer.appendChild(div);
    bindRemoveButtons(modal);
  });

  bindRemoveButtons(modal);

  // Close
  modal.querySelector('#cancel-question-btn')?.addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

  // Save
  modal.querySelector('#save-question-btn')?.addEventListener('click', async () => {
    const text = (modal.querySelector('#q-text') as HTMLTextAreaElement).value.trim();
    if (!text) {
      showToast('Inserisci il testo della domanda', 'error');
      return;
    }

    const questionType = typeSelect.value as QuestionType;
    const points = Number((modal.querySelector('#q-points') as HTMLInputElement).value) || 0;
    const idealAnswer = (modal.querySelector('#q-ideal') as HTMLTextAreaElement).value.trim() || null;

    // Build config
    let questionConfig: QuestionConfig = {};
    if (questionType === 'multiple_choice') {
      const optionInputs = modal.querySelectorAll('.mc-option') as NodeListOf<HTMLInputElement>;
      const correctInputs = modal.querySelectorAll('.mc-correct') as NodeListOf<HTMLInputElement>;
      const options: string[] = [];
      const correct: number[] = [];

      optionInputs.forEach((input, i) => {
        const val = input.value.trim();
        if (val) {
          if (correctInputs[i]?.checked) correct.push(options.length);
          options.push(val);
        }
      });

      if (options.length < 2) {
        showToast('Servono almeno 2 opzioni', 'error');
        return;
      }
      if (correct.length === 0) {
        showToast('Segna almeno una risposta corretta', 'error');
        return;
      }

      questionConfig = { options, correct, allow_multiple: correct.length > 1 };
    }

    const payload = {
      quiz_id: quizId,
      question_type: questionType,
      question_text: text,
      sort_order: isNew ? questions.length : (existing!.sort_order),
      points,
      config: questionConfig,
      ideal_answer: idealAnswer,
    };

    let error;
    if (isNew) {
      const { data, error: insertError } = await supabase
        .from('quiz_questions')
        .insert(payload)
        .select()
        .single();
      error = insertError;
      if (data) questions.push(data);
    } else {
      ({ error } = await supabase
        .from('quiz_questions')
        .update(payload)
        .eq('id', existing!.id));
      if (!error) {
        const idx = questions.findIndex((qq) => qq.id === existing!.id);
        if (idx >= 0) questions[idx] = { ...questions[idx], ...payload } as QuizQuestion;
      }
    }

    if (error) {
      showToast(`Errore: ${error.message}`, 'error');
      return;
    }

    modal.remove();
    showToast(isNew ? 'Domanda aggiunta' : 'Domanda aggiornata');
    render(container, router);
  });
}

function bindRemoveButtons(modal: HTMLElement) {
  modal.querySelectorAll('.mc-remove').forEach((btn) => {
    btn.replaceWith(btn.cloneNode(true)); // remove old listeners
  });
  modal.querySelectorAll('.mc-remove').forEach((btn) => {
    btn.addEventListener('click', () => {
      btn.parentElement?.remove();
    });
  });
}