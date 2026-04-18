/**
 * Settings — sync mount.
 */

import type { PageFactory } from '../lib/page';
import { supabase } from '../lib/supabase-client';
import * as q from '../lib/queries';
import { showToast } from '../lib/toast';
import { iconEdit } from '../lib/icons';
import type { EmailTemplate } from '../lib/database-types';

const TRIGGER_LABELS: Record<string, string> = {
  application_received: 'Candidatura ricevuta',
  status_interview:     'Promosso a colloquio',
  status_hired:         'Assunto',
  status_rejected:      'Scartato',
};

const PLACEHOLDERS = [
  { tag: '{candidate_name}', desc: 'Nome completo del candidato' },
  { tag: '{position_title}', desc: 'Titolo della posizione' },
  { tag: '{company_name}',   desc: 'Nome azienda (Amia)' },
  { tag: '{portal_url}',     desc: 'Link al portale candidato' },
];

const PREVIEW_VALUES: Record<string, string> = {
  '{candidate_name}': 'Mario Rossi',
  '{position_title}': 'UI/UX Designer',
  '{company_name}':   'Amia',
  '{portal_url}':     'https://ats.amia.technology',
};

export const createSettingsPage: PageFactory = (ctx) => {
  let templates: EmailTemplate[] = [];

  ctx.container.innerHTML = loadingShell();

  q.fetchEmailTemplates({ signal: ctx.signal })
    .then((res) => {
      if (ctx.signal.aborted) return;
      if (res.error) {
        showToast('Errore nel caricamento', 'error');
        ctx.container.innerHTML = errorShell();
        return;
      }
      templates = res.data!;
      renderFull();
      bindEvents();
    })
    .catch((err) => {
      if (ctx.signal.aborted) return;
      console.error('[settings]', err);
    });

  function renderFull() {
    ctx.container.innerHTML = `
      <div class="p-8 max-w-4xl mx-auto">
        <div class="mb-8">
          <h1 class="text-2xl font-semibold text-amia-950 tracking-tight">Impostazioni</h1>
          <p class="text-amia-500 text-sm mt-1">Template email e configurazione invio</p>
        </div>

        ${smtpSection()}
        ${placeholderReference()}

        <div class="space-y-4">
          <div class="flex items-center justify-between">
            <h2 class="text-sm font-semibold text-amia-950">Template email (${templates.length})</h2>
          </div>
          ${templates.length > 0
            ? templates.map(templateCard).join('')
            : `<p class="text-xs text-amia-400 text-center py-8">Nessun template configurato</p>`
          }
        </div>
      </div>
    `;
  }

  function bindEvents() {
    ctx.on(ctx.$<HTMLButtonElement>('#save-smtp-btn'), 'click', () => {
      showToast('Configurazione SMTP salvata (locale). Edge Functions necessarie per invio reale.');
    });
    ctx.on(ctx.$<HTMLButtonElement>('#test-smtp-btn'), 'click', () => {
      showToast('Funzionalità non ancora disponibile — richiede Edge Functions', 'error');
    });

    ctx.$$<HTMLButtonElement>('.edit-template-btn').forEach((btn) => {
      ctx.on(btn, 'click', () => {
        const id = btn.dataset.id!;
        const template = templates.find((t) => t.id === id);
        if (template) openTemplateModal(template);
      });
    });
  }

  function openTemplateModal(t: EmailTemplate) {
    const label = TRIGGER_LABELS[t.trigger] ?? t.trigger;

    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4';
    modal.innerHTML = renderTemplateModal(t, label);
    document.body.appendChild(modal);

    const disposers: Array<() => void> = [];
    const on = <K extends keyof HTMLElementEventMap>(
      target: HTMLElement | null | undefined,
      event: K,
      handler: (ev: HTMLElementEventMap[K]) => void,
    ) => {
      if (!target) return;
      target.addEventListener(event, handler as EventListener);
      disposers.push(() => target.removeEventListener(event, handler as EventListener));
    };

    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      disposers.forEach((d) => { try { d(); } catch {} });
      modal.remove();
    };

    // Auto-close on navigation
    const onAbort = () => close();
    ctx.signal.addEventListener('abort', onAbort);
    disposers.push(() => ctx.signal.removeEventListener('abort', onAbort));

    const bodyTextarea = modal.querySelector<HTMLTextAreaElement>('#tpl-body');
    const preview = modal.querySelector<HTMLElement>('#tpl-preview');

    on(bodyTextarea, 'input', () => {
      if (!bodyTextarea || !preview) return;
      preview.innerHTML = renderPreview(bodyTextarea.value);
    });

    on(modal.querySelector<HTMLButtonElement>('#cancel-tpl-btn'), 'click', close);
    on(modal, 'click', (e) => { if (e.target === modal) close(); });

    on(modal.querySelector<HTMLButtonElement>('#save-tpl-btn'), 'click', () => {
      const subjectEl = modal.querySelector<HTMLInputElement>('#tpl-subject');
      const subject = subjectEl?.value.trim() ?? '';
      const bodyHtml = bodyTextarea?.value.trim() ?? '';
      if (!subject || !bodyHtml) { showToast('Compila oggetto e corpo', 'error'); return; }

      supabase.from('email_templates').update({ subject, body_html: bodyHtml }).eq('id', t.id)
        .then(({ error }) => {
          if (closed || ctx.signal.aborted) return;
          if (error) { showToast(`Errore: ${error.message}`, 'error'); return; }

          const idx = templates.findIndex((tpl) => tpl.id === t.id);
          if (idx >= 0) templates[idx] = { ...templates[idx], subject, body_html: bodyHtml };

          close();
          showToast('Template salvato');
          renderFull();
          bindEvents();
        });
    });
  }
};

// ── HTML ──

