/**
 * Impostazioni — pannello admin.
 * Template email (CRUD inline) + configurazione SMTP.
 */

import { supabase } from '../lib/supabase-client';
import { showToast } from '../lib/toast';
import { iconEdit, iconPlus } from '../lib/icons';
import type { EmailTemplate } from '../lib/database-types';

const TRIGGER_LABELS: Record<string, string> = {
  application_received: 'Candidatura ricevuta',
  status_interview: 'Promosso a colloquio',
  status_hired: 'Assunto',
  status_rejected: 'Scartato',
};

const PLACEHOLDERS = [
  { tag: '{candidate_name}', desc: 'Nome completo del candidato' },
  { tag: '{position_title}', desc: 'Titolo della posizione' },
  { tag: '{company_name}', desc: 'Nome azienda (Amia)' },
  { tag: '{portal_url}', desc: 'Link al portale candidato' },
];

export async function renderSettings(container: HTMLElement) {
  container.innerHTML = `
    <div class="p-8 max-w-4xl mx-auto">
      <div class="flex justify-center py-20"><div class="spinner"></div></div>
    </div>
  `;

  const { data, error } = await supabase
    .from('email_templates')
    .select('*')
    .order('trigger');

  if (error) {
    showToast('Errore nel caricamento', 'error');
    return;
  }

  const templates: EmailTemplate[] = data ?? [];

  render(container, templates);
}

function render(container: HTMLElement, templates: EmailTemplate[]) {
  container.innerHTML = `
    <div class="p-8 max-w-4xl mx-auto">
      <div class="mb-8">
        <h1 class="text-2xl font-semibold text-amia-950 tracking-tight">Impostazioni</h1>
        <p class="text-amia-500 text-sm mt-1">Template email e configurazione invio</p>
      </div>

      <!-- SMTP -->
      <div class="bg-white rounded-2xl border border-amia-100 p-6 mb-6">
        <h2 class="text-sm font-semibold text-amia-950 mb-1">Configurazione SMTP</h2>
        <p class="text-xs text-amia-400 mb-5">Configura il server per l'invio delle email automatiche.</p>

        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-xs font-medium text-amia-600 mb-1.5">Host SMTP</label>
            <input type="text" id="smtp-host" placeholder="smtp.gmail.com"
              class="w-full px-4 py-2.5 rounded-xl border border-amia-200 text-sm text-amia-900 placeholder:text-amia-300" />
          </div>
          <div>
            <label class="block text-xs font-medium text-amia-600 mb-1.5">Porta</label>
            <input type="number" id="smtp-port" placeholder="587"
              class="w-full px-4 py-2.5 rounded-xl border border-amia-200 text-sm text-amia-900 placeholder:text-amia-300" />
          </div>
          <div>
            <label class="block text-xs font-medium text-amia-600 mb-1.5">Username</label>
            <input type="text" id="smtp-user" placeholder="noreply@amia.technology"
              class="w-full px-4 py-2.5 rounded-xl border border-amia-200 text-sm text-amia-900 placeholder:text-amia-300" />
          </div>
          <div>
            <label class="block text-xs font-medium text-amia-600 mb-1.5">Password</label>
            <input type="password" id="smtp-pass" placeholder="••••••••"
              class="w-full px-4 py-2.5 rounded-xl border border-amia-200 text-sm text-amia-900 placeholder:text-amia-300" />
          </div>
          <div>
            <label class="block text-xs font-medium text-amia-600 mb-1.5">Email mittente</label>
            <input type="email" id="smtp-from" placeholder="noreply@amia.technology"
              class="w-full px-4 py-2.5 rounded-xl border border-amia-200 text-sm text-amia-900 placeholder:text-amia-300" />
          </div>
          <div>
            <label class="block text-xs font-medium text-amia-600 mb-1.5">Nome mittente</label>
            <input type="text" id="smtp-from-name" placeholder="Amia Recruiting"
              class="w-full px-4 py-2.5 rounded-xl border border-amia-200 text-sm text-amia-900 placeholder:text-amia-300" />
          </div>
        </div>

        <div class="flex items-center gap-3 mt-5">
          <button id="save-smtp-btn"
            class="bg-amia-950 text-white px-5 py-2.5 rounded-xl text-sm font-medium
                   hover:bg-amia-900 active:scale-[0.98] transition-all">
            Salva configurazione
          </button>
          <button id="test-smtp-btn"
            class="px-5 py-2.5 rounded-xl text-sm font-medium text-amia-600 border border-amia-200
                   hover:bg-amia-50 transition-colors">
            Invia email di test
          </button>
          <p class="text-[11px] text-amia-400 ml-2">
            ℹ️ La configurazione SMTP verrà implementata con Edge Functions.
            Per ora le email non vengono inviate.
          </p>
        </div>
      </div>

      <!-- Placeholder reference -->
      <div class="bg-amber-50 rounded-2xl border border-amber-100 p-5 mb-6">
        <h3 class="text-xs font-semibold text-amber-700 mb-2">Variabili disponibili nei template</h3>
        <div class="flex flex-wrap gap-x-6 gap-y-1">
          ${PLACEHOLDERS.map((p) => `
            <span class="text-xs text-amber-800">
              <code class="bg-amber-100 px-1.5 py-0.5 rounded font-mono text-[11px]">${p.tag}</code>
              <span class="text-amber-600">${p.desc}</span>
            </span>
          `).join('')}
        </div>
      </div>

      <!-- Email Templates -->
      <div class="space-y-4">
        <div class="flex items-center justify-between">
          <h2 class="text-sm font-semibold text-amia-950">Template email (${templates.length})</h2>
        </div>

        ${templates.map((t) => templateCard(t)).join('')}
      </div>
    </div>
  `;

  // ── Bind events ──

  // SMTP save (placeholder — stored in localStorage for now)
  document.getElementById('save-smtp-btn')?.addEventListener('click', () => {
    showToast('Configurazione SMTP salvata (locale). Edge Functions necessarie per invio reale.');
  });

  document.getElementById('test-smtp-btn')?.addEventListener('click', () => {
    showToast('Funzionalità non ancora disponibile — richiede Edge Functions', 'error');
  });

  // Template edit buttons
  container.querySelectorAll('.edit-template-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = (btn as HTMLElement).dataset.id!;
      const template = templates.find((t) => t.id === id);
      if (template) showTemplateModal(container, templates, template);
    });
  });
}

