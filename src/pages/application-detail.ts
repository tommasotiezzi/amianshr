/**
 * Application detail — PageFactory.
 *
 * Left column: candidate info + CV/portfolio links + cover letter + metadata.
 * Main column: quiz overview cards → axis breakdown (new) → detailed responses + notes.
 *
 * Axis breakdown shows each axis the candidate was scored on, comparing their
 * raw value to the ICP target, with a match % readout. Only visible when
 * the attitudinal quiz has been submitted (axis_scores populated).
 */

import type { PageFactory } from '../lib/page';
import { supabase } from '../lib/supabase-client';
import * as q from '../lib/queries';
import { showToast } from '../lib/toast';
import { iconDownload, iconNote } from '../lib/icons';
import {
  formatDate,
  formatDateTime,
  applicationStatusBadge,
  pctColor,
  compositeScoreDisplay,
} from '../lib/formatting';
import {
  AXIS_LABELS,
  type ApplicationStatus,
  type ApplicationNote,
  type AxisType,
  type AxisScores,
  type IcpConfig,
  type QuizResponse,
} from '../lib/database-types';

// ── Types ──

interface FullApplication {
  id: string;
  status: ApplicationStatus;
  cv_file_path: string;
  portfolio_path: string | null;
  cover_letter: string | null;
  created_at: string;
  pre_quiz_score: number | null;
  pre_quiz_max_score: number | null;
  pre_quiz_responses: QuizResponse[] | null;
  pre_quiz_started_at: string | null;
  pre_quiz_completed_at: string | null;
  pre_quiz_over_time: boolean;
  post_quiz_score: number | null;
  post_quiz_max_score: number | null;
  post_quiz_responses: QuizResponse[] | null;
  post_quiz_started_at: string | null;
  post_quiz_completed_at: string | null;
  post_quiz_over_time: boolean;
  att_quiz_responses: QuizResponse[] | null;
  att_quiz_completed_at: string | null;
  axis_scores: AxisScores | null;
  composite_score: number | null;
  candidate: {
    first_name: string;
    last_name: string;
    email: string;
    phone: string | null;
    linkedin_url: string | null;
  };
  position: {
    title: string;
    department: string;
    icp_config: IcpConfig;
  };
}

const STATUS_OPTIONS: { value: ApplicationStatus; label: string }[] = [
  { value: 'applied',   label: 'Candidato' },
  { value: 'interview', label: 'Colloquio' },
  { value: 'hired',     label: 'Assunto' },
  { value: 'rejected',  label: 'Scartato' },
];

// ── Factory ──

