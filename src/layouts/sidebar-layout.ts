/**
 * Sidebar layout wrapper.
 *
 * Called by the router's defaultWrapper. Sets up the sidebar + main area,
 * returns the inner `<main>` element — which the router passes to the page
 * factory as ctx.container.
 */

import type { Router } from '../router';
import type { DisposerSet } from '../lib/dom';
import { logout, getUser } from '../lib/auth';
import {
  iconDashboard, iconPositions, iconApplications,
  iconQuiz, iconSettings, iconLogout,
} from '../lib/icons';

interface NavItem {
  path: string;
  label: string;
  icon: string;
  matchPrefixes?: string[];
}

const NAV_ITEMS: NavItem[] = [
  { path: '/dashboard',    label: 'Dashboard',   icon: iconDashboard },
  { path: '/positions',    label: 'Posizioni',   icon: iconPositions,    matchPrefixes: ['/positions'] },
  { path: '/applications', label: 'Candidature', icon: iconApplications, matchPrefixes: ['/applications'] },
  { path: '/quizzes',      label: 'Quiz',        icon: iconQuiz,      matchPrefixes: ['/quizzes'] },
  { path: '/settings',     label: 'Impostazioni', icon: iconSettings },
];

export function renderSidebarLayout(
  root: HTMLElement,
  router: Router,
  disposers: DisposerSet,
): HTMLElement {
  const user = getUser();
  const currentPath = router.currentPath;

  const isActive = (item: NavItem): boolean => {
    if (item.matchPrefixes) {
      return item.matchPrefixes.some((p) => currentPath === p || currentPath.startsWith(p + '/'));
    }
    return currentPath === item.path;
  };

  root.innerHTML = `
    <div class="min-h-screen flex bg-amia-50">
      <aside class="w-60 bg-white border-r border-amia-100 flex flex-col shrink-0">
        <div class="px-5 py-6 border-b border-amia-100">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 bg-amia-950 rounded-lg flex items-center justify-center">
              <span class="text-white font-bold text-sm leading-none">A</span>
            </div>
            <div>
              <p class="font-semibold text-amia-950 text-sm tracking-tight">Amia</p>
              <p class="text-amia-400 text-[11px]">ATS</p>
            </div>
          </div>
        </div>

        <nav class="flex-1 px-3 py-4 space-y-1">
          ${NAV_ITEMS.map((item) => `
            <a href="#${item.path}"
               class="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors ${
                 isActive(item)
                   ? 'bg-amia-950 text-white'
                   : 'text-amia-600 hover:bg-amia-50'
               }">
              ${item.icon}
              ${item.label}
            </a>
          `).join('')}
        </nav>

        <div class="px-3 py-4 border-t border-amia-100">
          ${user ? `
            <div class="px-3 py-2">
              <p class="text-xs font-medium text-amia-700 truncate">${escapeText(user.name ?? user.email ?? '')}</p>
              <p class="text-[11px] text-amia-400 truncate">${escapeText(user.email ?? '')}</p>
            </div>
          ` : ''}
          <button id="logout-btn"
            class="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium text-amia-500 hover:bg-amia-50 transition-colors">
            ${iconLogout} Esci
          </button>
        </div>
      </aside>

      <main id="page-container" class="flex-1 overflow-auto"></main>
    </div>
  `;

  const logoutBtn = root.querySelector<HTMLButtonElement>('#logout-btn');
  if (logoutBtn) {
    disposers.addListener(logoutBtn, 'click', () => {
      logout().then(() => router.navigate('/login'));
    });
  }

  return root.querySelector<HTMLElement>('#page-container')!;
}

function escapeText(s: string): string {
  return s.replace(/</g, '&lt;').replace(/>/g, '&gt;');
}