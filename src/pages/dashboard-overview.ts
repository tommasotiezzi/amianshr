/**
 * Dashboard — PageFactory.
 *
 * Admin overview:
 *   - Stats cards (total apps, interview, hired, active positions)
 *   - Pipeline visualization
 *   - Recent applications (latest 5)
 *   - Top candidates by composite ICP match (NEW) — only shown if any exist
 */

import type { PageFactory } from '../lib/page';
import { supabase } from '../lib/supabase-client';
import { showToast } from '../lib/toast';
import {
  applicationStatusBadge,
  timeAgo,
  scoreDisplay,
  compositeScoreDisplay,
} from '../lib/formatting';
import type { ApplicationStatus } from '../lib/database-types';

// ── Types ──

interface DashboardStats {
  totalApplications: number;
  appliedCount: number;
  interviewCount: number;
  hiredCount: number;
  rejectedCount: number;
  activePositions: number;
  totalQuizzes: number;
}

interface RecentApp {
  id: string;
  status: ApplicationStatus;
  created_at: string;
  pre_quiz_score: number | null;
  pre_quiz_max_score: number | null;
  pre_quiz_completed_at: string | null;
  post_quiz_completed_at: string | null;
  composite_score: number | null;
  candidate: { first_name: string; last_name: string };
  position: { title: string };
}

interface TopCandidate {
  id: string;
  composite_score: number;
  created_at: string;
  candidate: { first_name: string; last_name: string };
  position: { title: string; department: string };
}

// ── Factory ──

export const createDashboardPage: PageFactory = (ctx) => {
  return {
    async mount() {
      ctx.container.innerHTML = loadingShell();

      const [appsRes, posRes, quizRes, recentRes, topRes] = await Promise.all([
        supabase.from('applications').select('status').abortSignal(ctx.signal),
        supabase.from('positions').select('status').abortSignal(ctx.signal),
        supabase.from('quizzes').select('id').abortSignal(ctx.signal),
        supabase.from('applications').select(`
          id, status, created_at,
          pre_quiz_score, pre_quiz_max_score, pre_quiz_completed_at, post_quiz_completed_at, composite_score,
          candidate:candidates(first_name, last_name),
          position:positions(title)
        `).order('created_at', { ascending: false }).limit(5).abortSignal(ctx.signal),
        supabase.from('applications').select(`
          id, composite_score, created_at,
          candidate:candidates(first_name, last_name),
          position:positions(title, department)
        `)
          .not('composite_score', 'is', null)
          .order('composite_score', { ascending: false })
          .limit(5)
          .abortSignal(ctx.signal),
      ]);

      if (ctx.signal.aborted) return;

      if (appsRes.error || posRes.error || quizRes.error) {
        showToast('Errore nel caricamento', 'error');
        return;
      }

      const apps = appsRes.data ?? [];
      const stats: DashboardStats = {
        totalApplications: apps.length,
        appliedCount:   apps.filter((a: any) => a.status === 'applied').length,
        interviewCount: apps.filter((a: any) => a.status === 'interview').length,
        hiredCount:     apps.filter((a: any) => a.status === 'hired').length,
        rejectedCount:  apps.filter((a: any) => a.status === 'rejected').length,
        activePositions: (posRes.data ?? []).filter((p: any) => p.status === 'published').length,
        totalQuizzes: (quizRes.data ?? []).length,
      };

      const recent: RecentApp[] = (recentRes.data ?? []).map((r: any) => ({
        ...r,
        candidate: Array.isArray(r.candidate) ? r.candidate[0] : r.candidate,
        position:  Array.isArray(r.position)  ? r.position[0]  : r.position,
      }));

      const top: TopCandidate[] = (topRes.data ?? []).map((r: any) => ({
        ...r,
        candidate: Array.isArray(r.candidate) ? r.candidate[0] : r.candidate,
        position:  Array.isArray(r.position)  ? r.position[0]  : r.position,
      }));

      renderFull(ctx.container, stats, recent, top);
    },
  };
};

// ── Render ──

function renderFull(container: HTMLElement, stats: DashboardStats, recent: RecentApp[], top: TopCandidate[]) {
  container.innerHTML = `
    <div class="p-8 max-w-6xl mx-auto">

      <!-- Header -->
      <div class="mb-8">
        <h1 class="text-2xl font-semibold text-amia-950 tracking-tight">Dashboard</h1>
        <p class="text-amia-500 text-sm mt-1">Panoramica del recruiting</p>
      </div>

      <!-- Stats cards -->
      <div class="grid grid-cols-4 gap-4 mb-8">
        ${statCard('Candidature',      stats.totalApplications)}
        ${statCard('In colloquio',     stats.interviewCount)}
        ${statCard('Assunti',          stats.hiredCount)}
        ${statCard('Posizioni attive', stats.activePositions)}
      </div>

      <!-- Pipeline -->
      ${pipelineSection(stats)}

      <!-- Two-column bottom row: top candidates (if any) + recent -->
      <div class="grid ${top.length > 0 ? 'grid-cols-2' : 'grid-cols-1'} gap-6 mt-6">
        ${top.length > 0 ? topCandidatesSection(top) : ''}
        ${recentSection(recent)}
      </div>
    </div>
  `;
}