export const createApplicationDetailPage: PageFactory = (ctx) => {
  const appId = ctx.params.id;

  // Closure state
  let app: FullApplication | null = null;
  let notes: ApplicationNote[] = [];
  let cvUrl: string | null = null;
  let portfolioUrl: string | null = null;

  return {
    async mount() {
      if (!appId) {
        ctx.router.navigate('/applications');
        return;
      }

      ctx.container.innerHTML = loadingShell();

      const res = await q.fetchApplicationDetail(appId, { signal: ctx.signal });
      if (ctx.signal.aborted) return;

      if (res.error) {
        showToast(res.error, 'error');
        ctx.router.navigate('/applications');
        return;
      }

      app = res.data!.application as FullApplication;
      notes = res.data!.notes;

      // Fetch signed URLs for CV + portfolio (cvs bucket is private)
      await refreshFileUrls();
      if (ctx.signal.aborted) return;

      renderFull();
      bindEvents();
    },
  };

  // ── Data helpers ──

  async function refreshFileUrls() {
    if (!app) return;
    const [cv, portfolio] = await Promise.all([
      app.cv_file_path
        ? supabase.storage.from('cvs').createSignedUrl(app.cv_file_path, 3600)
        : Promise.resolve({ data: null, error: null }),
      app.portfolio_path
        ? supabase.storage.from('cvs').createSignedUrl(app.portfolio_path, 3600)
        : Promise.resolve({ data: null, error: null }),
    ]);
    cvUrl = cv.data?.signedUrl ?? null;
    portfolioUrl = portfolio.data?.signedUrl ?? null;
  }

  // ── Render ──

  function renderFull() {
    if (!app) return;
    const c = app.candidate;
    const p = app.position;

    ctx.container.innerHTML = `
      <div class="p-8 max-w-5xl mx-auto">

        <a href="#/applications" class="text-xs text-amia-400 hover:text-amia-600 transition-colors mb-3 inline-block">
          ← Tutte le candidature
        </a>

        <!-- Header -->
        <div class="flex items-start justify-between mb-8">
          <div>
            <h1 class="text-2xl font-semibold text-amia-950 tracking-tight">
              ${escapeText(c.first_name)} ${escapeText(c.last_name)}
            </h1>
            <p class="text-amia-500 text-sm mt-1">${escapeText(p.title)} · ${escapeText(p.department)}</p>
          </div>
          <div class="flex items-center gap-3">
            ${applicationStatusBadge(app.status)}
            <select id="status-select"
              class="px-3 py-1.5 rounded-lg text-xs font-medium border border-amia-200 bg-white text-amia-700">
              ${STATUS_OPTIONS.map((s) => `
                <option value="${s.value}" ${app!.status === s.value ? 'selected' : ''}>${s.label}</option>
              `).join('')}
            </select>
          </div>
        </div>

        <div class="grid grid-cols-3 gap-6">

          <!-- Left column -->
          <div class="space-y-4">

            <!-- Contacts -->
            <div class="bg-white rounded-2xl border border-amia-100 p-5">
              <h3 class="text-xs font-semibold text-amia-400 uppercase tracking-wider mb-3">Contatti</h3>
              <div class="space-y-2 text-sm">
                <p class="text-amia-900 break-all">${escapeText(c.email)}</p>
                ${c.phone ? `<p class="text-amia-700">${escapeText(c.phone)}</p>` : ''}
                ${c.linkedin_url ? `
                  <a href="${escapeAttr(c.linkedin_url)}" target="_blank" rel="noopener"
                     class="text-accent hover:underline block">LinkedIn ↗</a>
                ` : ''}
              </div>
            </div>

            <!-- Documents -->
            <div class="bg-white rounded-2xl border border-amia-100 p-5">
              <h3 class="text-xs font-semibold text-amia-400 uppercase tracking-wider mb-3">Documenti</h3>
              <div class="space-y-2">
                ${cvUrl ? `
                  <a href="${cvUrl}" target="_blank" rel="noopener"
                     class="flex items-center gap-2 text-sm text-amia-700 hover:text-accent transition-colors">
                    ${iconDownload} <span>CV</span>
                  </a>
                ` : `
                  <p class="text-xs text-amia-400">CV non disponibile</p>
                `}
                ${portfolioUrl ? `
                  <a href="${portfolioUrl}" target="_blank" rel="noopener"
                     class="flex items-center gap-2 text-sm text-amia-700 hover:text-accent transition-colors">
                    ${iconDownload} <span>Portfolio</span>
                  </a>
                ` : ''}
              </div>
            </div>

            <!-- Cover letter -->
            ${app.cover_letter ? `
              <div class="bg-white rounded-2xl border border-amia-100 p-5">
                <h3 class="text-xs font-semibold text-amia-400 uppercase tracking-wider mb-3">Lettera</h3>
                <p class="text-sm text-amia-700 leading-relaxed whitespace-pre-line">${escapeText(app.cover_letter)}</p>
              </div>
            ` : ''}

            <!-- Metadata -->
            <div class="bg-white rounded-2xl border border-amia-100 p-5">
              <h3 class="text-xs font-semibold text-amia-400 uppercase tracking-wider mb-3">Info</h3>
              <p class="text-xs text-amia-500">
                Candidatura del <span class="text-amia-700">${formatDate(app.created_at)}</span>
              </p>
            </div>
          </div>

          <!-- Main column -->
          <div class="col-span-2 space-y-4">

            <!-- Quiz overview cards -->
            <div class="grid grid-cols-3 gap-3">
              ${quizOverviewCard('Quiz Logica',
                app.pre_quiz_score, app.pre_quiz_max_score,
                app.pre_quiz_started_at, app.pre_quiz_completed_at, app.pre_quiz_over_time)}
              ${quizOverviewCard('Quiz Skills',
                app.post_quiz_score, app.post_quiz_max_score,
                app.post_quiz_started_at, app.post_quiz_completed_at, app.post_quiz_over_time)}
              ${attOverviewCard(app.att_quiz_completed_at, app.composite_score)}
            </div>

            <!-- Axis breakdown (only when axis_scores present) -->
            ${axisBreakdownSection(app.axis_scores, app.position.icp_config, app.composite_score)}

            <!-- Detailed responses -->
            ${quizResponsesSection('Quiz Logica — Risposte', app.pre_quiz_responses)}
            ${quizResponsesSection('Quiz Skills — Risposte', app.post_quiz_responses)}
            ${attResponsesSection(app.att_quiz_responses)}

            <!-- Notes -->
            ${notesSection(notes)}
          </div>
        </div>
      </div>
    `;
  }

  // ── Events ──

  function bindEvents() {
    // Status change
    ctx.on(ctx.$<HTMLSelectElement>('#status-select'), 'change', async (e) => {
      if (!app) return;
      const newStatus = (e.target as HTMLSelectElement).value as ApplicationStatus;
      const res = await q.updateApplicationStatus(app.id, newStatus);
      if (ctx.signal.aborted) return;
      if (res.error) { showToast(`Errore: ${res.error}`, 'error'); return; }
      app.status = newStatus;
      showToast('Status aggiornato');
      renderFull();
      bindEvents();
    });

    // Add note
    ctx.on(ctx.$<HTMLButtonElement>('#add-note-btn'), 'click', async () => {
      if (!app) return;
      const input = ctx.$<HTMLInputElement>('#note-input');
      const content = input?.value.trim() ?? '';
      if (!content) return;

      const { data: userData } = await supabase.auth.getUser();
      if (ctx.signal.aborted) return;
      const authorId = userData.user?.id;
      if (!authorId) { showToast('Sessione non valida', 'error'); return; }

      const res = await q.addApplicationNote(app.id, authorId, content);
      if (ctx.signal.aborted) return;
      if (res.error) { showToast(`Errore: ${res.error}`, 'error'); return; }

      notes.unshift(res.data!);
      if (input) input.value = '';
      showToast('Nota aggiunta');

      // Re-render just the notes section in place
      const notesContainer = ctx.$<HTMLElement>('[data-notes-section]');
      if (notesContainer) {
        notesContainer.outerHTML = notesSection(notes);
        // Rebind add button (old reference destroyed)
        bindEvents();
      }
    });

    // Allow Enter in note input to submit
    ctx.on(ctx.$<HTMLInputElement>('#note-input'), 'keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter') {
        e.preventDefault();
        ctx.$<HTMLButtonElement>('#add-note-btn')?.click();
      }
    });
  }
};

