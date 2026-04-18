/**
 * Amia ATS — Entry point.
 *
 * Wires the router to page factories. Each page factory imports its own
 * dependencies; this file stays thin.
 *
 * Auth flow:
 *   - initAuth() loads the session before routing starts
 *   - /login uses `null` as wrapper (no sidebar)
 *   - All other routes use createSidebarWrapper (set as default wrapper),
 *     which redirects to /login if unauthenticated and shows "access denied"
 *     if the user isn't an admin
 */

import { Router } from './router';
import { initAuth, isAuthenticated } from './lib/auth';
import { createSidebarWrapper } from './layouts/sidebar-layout';

// Page factories
import { createLoginPage } from './pages/login';
import { createPositionsListPage } from './pages/positions-list';
import { createPositionFormPage } from './pages/position-form';
import { createQuizzesListPage } from './pages/quizzes-list';
// As more pages are rewritten, import them here:
// import { createDashboardPage } from './pages/dashboard-overview';
// ...

const root = document.getElementById('app');
if (!root) throw new Error('#app element not found');

const router = new Router(root);

// Default wrapper for all authed admin pages
router.setDefaultWrapper(createSidebarWrapper());

// ── Routes ──

// Login has no wrapper (pass `null` to skip the default sidebar)
router.on('/login', createLoginPage, null);

// Admin pages use the default sidebar wrapper automatically.
router.on('/positions', createPositionsListPage);
router.on('/positions/new', createPositionFormPage);
router.on('/positions/:id/edit', createPositionFormPage);
router.on('/quizzes', createQuizzesListPage);

// Add as they get rewritten:
// router.on('/dashboard', createDashboardPage);
// router.on('/applications', createApplicationsListPage);
// router.on('/applications/:id', createApplicationDetailPage);
// router.on('/quizzes/new', createQuizEditorPage);
// router.on('/quizzes/:id/edit', createQuizEditorPage);
// router.on('/settings', createSettingsPage);

router.onFallback(() => {
  // Avoid navigate-loop: only navigate if we're not already on the target
  const target = isAuthenticated() ? '/dashboard' : '/login';
  if (router.currentPath !== target) {
    router.navigate(target);
  } else {
    // We're on the target but no route matched — means the page isn't
    // registered yet (still being rewritten). Show a placeholder.
    root.innerHTML = `
      <div class="min-h-screen flex items-center justify-center bg-amia-50">
        <div class="text-center max-w-sm px-6">
          <p class="text-amia-950 text-lg font-semibold mb-2">Pagina in rewrite</p>
          <p class="text-amia-400 text-sm">
            La route <code class="bg-amia-100 px-1.5 py-0.5 rounded text-xs">${router.currentPath}</code>
            non è ancora stata migrata al nuovo router.
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