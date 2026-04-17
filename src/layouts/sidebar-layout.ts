/**
 * Sidebar layout — PageWrapper for all authed admin pages.
 *
 * Renders the sidebar ONCE per session and reuses the #page-content div across
 * navigations. Only the active nav highlight + page content change.
 *
 * Usage in main.ts:
 *   router.setDefaultWrapper(createSidebarWrapper());
 *   router.on('/login', loginPageFactory);  // login doesn't use the wrapper
 *   router.on('/positions', positionsListFactory);  // uses default wrapper
 */

import type { PageWrapper } from '../router';
import { isAuthenticated, isAdmin, getUser, logout } from '../lib/auth';
import {
  iconDashboard,
  iconPositions,
  iconApplications,
  iconQuiz,
  iconSettings,
  iconLogout,
} from '../lib/icons';

interface NavItem {
  path: string;
  label: string;
  icon: string;
}

const NAV_ITEMS: NavItem[] = [
  { path: '/dashboard',    label: 'Dashboard',    icon: iconDashboard },
  { path: '/positions',    label: 'Posizioni',    icon: iconPositions },
  { path: '/applications', label: 'Candidature',  icon: iconApplications },
  { path: '/quizzes',      label: 'Quiz',         icon: iconQuiz },
  { path: '/settings',     label: 'Impostazioni', icon: iconSettings },
];

const SHELL_ID = 'sidebar-shell';
const PAGE_CONTENT_ID = 'page-content';

export function createSidebarWrapper(): PageWrapper {
  return ({ root, router, currentPath, disposers }) => {

    // Auth check
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

    // If the shell already exists, just update the active nav state and return
    // the existing #page-content. This avoids rebuilding the whole DOM on every
    // navigation — fixes flicker, preserves scroll state above the content area.
    const existingShell = root.querySelector<HTMLElement>(`#${SHELL_ID}`);
    if (existingShell) {
      updateActiveNav(existingShell, currentPath);
      const content = existingShell.querySelector<HTMLElement>(`#${PAGE_CONTENT_ID}`);
      if (content) {
        content.innerHTML = '';
        return content;
      }
      // Fallthrough — shell exists but content missing (shouldn't happen), full rebuild
    }

    // Full build
    const user = getUser();
    const initial = (user?.name ?? 'U').charAt(0).toUpperCase();

    root.innerHTML = `
      <div id="${SHELL_ID}" class="flex h-screen overflow-hidden">

        <!-- Sidebar -->
        <aside class="w-64 h-screen flex flex-col border-r border-amia-100 bg-white shrink-0">
          <div class="px-6 pt-7 pb-6 flex items-center gap-3">
            <div class="w-8 h-8 bg-amia-950 rounded-lg flex items-center justify-center">
              <span class="text-white font-bold text-sm leading-none">A</span>
            </div>
            <span class="font-semibold text-amia-950 text-[15px] tracking-tight">
              Amia
              <span class="text-amia-400 font-normal text-xs ml-1">ATS</span>
            </span>
          </div>

          <nav class="flex-1 px-3 space-y-0.5" data-nav>
            ${NAV_ITEMS.map((item) => navLinkHtml(item, currentPath)).join('')}
          </nav>

          <div class="px-3 pb-5 mt-auto">
            <div class="flex items-center gap-3 px-3 py-3 rounded-xl border border-amia-100">
              <div class="w-8 h-8 rounded-full bg-amia-100 flex items-center justify-center shrink-0">
                <span class="text-amia-600 text-xs font-semibold leading-none">${initial}</span>
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-[13px] font-medium text-amia-900 truncate">${user?.name ?? 'Utente'}</p>
                <p class="text-[11px] text-amia-400 truncate">${user?.email ?? ''}</p>
              </div>
              <button
                id="logout-btn"
                class="text-amia-400 hover:text-red-500 transition-colors shrink-0"
                title="Esci"
              >
                ${iconLogout}
              </button>
            </div>
          </div>
        </aside>

        <!-- Content area -->
        <main class="flex-1 overflow-y-auto bg-amia-50/60">
          <div id="${PAGE_CONTENT_ID}"></div>
        </main>
      </div>
    `;

    // Bind logout once — but we're in a per-navigation wrapper invocation, and
    // the shell is only built on the FIRST call. For subsequent calls we return
    // early above. So we only reach this point on first build, meaning this
    // listener is attached to a long-lived button that persists across navigations.
    // We register it with the current page's disposers — on first page unmount
    // we'd lose it, which is wrong. So we attach directly without disposers and
    // rely on the button being recreated only when the shell is rebuilt.
    const logoutBtn = root.querySelector<HTMLButtonElement>('#logout-btn');
    if (logoutBtn) {
      // Mark as bound so we don't double-bind if somehow the shell gets reused
      if (!logoutBtn.dataset.bound) {
        logoutBtn.dataset.bound = '1';
        logoutBtn.addEventListener('click', async () => {
          await logout();
          router.navigate('/login');
        });
      }
    }

    // Optional: flag unused so TS doesn't complain if you're strict
    void disposers;

    return root.querySelector<HTMLElement>(`#${PAGE_CONTENT_ID}`);
  };
}

function navLinkHtml(item: NavItem, currentPath: string): string {
  const isActive = isItemActive(item.path, currentPath);
  return `
    <a
      href="#${item.path}"
      data-nav-path="${item.path}"
      class="nav-link flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium
        ${isActive ? 'active' : 'text-amia-600 hover:text-amia-900'}"
    >
      <span class="${isActive ? 'text-accent' : 'text-amia-400'}" data-nav-icon>
        ${item.icon}
      </span>
      ${item.label}
    </a>
  `;
}

function isItemActive(itemPath: string, currentPath: string): boolean {
  if (itemPath === currentPath) return true;
  // Dashboard only matches exact (so /dashboard-extra doesn't highlight it)
  if (itemPath === '/dashboard') return false;
  return currentPath.startsWith(itemPath);
}

function updateActiveNav(shell: HTMLElement, currentPath: string): void {
  const links = shell.querySelectorAll<HTMLAnchorElement>('[data-nav-path]');
  links.forEach((link) => {
    const path = link.dataset.navPath!;
    const active = isItemActive(path, currentPath);
    link.classList.toggle('active', active);
    link.classList.toggle('text-amia-600', !active);
    link.classList.toggle('hover:text-amia-900', !active);

    const iconSpan = link.querySelector<HTMLElement>('[data-nav-icon]');
    if (iconSpan) {
      iconSpan.classList.toggle('text-accent', active);
      iconSpan.classList.toggle('text-amia-400', !active);
    }
  });
}