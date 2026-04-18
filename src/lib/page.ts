/**
 * Page lifecycle — the factory IS the mount.
 *
 * A PageFactory is called by the router at mount time. It must:
 *   1. Set container.innerHTML to a loading shell IMMEDIATELY
 *   2. Kick off async work (fetches) in the background
 *   3. Return synchronously — with an optional unmount handle
 *
 * The async work updates the DOM when it resolves, guarded by ctx.signal.aborted.
 *
 * This means:
 *   - Navigation is instant — no blocked router
 *   - Stuck fetches (tab throttling, network drops) can never stall navigation
 *   - If the user navigates away during a pending fetch, the old fetch resolves
 *     into a detached DOM or early-returns because signal.aborted is true
 *
 * Example page:
 *
 *   export const createFooPage: PageFactory = (ctx) => {
 *     ctx.container.innerHTML = loadingShell();
 *
 *     q.fetchFoo({ signal: ctx.signal })
 *       .then(res => {
 *         if (ctx.signal.aborted) return;
 *         if (res.error) { showError(); return; }
 *         renderFull(res.data);
 *         bindEvents();
 *       });
 *
 *     // Optional: return { unmount() { ... } } for explicit cleanup
 *     // Most pages don't need this — auto-cleanup handles listeners/timers.
 *   };
 */

import type { Router } from '../router';

export interface PageContext {
  container: HTMLElement;
  params: Record<string, string>;
  query: Record<string, string>;
  router: Router;
  signal: AbortSignal;

  /** Add a DOM event listener that's auto-removed on unmount. */
  on<K extends keyof HTMLElementEventMap>(
    target: HTMLElement | Document | Window | null | undefined,
    event: K,
    handler: (ev: HTMLElementEventMap[K]) => void,
    options?: AddEventListenerOptions,
  ): void;

  /** Query a single element scoped to this page's container. */
  $<T extends HTMLElement = HTMLElement>(selector: string): T | null;

  /** Query all matching elements scoped to this page's container. */
  $$<T extends HTMLElement = HTMLElement>(selector: string): T[];

  /** Register a cleanup function to run on unmount. */
  onCleanup(fn: () => void): void;
}

/**
 * Optional handle returned by a page factory. Most pages return nothing
 * (void) and rely on auto-cleanup via ctx.on / ctx.onCleanup.
 */
export interface PageHandle {
  unmount?(): void;
}

export type PageFactory = (ctx: PageContext) => PageHandle | void;