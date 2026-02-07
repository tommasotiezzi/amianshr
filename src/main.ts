/**
 * Amia ATS — Entry point.
 * Collega il router alle pagine e al layout.
 */

import { Router } from './router';
import { isAuthenticated, isAdmin, initAuth } from './lib/auth';
import { renderSidebarLayout } from './layouts/sidebar-layout';
import { renderLoginPage } from './pages/login';
import { renderDashboardOverview } from './pages/dashboard-overview';
import { renderPositionsList } from './pages/positions-list';
import { renderPositionForm } from './pages/position-form';
import { renderQuizzesList } from './pages/quizzes-list';
import { renderQuizEditor } from './pages/quiz-editor';
import { renderApplicationsList } from './pages/applications-list';
import { renderApplicationDetail } from './pages/application-detail';
import { renderSettings } from './pages/settings';

const app = document.getElementById('app')!;
const router = new Router();

// ── Wrapper: renderizza una pagina dentro il layout sidebar ──

function withSidebar(renderPage: (container: HTMLElement) => void) {
  if (!isAuthenticated()) {
    router.navigate('/login');
    return;
  }
  if (!isAdmin()) {
    // Utente loggato ma non admin: mostra errore
    app.innerHTML = `
      <div class="min-h-screen flex items-center justify-center bg-amia-50">
        <div class="text-center">
          <p class="text-amia-950 text-lg font-semibold mb-2">Accesso negato</p>
          <p class="text-amia-400 text-sm">Non hai i permessi per accedere a questa sezione.</p>
        </div>
      </div>
    `;
    return;
  }
  renderSidebarLayout(app, router, renderPage);
}

// ── Placeholder per pagine non ancora sviluppate ──

function comingSoon(title: string, description: string) {
  return (container: HTMLElement) => {
    container.innerHTML = `
      <div class="p-8 max-w-5xl mx-auto">
        <h1 class="text-2xl font-semibold text-amia-950 tracking-tight">${title}</h1>
        <p class="text-amia-500 text-sm mt-1">${description}</p>
        <div class="mt-8 text-center py-20 bg-white rounded-2xl border border-dashed border-amia-200">
          <div class="w-12 h-12 bg-amia-100 rounded-xl flex items-center justify-center mx-auto mb-4">
            <span class="text-amia-400 text-lg">🚧</span>
          </div>
          <p class="text-amia-400 text-sm font-medium">In sviluppo</p>
          <p class="text-amia-300 text-xs mt-1">Questa sezione verrà implementata nel prossimo sprint</p>
        </div>
      </div>
    `;
  };
}

// ── Rotte ──

router
  .on('/login', () => {
    if (isAuthenticated()) {
      router.navigate('/dashboard');
      return;
    }
    renderLoginPage(app, router);
  })
  .on('/dashboard', () => withSidebar(renderDashboardOverview))
  .on('/positions', () => withSidebar((c) => { renderPositionsList(c, router); }))
  .on('/positions/new', () => withSidebar((c) => { renderPositionForm(c, router); }))
  .on('/positions/:id/edit', (p) => withSidebar((c) => { renderPositionForm(c, router, p); }))
  .on('/positions/:id/applications', () => withSidebar(comingSoon('Candidature', 'Candidature per questa posizione')))
  .on('/applications', () => withSidebar((c) => { renderApplicationsList(c, router); }))
  .on('/applications/:id', (p) => withSidebar((c) => { renderApplicationDetail(c, router, p); }))
  .on('/quizzes', () => withSidebar((c) => { renderQuizzesList(c, router); }))
  .on('/quizzes/new', () => withSidebar((c) => { renderQuizEditor(c, router); }))
  .on('/quizzes/:id/edit', (p) => withSidebar((c) => { renderQuizEditor(c, router, p); }))
  .on('/settings', () => withSidebar(renderSettings))
  .onFallback(() => {
    router.navigate(isAuthenticated() ? '/dashboard' : '/login');
  });

// ── Avvia (aspetta che l'auth sia pronta) ──

async function start() {
  await initAuth();
  router.start();
}

start();