/**
 * Layout principale dell'app: sidebar di navigazione + area contenuto.
 * Usato da tutte le pagine che richiedono autenticazione.
 */

import { Router } from '../router';
import { getUser, logout } from '../lib/auth';
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
  { path: '/dashboard', label: 'Dashboard', icon: iconDashboard },
  { path: '/positions', label: 'Posizioni', icon: iconPositions },
  { path: '/applications', label: 'Candidature', icon: iconApplications },
  { path: '/quizzes', label: 'Quiz', icon: iconQuiz },
  { path: '/settings', label: 'Impostazioni', icon: iconSettings },
];

/**
 * Renderizza sidebar + area contenuto, poi chiama `renderPage`
 * passandogli il container dove montare il contenuto della pagina.
 */
export function renderSidebarLayout(
  root: HTMLElement,
  router: Router,
  renderPage: (container: HTMLElement) => void
) {
  const user = getUser();
  const currentPath = router.currentPath;
  const initial = (user?.name ?? 'U').charAt(0).toUpperCase();

  root.innerHTML = `
    <div class="flex h-screen overflow-hidden">

      <!-- Sidebar -->
      <aside class="w-64 h-screen flex flex-col border-r border-amia-100 bg-white shrink-0">

        <!-- Logo -->
        <div class="px-6 pt-7 pb-6 flex items-center gap-3">
          <div class="w-8 h-8 bg-amia-950 rounded-lg flex items-center justify-center">
            <span class="text-white font-bold text-sm leading-none">A</span>
          </div>
          <span class="font-semibold text-amia-950 text-[15px] tracking-tight">
            Amia
            <span class="text-amia-400 font-normal text-xs ml-1">ATS</span>
          </span>
        </div>

        <!-- Navigazione -->
        <nav class="flex-1 px-3 space-y-0.5">
          ${NAV_ITEMS.map((item) => {
            const isActive =
              currentPath === item.path ||
              (item.path !== '/dashboard' && currentPath.startsWith(item.path));

            return `
              <a
                href="#${item.path}"
                class="nav-link flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium
                  ${isActive ? 'active' : 'text-amia-600 hover:text-amia-900'}"
              >
                <span class="${isActive ? 'text-accent' : 'text-amia-400'}">
                  ${item.icon}
                </span>
                ${item.label}
              </a>
            `;
          }).join('')}
        </nav>

        <!-- Utente -->
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

      <!-- Area contenuto -->
      <main class="flex-1 overflow-y-auto bg-amia-50/60">
        <div id="page-content" class="page-enter"></div>
      </main>
    </div>
  `;

  // Logout
  document.getElementById('logout-btn')?.addEventListener('click', () => {
    logout();
    router.navigate('/login');
  });

  // Monta il contenuto della pagina con transizione
  const content = document.getElementById('page-content')!;
  renderPage(content);

  requestAnimationFrame(() => {
    content.classList.remove('page-enter');
    content.classList.add('page-active');
  });
}