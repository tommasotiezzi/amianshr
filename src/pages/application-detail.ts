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
  compositeScoreDisplay, pctColor,
} from '../lib/formatting';
import {
  AXIS_LABELS,
  type ApplicationStatus, type AxisType,
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
  pre_quiz_over_time: boolean;
  post_quiz_score: number | null;
  post_quiz_max_score: number | null;
  post_quiz_completed_at: string | null;
  post_quiz_over_time: boolean;
  att_quiz_completed_at: string | null;
  axis_scores: Record<string, { raw: number; match_pct: number }> | null;
  composite_score: number | null;
  candidate: { id: string; first_name: string; last_name: string; email: string; phone: string | null; linkedin_url: string | null };
  position: { id: string; title: string; department: string; icp_config: Record<string, { target: number; weight: number }> };
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

  ctx.container.innerHTML = loadingShell();

  Promise.all([
    supabase.from('applications').select(`
      id, status, created_at, cv_file_path, cover_letter, portfolio_path,
      pre_quiz_score, pre_quiz_max_score, pre_quiz_completed_at, pre_quiz_over_time,
      post_quiz_score, post_quiz_max_score, post_quiz_completed_at, post_quiz_over_time,
      att_quiz_completed_at, axis_scores, composite_score,
      candidate:candidates(id, first_name, last_name, email, phone, linkedin_url),
      position:positions(id, title, department, icp_config)
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
            <p class="text-amia-500 text-sm mt-1">
              ${escapeText(app.position.title)} · ${escapeText(app.position.department)}
            </p>
            <div class="flex items-center gap-3 mt-3">
              ${applicationStatusBadge(app.status)}
              <span class="text-xs text-amia-400">Candidatura del ${formatDate(app.created_at)}</span>
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
        <h2 class="text-sm font-semibold text-amia-950 mb-4">Profilo assi</h2>
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