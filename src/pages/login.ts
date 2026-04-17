/**
 * Login page — PageFactory.
 *
 * This page does NOT use the sidebar wrapper. In main.ts:
 *   router.on('/login', createLoginPage, () => ({ root, ... }) => ...);
 *   // or more simply, register without a wrapper — but the default wrapper
 *   // is createSidebarWrapper. To skip it, pass a no-op wrapper that just
 *   // returns the root element.
 *
 * The login page takes over the entire root container. When the user submits
 * valid credentials we navigate to /dashboard and the router swaps to the
 * sidebar-wrapped layout automatically.
 */

import type { PageFactory } from '../lib/page';
import { login, isAuthenticated } from '../lib/auth';

export const createLoginPage: PageFactory = (ctx) => {
  return {
    async mount() {
      // If already logged in, bounce to dashboard
      if (isAuthenticated()) {
        ctx.router.navigate('/dashboard');
        return;
      }

      ctx.container.innerHTML = render();

      const form = ctx.$<HTMLFormElement>('#login-form');
      const emailInput = ctx.$<HTMLInputElement>('#login-email');
      const passwordInput = ctx.$<HTMLInputElement>('#login-password');
      const btn = ctx.$<HTMLButtonElement>('#login-btn');
      const btnText = ctx.$('#login-btn-text');
      const spinner = ctx.$('#login-spinner');
      const errorBox = ctx.$('#login-error');

      ctx.on(form, 'submit', async (e) => {
        e.preventDefault();
        if (!emailInput || !passwordInput || !btn || !btnText || !spinner || !errorBox) return;

        btn.disabled = true;
        btnText.textContent = 'Accesso in corso...';
        spinner.classList.remove('hidden');
        errorBox.classList.add('hidden');

        try {
          await login(emailInput.value, passwordInput.value);
          if (ctx.signal.aborted) return;
          ctx.router.navigate('/dashboard');
        } catch {
          if (ctx.signal.aborted) return;
          errorBox.textContent = 'Credenziali non valide. Riprova.';
          errorBox.classList.remove('hidden');
          btn.disabled = false;
          btnText.textContent = 'Accedi';
          spinner.classList.add('hidden');
        }
      });
    },
  };
};

function render(): string {
  return `
    <div class="min-h-screen bg-white flex">

      <!-- Left: form -->
      <div class="flex-1 flex items-center justify-center px-6">
        <div class="w-full max-w-sm">

          <!-- Logo -->
          <div class="flex items-center gap-3 mb-14">
            <div class="w-10 h-10 bg-amia-950 rounded-xl flex items-center justify-center">
              <span class="text-white font-bold text-lg leading-none">A</span>
            </div>
            <span class="font-semibold text-amia-950 text-lg tracking-tight">
              Amia
              <span class="text-amia-400 font-normal text-sm ml-1">ATS</span>
            </span>
          </div>

          <h1 class="text-2xl font-semibold text-amia-950 tracking-tight">
            Bentornato
          </h1>
          <p class="text-amia-500 text-sm mt-2 mb-8">
            Accedi per gestire le candidature
          </p>

          <form id="login-form" class="space-y-4">
            <div>
              <label class="block text-xs font-medium text-amia-600 mb-1.5">Email</label>
              <input
                type="email"
                id="login-email"
                required
                placeholder="nome@amia.technology"
                class="w-full px-4 py-3 rounded-xl border border-amia-200 text-sm
                       text-amia-900 placeholder:text-amia-300 transition-all"
              />
            </div>

            <div>
              <label class="block text-xs font-medium text-amia-600 mb-1.5">Password</label>
              <input
                type="password"
                id="login-password"
                required
                placeholder="••••••••"
                class="w-full px-4 py-3 rounded-xl border border-amia-200 text-sm
                       text-amia-900 placeholder:text-amia-300 transition-all"
              />
            </div>

            <div
              id="login-error"
              class="hidden text-red-600 text-xs font-medium bg-red-50 px-4 py-2.5 rounded-xl"
            ></div>

            <button
              type="submit"
              id="login-btn"
              class="w-full mt-2 bg-amia-950 text-white py-3 rounded-xl text-sm font-medium
                     hover:bg-amia-900 active:scale-[0.98] transition-all
                     flex items-center justify-center gap-2"
            >
              <span id="login-btn-text">Accedi</span>
              <div id="login-spinner" class="spinner hidden"></div>
            </button>
          </form>

          <p class="text-center text-amia-300 text-xs mt-10">
            Amia ATS · Uso interno
          </p>
        </div>
      </div>

      <!-- Right: brand -->
      <div class="hidden lg:flex flex-1 items-center justify-center bg-amia-50 border-l border-amia-100">
        <div class="text-center max-w-xs">
          <div class="w-20 h-20 bg-amia-950 rounded-3xl flex items-center justify-center mx-auto mb-8">
            <span class="text-white font-bold text-3xl leading-none">A</span>
          </div>
          <p class="text-amia-950 text-xl font-semibold tracking-tight leading-relaxed">
            Innovate Today,<br />Shape Tomorrow
          </p>
          <p class="text-amia-400 text-sm mt-4 leading-relaxed">
            Gestisci il tuo processo di selezione<br />in modo semplice e organizzato
          </p>
        </div>
      </div>
    </div>
  `;
}