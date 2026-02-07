/**
 * Dettaglio candidatura — pannello admin.
 * Info candidato, CV, quiz results con ideal answers, note interne, cambio status.
 */

import { Router } from '../router';
import { supabase } from '../lib/supabase-client';
import { showToast } from '../lib/toast';
import { iconDownload, iconNote } from '../lib/icons';
import { formatDate, formatDateTime, applicationStatusBadge, scoreDisplay } from '../lib/formatting';
import type { ApplicationStatus, ApplicationNote } from '../lib/database-types';

interface FullApplication {
  id: string;
  status: ApplicationStatus;
  cv_file_path: string;
  portfolio_path: string | null;
  cover_letter: string | null;
  created_at: string;
  pre_quiz_score: number | null;
  pre_quiz_max_score: number | null;
  pre_quiz_responses: any[] | null;
  pre_quiz_started_at: string | null;
  pre_quiz_completed_at: string | null;
  pre_quiz_over_time: boolean;
  post_quiz_score: number | null;
  post_quiz_max_score: number | null;
  post_quiz_responses: any[] | null;
  post_quiz_started_at: string | null;
  post_quiz_completed_at: string | null;
  post_quiz_over_time: boolean;
  att_quiz_responses: any[] | null;
  att_quiz_completed_at: string | null;
  candidate: { first_name: string; last_name: string; email: string; phone: string | null; linkedin_url: string | null };
  position: { title: string; department: string };
}

const STATUS_OPTIONS: { value: ApplicationStatus; label: string }[] = [
  { value: 'applied', label: 'Candidato' },
  { value: 'interview', label: 'Colloquio' },
  { value: 'hired', label: 'Assunto' },
  { value: 'rejected', label: 'Scartato' },
];

export async function renderApplicationDetail(
  container: HTMLElement,
  router: Router,
  params?: Record<string, string>
) {
  const appId = params?.id;
  if (!appId) { router.navigate('/applications'); return; }

  container.innerHTML = `
    <div class="p-8 max-w-5xl mx-auto">
      <div class="flex justify-center py-20"><div class="spinner"></div></div>
    </div>
  `;

  const [appRes, notesRes] = await Promise.all([
    supabase.from('applications').select(`
      *,
      candidate:candidates(first_name, last_name, email, phone, linkedin_url),
      position:positions(title, department)
    `).eq('id', appId).single(),
    supabase.from('application_notes').select('*').eq('application_id', appId).order('created_at', { ascending: false }),
  ]);

  if (appRes.error || !appRes.data) {
    showToast('Candidatura non trovata', 'error');
    router.navigate('/applications');
    return;
  }

  const app: FullApplication = {
    ...appRes.data,
    candidate: Array.isArray(appRes.data.candidate) ? appRes.data.candidate[0] : appRes.data.candidate,
    position: Array.isArray(appRes.data.position) ? appRes.data.position[0] : appRes.data.position,
  } as any;

  const notes: ApplicationNote[] = notesRes.data ?? [];

  render(container, router, app, notes);
}