// ── Quiz overview cards ──

function quizOverviewCard(
  title: string,
  score: number | null,
  max: number | null,
  startedAt: string | null,
  completedAt: string | null,
  overTime: boolean,
): string {
  if (!completedAt) {
    return `
      <div class="bg-white rounded-2xl border border-amia-100 p-4">
        <p class="text-xs font-semibold text-amia-400 uppercase tracking-wider mb-2">${title}</p>
        <p class="text-2xl font-bold text-amia-200">—</p>
        <p class="text-[11px] text-amia-300 mt-1">Non completato</p>
      </div>
    `;
  }

  const pct = max ? Math.round(((score ?? 0) / max) * 100) : 0;
  const color = pctColor(pct);

  let durationStr = '';
  if (startedAt && completedAt) {
    const mins = Math.round((new Date(completedAt).getTime() - new Date(startedAt).getTime()) / 60000);
    durationStr = `${mins} min`;
  }

  return `
    <div class="bg-white rounded-2xl border border-amia-100 p-4">
      <p class="text-xs font-semibold text-amia-400 uppercase tracking-wider mb-2">${title}</p>
      <p class="text-2xl font-bold ${color}">${pct}%</p>
      <p class="text-[11px] text-amia-500 mt-1">${score ?? 0}/${max ?? 0} punti</p>
      ${durationStr ? `
        <p class="text-[11px] mt-1 ${overTime ? 'text-red-500 font-medium' : 'text-amia-400'}">
          ${overTime ? '⏱ ' : ''}${durationStr}${overTime ? ' (sforato)' : ''}
        </p>
      ` : ''}
    </div>
  `;
}

