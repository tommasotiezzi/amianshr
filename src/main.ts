/**
 * App entry — wires routes and boots.
 */

import './style.css'

import { Router } from './router';
import { initAuth, isAuthenticated, isAdmin } from './lib/auth';
import { renderSidebarLayout } from './layouts/sidebar-layout';

import { createLoginPage } from './pages/login';
import { createDashboardPage } from './pages/dashboard-overview';
import { createPositionsListPage } from './pages/positions-list';
import { createPositionFormPage } from './pages/position-form';
import { createQuizzesListPage } from './pages/quizzes-list';
import { createQuizEditorPage } from './pages/quiz-editor';
import { createApplicationsListPage } from './pages/applications-list';
import { createApplicationDetailPage } from './pages/application-detail';
import { createSettingsPage } from './pages/settings';

const app = document.getElementById('app')!;
const router = new Router(app);

// Default wrapper: sidebar layout + auth gate. Returns null if user should be redirected.
router.setDefaultWrapper(({ root, router, disposers }) => {
  if (!isAuthenticated()) {
    router.navigate('/login');
    return null;
  }
  if (!isAdmin()) {
    root.innerHTML = `
      <div class="min-h-screen flex items-center justify-center bg-amia-50">
        <div class="text-center">
          <p class="text-amia-950 text-lg font-semibold mb-2">Accesso negato</p>
          <p class="text-amia-400 text-sm">Non hai i permessi per accedere a questa sezione.</p>
        </div>
      </div>
    `;
    return null;
  }
  return renderSidebarLayout(root, router, disposers);
});

// Routes
router
  .on('/login', createLoginPage, null)
  .on('/dashboard', createDashboardPage)
  .on('/positions', createPositionsListPage)
  .on('/positions/new', createPositionFormPage)
  .on('/positions/:id/edit', createPositionFormPage)
  .on('/applications', createApplicationsListPage)
  .on('/applications/:id', createApplicationDetailPage)
  .on('/quizzes', createQuizzesListPage)
  .on('/quizzes/new', createQuizEditorPage)
  .on('/quizzes/:id/edit', createQuizEditorPage)
  .on('/settings', createSettingsPage)
  .onFallback(() => {
    router.navigate(isAuthenticated() ? '/dashboard' : '/login');
  });

initAuth().then(() => router.start());