function loadingShell(): string {
  return `
    <div class="p-8 max-w-4xl mx-auto">
      <div class="mb-8">
        <h1 class="text-2xl font-semibold text-amia-950 tracking-tight">Impostazioni</h1>
        <p class="text-amia-500 text-sm mt-1">Caricamento...</p>
      </div>
      <div class="flex justify-center py-20"><div class="spinner"></div></div>
    </div>
  `;
}

function errorShell(): string {
  return `
    <div class="p-8 max-w-4xl mx-auto">
      <div class="mb-8">
        <h1 class="text-2xl font-semibold text-amia-950 tracking-tight">Impostazioni</h1>
        <p class="text-amia-500 text-sm mt-1">Errore nel caricamento</p>
      </div>
    </div>
  `;
}

function smtpSection(): string {
  return `
    <div class="bg-white rounded-2xl border border-amia-100 p-6 mb-6">
      <h2 class="text-sm font-semibold text-amia-950 mb-1">Configurazione SMTP</h2>
      <p class="text-xs text-amia-400 mb-5">Configura il server per l'invio delle email automatiche.</p>
      <div class="grid grid-cols-2 gap-4">
        ${smtpField('smtp-host',      'Host SMTP',      'smtp.gmail.com',         'text')}
        ${smtpField('smtp-port',      'Porta',          '587',                    'number')}
        ${smtpField('smtp-user',      'Username',       'noreply@amia.technology','text')}
        ${smtpField('smtp-pass',      'Password',       '••••••••',               'password')}
        ${smtpField('smtp-from',      'Email mittente', 'noreply@amia.technology','email')}
        ${smtpField('smtp-from-name', 'Nome mittente',  'Amia Recruiting',        'text')}
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
        <p class="text-[11px] text-amia-400 ml-2">ℹ️ Richiede Edge Functions.</p>
      </div>
    </div>
  `;
}

function smtpField(id: string, label: string, placeholder: string, type: string): string {
  return `
    <div>
      <label class="block text-xs font-medium text-amia-600 mb-1.5">${label}</label>
      <input type="${type}" id="${id}" placeholder="${placeholder}"
        class="w-full px-4 py-2.5 rounded-xl border border-amia-200 text-sm text-amia-900 placeholder:text-amia-300" />
    </div>
  `;
}

function placeholderReference(): string {
  return `
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
  `;
}

function templateCard(t: EmailTemplate): string {
  const label = TRIGGER_LABELS[t.trigger] ?? t.trigger;
  const bodyPreview = t.body_html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);

  return `
    <div class="bg-white rounded-2xl border border-amia-100 p-5">
      <div class="flex items-start justify-between">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 mb-1">
            <span class="text-[11px] font-mono text-amia-400 bg-amia-50 px-2 py-0.5 rounded">${t.trigger}</span>
            <span class="text-xs font-medium text-amia-700">${label}</span>
          </div>
          <p class="text-sm text-amia-900 font-medium mb-1">${escapeText(t.subject)}</p>
          <p class="text-xs text-amia-400 line-clamp-2">${escapeText(bodyPreview)}${bodyPreview.length >= 120 ? '…' : ''}</p>
        </div>
        <button class="edit-template-btn p-2 rounded-lg text-amia-400 hover:text-amia-600 hover:bg-amia-50 transition-colors shrink-0 ml-4"
                data-id="${t.id}" title="Modifica">${iconEdit}</button>
      </div>
    </div>
  `;
}

function renderTemplateModal(t: EmailTemplate, label: string): string {
  return `
    <div class="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] overflow-y-auto">
      <div class="p-6">
        <div class="flex items-center gap-2 mb-6">
          <span class="text-[11px] font-mono text-amia-400 bg-amia-50 px-2 py-0.5 rounded">${t.trigger}</span>
          <h3 class="text-lg font-semibold text-amia-950">${label}</h3>
        </div>
        <div class="space-y-4">
          <div>
            <label class="block text-xs font-medium text-amia-600 mb-1.5">Oggetto</label>
            <input type="text" id="tpl-subject" value="${escapeAttr(t.subject)}"
              class="w-full px-4 py-3 rounded-xl border border-amia-200 text-sm text-amia-900" />
          </div>
          <div>
            <label class="block text-xs font-medium text-amia-600 mb-1.5">Corpo (HTML)</label>
            <textarea id="tpl-body" rows="10"
              class="w-full px-4 py-3 rounded-xl border border-amia-200 text-sm text-amia-900 font-mono text-xs resize-none"
            >${escapeText(t.body_html)}</textarea>
          </div>
          <div>
            <label class="block text-xs font-medium text-amia-600 mb-1.5">Anteprima</label>
            <div id="tpl-preview" class="p-4 rounded-xl border border-amia-200 bg-amia-50 text-sm text-amia-800">
              ${renderPreview(t.body_html)}
            </div>
          </div>
        </div>
        <div class="flex items-center gap-3 mt-6 pt-4 border-t border-amia-100">
          <button id="save-tpl-btn" class="bg-amia-950 text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-amia-900 active:scale-[0.98] transition-all">Salva template</button>
          <button id="cancel-tpl-btn" class="px-5 py-2.5 rounded-xl text-sm font-medium text-amia-600 hover:bg-amia-50 transition-colors">Annulla</button>
        </div>
      </div>
    </div>
  `;
}

function renderPreview(bodyHtml: string): string {
  let out = bodyHtml;
  for (const [tag, value] of Object.entries(PREVIEW_VALUES)) out = out.split(tag).join(value);
  return out;
}

function escapeAttr(s: string): string { return s.replace(/"/g, '&quot;').replace(/</g, '&lt;'); }
function escapeText(s: string): string { return s.replace(/</g, '&lt;').replace(/>/g, '&gt;'); }