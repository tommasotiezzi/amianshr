/**
 * Application detail — sync mount.
 *
 * Shows: candidate info, CV link, per-quiz scores, axis breakdown,
 * composite score, notes, status change actions.
 */

import type { PageFactory } from '../lib/page';
import { supabase } from '../lib/supabase-client';
import { showToast } from '../lib/toast';
import {
  applicationStatusBadge, applicationStatusLabel,
  formatDate, formatDateTime, scoreDisplay,
  compositeScoreDisplay, pctColor, appPillHtml,
} from '../lib/formatting';
import {
  AXIS_LABELS,
  type ApplicationStatus, type AxisType,
  type QuizQuestion, type QuestionConfig, type AnswerKey,
  type RankingItem, type QuizResponse,
} from '../lib/database-types';

interface FullApp {
  id: string;
  status: ApplicationStatus;
  created_at: string;
  cv_file_path: string;
  cover_letter: string | null;
  portfolio_path: string | null;
  pre_quiz_score: number | null;
  pre_quiz_max_score: number | null;
  pre_quiz_completed_at: string | null;
  pre_quiz_started_at: string | null;
  pre_quiz_over_time: boolean;
  pre_quiz_responses: QuizResponse[] | null;
  post_quiz_score: number | null;
  post_quiz_max_score: number | null;
  post_quiz_completed_at: string | null;
  post_quiz_started_at: string | null;
  post_quiz_over_time: boolean;
  post_quiz_responses: QuizResponse[] | null;
  att_quiz_completed_at: string | null;
  att_quiz_responses: QuizResponse[] | null;
  axis_scores: Record<string, { raw: number; match_pct: number }> | null;
  composite_score: number | null;
  screened: boolean;
  standby: boolean;
  candidate: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    phone: string | null;
    linkedin_url: string | null;
    work_location: 'milan' | 'remote' | null;
  };
  position: {
    id: string;
    title: string;
    department: string;
    icp_config: Record<string, { target: number; weight: number }>;
    app_name: string | null;
    app_color_from: string | null;
    app_color_to: string | null;
    pre_quiz_id: string | null;
    post_quiz_id: string | null;
    att_quiz_id: string | null;
  };
}

interface Note { id: string; content: string; created_at: string; author_id: string; }

const STATUS_TRANSITIONS: Record<ApplicationStatus, ApplicationStatus[]> = {
  applied:   ['interview', 'rejected'],
  interview: ['hired', 'rejected'],
  hired:     [],
  rejected:  [],
};

