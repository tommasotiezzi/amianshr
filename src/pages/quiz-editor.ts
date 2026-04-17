/**
 * Quiz editor — PageFactory.
 *
 * Edit quiz metadata + manage its questions. Questions are added/edited via
 * the question modal (see quiz-editor-modal.ts).
 *
 * Create flow: save quiz metadata first → redirect to edit mode to add questions.
 * Edit flow: shows existing questions as cards with edit/delete buttons.
 */

import type { PageFactory } from '../lib/page';
import { supabase } from '../lib/supabase-client';
import * as q from '../lib/queries';
import { showToast } from '../lib/toast';
import { iconPlus } from '../lib/icons';
import { AXIS_LABELS } from '../lib/database-types';
import type {
  Quiz,
  QuizQuestion,
  QuizType,
  QuestionType,
  QuestionConfig,
  AnswerKey,
  RankingItem,
} from '../lib/database-types';
import { openQuestionModal } from './quiz-editor-modal';

const QUIZ_TYPES: { value: QuizType; label: string }[] = [
  { value: 'logic',       label: 'Logica (pre-screening)' },
  { value: 'skills',      label: 'Skills (post-screening)' },
  { value: 'attitudinal', label: 'Attitudinale' },
];

const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  multiple_choice: 'Scelta multipla',
  ranking:         'Ranking',
  open_text:       'Risposta aperta',
  file_upload:     'Upload file',
};