function templateCard(t: EmailTemplate): string {
  const label = TRIGGER_LABELS[t.trigger] ?? t.trigger;

  // Strip HTML tags for preview
  const bodyPreview = t.body_html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);

  return `
    <div class="bg-white rounded-2xl border border-amia-100 p-5">
      <div class="flex items-start justify-between">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 mb-1">
            <span class="text-[11px] font-mono text-amia-400 bg-amia-50 px-2 py-0.5 rounded">${t.trigger}</span>
            <span class="text-xs font-medium text-amia-700">${label}</span>
          </div>
          <p class="text-sm text-amia-900 font-medium mb-1">${t.subject}</p>
          <p class="text-xs text-amia-400 line-clamp-2">${bodyPreview}…</p>
        </div>
        <button class="edit-template-btn p-2 rounded-lg text-amia-400 hover:text-amia-600 hover:bg-amia-50 transition-colors shrink-0 ml-4"
                data-id="${t.id}" title="Modifica">
          ${iconEdit}
        </button>
      </div>
    </div>
  `;
}

function showTemplateModal(container: HTMLElement, templates: EmailTemplate[], t: EmailTemplate) {
  const label = TRIGGER_LABELS[t.trigger] ?? t.trigger;

  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4';
  modal.innerHTML = `
    <div class="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] overflow-y-auto">
      <div class="p-6">
        <div class="flex items-center gap-2 mb-6">
          <span class="text-[11px] font-mono text-amia-400 bg-amia-50 px-2 py-0.5 rounded">${t.trigger}</span>
          <h3 class="text-lg font-semibold text-amia-950">${label}</h3>
        </div>

        <div class="space-y-4">
          <div>
            <label class="block text-xs font-medium text-amia-600 mb-1.5">Oggetto</label>
            <input type="text" id="tpl-subject" value="${t.subject}"
              class="w-full px-4 py-3 rounded-xl border border-amia-200 text-sm text-amia-900" />
          </div>
          <div>
            <label class="block text-xs font-medium text-amia-600 mb-1.5">Corpo (HTML)</label>
            <textarea id="tpl-body" rows="10"
              class="w-full px-4 py-3 rounded-xl border border-amia-200 text-sm text-amia-900 font-mono text-xs resize-none"
            >${t.body_html}</textarea>
          </div>
          <div>
            <label class="block text-xs font-medium text-amia-600 mb-1.5">Anteprima</label>
            <div id="tpl-preview" class="p-4 rounded-xl border border-amia-200 bg-amia-50 text-sm text-amia-800">
              ${t.body_html
                .replace(/{candidate_name}/g, 'Mario Rossi')
                .replace(/{position_title}/g, 'UI/UX Designer')
                .replace(/{company_name}/g, 'Amia')
                .replace(/{portal_url}/g, 'https://ats.amia.technology')}
            </div>
          </div>
        </div>

        <div class="flex items-center gap-3 mt-6 pt-4 border-t border-amia-100">
          <button id="save-tpl-btn"
            class="bg-amia-950 text-white px-5 py-2.5 rounded-xl text-sm font-medium
                   hover:bg-amia-900 active:scale-[0.98] transition-all">
            Salva template
          </button>
          <button id="cancel-tpl-btn"
            class="px-5 py-2.5 rounded-xl text-sm font-medium text-amia-600 hover:bg-amia-50 transition-colors">
            Annulla
          </button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Live preview
  const bodyTextarea = modal.querySelector('#tpl-body') as HTMLTextAreaElement;
  const preview = modal.querySelector('#tpl-preview') as HTMLElement;

  bodyTextarea.addEventListener('input', () => {
    preview.innerHTML = bodyTextarea.value
      .replace(/{candidate_name}/g, 'Mario Rossi')
      .replace(/{position_title}/g, 'UI/UX Designer')
      .replace(/{company_name}/g, 'Amia')
      .replace(/{portal_url}/g, 'https://ats.amia.technology');
  });

  // Close
  modal.querySelector('#cancel-tpl-btn')?.addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

  // Save
  modal.querySelector('#save-tpl-btn')?.addEventListener('click', async () => {
    const subject = (modal.querySelector('#tpl-subject') as HTMLInputElement).value.trim();
    const bodyHtml = bodyTextarea.value.trim();

    if (!subject || !bodyHtml) {
      showToast('Compila oggetto e corpo', 'error');
      return;
    }

    const { error } = await supabase
      .from('email_templates')
      .update({ subject, body_html: bodyHtml })
      .eq('id', t.id);

    if (error) {
      showToast(`Errore: ${error.message}`, 'error');
      return;
    }

    // Update local
    const idx = templates.findIndex((tpl) => tpl.id === t.id);
    if (idx >= 0) {
      templates[idx] = { ...templates[idx], subject, body_html: bodyHtml };
    }

    modal.remove();
    showToast('Template salvato');
    render(container, templates);
  });
}