export const createApplicationDetailPage: PageFactory = (ctx) => {
  const appId = ctx.params.id;
  let app: FullApp | null = null;
  let notes: Note[] = [];
  let cvUrl: string | null = null;

  // Cache of questions per quiz_id, fetched lazily on first expand
  const questionsByQuiz: Record<string, QuizQuestion[]> = {};
  // Which quiz sections are expanded ('pre' / 'post' / 'att')
  const expandedQuizzes = new Set<'pre' | 'post' | 'att'>();

  ctx.container.innerHTML = loadingShell();

  Promise.all([
    supabase.from('applications').select(`
      id, status, created_at, cv_file_path, cover_letter, portfolio_path,
      pre_quiz_score, pre_quiz_max_score, pre_quiz_completed_at, pre_quiz_started_at, pre_quiz_over_time, pre_quiz_responses,
      post_quiz_score, post_quiz_max_score, post_quiz_completed_at, post_quiz_started_at, post_quiz_over_time, post_quiz_responses,
      att_quiz_completed_at, att_quiz_responses, axis_scores, composite_score,
      screened, standby,
      candidate:candidates(id, first_name, last_name, email, phone, linkedin_url, work_location),
      position:positions(id, title, department, icp_config, app_name, app_color_from, app_color_to, pre_quiz_id, post_quiz_id, att_quiz_id)
    `).eq('id', appId).single(),
    supabase.from('application_notes').select('*').eq('application_id', appId).order('created_at', { ascending: false }),
  ])
    .then(([appRes, notesRes]: any[]) => {
      if (ctx.signal.aborted) return;
      if (appRes.error || !appRes.data) {
        showToast('Candidatura non trovata', 'error');
        ctx.router.navigate('/applications');
        return;
      }
      app = {
        ...appRes.data,
        candidate: Array.isArray(appRes.data.candidate) ? appRes.data.candidate[0] : appRes.data.candidate,
        position: Array.isArray(appRes.data.position) ? appRes.data.position[0] : appRes.data.position,
      };
      notes = notesRes.data ?? [];

      if (app?.cv_file_path) {
        supabase.storage.from('cvs').createSignedUrl(app.cv_file_path, 3600)
          .then(({ data }) => {
            if (ctx.signal.aborted) return;
            cvUrl = data?.signedUrl ?? null;
            renderFull();
            bindEvents();
          });
      } else {
        renderFull();
        bindEvents();
      }
    })
    .catch((err) => {
      if (ctx.signal.aborted) return;
      console.error('[application-detail]', err);
    });

  function renderFull() {
    if (!app) return;
    const nextStatuses = STATUS_TRANSITIONS[app.status];

    ctx.container.innerHTML = `
      <div class="p-8 max-w-5xl mx-auto">
        <a href="#/applications" class="text-xs text-amia-400 hover:text-amia-600 transition-colors mb-3 inline-block">← Torna alle candidature</a>

        <div class="flex items-start justify-between mb-8">
          <div>
            <h1 class="text-2xl font-semibold text-amia-950 tracking-tight">
              ${escapeText(app.candidate.first_name)} ${escapeText(app.candidate.last_name)}
            </h1>
            <div class="flex items-center gap-2 mt-1 flex-wrap">
              <p class="text-amia-500 text-sm">
                ${escapeText(app.position.title)} · ${escapeText(app.position.department)}
              </p>
              ${appPillHtml(app.position, 'sm')}
            </div>
            <div class="flex items-center gap-3 mt-3 flex-wrap">
              ${applicationStatusBadge(app.status)}
              <span class="text-xs text-amia-400">Candidatura del ${formatDate(app.created_at)}</span>
              <button id="flag-screened" class="${detailFlagClasses(app.screened)}" data-flag="screened" data-value="${app.screened}" title="Screening pass (portfolio/LinkedIn ok)">
                ${app.screened ? '✓ Screened' : '○ Screen'}
              </button>
              <button id="flag-standby" class="${detailFlagClasses(app.standby)}" data-flag="standby" data-value="${app.standby}" title="On hold / standby">
                ${app.standby ? '⏸ Standby' : '○ Standby'}
              </button>
            </div>
          </div>
          ${app.composite_score != null ? `
            <div class="text-right">
              <p class="text-[11px] text-amia-400 uppercase tracking-wider mb-0.5">Match ICP</p>
              ${compositeScoreDisplay(app.composite_score)}
            </div>
          ` : ''}
        </div>

        <div class="grid grid-cols-3 gap-6">
          <div class="col-span-2 space-y-6">
            ${contactSection()}
            ${quizSection()}
            ${app.axis_scores ? axisBreakdownSection() : ''}
            ${answersSection()}
            ${coverLetterSection()}
            ${notesSection()}
          </div>
          <div class="space-y-6">
            ${actionsSection(nextStatuses)}
          </div>
        </div>
      </div>
    `;
  }

  function contactSection(): string {
    if (!app) return '';
    return `
      <div class="bg-white rounded-2xl border border-amia-100 p-6">
        <h2 class="text-sm font-semibold text-amia-950 mb-4">Contatti</h2>
        <div class="space-y-2 text-sm">
          <div class="flex items-center gap-2">
            <span class="text-amia-400 text-xs w-20">Email:</span>
            <a href="mailto:${escapeAttr(app.candidate.email)}" class="text-accent hover:underline">${escapeText(app.candidate.email)}</a>
          </div>
          ${app.candidate.phone ? `
            <div class="flex items-center gap-2">
              <span class="text-amia-400 text-xs w-20">Telefono:</span>
              <span class="text-amia-700">${escapeText(app.candidate.phone)}</span>
            </div>
          ` : ''}
          ${app.candidate.linkedin_url ? `
            <div class="flex items-center gap-2">
              <span class="text-amia-400 text-xs w-20">LinkedIn:</span>
              <a href="${escapeAttr(app.candidate.linkedin_url)}" target="_blank" rel="noopener" class="text-accent hover:underline">Profilo ↗</a>
            </div>
          ` : ''}
          <div class="flex items-center gap-2">
            <span class="text-amia-400 text-xs w-20">Lavora da:</span>
            <span class="text-amia-700">${workLocationText(app.candidate.work_location)}</span>
          </div>
          ${cvUrl ? `
            <div class="flex items-center gap-2 pt-2">
              <a href="${escapeAttr(cvUrl)}" target="_blank" rel="noopener"
                class="inline-flex items-center gap-1.5 text-xs font-medium bg-amia-50 hover:bg-amia-100 text-amia-700 px-3 py-1.5 rounded-lg transition-colors">
                📄 Scarica CV
              </a>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  function quizSection(): string {
    if (!app) return '';
    return `
      <div class="bg-white rounded-2xl border border-amia-100 p-6">
        <h2 class="text-sm font-semibold text-amia-950 mb-4">Quiz</h2>
        <div class="grid grid-cols-3 gap-4">
          ${quizCard('Logica',      app.pre_quiz_score,  app.pre_quiz_max_score,  app.pre_quiz_completed_at,  app.pre_quiz_over_time)}
          ${quizCard('Skills',      app.post_quiz_score, app.post_quiz_max_score, app.post_quiz_completed_at, app.post_quiz_over_time)}
          ${attitudinalCard(app.att_quiz_completed_at)}
        </div>
      </div>
    `;
  }

  function axisBreakdownSection(): string {
    if (!app?.axis_scores) return '';
    const icp = app.position.icp_config ?? {};
    const rows = Object.entries(app.axis_scores)
      .map(([axis, scores]) => {
        const target = icp[axis]?.target;
        const weight = icp[axis]?.weight;
        return { axis: axis as AxisType, raw: scores.raw, match: scores.match_pct, target, weight };
      })
      .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0));

    return `
      <div class="bg-white rounded-2xl border border-amia-100 p-6">
        <div class="flex items-center gap-2 mb-4">
          <h2 class="text-sm font-semibold text-amia-950">Profilo assi</h2>
          <span class="relative inline-flex group">
            <span class="w-4 h-4 rounded-full bg-amia-100 text-amia-500 text-[10px] font-semibold flex items-center justify-center cursor-help select-none">i</span>
            <span class="invisible group-hover:visible absolute left-1/2 -translate-x-1/2 top-full mt-2 w-[320px] z-10
                         bg-amia-950 text-white text-[11px] font-normal leading-relaxed rounded-xl p-3 shadow-lg">
              <strong class="block mb-1.5 text-[11px] font-semibold">Come si calcola il match</strong>
              Ogni asse confronta il valore grezzo del candidato col target del ruolo:
              <span class="block mt-1 font-mono text-[10px] text-amia-300">match = max(0, 100 − |raw − target| × 25)</span>
              <span class="block mt-2">La distanza dal target conta in entrambe le direzioni.
              Essere "troppo" su un asse non sempre è un vantaggio:
              un profilo molto data-driven, ad esempio, può rallentare un ruolo
              che richiede invece azione rapida.</span>
              <span class="block mt-2 text-amia-300">Il peso non cambia il match per asse, ma pesa il contributo
              al match composito mostrato in alto.</span>
            </span>
          </span>
        </div>
        <div class="space-y-3">
          ${rows.map((r) => {
            const color = 'bg-accent';
            const matchCls = pctColor(r.match);
            return `
              <div>
                <div class="flex items-center justify-between mb-1">
                  <div class="flex items-center gap-2">
                    <span class="text-xs font-medium text-amia-700">${AXIS_LABELS[r.axis]}</span>
                    ${r.weight ? `<span class="text-[10px] text-amia-400">peso ${r.weight}</span>` : ''}
                  </div>
                  <div class="flex items-center gap-3 text-xs">
                    <span class="text-amia-500">${r.raw.toFixed(1)}/5 ${r.target != null ? `→ target ${r.target}` : ''}</span>
                    <span class="font-semibold ${matchCls}">${Math.round(r.match)}%</span>
                  </div>
                </div>
                <div class="h-1.5 bg-amia-100 rounded-full overflow-hidden">
                  <div class="${color} h-full rounded-full transition-all" style="width:${Math.min(100, r.match)}%"></div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  // ── Answers (responses) section ──

  type QuizSlot = { kind: 'pre' | 'post' | 'att'; label: string; quizId: string | null; responses: QuizResponse[] | null; completed: string | null; };

  function getQuizSlots(): QuizSlot[] {
    if (!app) return [];
    return [
      { kind: 'pre',  label: 'Logica',       quizId: app.position.pre_quiz_id,  responses: app.pre_quiz_responses,  completed: app.pre_quiz_completed_at },
      { kind: 'post', label: 'Skills',       quizId: app.position.post_quiz_id, responses: app.post_quiz_responses, completed: app.post_quiz_completed_at },
      { kind: 'att',  label: 'Attitudinale', quizId: app.position.att_quiz_id,  responses: app.att_quiz_responses,  completed: app.att_quiz_completed_at },
    ];
  }

  function answersSection(): string {
    const slots = getQuizSlots().filter((s) => s.completed && s.responses && s.quizId);
    if (slots.length === 0) return '';

    return `
      <div class="bg-white rounded-2xl border border-amia-100 p-6">
        <h2 class="text-sm font-semibold text-amia-950 mb-4">Risposte del candidato</h2>
        <div class="space-y-2">
          ${slots.map((s) => {
            const isOpen = expandedQuizzes.has(s.kind);
            return `
              <div class="rounded-xl border border-amia-100 overflow-hidden" data-answers-quiz="${s.kind}">
                <button type="button" class="answers-toggle w-full flex items-center justify-between px-4 py-3 hover:bg-amia-50 transition-colors text-left"
                        data-quiz-kind="${s.kind}" data-quiz-id="${s.quizId}">
                  <div class="flex items-center gap-3">
                    <span class="text-amia-300 text-sm transition-transform ${isOpen ? 'rotate-90' : ''}" data-chevron>▶</span>
                    <span class="text-sm font-medium text-amia-900">${s.label}</span>
                    <span class="text-[11px] text-amia-400">${s.responses!.length} risposte</span>
                  </div>
                </button>
                <div class="answers-body ${isOpen ? '' : 'hidden'} px-4 py-3 border-t border-amia-100 bg-amia-50/30 space-y-3">
                  ${isOpen ? renderAnswersBody(s) : '<div class="flex justify-center py-6"><div class="spinner"></div></div>'}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  function renderAnswersBody(slot: QuizSlot): string {
    if (!slot.quizId) return '';
    const questions = questionsByQuiz[slot.quizId];
    if (!questions) return '<div class="flex justify-center py-6"><div class="spinner"></div></div>';

    if (questions.length === 0) {
      return '<p class="text-xs text-amia-400 text-center py-4">Nessuna domanda trovata</p>';
    }

    // Build response map
    const respMap = new Map<string, QuizResponse>();
    (slot.responses ?? []).forEach((r) => respMap.set(r.question_id, r));

    return questions
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((qn, idx) => renderAnswerCard(qn, respMap.get(qn.id), idx + 1, slot.kind))
      .join('');
  }

  function renderAnswerCard(qn: QuizQuestion, resp: QuizResponse | undefined, num: number, kind: 'pre' | 'post' | 'att'): string {
    const config = (qn.config ?? {}) as QuestionConfig;
    const answerKey = (qn.answer_key ?? {}) as AnswerKey;

    const body = renderAnswerBody(qn, config, answerKey, resp, kind);

    return `
      <div class="bg-white rounded-xl border border-amia-100 p-4">
        <div class="flex items-start gap-2 mb-2">
          <span class="text-[11px] font-mono text-amia-300 bg-amia-50 px-1.5 py-0.5 rounded shrink-0">${num}</span>
          <p class="text-sm text-amia-900 leading-relaxed">${escapeText(qn.question_text)}</p>
        </div>
        ${config.image_url ? `
          <div class="my-2 rounded-lg overflow-hidden border border-amia-100 bg-amia-50">
            <img src="${escapeAttr(config.image_url)}" alt="" class="w-full max-h-48 object-contain bg-white" loading="lazy" />
          </div>
        ` : ''}
        ${body}
        ${(resp?.points_earned != null) ? `
          <div class="mt-2 text-[11px] text-amia-400">Punti: <span class="font-semibold text-amia-700">${resp.points_earned}</span> / ${qn.points}</div>
        ` : ''}
      </div>
    `;
  }

  function renderAnswerBody(qn: QuizQuestion, config: QuestionConfig, answerKey: AnswerKey, resp: QuizResponse | undefined, kind: 'pre' | 'post' | 'att'): string {
    if (!resp) return '<p class="text-xs text-amia-400 italic">Nessuna risposta</p>';

    if (qn.question_type === 'multiple_choice') {
      const options = (config.options as string[]) ?? [];
      const correct = (answerKey.correct as number[]) ?? [];
      const picked = (resp.answer as number[]) ?? [];
      return `
        <div class="space-y-1 mt-2">
          ${options.map((opt, i) => {
            const isPicked = picked.includes(i);
            const isCorrect = correct.includes(i);
            // 4 visual states
            let bg = 'bg-white border border-amia-100';
            let icon = '<span class="w-3.5 h-3.5 rounded-full border border-amia-200 shrink-0"></span>';
            if (isPicked && isCorrect) {
              bg = 'bg-emerald-50 border border-emerald-200';
              icon = '<span class="text-emerald-600 text-sm shrink-0">✓</span>';
            } else if (isPicked && !isCorrect) {
              bg = 'bg-red-50 border border-red-200';
              icon = '<span class="text-red-500 text-sm shrink-0">✗</span>';
            } else if (!isPicked && isCorrect) {
              bg = 'bg-amber-50 border border-amber-200';
              icon = '<span class="text-amber-500 text-xs shrink-0">★</span>';
            }
            return `
              <div class="flex items-start gap-2 px-3 py-1.5 rounded-lg ${bg}">
                ${icon}
                <span class="text-xs text-amia-800 flex-1">${escapeText(opt)}</span>
                ${isPicked ? '<span class="text-[10px] font-medium text-amia-500 shrink-0">scelta</span>' : ''}
                ${!isPicked && isCorrect ? '<span class="text-[10px] font-medium text-amber-600 shrink-0">corretta</span>' : ''}
              </div>
            `;
          }).join('')}
        </div>
      `;
    }

    if (qn.question_type === 'ranking') {
      const items = (config.options as RankingItem[]) ?? [];
      const itemMap = new Map(items.map((it) => [it.id, it]));
      const candidateOrder = (resp.answer as string[]) ?? [];
      const correctOrder = (answerKey.correct as string[]) ?? [];

      // Build row-by-row comparison
      const rowsCount = Math.max(candidateOrder.length, correctOrder.length);

      if (kind === 'att') {
        // Attitudinal — no "correct", show order + axis_value
        return `
          <div class="mt-2">
            <p class="text-[11px] font-medium text-amia-500 mb-1.5">Ordine del candidato (top → bottom):</p>
            <div class="space-y-1">
              ${candidateOrder.map((id, i) => {
                const item = itemMap.get(id);
                if (!item) return '';
                return `
                  <div class="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white border border-amia-100">
                    <span class="w-5 h-5 rounded-full bg-amia-100 text-amia-600 flex items-center justify-center text-[10px] font-semibold shrink-0">${i + 1}</span>
                    <span class="text-xs text-amia-800 flex-1">${escapeText(item.label)}</span>
                    ${item.axis_value != null ? `<span class="text-[10px] text-amia-400 shrink-0">val ${item.axis_value}</span>` : ''}
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        `;
      }

      // Logic / skills ranking — show side by side
      return `
        <div class="grid grid-cols-2 gap-3 mt-2">
          <div>
            <p class="text-[11px] font-medium text-amia-500 mb-1.5">Risposta del candidato</p>
            <div class="space-y-1">
              ${candidateOrder.map((id, i) => {
                const item = itemMap.get(id);
                if (!item) return '';
                const expectedAt = correctOrder.indexOf(id);
                const exact = expectedAt === i;
                const offByOne = !exact && Math.abs(expectedAt - i) === 1;
                let cls = 'bg-red-50 border border-red-200';
                if (exact) cls = 'bg-emerald-50 border border-emerald-200';
                else if (offByOne) cls = 'bg-amber-50 border border-amber-200';
                return `
                  <div class="flex items-center gap-2 px-2.5 py-1.5 rounded-lg ${cls}">
                    <span class="w-5 h-5 rounded-full bg-white text-amia-700 flex items-center justify-center text-[10px] font-semibold shrink-0">${i + 1}</span>
                    <span class="text-xs text-amia-800 flex-1">${escapeText(item.label)}</span>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
          <div>
            <p class="text-[11px] font-medium text-amia-500 mb-1.5">Ordine corretto</p>
            <div class="space-y-1">
              ${correctOrder.map((id, i) => {
                const item = itemMap.get(id);
                if (!item) return '';
                return `
                  <div class="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-white border border-amia-100">
                    <span class="w-5 h-5 rounded-full bg-amia-100 text-amia-600 flex items-center justify-center text-[10px] font-semibold shrink-0">${i + 1}</span>
                    <span class="text-xs text-amia-800 flex-1">${escapeText(item.label)}</span>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        </div>
      `;
    }

    if (qn.question_type === 'open_text') {
      return `
        <div class="mt-2 px-3 py-2 rounded-lg bg-white border border-amia-100">
          <p class="text-xs text-amia-800 whitespace-pre-wrap">${escapeText(String(resp.answer ?? ''))}</p>
        </div>
        ${answerKey.ideal_answer ? `
          <div class="mt-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-100">
            <p class="text-[10px] font-medium text-amber-700 mb-0.5">💡 Risposta ideale</p>
            <p class="text-xs text-amber-800">${escapeText(answerKey.ideal_answer)}</p>
          </div>
        ` : ''}
      `;
    }

    return `<pre class="text-xs text-amia-500 mt-2">${escapeText(JSON.stringify(resp.answer))}</pre>`;
  }
  function coverLetterSection(): string {
    if (!app?.cover_letter) return '';
    return `
      <div class="bg-white rounded-2xl border border-amia-100 p-6">
        <h2 class="text-sm font-semibold text-amia-950 mb-3">Lettera di presentazione</h2>
        <p class="text-sm text-amia-700 whitespace-pre-wrap leading-relaxed">${escapeText(app.cover_letter)}</p>
      </div>
    `;
  }

  function notesSection(): string {
    return `
      <div class="bg-white rounded-2xl border border-amia-100 p-6">
        <h2 class="text-sm font-semibold text-amia-950 mb-4">Note interne (${notes.length})</h2>
        <div class="space-y-3 mb-4">
          <textarea id="note-input" rows="2" placeholder="Scrivi una nota interna..."
            class="w-full px-3 py-2 rounded-xl border border-amia-200 text-sm text-amia-900 placeholder:text-amia-300 resize-none"></textarea>
          <button id="add-note-btn" class="text-xs text-accent font-medium hover:underline">Aggiungi nota</button>
        </div>
        ${notes.length > 0 ? `
          <div class="space-y-3 pt-3 border-t border-amia-100">
            ${notes.map((n) => `
              <div class="p-3 rounded-xl bg-amia-50">
                <p class="text-sm text-amia-800 whitespace-pre-wrap">${escapeText(n.content)}</p>
                <p class="text-[11px] text-amia-400 mt-1.5">${formatDateTime(n.created_at)}</p>
              </div>
            `).join('')}
          </div>
        ` : `<p class="text-xs text-amia-400 text-center py-4">Nessuna nota</p>`}
      </div>
    `;
  }

  function actionsSection(nextStatuses: ApplicationStatus[]): string {
    if (!app) return '';
    return `
      <div class="bg-white rounded-2xl border border-amia-100 p-6">
        <h2 class="text-sm font-semibold text-amia-950 mb-4">Azioni</h2>
        ${nextStatuses.length > 0 ? `
          <div class="space-y-2">
            ${nextStatuses.map((s) => {
              const styleFor = (status: ApplicationStatus): string => {
                if (status === 'interview') return 'bg-orange-50 text-orange-700 hover:bg-orange-100';
                if (status === 'hired')     return 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100';
                if (status === 'rejected')  return 'bg-red-50 text-red-700 hover:bg-red-100';
                return 'bg-amia-50 text-amia-700 hover:bg-amia-100';
              };
              return `
                <button class="status-btn w-full px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${styleFor(s)}" data-status="${s}">
                  → ${applicationStatusLabel(s)}
                </button>
              `;
            }).join('')}
          </div>
        ` : `<p class="text-xs text-amia-400 italic">Stato finale</p>`}
      </div>

      <div class="bg-white rounded-2xl border border-red-100 p-6">
        <h2 class="text-sm font-semibold text-red-700 mb-1">Zona pericolosa</h2>
        <p class="text-xs text-amia-500 mb-4">Eliminare la candidatura cancella anche le risposte ai quiz e le note. Operazione irreversibile.</p>
        <button id="delete-app-btn"
          class="w-full px-3 py-2.5 rounded-xl text-sm font-medium bg-red-50 text-red-700 hover:bg-red-100 transition-colors">
          Elimina candidatura
        </button>
      </div>
    `;
  }

  function bindEvents() {
    ctx.$$<HTMLButtonElement>('.status-btn').forEach((btn) => {
      ctx.on(btn, 'click', () => {
        if (!app) return;
        const newStatus = btn.dataset.status as ApplicationStatus;
        if (!confirm(`Cambiare stato a "${applicationStatusLabel(newStatus)}"?`)) return;
        supabase.from('applications').update({ status: newStatus }).eq('id', app.id).then(({ error }) => {
          if (ctx.signal.aborted) return;
          if (error) { showToast(`Errore: ${error.message}`, 'error'); return; }
          showToast('Stato aggiornato');
          app!.status = newStatus;
          renderFull();
          bindEvents();
        });
      });
    });

    // Flag toggles: screened / standby
    ['flag-screened', 'flag-standby'].forEach((id) => {
      const btn = ctx.$<HTMLButtonElement>('#' + id);
      ctx.on(btn, 'click', () => {
        if (!app || !btn) return;
        const flag = btn.dataset.flag as 'screened' | 'standby';
        const cur  = btn.dataset.value === 'true';
        const next = !cur;
        // Optimistic update
        app[flag] = next;
        supabase.from('applications').update({ [flag]: next }).eq('id', app.id).then(({ error }) => {
          if (ctx.signal.aborted) return;
          if (error) {
            showToast(`Errore: ${error.message}`, 'error');
            app![flag] = cur;
          } else {
            showToast(next ? `Marcato come ${flag === 'screened' ? 'screened' : 'standby'}` : `Rimosso ${flag === 'screened' ? 'screened' : 'standby'}`);
          }
          renderFull();
          bindEvents();
        });
      });
    });

    // Delete application
    ctx.on(ctx.$<HTMLButtonElement>('#delete-app-btn'), 'click', () => {
      if (!app) return;
      const candidateLabel = `${app.candidate.first_name} ${app.candidate.last_name}`.trim() || app.candidate.email;
      const confirmMsg = `Eliminare definitivamente la candidatura di ${candidateLabel} per "${app.position.title}"?\n\nQuesta operazione non può essere annullata. Verranno eliminate anche tutte le risposte ai quiz, le note, lo storico stati e i file caricati (CV / portfolio).`;
      if (!confirm(confirmMsg)) return;

      const cvPath = app.cv_file_path;
      const portfolioPath = app.portfolio_path;

      supabase.from('applications').delete().eq('id', app.id).then(({ error }) => {
        if (ctx.signal.aborted) return;
        if (error) { showToast(`Errore: ${error.message}`, 'error'); return; }

        // Best-effort file cleanup — orphans if it fails (storage isn't transactional with the row)
        if (cvPath) {
          supabase.storage.from('cvs').remove([cvPath]).catch(() => {});
        }
        if (portfolioPath) {
          supabase.storage.from('cvs').remove([portfolioPath]).catch(() => {});
        }

        showToast('Candidatura eliminata');
        ctx.router.navigate('/applications');
      });
    });

    ctx.on(ctx.$<HTMLButtonElement>('#add-note-btn'), 'click', () => {
      const input = ctx.$<HTMLTextAreaElement>('#note-input');
      const content = input?.value.trim();
      if (!input || !content || !app) return;
      supabase.auth.getUser().then(({ data: userData }) => {
        if (!userData?.user) return;
        supabase.from('application_notes').insert({
          application_id: app!.id, author_id: userData.user.id, content,
        }).select().single().then(({ data, error }) => {
          if (ctx.signal.aborted) return;
          if (error) { showToast(`Errore: ${error.message}`, 'error'); return; }
          notes = [data as Note, ...notes];
          input.value = '';
          renderFull();
          bindEvents();
        });
      });
    });

    // Answers section toggle (lazy-fetch questions on first expand)
    ctx.$$<HTMLButtonElement>('.answers-toggle').forEach((btn) => {
      ctx.on(btn, 'click', () => {
        const kind = btn.dataset.quizKind as 'pre' | 'post' | 'att';
        const quizId = btn.dataset.quizId!;

        if (expandedQuizzes.has(kind)) {
          expandedQuizzes.delete(kind);
          renderFull();
          bindEvents();
          return;
        }

        expandedQuizzes.add(kind);
        renderFull();
        bindEvents();

        // Lazy fetch if not cached
        if (!questionsByQuiz[quizId]) {
          supabase.from('quiz_questions').select('*').eq('quiz_id', quizId).then(({ data, error }) => {
            if (ctx.signal.aborted || !expandedQuizzes.has(kind)) return;
            if (error) { showToast('Errore caricamento domande', 'error'); return; }
            questionsByQuiz[quizId] = data ?? [];
            renderFull();
            bindEvents();
          });
        }
      });
    });
  }
};

// ── HTML ──

function loadingShell(): string {
  return `<div class="p-8 max-w-5xl mx-auto"><div class="flex justify-center py-20"><div class="spinner"></div></div></div>`;
}

function quizCard(label: string, score: number | null, max: number | null, completed: string | null, over: boolean): string {
  if (!completed) return `
    <div class="p-4 rounded-xl border border-amia-100 bg-amia-50/50 text-center">
      <p class="text-[11px] text-amia-400 mb-1">${label}</p>
      <p class="text-sm text-amia-400">—</p>
      <p class="text-[10px] text-amia-400 mt-1">Non completato</p>
    </div>
  `;
  const pct = max ? Math.round(((score ?? 0) / max) * 100) : 0;
  return `
    <div class="p-4 rounded-xl border border-amia-100 text-center">
      <p class="text-[11px] text-amia-400 mb-1">${label}</p>
      <p class="text-lg font-semibold ${pctColor(pct)}">${pct}%</p>
      <p class="text-[11px] text-amia-400 mt-0.5">${score ?? 0}/${max ?? 0}${over ? ' ⏱' : ''}</p>
    </div>
  `;
}

function attitudinalCard(completed: string | null): string {
  if (!completed) return `
    <div class="p-4 rounded-xl border border-amia-100 bg-amia-50/50 text-center">
      <p class="text-[11px] text-amia-400 mb-1">Attitudinale</p>
      <p class="text-sm text-amia-400">—</p>
      <p class="text-[10px] text-amia-400 mt-1">Non completato</p>
    </div>
  `;
  return `
    <div class="p-4 rounded-xl border border-amia-100 text-center">
      <p class="text-[11px] text-amia-400 mb-1">Attitudinale</p>
      <p class="text-lg text-emerald-600">✓</p>
      <p class="text-[11px] text-amia-400 mt-0.5">Completato</p>
    </div>
  `;
}

function escapeAttr(s: string): string { return s.replace(/"/g, '&quot;').replace(/</g, '&lt;'); }
function escapeText(s: string): string { return s.replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function detailFlagClasses(active: boolean): string {
  return `inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
    active
      ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
      : 'bg-amia-50 text-amia-500 border border-amia-200 hover:bg-amia-100'
  }`;
}

function workLocationText(loc: 'milan' | 'remote' | null): string {
  if (loc === 'milan')  return '📍 Milano (hybrid)';
  if (loc === 'remote') return '🌍 Remote';
  return '<span class="text-amia-300">—</span>';
}