function attOverviewCard(completedAt: string | null, composite: number | null): string {
  if (!completedAt) {
    return `
      <div class="bg-white rounded-2xl border border-amia-100 p-4">
        <p class="text-xs font-semibold text-amia-400 uppercase tracking-wider mb-2">Attitudinale</p>
        <p class="text-2xl font-bold text-amia-200">—</p>
        <p class="text-[11px] text-amia-300 mt-1">Non compilato</p>
      </div>
    `;
  }

  if (composite == null) {
    return `
      <div class="bg-white rounded-2xl border border-amia-100 p-4">
        <p class="text-xs font-semibold text-amia-400 uppercase tracking-wider mb-2">Attitudinale</p>
        <p class="text-2xl font-bold text-emerald-600">✓</p>
        <p class="text-[11px] text-amia-500 mt-1">ICP non configurato</p>
      </div>
    `;
  }

  return `
    <div class="bg-white rounded-2xl border border-amia-100 p-4">
      <p class="text-xs font-semibold text-amia-400 uppercase tracking-wider mb-2">Match ICP</p>
      <p class="text-2xl font-bold ${pctColor(composite)}">${Math.round(composite)}%</p>
      <p class="text-[11px] text-amia-500 mt-1">Composite score</p>
    </div>
  `;
}

// ── Axis breakdown (NEW) ──

function axisBreakdownSection(
  axisScores: AxisScores | null,
  icp: IcpConfig,
  composite: number | null,
): string {
  if (!axisScores || Object.keys(axisScores).length === 0) return '';

  // Sort axes: configured in ICP first (sorted by weight desc), then the rest
  const axes = Object.keys(axisScores) as AxisType[];
  const sorted = axes.sort((a, b) => {
    const wa = icp[a]?.weight ?? 0;
    const wb = icp[b]?.weight ?? 0;
    return wb - wa;
  });

  return `
    <div class="bg-white rounded-2xl border border-amia-100 p-5">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-xs font-semibold text-amia-400 uppercase tracking-wider">
          Breakdown per asse
        </h3>
        ${composite != null ? `
          <div class="flex items-center gap-2">
            <span class="text-[11px] text-amia-400">Composite:</span>
            ${compositeScoreDisplay(composite)}
          </div>
        ` : ''}
      </div>

      <div class="space-y-2.5">
        ${sorted.map((axis) => axisRow(axis, axisScores[axis]!, icp[axis])).join('')}
      </div>

      <p class="text-[11px] text-amia-400 mt-4 leading-relaxed">
        <strong>Raw</strong> = punteggio medio del candidato sull'asse (1-5).
        <strong>Target</strong> = valore desiderato per la posizione.
        <strong>Match</strong> = vicinanza al target pesata.
      </p>
    </div>
  `;
}

function axisRow(
  axis: AxisType,
  score: { raw: number; match_pct: number },
  icpAxis: { target: number; weight: number } | undefined,
): string {
  const matchPct = score.match_pct;
  const hasIcp = !!icpAxis && icpAxis.weight > 0;
  const target = icpAxis?.target ?? null;
  const weight = icpAxis?.weight ?? 0;

  // Horizontal bar: value position on 1-5 scale
  const rawPct = ((score.raw - 1) / 4) * 100;  // 1→0%, 5→100%
  const targetPct = target != null ? ((target - 1) / 4) * 100 : null;

  return `
    <div class="flex items-center gap-3 py-1.5">
      <!-- Label -->
      <div class="w-40 shrink-0">
        <p class="text-xs font-medium text-amia-900 truncate">${AXIS_LABELS[axis]}</p>
        ${hasIcp ? `
          <p class="text-[10px] text-amia-400">peso ${weight}</p>
        ` : `
          <p class="text-[10px] text-amia-300 italic">non in ICP</p>
        `}
      </div>

      <!-- Bar -->
      <div class="flex-1 relative h-7 bg-amia-50 rounded-lg overflow-hidden">
        <!-- Candidate's raw score bar -->
        <div class="absolute inset-y-0 left-0 bg-gradient-to-r from-accent-light to-accent/30 rounded-lg"
             style="width: ${rawPct}%"></div>

        <!-- Target marker -->
        ${targetPct != null ? `
          <div class="absolute inset-y-0 w-0.5 bg-amia-900"
               style="left: calc(${targetPct}% - 1px)"
               title="Target: ${target}">
          </div>
        ` : ''}

        <!-- Raw value label -->
        <div class="absolute inset-0 flex items-center px-2.5">
          <span class="text-[11px] font-semibold text-amia-900">${score.raw.toFixed(1)}</span>
          ${target != null ? `
            <span class="text-[10px] text-amia-500 ml-auto">target ${target}</span>
          ` : ''}
        </div>
      </div>

      <!-- Match % -->
      <div class="w-14 text-right shrink-0">
        ${hasIcp ? `
          <span class="text-xs font-semibold ${pctColor(matchPct)}">${Math.round(matchPct)}%</span>
        ` : `
          <span class="text-xs text-amia-300">—</span>
        `}
      </div>
    </div>
  `;
}