export const createQuizEditorPage: PageFactory = (ctx) => {
  const isEdit = !!ctx.params.id;
  const quizId = ctx.params.id ?? '';

  // Closure state
  let quiz: Partial<Quiz> = isEdit
    ? {}
    : { title: '', description: '', quiz_type: 'logic', duration_minutes: 25 };
  let questions: QuizQuestion[] = [];
  let isSaving = false;

  return {
    async mount() {
      ctx.container.innerHTML = loadingShell();

      if (isEdit) {
        const res = await q.fetchQuizWithQuestions(quizId, { signal: ctx.signal });
        if (ctx.signal.aborted) return;
        if (res.error) {
          showToast('Quiz non trovato', 'error');
          ctx.router.navigate('/quizzes');
          return;
        }
        quiz = res.data!.quiz;
        questions = res.data!.questions;
      }

      renderFull();
      bindQuizEvents();
      if (isEdit) bindQuestionListEvents();
    },
  };

  // ── Render ──

  function renderFull() {
    ctx.container.innerHTML = `
      <div class="p-8 max-w-4xl mx-auto">

        <a href="#/quizzes" class="text-xs text-amia-400 hover:text-amia-600 transition-colors mb-3 inline-block">
          ← Torna ai quiz
        </a>

        <h1 class="text-2xl font-semibold text-amia-950 tracking-tight mb-8">
          ${isEdit ? 'Modifica quiz' : 'Nuovo quiz'}
        </h1>

        <!-- Quiz Info -->
        <div class="bg-white rounded-2xl border border-amia-100 p-6 mb-6">
          <div class="space-y-4">
            <div>
              <label class="block text-xs font-medium text-amia-600 mb-1.5">Titolo *</label>
              <input type="text" id="quiz-title"
                value="${escapeAttr(quiz.title ?? '')}"
                placeholder="es. Quiz Logica e Ragionamento"
                class="w-full px-4 py-3 rounded-xl border border-amia-200 text-sm text-amia-900 placeholder:text-amia-300" />
            </div>
            <div>
              <label class="block text-xs font-medium text-amia-600 mb-1.5">Descrizione</label>
              <textarea id="quiz-description" rows="2"
                placeholder="Breve descrizione del quiz..."
                class="w-full px-4 py-3 rounded-xl border border-amia-200 text-sm text-amia-900 placeholder:text-amia-300 resize-none"
              >${escapeText(quiz.description ?? '')}</textarea>
            </div>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-xs font-medium text-amia-600 mb-1.5">Tipo *</label>
                <select id="quiz-type"
                  class="w-full px-4 py-3 rounded-xl border border-amia-200 text-sm text-amia-900 bg-white">
                  ${QUIZ_TYPES.map((t) => `
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

        <!-- Questions -->
        ${isEdit ? renderQuestionsSection() : `
          <div class="text-center py-12 bg-white rounded-2xl border border-dashed border-amia-200">
            <p class="text-amia-400 text-sm">Salva il quiz per iniziare ad aggiungere domande</p>
          </div>
        `}
      </div>
    `;
  }

  function renderQuestionsSection(): string {
    return `
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-lg font-semibold text-amia-950">Domande (${questions.length})</h2>
      </div>

      <div id="questions-list" class="space-y-3">
        ${questions.map((qn, i) => questionCard(qn, i)).join('')}
      </div>

      <button id="add-question-btn"
        class="mt-4 w-full py-4 rounded-2xl border-2 border-dashed border-amia-200
               text-sm font-medium text-amia-400 hover:border-amia-300 hover:text-amia-600
               transition-colors flex items-center justify-center gap-2">
        ${iconPlus} Aggiungi domanda
      </button>
    `;
  }

  function rerenderQuestionsSection() {
    const listEl = ctx.$<HTMLElement>('#questions-list');
    if (!listEl) return;
    listEl.innerHTML = questions.map((qn, i) => questionCard(qn, i)).join('');
    // Update count
    const heading = ctx.container.querySelector('h2');
    if (heading) heading.textContent = `Domande (${questions.length})`;
    // Re-bind card buttons
    bindQuestionListEvents();
  }

  // ── Event binding ──

  function bindQuizEvents() {
    ctx.on(ctx.$<HTMLButtonElement>('#save-quiz-btn'), 'click', handleQuizSave);
    ctx.on(ctx.$<HTMLButtonElement>('#delete-quiz-btn'), 'click', handleQuizDelete);
  }

  function bindQuestionListEvents() {
    ctx.on(ctx.$<HTMLButtonElement>('#add-question-btn'), 'click', () => openModal(null));

    ctx.$$<HTMLButtonElement>('.edit-question-btn').forEach((btn) => {
      ctx.on(btn, 'click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const id = btn.dataset.id!;
        const question = questions.find((qn) => qn.id === id);
        if (question) openModal(question);
      });
    });

    ctx.$$<HTMLButtonElement>('.delete-question-btn').forEach((btn) => {
      ctx.on(btn, 'click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const id = btn.dataset.id!;
        if (!confirm('Eliminare questa domanda?')) return;

        const { error } = await supabase.from('quiz_questions').delete().eq('id', id);
        if (ctx.signal.aborted) return;
        if (error) { showToast(`Errore: ${error.message}`, 'error'); return; }

        questions = questions.filter((qn) => qn.id !== id);
        showToast('Domanda eliminata');
        rerenderQuestionsSection();
      });
    });
  }

  // ── Handlers ──

  async function openModal(existing: QuizQuestion | null) {
    const result = await openQuestionModal({
      quizId,
      showAxisPicker: quiz.quiz_type === 'attitudinal',
      existing,
      defaultSortOrder: questions.length,
    });
    if (ctx.signal.aborted) return;
    if (!result) return;  // cancelled

    if (existing) {
      questions = questions.map((qn) => qn.id === result.id ? result : qn);
    } else {
      questions.push(result);
    }
    rerenderQuestionsSection();
  }

  async function handleQuizSave() {
    if (isSaving) return;
    isSaving = true;

    const title = ctx.$<HTMLInputElement>('#quiz-title')!.value.trim();
    if (!title) {
      showToast('Inserisci un titolo', 'error');
      isSaving = false;
      return;
    }

    const payload = {
      title,
      description: ctx.$<HTMLTextAreaElement>('#quiz-description')!.value.trim() || null,
      quiz_type: ctx.$<HTMLSelectElement>('#quiz-type')!.value as QuizType,
      duration_minutes: (() => {
        const v = ctx.$<HTMLInputElement>('#quiz-duration')!.value;
        return v ? Number(v) : null;
      })(),
    };

    if (isEdit) {
      const { error } = await supabase.from('quizzes').update(payload).eq('id', quizId);
      if (ctx.signal.aborted) return;
      if (error) { showToast(`Errore: ${error.message}`, 'error'); isSaving = false; return; }
      showToast('Quiz salvato');
      quiz = { ...quiz, ...payload };
      isSaving = false;
    } else {
      const { data, error } = await supabase.from('quizzes').insert(payload).select().single();
      if (ctx.signal.aborted) return;
      if (error) { showToast(`Errore: ${error.message}`, 'error'); isSaving = false; return; }
      showToast('Quiz creato');
      setTimeout(() => ctx.router.navigate(`/quizzes/${data!.id}/edit`), 300);
    }
  }

  async function handleQuizDelete() {
    if (!confirm('Eliminare questo quiz e tutte le sue domande?')) return;

    const { error } = await supabase.from('quizzes').delete().eq('id', quizId);
    if (ctx.signal.aborted) return;
    if (error) { showToast(`Errore: ${error.message}`, 'error'); return; }

    showToast('Quiz eliminato');
    setTimeout(() => ctx.router.navigate('/quizzes'), 300);
  }
};

// ── HTML fragments ──

function loadingShell(): string {
  return `
    <div class="p-8 max-w-4xl mx-auto">
      <div class="flex justify-center py-20"><div class="spinner"></div></div>
    </div>
  `;
}

function questionCard(qn: QuizQuestion, index: number): string {
  const config = qn.config as QuestionConfig;
  const answerKey = qn.answer_key as AnswerKey;

  return `
    <div class="bg-white rounded-2xl border border-amia-100 p-5 question-card" data-id="${qn.id}">
      <div class="flex items-start justify-between mb-3">
        <div class="flex items-center gap-2 flex-wrap">
          <span class="text-xs font-mono text-amia-300 bg-amia-50 px-2 py-1 rounded">${index + 1}</span>
          <span class="text-xs font-medium text-amia-500">${QUESTION_TYPE_LABELS[qn.question_type]}</span>
          <span class="text-xs text-amia-400">${qn.points} pt</span>
          ${qn.axis ? `
            <span class="text-[10px] font-medium text-accent bg-accent-light px-2 py-0.5 rounded">
              ${AXIS_LABELS[qn.axis]}
            </span>
          ` : ''}
        </div>
        <div class="flex items-center gap-1">
          <button class="edit-question-btn p-1.5 rounded-lg text-amia-400 hover:text-amia-600 hover:bg-amia-50 transition-colors"
                  data-id="${qn.id}" title="Modifica">
            ${iconEditSmall}
          </button>
          <button class="delete-question-btn p-1.5 rounded-lg text-amia-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                  data-id="${qn.id}" title="Elimina">
            ${iconTrashSmall}
          </button>
        </div>
      </div>

      <p class="text-sm text-amia-900 mb-2">${escapeText(qn.question_text)}</p>

      ${renderCardBody(qn, config, answerKey)}

      ${answerKey?.ideal_answer ? `
        <div class="mt-3 p-3 rounded-xl bg-amber-50 border border-amber-100">
          <p class="text-[11px] font-medium text-amber-700 mb-1">💡 Risposta ideale</p>
          <p class="text-xs text-amber-800">${escapeText(answerKey.ideal_answer)}</p>
        </div>
      ` : ''}
    </div>
  `;
}

function renderCardBody(qn: QuizQuestion, config: QuestionConfig, answerKey: AnswerKey): string {
  if (qn.question_type === 'multiple_choice') {
    const options = config?.options ?? [];
    const correct = (answerKey?.correct as number[]) ?? [];
    if (options.length === 0) return '';
    return `
      <div class="space-y-1 mt-3">
        ${options.map((opt, i) => {
          const isCorrect = correct.includes(i);
          return `
            <div class="flex items-center gap-2 text-xs ${isCorrect ? 'text-emerald-700 font-medium' : 'text-amia-500'}">
              <span class="w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0
                ${isCorrect ? 'border-emerald-500 bg-emerald-50' : 'border-amia-200'}">
                ${isCorrect ? '<span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>' : ''}
              </span>
              ${escapeText(opt)}
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  if (qn.question_type === 'ranking') {
    const items = (config?.options as RankingItem[]) ?? [];
    const correctOrder = (answerKey?.correct as string[]) ?? [];
    // Show items in correct order
    const ordered = correctOrder.map((id) => items.find((it) => it.id === id)).filter(Boolean) as RankingItem[];
    if (ordered.length === 0) return '';
    return `
      <div class="space-y-1 mt-3">
        ${ordered.map((item, i) => `
          <div class="flex items-center gap-2 text-xs text-amia-600">
            <span class="w-5 h-5 rounded-full border-2 border-accent bg-accent-light
                         flex items-center justify-center text-[10px] font-semibold text-accent shrink-0">
              ${i + 1}
            </span>
            <span>${escapeText(item.label)}</span>
            ${item.axis_value != null ? `
              <span class="text-[10px] text-amia-300 ml-auto">val: ${item.axis_value}</span>
            ` : ''}
          </div>
        `).join('')}
      </div>
    `;
  }

  return '';
}

// ── Small inline icons ──

const iconEditSmall = `
  <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
    <path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
  </svg>
`;

const iconTrashSmall = `
  <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
    <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
  </svg>
`;

// ── Helpers ──

function escapeAttr(s: string): string {
  return s.replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function escapeText(s: string): string {
  return s.replace(/</g, '&lt;').replace(/>/g, '&gt;');
}