function pipelineSection(stats: DashboardStats): string {
  return `
    <div class="bg-white rounded-2xl border border-amia-100 p-6">
      <h2 class="text-sm font-semibold text-amia-950 mb-4">Pipeline</h2>
      <div class="flex items-center gap-1 h-4 rounded-full overflow-hidden bg-amia-100">
        ${pipelineBar(stats.appliedCount,   stats.totalApplications, 'bg-blue-400',    'Candidati')}
        ${pipelineBar(stats.interviewCount, stats.totalApplications, 'bg-orange-400',  'Colloquio')}
        ${pipelineBar(stats.hiredCount,     stats.totalApplications, 'bg-emerald-400', 'Assunti')}
        ${pipelineBar(stats.rejectedCount,  stats.totalApplications, 'bg-red-300',     'Scartati')}
      </div>
      <div class="flex items-center gap-6 mt-3">
        ${pipelineLegend('bg-blue-400',    'Candidati', stats.appliedCount)}
        ${pipelineLegend('bg-orange-400',  'Colloquio', stats.interviewCount)}
        ${pipelineLegend('bg-emerald-400', 'Assunti',   stats.hiredCount)}
        ${pipelineLegend('bg-red-300',     'Scartati',  stats.rejectedCount)}
      </div>
    </div>
  `;
}

function topCandidatesSection(top: TopCandidate[]): string {
  return `
    <div class="bg-white rounded-2xl border border-amia-100 p-6">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-sm font-semibold text-amia-950">Top match ICP</h2>
        <a href="#/applications" class="text-xs text-accent hover:underline">Vedi tutte →</a>
      </div>
      <div class="space-y-2">
        ${top.map((t) => `
          <a href="#/applications/${t.id}"
             class="flex items-center justify-between p-3 rounded-xl hover:bg-amia-50 transition-colors">
            <div class="flex items-center gap-3 min-w-0">
              <div class="w-8 h-8 rounded-full bg-amia-100 flex items-center justify-center text-xs font-semibold text-amia-600 shrink-0">
                ${escapeText(t.candidate.first_name[0] ?? '')}${escapeText(t.candidate.last_name[0] ?? '')}
              </div>
              <div class="min-w-0">
                <p class="text-sm font-medium text-amia-950 truncate">
                  ${escapeText(t.candidate.first_name)} ${escapeText(t.candidate.last_name)}
                </p>
                <p class="text-xs text-amia-400 truncate">${escapeText(t.position.title)}</p>
              </div>
            </div>
            <div class="shrink-0 ml-3">
              ${compositeScoreDisplay(t.composite_score)}
            </div>
          </a>
        `).join('')}
      </div>
    </div>
  `;
}

function recentSection(recent: RecentApp[]): string {
  return `
    <div class="bg-white rounded-2xl border border-amia-100 p-6">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-sm font-semibold text-amia-950">Candidature recenti</h2>
        <a href="#/applications" class="text-xs text-accent hover:underline">Vedi tutte →</a>
      </div>

      ${recent.length > 0 ? `
        <div class="space-y-2">
          ${recent.map((r) => `
            <a href="#/applications/${r.id}"
               class="flex items-center justify-between p-3 rounded-xl hover:bg-amia-50 transition-colors">
              <div class="flex items-center gap-3 min-w-0">
                <div class="w-8 h-8 rounded-full bg-amia-100 flex items-center justify-center text-xs font-semibold text-amia-600 shrink-0">
                  ${escapeText(r.candidate.first_name[0] ?? '')}${escapeText(r.candidate.last_name[0] ?? '')}
                </div>
                <div class="min-w-0">
                  <p class="text-sm font-medium text-amia-950 truncate">
                    ${escapeText(r.candidate.first_name)} ${escapeText(r.candidate.last_name)}
                  </p>
                  <p class="text-xs text-amia-400 truncate">${escapeText(r.position.title)}</p>
                </div>
              </div>
              <div class="flex items-center gap-3 shrink-0 ml-3">
                <div class="flex items-center gap-1.5 text-xs text-amia-400">
                  ${r.pre_quiz_completed_at
                    ? scoreDisplay(r.pre_quiz_score, r.pre_quiz_max_score)
                    : '<span class="text-amia-300">—</span>'}
                </div>
                ${applicationStatusBadge(r.status)}
                <span class="text-[11px] text-amia-400 w-14 text-right">${timeAgo(r.created_at)}</span>
              </div>
            </a>
          `).join('')}
        </div>
      ` : `
        <p class="text-sm text-amia-400 text-center py-8">Nessuna candidatura ancora</p>
      `}
    </div>
  `;
}

// ── Small components ──

function statCard(label: string, value: number): string {
  return `
    <div class="bg-white rounded-2xl border border-amia-100 p-5">
      <p class="text-xs font-medium text-amia-400 mb-1">${label}</p>
      <p class="text-3xl font-bold text-amia-950">${value}</p>
    </div>
  `;
}

function pipelineBar(count: number, total: number, bgColor: string, label: string): string {
  if (total === 0 || count === 0) return '';
  const pct = Math.max((count / total) * 100, 2);
  return `<div class="${bgColor} h-full rounded-full" style="width:${pct}%" title="${label}: ${count}"></div>`;
}

function pipelineLegend(dotColor: string, label: string, count: number): string {
  return `
    <div class="flex items-center gap-1.5">
      <span class="w-2.5 h-2.5 rounded-full ${dotColor}"></span>
      <span class="text-xs text-amia-600">${label}</span>
      <span class="text-xs font-semibold text-amia-950">${count}</span>
    </div>
  `;
}

// ── Shell + helpers ──

function loadingShell(): string {
  return `
    <div class="p-8 max-w-6xl mx-auto">
      <div class="mb-8">
        <h1 class="text-2xl font-semibold text-amia-950 tracking-tight">Dashboard</h1>
        <p class="text-amia-500 text-sm mt-1">Caricamento...</p>
      </div>
      <div class="flex justify-center py-20"><div class="spinner"></div></div>
    </div>
  `;
}

function escapeText(s: string): string {
  return s.replace(/</g, '&lt;').replace(/>/g, '&gt;');
}