function render(container: HTMLElement, router: Router, app: FullApplication, notes: ApplicationNote[]) {
  const c = app.candidate;
  const p = app.position;

  container.innerHTML = `
    <div class="p-8 max-w-5xl mx-auto">

      <a href="#/applications" class="text-xs text-amia-400 hover:text-amia-600 transition-colors mb-3 inline-block">
        ← Tutte le candidature
      </a>

      <!-- Header -->
      <div class="flex items-start justify-between mb-8">
        <div>
          <h1 class="text-2xl font-semibold text-amia-950 tracking-tight">
            ${c.first_name} ${c.last_name}
          </h1>
          <p class="text-amia-500 text-sm mt-1">${p.title} · ${p.department}</p>
        </div>
        <div class="flex items-center gap-3">
          ${applicationStatusBadge(app.status)}
          <select id="status-select"
            class="px-3 py-1.5 rounded-lg text-xs font-medium border border-amia-200 bg-white text-amia-700">
            ${STATUS_OPTIONS.map((s) => `
              <option value="${s.value}" ${app.status === s.value ? 'selected' : ''}>${s.label}</option>
            `).join('')}
          </select>
        </div>
      </div>

      <div class="grid grid-cols-3 gap-6">

        <!-- Colonna sinistra: info + CV + contatti -->
        <div class="space-y-4">

          <!-- Contatti -->
          <div class="bg-white rounded-2xl border border-amia-100 p-5">
            <h3 class="text-xs font-semibold text-amia-400 uppercase tracking-wider mb-3">Contatti</h3>
            <div class="space-y-2 text-sm">
              <p class="text-amia-900">${c.email}</p>
              ${c.phone ? `<p class="text-amia-700">${c.phone}</p>` : ''}
              ${c.linkedin_url ? `<a href="${c.linkedin_url}" target="_blank" class="text-accent hover:underline block">LinkedIn ↗</a>` : ''}
            </div>
          </div>

          <!-- CV e materiali -->
          <div class="bg-white rounded-2xl border border-amia-100 p-5">
            <h3 class="text-xs font-semibold text-amia-400 uppercase tracking-wider mb-3">Documenti</h3>
            <div class="space-y-2">
              <a href="#" class="flex items-center gap-2 text-sm text-amia-700 hover:text-accent transition-colors">
                ${iconDownload} <span>CV</span>
              </a>
              ${app.portfolio_path ? `
                <a href="#" class="flex items-center gap-2 text-sm text-amia-700 hover:text-accent transition-colors">
                  ${iconDownload} <span>Portfolio</span>
                </a>
              ` : ''}
            </div>
          </div>

          <!-- Cover letter -->
          ${app.cover_letter ? `
            <div class="bg-white rounded-2xl border border-amia-100 p-5">
              <h3 class="text-xs font-semibold text-amia-400 uppercase tracking-wider mb-3">Lettera</h3>
              <p class="text-sm text-amia-700 leading-relaxed">${app.cover_letter}</p>
            </div>
          ` : ''}

          <!-- Data candidatura -->
          <div class="bg-white rounded-2xl border border-amia-100 p-5">
            <h3 class="text-xs font-semibold text-amia-400 uppercase tracking-wider mb-3">Info</h3>
            <p class="text-xs text-amia-500">Candidatura del <span class="text-amia-700">${formatDate(app.created_at)}</span></p>
          </div>
        </div>

        <!-- Colonna centrale: quiz results -->
        <div class="col-span-2 space-y-4">

          <!-- Quiz overview cards -->
          <div class="grid grid-cols-3 gap-3">
            ${quizOverviewCard('Quiz Logica', app.pre_quiz_score, app.pre_quiz_max_score,
              app.pre_quiz_started_at, app.pre_quiz_completed_at, app.pre_quiz_over_time, 25)}
            ${quizOverviewCard('Quiz Skills', app.post_quiz_score, app.post_quiz_max_score,
              app.post_quiz_started_at, app.post_quiz_completed_at, app.post_quiz_over_time, 35)}
            ${attOverviewCard(app.att_quiz_completed_at, app.att_quiz_responses)}
          </div>

          <!-- Quiz risposte dettagliate -->
          ${quizResponsesSection('Quiz Logica — Risposte', app.pre_quiz_responses)}
          ${quizResponsesSection('Quiz Skills — Risposte', app.post_quiz_responses)}
          ${attResponsesSection(app.att_quiz_responses)}

          <!-- Note interne -->
          <div class="bg-white rounded-2xl border border-amia-100 p-5">
            <h3 class="text-xs font-semibold text-amia-400 uppercase tracking-wider mb-4">
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
                      <p class="text-sm text-amia-800">${n.content}</p>
                      <p class="text-[11px] text-amia-400 mt-1">${formatDateTime(n.created_at)}</p>
                    </div>
                  `).join('')
                : '<p class="text-xs text-amia-400">Nessuna nota</p>'
              }
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  // ── Bind events ──

  // Status change
  document.getElementById('status-select')?.addEventListener('change', async (e) => {
    const newStatus = (e.target as HTMLSelectElement).value as ApplicationStatus;
    const { error } = await supabase
      .from('applications')
      .update({ status: newStatus })
      .eq('id', app.id);

    if (error) {
      showToast(`Errore: ${error.message}`, 'error');
      return;
    }
    app.status = newStatus;
    showToast(`Status aggiornato: ${newStatus}`);
    render(container, router, app, notes);
  });

  // Add note
  document.getElementById('add-note-btn')?.addEventListener('click', async () => {
    const input = document.getElementById('note-input') as HTMLInputElement;
    const content = input.value.trim();
    if (!content) return;

    const { data: userData } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('application_notes')
      .insert({ application_id: app.id, author_id: userData?.user?.id, content })
      .select()
      .single();

    if (error) {
      showToast(`Errore: ${error.message}`, 'error');
      return;
    }

    notes.unshift(data as ApplicationNote);
    showToast('Nota aggiunta');
    render(container, router, app, notes);
  });
}

