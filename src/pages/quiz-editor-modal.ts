/**
 * Question modal — shared UI for create/edit of a quiz_questions row.
 *
 * Takes an AbortSignal from the caller. When the signal aborts (page unmount),
 * the modal closes itself and resolves with null. This prevents stuck modals
 * after navigation.
 *
 * Supports multiple_choice, ranking, open_text, file_upload.
 * Axis picker appears only for attitudinal quizzes.
 */

import { supabase } from '../lib/supabase-client';
import { showToast } from '../lib/toast';
import { questionImages } from '../lib/question-images';
import {
  AXES,
  AXIS_LABELS,
  type AxisType,
  type QuizQuestion,
  type QuestionType,
  type QuestionConfig,
  type AnswerKey,
  type RankingItem,
} from '../lib/database-types';

interface OpenModalArgs {
  quizId: string;
  showAxisPicker: boolean;
  existing: QuizQuestion | null;
  defaultSortOrder: number;
  /** Cancels the modal when the parent page unmounts. */
  signal: AbortSignal;
}

const TYPE_LABELS: Record<QuestionType, string> = {
  multiple_choice: 'Scelta multipla',
  ranking:         'Ranking (1→4)',
  open_text:       'Risposta aperta',
  file_upload:     'Upload file',
};

export function openQuestionModal(args: OpenModalArgs): Promise<QuizQuestion | null> {
  return new Promise((resolve) => {
    const { quizId, showAxisPicker, existing, defaultSortOrder, signal } = args;

    // If the parent is already aborted, don't even open
    if (signal.aborted) { resolve(null); return; }

    const isNew = !existing;

    let qType: QuestionType = existing?.question_type ?? 'multiple_choice';
    let points: number = existing?.points ?? 10;
    let axis: AxisType | null = existing?.axis ?? null;
    let questionText = existing?.question_text ?? '';
    let idealAnswer = existing?.answer_key?.ideal_answer ?? '';
    let imageUrl: string | null = existing?.config?.image_url ?? null;
    let imageUploading = false;

    let mcOptions: string[] = (existing?.config?.options as string[]) ?? ['', '', '', ''];
    let mcCorrect: number[] = (existing?.answer_key?.correct as number[]) ?? [0];

    let rankingItems: RankingItem[] = (existing?.config?.options as RankingItem[]) ?? [
      { id: 'a', label: '', axis_value: 4 },
      { id: 'b', label: '', axis_value: 3 },
      { id: 'c', label: '', axis_value: 2 },
      { id: 'd', label: '', axis_value: 1 },
    ];
    let rankingCorrect: string[] = (existing?.answer_key?.correct as string[])
      ?? rankingItems.map((i) => i.id);

    // ── Build modal DOM ──

    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4';
    modal.innerHTML = renderModal();
    document.body.appendChild(modal);

    // Local listener tracking
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
    function close(result: QuizQuestion | null) {
      if (closed) return;
      closed = true;
      disposers.forEach((d) => { try { d(); } catch {} });
      modal.remove();
      resolve(result);
    }

    // AUTO-CLOSE ON NAVIGATION: if the parent page aborts, close us
    const onAbort = () => close(null);
    signal.addEventListener('abort', onAbort);
    disposers.push(() => signal.removeEventListener('abort', onAbort));

    // ── HTML template ──

    function renderModal(): string {
      return `
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
          <div class="p-6">
            <h3 class="text-lg font-semibold text-amia-950 mb-6">${isNew ? 'Nuova domanda' : 'Modifica domanda'}</h3>

            <div class="space-y-4">

              <!-- Type + points + axis -->
              <div class="grid grid-cols-${showAxisPicker ? 3 : 2} gap-4">
                <div>
                  <label class="block text-xs font-medium text-amia-600 mb-1.5">Tipo domanda</label>
                  <select id="q-type" class="w-full px-4 py-3 rounded-xl border border-amia-200 text-sm text-amia-900 bg-white">
                    ${(Object.keys(TYPE_LABELS) as QuestionType[]).map((t) => `
                      <option value="${t}" ${qType === t ? 'selected' : ''}>${TYPE_LABELS[t]}</option>
                    `).join('')}
                  </select>
                </div>

                <div>
                  <label class="block text-xs font-medium text-amia-600 mb-1.5">Punti</label>
                  <input type="number" id="q-points" value="${points}" min="0"
                    class="w-full px-4 py-3 rounded-xl border border-amia-200 text-sm text-amia-900" />
                </div>

                ${showAxisPicker ? `
                  <div>
                    <label class="block text-xs font-medium text-amia-600 mb-1.5">Asse</label>
                    <select id="q-axis"
                      class="w-full px-4 py-3 rounded-xl border border-amia-200 text-sm text-amia-900 bg-white">
                      <option value="">—</option>
                      ${AXES.map((a) => `
                        <option value="${a}" ${axis === a ? 'selected' : ''}>${AXIS_LABELS[a]}</option>
                      `).join('')}
                    </select>
                  </div>
                ` : ''}
              </div>

              <!-- Question text -->
              <div>
                <label class="block text-xs font-medium text-amia-600 mb-1.5">Domanda *</label>
                <textarea id="q-text" rows="3" required
                  class="w-full px-4 py-3 rounded-xl border border-amia-200 text-sm text-amia-900 resize-none"
                >${escapeText(questionText)}</textarea>
              </div>

              <!-- Image (optional) -->
              <div>
                <label class="block text-xs font-medium text-amia-600 mb-1.5">
                  Immagine (opzionale)
                  <span class="text-amia-400 font-normal">— mostrata sopra la domanda</span>
                </label>
                <div id="q-image-slot"></div>
              </div>

              <!-- Type-specific body -->
              <div id="q-body"></div>

              <!-- Ideal answer -->
              <div>
                <label class="block text-xs font-medium text-amia-600 mb-1.5">
                  Risposta ideale
                  <span class="text-amia-400 font-normal">(visibile solo all'admin)</span>
                </label>
                <textarea id="q-ideal" rows="2"
                  placeholder="Una buona risposta dovrebbe menzionare..."
                  class="w-full px-4 py-3 rounded-xl border border-amia-200 text-sm text-amia-900 resize-none"
                >${escapeText(idealAnswer)}</textarea>
              </div>
            </div>

            <!-- Actions -->
            <div class="flex items-center gap-3 mt-6 pt-4 border-t border-amia-100">
              <button id="save-btn"
                class="bg-amia-950 text-white px-5 py-2.5 rounded-xl text-sm font-medium
                       hover:bg-amia-900 active:scale-[0.98] transition-all">
                ${isNew ? 'Aggiungi' : 'Salva'}
              </button>
              <button id="cancel-btn"
                class="px-5 py-2.5 rounded-xl text-sm font-medium text-amia-600 hover:bg-amia-50 transition-colors">
                Annulla
              </button>
            </div>
          </div>
        </div>
      `;
    }

    // ── Body rendering ──

    function renderBody() {
      const body = modal.querySelector<HTMLElement>('#q-body');
      if (!body) return;

      if (qType === 'multiple_choice') {
        body.innerHTML = renderMcBody();
        bindMcEvents();
      } else if (qType === 'ranking') {
        body.innerHTML = renderRankingBody();
        bindRankingEvents();
      } else if (qType === 'file_upload') {
        body.innerHTML = `
          <div class="p-4 rounded-xl bg-amber-50 border border-amber-100">
            <p class="text-xs text-amber-800">Upload file: configurazione avanzata in arrivo.</p>
          </div>
        `;
      } else {
        body.innerHTML = '';
      }
    }

    // ── Image slot ──

    function renderImageSlot() {
      const slot = modal.querySelector<HTMLElement>('#q-image-slot');
      if (!slot) return;

      if (imageUploading) {
        slot.innerHTML = `
          <div class="px-4 py-6 rounded-xl border-2 border-dashed border-amia-200 bg-amia-50/50 text-center">
            <div class="inline-flex items-center gap-2 text-xs text-amia-500">
              <div class="spinner"></div> Caricamento...
            </div>
          </div>
        `;
        return;
      }

      if (imageUrl) {
        slot.innerHTML = `
          <div class="rounded-xl border border-amia-100 overflow-hidden bg-amia-50">
            <img src="${escapeAttr(imageUrl)}" alt="Immagine domanda"
                 class="w-full max-h-64 object-contain bg-white" />
            <div class="flex items-center justify-between px-3 py-2 bg-white border-t border-amia-100">
              <span class="text-[11px] text-amia-400 truncate">Immagine caricata</span>
              <button type="button" id="q-image-remove"
                class="text-xs text-red-600 hover:underline">Rimuovi</button>
            </div>
          </div>
        `;
        const removeBtn = slot.querySelector<HTMLButtonElement>('#q-image-remove');
        on(removeBtn, 'click', () => {
          if (!imageUrl) return;
          const urlToDelete = imageUrl;
          imageUrl = null;
          renderImageSlot();
          questionImages.delete(urlToDelete).catch(() => {});
        });
        return;
      }

      slot.innerHTML = `
        <label for="q-image-input"
          class="block px-4 py-6 rounded-xl border-2 border-dashed border-amia-200 bg-white hover:bg-amia-50/40
                 transition-colors cursor-pointer text-center">
          <p class="text-xs font-medium text-amia-600">+ Carica immagine</p>
          <p class="text-[11px] text-amia-400 mt-1">JPG, PNG, WebP &middot; max 1600px, compressa automaticamente</p>
          <input type="file" id="q-image-input" accept="image/*" class="hidden" />
        </label>
      `;
      const input = slot.querySelector<HTMLInputElement>('#q-image-input');
      on(input, 'change', () => {
        const file = input?.files?.[0];
        if (!file) return;
        imageUploading = true;
        renderImageSlot();
        questionImages.upload(file)
          .then(({ url }) => {
            if (closed) return;
            imageUrl = url;
          })
          .catch((e: any) => {
            if (closed) return;
            showToast(e?.message ?? 'Errore nel caricamento', 'error');
          })
          .finally(() => {
            if (closed) return;
            imageUploading = false;
            renderImageSlot();
          });
      });
    }

    function renderMcBody(): string {
      return `
        <label class="block text-xs font-medium text-amia-600 mb-1.5">
          Opzioni di risposta
          <span class="text-amia-400 font-normal">(spunta le risposte corrette)</span>
        </label>
        <div id="mc-options" class="space-y-2">
          ${mcOptions.map((opt, i) => mcOptionRow(opt, i, mcCorrect.includes(i))).join('')}
        </div>
        <button type="button" id="mc-add"
          class="mt-2 text-xs text-accent hover:underline">+ Aggiungi opzione</button>
      `;
    }

    function mcOptionRow(value: string, index: number, checked: boolean): string {
      return `
        <div class="flex items-center gap-2" data-mc-row="${index}">
          <input type="checkbox" class="mc-correct w-4 h-4 rounded accent-emerald-600"
            data-index="${index}" ${checked ? 'checked' : ''} />
          <input type="text" class="mc-input flex-1 px-3 py-2 rounded-lg border border-amia-200 text-sm"
            data-index="${index}" value="${escapeAttr(value)}" placeholder="Opzione ${index + 1}" />
          <button type="button" class="mc-remove p-1 text-amia-300 hover:text-red-500 transition-colors"
            data-index="${index}" title="Rimuovi">✕</button>
        </div>
      `;
    }

    function renderRankingBody(): string {
      const itemsInOrder = rankingCorrect
        .map((id) => rankingItems.find((i) => i.id === id))
        .filter(Boolean) as RankingItem[];

      return `
        <label class="block text-xs font-medium text-amia-600 mb-1.5">
          Elementi da ordinare
          <span class="text-amia-400 font-normal">(trascina per definire l'ordine corretto dall'alto verso il basso)</span>
        </label>
        <div id="ranking-items" class="space-y-2">
          ${itemsInOrder.map((item, i) => rankingItemRow(item, i)).join('')}
        </div>
        <button type="button" id="ranking-add"
          class="mt-2 text-xs text-accent hover:underline">+ Aggiungi elemento</button>

        ${showAxisPicker ? `
          <p class="text-[11px] text-amia-400 mt-3 italic">
            Il "valore asse" (1-5) è il punteggio di questa opzione se viene scelta come #1 dal candidato.
          </p>
        ` : ''}
      `;
    }

    function rankingItemRow(item: RankingItem, position: number): string {
      return `
        <div class="ranking-row flex items-center gap-2 p-2 rounded-lg border border-amia-100 bg-white"
             draggable="true" data-id="${item.id}">
          <span class="cursor-move text-amia-300 select-none px-1">⋮⋮</span>
          <span class="text-xs font-mono text-amia-400 bg-amia-50 rounded px-2 py-1 w-7 text-center shrink-0">${position + 1}</span>
          <input type="text" class="ranking-label flex-1 px-3 py-1.5 rounded-lg border border-amia-100 text-sm"
            data-id="${item.id}" value="${escapeAttr(item.label)}" placeholder="Testo opzione" />
          ${showAxisPicker ? `
            <input type="number" class="ranking-axis-value w-16 px-2 py-1.5 rounded-lg border border-amia-100 text-sm text-center"
              data-id="${item.id}" value="${item.axis_value ?? 3}" min="1" max="5"
              title="Valore asse (1-5)" />
          ` : ''}
          <button type="button" class="ranking-remove p-1 text-amia-300 hover:text-red-500 transition-colors"
            data-id="${item.id}" title="Rimuovi">✕</button>
        </div>
      `;
    }

    // Type toggle
    const typeSelect = modal.querySelector<HTMLSelectElement>('#q-type')!;
    on(typeSelect, 'change', () => {
      qType = typeSelect.value as QuestionType;
      renderBody();
    });

    const axisSelect = modal.querySelector<HTMLSelectElement>('#q-axis');
    on(axisSelect, 'change', () => {
      axis = (axisSelect?.value || null) as AxisType | null;
    });

    renderBody();
    renderImageSlot();

    // ── MC events ──

    function bindMcEvents() {
      const container = modal.querySelector<HTMLElement>('#mc-options');
      if (!container) return;

      on(modal.querySelector<HTMLButtonElement>('#mc-add'), 'click', () => {
        mcOptions.push('');
        rerenderMc();
      });

      const delegated = (ev: Event) => {
        const t = ev.target as HTMLElement;
        if (t.classList.contains('mc-input')) {
          const i = Number((t as HTMLInputElement).dataset.index);
          mcOptions[i] = (t as HTMLInputElement).value;
        } else if (t.classList.contains('mc-correct')) {
          const i = Number((t as HTMLInputElement).dataset.index);
          const checked = (t as HTMLInputElement).checked;
          if (checked && !mcCorrect.includes(i)) mcCorrect.push(i);
          if (!checked) mcCorrect = mcCorrect.filter((x) => x !== i);
        } else if (t.classList.contains('mc-remove') || t.closest('.mc-remove')) {
          const btn = (t.classList.contains('mc-remove') ? t : t.closest('.mc-remove')) as HTMLElement;
          const i = Number(btn.dataset.index);
          mcOptions.splice(i, 1);
          mcCorrect = mcCorrect.filter((x) => x !== i).map((x) => x > i ? x - 1 : x);
          rerenderMc();
        }
      };
      on(container, 'input', delegated);
      on(container, 'change', delegated);
      on(container, 'click', delegated);
    }

    function rerenderMc() {
      const body = modal.querySelector<HTMLElement>('#q-body');
      if (body) body.innerHTML = renderMcBody();
      bindMcEvents();
    }

    // ── Ranking events ──

    let draggedId: string | null = null;

    function bindRankingEvents() {
      const container = modal.querySelector<HTMLElement>('#ranking-items');
      if (!container) return;

      on(modal.querySelector<HTMLButtonElement>('#ranking-add'), 'click', () => {
        const newId = `item_${Date.now().toString(36)}`;
        rankingItems.push({ id: newId, label: '', axis_value: 3 });
        rankingCorrect.push(newId);
        rerenderRanking();
      });

      const delegated = (ev: Event) => {
        const t = ev.target as HTMLElement;
        if (t.classList.contains('ranking-label')) {
          const id = (t as HTMLInputElement).dataset.id!;
          const item = rankingItems.find((i) => i.id === id);
          if (item) item.label = (t as HTMLInputElement).value;
        } else if (t.classList.contains('ranking-axis-value')) {
          const id = (t as HTMLInputElement).dataset.id!;
          const item = rankingItems.find((i) => i.id === id);
          if (item) item.axis_value = Number((t as HTMLInputElement).value);
        } else if (t.classList.contains('ranking-remove') || t.closest('.ranking-remove')) {
          const btn = (t.classList.contains('ranking-remove') ? t : t.closest('.ranking-remove')) as HTMLElement;
          const id = btn.dataset.id!;
          rankingItems = rankingItems.filter((i) => i.id !== id);
          rankingCorrect = rankingCorrect.filter((x) => x !== id);
          rerenderRanking();
        }
      };
      on(container, 'input', delegated);
      on(container, 'click', delegated);

      container.querySelectorAll<HTMLElement>('.ranking-row').forEach((row) => {
        on(row, 'dragstart', (e) => {
          draggedId = row.dataset.id ?? null;
          row.classList.add('opacity-50');
          (e as DragEvent).dataTransfer?.setData('text/plain', row.dataset.id ?? '');
        });
        on(row, 'dragend', () => {
          row.classList.remove('opacity-50');
          draggedId = null;
        });
        on(row, 'dragover', (e) => {
          e.preventDefault();
          row.classList.add('ring-2', 'ring-accent', 'ring-offset-1');
        });
        on(row, 'dragleave', () => {
          row.classList.remove('ring-2', 'ring-accent', 'ring-offset-1');
        });
        on(row, 'drop', (e) => {
          e.preventDefault();
          row.classList.remove('ring-2', 'ring-accent', 'ring-offset-1');
          if (!draggedId || draggedId === row.dataset.id) return;
          const fromIdx = rankingCorrect.indexOf(draggedId);
          const toIdx = rankingCorrect.indexOf(row.dataset.id!);
          if (fromIdx < 0 || toIdx < 0) return;
          rankingCorrect.splice(fromIdx, 1);
          rankingCorrect.splice(toIdx, 0, draggedId);
          rerenderRanking();
        });
      });
    }

    function rerenderRanking() {
      const body = modal.querySelector<HTMLElement>('#q-body');
      if (body) body.innerHTML = renderRankingBody();
      bindRankingEvents();
    }

    // ── Cancel ──

    const originalImageUrl = existing?.config?.image_url ?? null;
    const cancelWithOrphanCleanup = () => {
      if (imageUrl && imageUrl !== originalImageUrl) {
        questionImages.delete(imageUrl).catch(() => {});
      }
      close(null);
    };

    on(modal.querySelector<HTMLButtonElement>('#cancel-btn'), 'click', cancelWithOrphanCleanup);
    on(modal, 'click', (e) => { if (e.target === modal) cancelWithOrphanCleanup(); });

    // ── Save ──

    on(modal.querySelector<HTMLButtonElement>('#save-btn'), 'click', () => {
      const text = (modal.querySelector<HTMLTextAreaElement>('#q-text')!).value.trim();
      if (!text) { showToast('Inserisci il testo della domanda', 'error'); return; }

      points = Number((modal.querySelector<HTMLInputElement>('#q-points')!).value) || 0;
      idealAnswer = (modal.querySelector<HTMLTextAreaElement>('#q-ideal')!).value.trim();

      const config: QuestionConfig = {};
      const answerKey: AnswerKey = {};
      if (idealAnswer) answerKey.ideal_answer = idealAnswer;
      if (imageUrl) config.image_url = imageUrl;

      if (qType === 'multiple_choice') {
        const cleanOptions: string[] = [];
        const cleanCorrect: number[] = [];
        mcOptions.forEach((opt, i) => {
          const val = opt.trim();
          if (val) {
            if (mcCorrect.includes(i)) cleanCorrect.push(cleanOptions.length);
            cleanOptions.push(val);
          }
        });
        if (cleanOptions.length < 2) { showToast('Servono almeno 2 opzioni', 'error'); return; }
        if (cleanCorrect.length === 0) { showToast('Segna almeno una risposta corretta', 'error'); return; }

        config.options = cleanOptions;
        config.allow_multiple = cleanCorrect.length > 1;
        answerKey.correct = cleanCorrect;
        answerKey.scoring_method = 'exact';
      }
      else if (qType === 'ranking') {
        const cleanItems = rankingItems.filter((i) => i.label.trim());
        const cleanCorrectIds = rankingCorrect.filter((id) => cleanItems.find((i) => i.id === id));
        if (cleanItems.length < 2) { showToast('Servono almeno 2 elementi', 'error'); return; }

        config.options = cleanItems;
        answerKey.correct = cleanCorrectIds;
        answerKey.scoring_method = showAxisPicker ? 'ipsative' : 'ranking_weighted';
      }
      else if (qType === 'open_text') {
        answerKey.scoring_method = 'exact';
      }

      const payload = {
        quiz_id: quizId,
        question_type: qType,
        question_text: text,
        sort_order: existing?.sort_order ?? defaultSortOrder,
        points,
        axis,
        config,
        answer_key: answerKey,
      };

      const op = existing
        ? supabase.from('quiz_questions').update(payload).eq('id', existing.id).select().single()
        : supabase.from('quiz_questions').insert(payload).select().single();

      op.then(({ data, error }) => {
        if (closed) return;
        if (error) { showToast(`Errore: ${error.message}`, 'error'); return; }

        if (originalImageUrl && originalImageUrl !== imageUrl) {
          questionImages.delete(originalImageUrl).catch(() => {});
        }

        showToast(existing ? 'Domanda aggiornata' : 'Domanda aggiunta');
        close(data);
      });
    });
  });
}

// ── Helpers ──

function escapeAttr(s: string): string {
  return s.replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function escapeText(s: string): string {
  return s.replace(/</g, '&lt;').replace(/>/g, '&gt;');
}