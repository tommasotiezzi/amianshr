/**
 * Quizzes list — PageFactory.
 *
 * Shows all quizzes with type badge, duration, and question count.
 * Each card links to the quiz editor.
 */

import type { PageFactory } from '../lib/page';
import * as q from '../lib/queries';
import { showToast } from '../lib/toast';
import { iconPlus, iconEdit } from '../lib/icons';
import type { QuizType } from '../lib/database-types';

const TYPE_LABELS: Record<QuizType, { label: string; classes: string }> = {
  logic:       { label: 'Logica',       classes: 'bg-blue-50 text-blue-700' },
  skills:      { label: 'Skills',       classes: 'bg-purple-50 text-purple-700' },
  attitudinal: { label: 'Attitudinale', classes: 'bg-amber-50 text-amber-700' },
};

export const createQuizzesListPage: PageFactory = (ctx) => {
  return {
    async mount() {
      ctx.container.innerHTML = shellHtml('Caricamento...');

      const res = await q.fetchQuizzes({ signal: ctx.signal });
      if (ctx.signal.aborted) return;

      if (res.error) {
        showToast('Errore nel caricamento dei quiz', 'error');
        ctx.container.innerHTML = shellHtml('Errore nel caricamento');
        return;
      }

      renderFull(res.data!);
    },
  };

  // ── Render ──

  function renderFull(quizzes: q.QuizWithCount[]) {
    ctx.container.innerHTML = `
      <div class="p-8 max-w-5xl mx-auto">

        <!-- Header -->
        <div class="flex items-center justify-between mb-8">
          <div>
            <h1 class="text-2xl font-semibold text-amia-950 tracking-tight">Quiz</h1>
            <p class="text-amia-500 text-sm mt-1">${quizzes.length} quiz totali</p>
          </div>
          <a
            href="#/quizzes/new"
            class="inline-flex items-center gap-2 bg-amia-950 text-white px-4 py-2.5 rounded-xl
                   text-sm font-medium hover:bg-amia-900 active:scale-[0.98] transition-all"
          >
            ${iconPlus} Nuovo quiz
          </a>
        </div>

        <!-- List -->
        <div class="space-y-3">
          ${quizzes.length > 0
            ? quizzes.map(quizCard).join('')
            : `<div class="text-center py-16 bg-white rounded-2xl border border-amia-100">
                 <p class="text-amia-400 text-sm">Nessun quiz creato</p>
               </div>`
          }
        </div>
      </div>
    `;
  }
};

// ── HTML fragments ──

function shellHtml(statusLine: string): string {
  return `
    <div class="p-8 max-w-5xl mx-auto">
      <div class="flex items-center justify-between mb-8">
        <div>
          <h1 class="text-2xl font-semibold text-amia-950 tracking-tight">Quiz</h1>
          <p class="text-amia-500 text-sm mt-1">${statusLine}</p>
        </div>
      </div>
      <div class="flex justify-center py-20"><div class="spinner"></div></div>
    </div>
  `;
}

function quizCard(quiz: q.QuizWithCount): string {
  const type = TYPE_LABELS[quiz.quiz_type] ?? { label: quiz.quiz_type, classes: 'bg-gray-100 text-gray-600' };

  return `
    <a href="#/quizzes/${quiz.id}/edit"
       class="block bg-white rounded-2xl border border-amia-100 p-5
              hover:shadow-card hover:border-amia-200 transition-all">
      <div class="flex items-center justify-between">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-3 mb-1.5">
            <h3 class="text-[15px] font-semibold text-amia-950">${quiz.title}</h3>
            <span class="inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${type.classes}">${type.label}</span>
          </div>
          ${quiz.description ? `<p class="text-xs text-amia-400 line-clamp-1">${quiz.description}</p>` : ''}
        </div>
        <div class="flex items-center gap-4 ml-4 shrink-0">
          <div class="text-right">
            <p class="text-sm font-semibold text-amia-950">${quiz.questions_count}</p>
            <p class="text-[11px] text-amia-400">domande</p>
          </div>
          ${quiz.duration_minutes ? `
            <div class="text-right">
              <p class="text-sm font-semibold text-amia-950">${quiz.duration_minutes}</p>
              <p class="text-[11px] text-amia-400">minuti</p>
            </div>
          ` : ''}
          <span class="text-amia-300">${iconEdit}</span>
        </div>
      </div>
    </a>
  `;
}