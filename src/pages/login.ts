/**
 * Login page — sync mount.
 */

import type { PageFactory } from '../lib/page';
import { login, isAuthenticated } from '../lib/auth';
import { showToast } from '../lib/toast';

export const createLoginPage: PageFactory = (ctx) => {
  // If already logged in, bounce immediately
  if (isAuthenticated()) {
    ctx.router.navigate('/dashboard');
    return;
  }

  ctx.container.innerHTML = `
    <div class="min-h-screen flex items-center justify-center bg-amia-50 px-4">
      <div class="w-full max-w-sm bg-white rounded-2xl shadow-card p-8">
        <div class="flex items-center gap-3 mb-8">
          <div class="w-10 h-10 bg-amia-950 rounded-xl flex items-center justify-center">
            <span class="text-white font-bold text-base leading-none">A</span>
          </div>
          <div>
            <p class="font-semibold text-amia-950 text-base tracking-tight">Amia</p>
            <p class="text-amia-400 text-xs">ATS</p>
          </div>
        </div>

        <form id="login-form" class="space-y-4">
          <div>
            <label class="block text-xs font-medium text-amia-600 mb-1.5">Email</label>
            <input type="email" name="email" required autocomplete="email"
              class="w-full px-4 py-3 rounded-xl border border-amia-200 text-sm
                     text-amia-900 placeholder:text-amia-300"
              placeholder="admin@amia.technology" />
          </div>
          <div>
            <label class="block text-xs font-medium text-amia-600 mb-1.5">Password</label>
            <input type="password" name="password" required autocomplete="current-password"
              class="w-full px-4 py-3 rounded-xl border border-amia-200 text-sm
                     text-amia-900 placeholder:text-amia-300"
              placeholder="••••••••" />
          </div>
          <button type="submit" id="submit-btn"
            class="w-full bg-amia-950 text-white px-4 py-3 rounded-xl text-sm font-medium
                   hover:bg-amia-900 active:scale-[0.98] transition-all
                   flex items-center justify-center gap-2">
            <span id="submit-text">Accedi</span>
            <div id="submit-spinner" class="spinner hidden"></div>
          </button>
        </form>
      </div>
    </div>
  `;

  const form = ctx.$<HTMLFormElement>('#login-form');
  const btn = ctx.$<HTMLButtonElement>('#submit-btn');
  const btnText = ctx.$('#submit-text');
  const spinner = ctx.$('#submit-spinner');
  let submitting = false;

  ctx.on(form, 'submit', (e) => {
    e.preventDefault();
    if (submitting || !form) return;

    submitting = true;
    if (btn) btn.disabled = true;
    if (btnText) btnText.textContent = 'Accesso in corso...';
    spinner?.classList.remove('hidden');

    const data = new FormData(form);
    const email = (data.get('email') as string).trim();
    const password = data.get('password') as string;

    login(email, password)
      .then(() => {
        if (ctx.signal.aborted) return;
        ctx.router.navigate('/dashboard');
      })
      .catch((err: Error) => {
        if (ctx.signal.aborted) return;
        showToast(err.message || 'Credenziali non valide', 'error');
        submitting = false;
        if (btn) btn.disabled = false;
        if (btnText) btnText.textContent = 'Accedi';
        spinner?.classList.add('hidden');
      });
  });
};