// ── Quiz responses ──

function quizResponsesSection(title: string, responses: QuizResponse[] | null): string {
  if (!responses || responses.length === 0) return '';

  return `
    <div class="bg-white rounded-2xl border border-amia-100 p-5">
      <h3 class="text-xs font-semibold text-amia-400 uppercase tracking-wider mb-4">${title}</h3>
      <div class="space-y-3">
        ${responses.map((r, i) => {
          const isCorrect = r.is_correct;
          const answer = formatAnswer(r.answer);
          const isMC = typeof r.is_correct === 'boolean';

          return `
            <div class="p-3 rounded-xl ${
              isCorrect === true ? 'bg-emerald-50/50'
              : isCorrect === false ? 'bg-red-50/50'
              : 'bg-amia-50'
            }">
              <div class="flex items-start justify-between mb-1">
                <span class="text-[11px] font-mono text-amia-400">D${i + 1}</span>
                ${isMC
                  ? `<span class="text-xs font-medium ${isCorrect ? 'text-emerald-600' : 'text-red-500'}">
                       ${isCorrect ? '✓ Corretta' : '✗ Errata'} · ${r.points_earned ?? 0} pt
                     </span>`
                  : (r.points_earned != null
                      ? `<span class="text-xs text-amia-500">${r.points_earned} pt</span>`
                      : '')
                }
              </div>
              <p class="text-sm text-amia-800">${escapeText(answer)}</p>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

function attResponsesSection(responses: QuizResponse[] | null): string {
  if (!responses || responses.length === 0) return '';

  return `
    <div class="bg-white rounded-2xl border border-amia-100 p-5">
      <h3 class="text-xs font-semibold text-amia-400 uppercase tracking-wider mb-4">Attitudinale — Risposte</h3>
      <div class="space-y-3">
        ${responses.map((r, i) => `
          <div class="p-3 rounded-xl bg-amber-50/50">
            <span class="text-[11px] font-mono text-amia-400 mb-1 block">D${i + 1}</span>
            <p class="text-sm text-amia-800">${escapeText(formatAnswer(r.answer))}</p>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function formatAnswer(answer: QuizResponse['answer']): string {
  if (answer == null) return '—';
  if (Array.isArray(answer)) return answer.join(', ');
  return String(answer);
}

// ── Notes ──

function notesSection(notes: ApplicationNote[]): string {
  return `
    <div class="bg-white rounded-2xl border border-amia-100 p-5" data-notes-section>
      <h3 class="text-xs font-semibold text-amia-400 uppercase tracking-wider mb-4 flex items-center gap-2">
        ${iconNote} Note interne (${notes.length})
      </h3>

      <div class="flex gap-2 mb-4">
        <input type="text" id="note-input" placeholder="Aggiungi una nota..."
          class="flex-1 px-4 py-2.5 rounded-xl border border-amia-200 text-sm text-amia-900 placeholder:text-amia-300" />
        <button id="add-note-btn"
          class="bg-amia-950 text-white px-4 py-2.5 rounded-xl text-sm font-medium
                 hover:bg-amia-900 active:scale-[0.98] transition-all shrink-0">
          Aggiungi
        </button>
      </div>

      <div class="space-y-3">
        ${notes.length > 0
          ? notes.map((n) => `
              <div class="p-3 rounded-xl bg-amia-50">
                <p class="text-sm text-amia-800 whitespace-pre-line">${escapeText(n.content)}</p>
                <p class="text-[11px] text-amia-400 mt-1">${formatDateTime(n.created_at)}</p>
              </div>
            `).join('')
          : '<p class="text-xs text-amia-400">Nessuna nota</p>'
        }
      </div>
    </div>
  `;
}

// ── Shell + helpers ──

function loadingShell(): string {
  return `
    <div class="p-8 max-w-5xl mx-auto">
      <div class="flex justify-center py-20"><div class="spinner"></div></div>
    </div>
  `;
}

function escapeAttr(s: string): string {
  return s.replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function escapeText(s: string): string {
  return s.replace(/</g, '&lt;').replace(/>/g, '&gt;');
}