// ── Helper components ──

function quizOverviewCard(
  title: string,
  score: number | null,
  max: number | null,
  startedAt: string | null,
  completedAt: string | null,
  overTime: boolean,
  durationMinutes: number
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
  const color = pct >= 80 ? 'text-emerald-600' : pct >= 60 ? 'text-amber-600' : 'text-red-600';

  let durationStr = '';
  if (startedAt && completedAt) {
    const mins = Math.round((new Date(completedAt).getTime() - new Date(startedAt).getTime()) / 60000);
    durationStr = `${mins} min / ${durationMinutes} min`;
  }

  return `
    <div class="bg-white rounded-2xl border border-amia-100 p-4">
      <p class="text-xs font-semibold text-amia-400 uppercase tracking-wider mb-2">${title}</p>
      <p class="text-2xl font-bold ${color}">${pct}%</p>
      <p class="text-[11px] text-amia-500 mt-1">${score}/${max} punti</p>
      ${durationStr ? `
        <p class="text-[11px] mt-1 ${overTime ? 'text-red-500 font-medium' : 'text-amia-400'}">
          ${overTime ? '⏱ ' : ''}${durationStr}${overTime ? ' (sforato)' : ''}
        </p>
      ` : ''}
    </div>
  `;
}

function attOverviewCard(completedAt: string | null, responses: any[] | null): string {
  const count = responses?.length ?? 0;
  return `
    <div class="bg-white rounded-2xl border border-amia-100 p-4">
      <p class="text-xs font-semibold text-amia-400 uppercase tracking-wider mb-2">Attitudinale</p>
      ${completedAt
        ? `<p class="text-2xl font-bold text-emerald-600">✓</p>
           <p class="text-[11px] text-amia-500 mt-1">${count} risposte</p>`
        : `<p class="text-2xl font-bold text-amia-200">—</p>
           <p class="text-[11px] text-amia-300 mt-1">Non compilato</p>`
      }
    </div>
  `;
}

function quizResponsesSection(title: string, responses: any[] | null): string {
  if (!responses || responses.length === 0) return '';

  return `
    <div class="bg-white rounded-2xl border border-amia-100 p-5">
      <h3 class="text-xs font-semibold text-amia-400 uppercase tracking-wider mb-4">${title}</h3>
      <div class="space-y-4">
        ${responses.map((r, i) => {
          const isCorrect = r.is_correct;
          const answer = Array.isArray(r.answer) ? r.answer.join(', ') : r.answer;
          const isMC = typeof r.is_correct === 'boolean';

          return `
            <div class="p-3 rounded-xl ${isCorrect === true ? 'bg-emerald-50/50' : isCorrect === false ? 'bg-red-50/50' : 'bg-amia-50'}">
              <div class="flex items-start justify-between mb-1">
                <span class="text-[11px] font-mono text-amia-400">D${i + 1}</span>
                ${isMC
                  ? `<span class="text-xs font-medium ${isCorrect ? 'text-emerald-600' : 'text-red-500'}">
                       ${isCorrect ? '✓ Corretta' : '✗ Errata'} · ${r.points_earned ?? 0} pt
                     </span>`
                  : (r.points_earned != null ? `<span class="text-xs text-amia-500">${r.points_earned} pt</span>` : '')
                }
              </div>
              <p class="text-sm text-amia-800">${answer}</p>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

function attResponsesSection(responses: any[] | null): string {
  if (!responses || responses.length === 0) return '';

  return `
    <div class="bg-white rounded-2xl border border-amia-100 p-5">
      <h3 class="text-xs font-semibold text-amia-400 uppercase tracking-wider mb-4">Attitudinale — Risposte</h3>
      <div class="space-y-4">
        ${responses.map((r, i) => `
          <div class="p-3 rounded-xl bg-amber-50/50">
            <span class="text-[11px] font-mono text-amia-400 mb-1 block">D${i + 1}</span>
            <p class="text-sm text-amia-800">${r.answer}</p>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}