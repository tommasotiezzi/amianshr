/**
 * Page lifecycle contract.
 *
 * Every page is a factory that returns a Page object. The factory is called
 * ONCE per navigation — state lives in closures, not module-level vars.
 *
 * Usage:
 *   export const createPositionsListPage: PageFactory = (ctx) => {
 *     let currentFilter: PositionStatus | 'all' = 'all';
 *
 *     return {
 *       async mount() {
 *         const { data } = await ctx.supabase.from('positions').select('*');
 *         if (ctx.signal.aborted) return;  // stale fetch
 *         ctx.container.innerHTML = render(data, currentFilter);
 *         ctx.on(ctx.$('.filter-btn'), 'click', (e) => { ... });
 *       },
 *       // unmount is auto-generated from ctx.on() disposers; only define
 *       // it if you need to clear timers / subscriptions manually.
 *     };
 *   };
 */

import type { Router } from '../router';

export interface Page {
  mount(): void | Promise<void>;
  unmount?(): void;
}

export interface PageContext {
  /** The DOM element to render into. */
  container: HTMLElement;
  /** Route params (e.g. { id: 'abc123' }). */
  params: Record<string, string>;
  /** Query string params (e.g. { filter: 'published' }). */
  query: Record<string, string>;
  /** Router instance for navigation. */
  router: Router;
  /** AbortSignal that fires when the page is unmounted. Pass to fetch() etc. */
  signal: AbortSignal;
  /**
   * Attach an event listener that auto-cleans on unmount.
   * Returns a manual disposer if you need to remove it sooner.
   */
  on<K extends keyof HTMLElementEventMap>(
    target: HTMLElement | null | undefined,
    event: K,
    handler: (ev: HTMLElementEventMap[K]) => void,
    options?: AddEventListenerOptions,
  ): () => void;
  /** Scoped query selector — looks inside container only. */
  $<T extends HTMLElement = HTMLElement>(selector: string): T | null;
  /** Scoped query selector all — looks inside container only. */
  $$<T extends HTMLElement = HTMLElement>(selector: string): T[];
  /** Register arbitrary cleanup (timers, subscriptions, etc.) — fires on unmount. */
  onCleanup(fn: () => void): void;
}

export type PageFactory = (ctx: PageContext) => Page;