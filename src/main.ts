/**
 * Amia ATS — Entry point.
 *
 * Auth flow:
 *   - initAuth() loads the session before routing starts
 *   - /login uses `null` as wrapper (no sidebar)
 *   - All other routes use createSidebarWrapper as default wrapper,
 *     which redirects to /login if unauthenticated and shows "access denied"
 *     if the user isn't an admin
 */

import { Router } from './router';
import { initAuth, isAuthenticated } from './lib/auth';
import { createSidebarWrapper } from './layouts/sidebar-layout';

// Page factories
import { createLoginPage } from './pages/login';
import { createDashboardPage } from './pages/dashboard-overview';
import { createPositionsListPage } from './pages/positions-list';
import { createPositionFormPage } from './pages/position-form';
import { createQuizzesListPage } from './pages/quizzes-list';
import { createQuizEditorPage } from './pages/quiz-editor';
import { createApplicationsListPage } from './pages/applications-list';
import { createApplicationDetailPage } from './pages/application-detail';
import { createSettingsPage } from './pages/settings';

const root = document.getElementById('app');
if (!root) throw new Error('#app element not found');

const router = new Router(root);

// Default wrapper for all authed admin pages
router.setDefaultWrapper(createSidebarWrapper());

// ── Routes ──

// Login has no wrapper (pass `null` to skip the default sidebar)
router.on('/login', createLoginPage, null);

// Admin pages (use default sidebar wrapper)
router.on('/dashboard', createDashboardPage);

router.on('/positions', createPositionsListPage);
router.on('/positions/new', createPositionFormPage);
router.on('/positions/:id/edit', createPositionFormPage);

router.on('/quizzes', createQuizzesListPage);
router.on('/quizzes/new', createQuizEditorPage);
router.on('/quizzes/:id/edit', createQuizEditorPage);

router.on('/applications', createApplicationsListPage);
router.on('/applications/:id', createApplicationDetailPage);

router.on('/settings', createSettingsPage);

// ── Fallback ──

router.onFallback(() => {
  const target = isAuthenticated() ? '/dashboard' : '/login';
  if (router.currentPath !== target) {
    router.navigate(target);
  } else {
    root.innerHTML = `
      <div class="min-h-screen flex items-center justify-center bg-amia-50">
        <div class="text-center max-w-sm px-6">
          <p class="text-amia-950 text-lg font-semibold mb-2">Pagina non trovata</p>
          <p class="text-amia-400 text-sm">
            La route <code class="bg-amia-100 px-1.5 py-0.5 rounded text-xs">${router.currentPath}</code> non esiste.
          </p>
        </div>
      </div>
    `;
  }
});

// ── Startup ──

async function start() {
  await initAuth();
  router.start();
}

start();