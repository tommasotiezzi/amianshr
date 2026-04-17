/**
 * DOM helpers used by the page context.
 *
 * These are the low-level primitives — you don't import them directly from pages.
 * Use ctx.on / ctx.$ / ctx.$$ instead (defined in router.ts when building PageContext).
 */

/** Create a scoped query selector bound to a root element. */
export function createScopedQuery(root: HTMLElement) {
  return {
    $<T extends HTMLElement = HTMLElement>(selector: string): T | null {
      return root.querySelector<T>(selector);
    },
    $$<T extends HTMLElement = HTMLElement>(selector: string): T[] {
      return Array.from(root.querySelectorAll<T>(selector));
    },
  };
}

/**
 * Disposer tracker — collects cleanup functions so they can all fire on unmount.
 *
 * Pages use this indirectly via ctx.on() and ctx.onCleanup().
 */
export class DisposerSet {
  private disposers: Array<() => void> = [];
  private disposed = false;

  add(fn: () => void): () => void {
    if (this.disposed) {
      // If already disposed, run immediately (shouldn't happen in practice, but safe)
      fn();
      return () => {};
    }
    this.disposers.push(fn);
    // Return a manual disposer that removes this one and runs it
    return () => {
      const i = this.disposers.indexOf(fn);
      if (i >= 0) {
        this.disposers.splice(i, 1);
        try { fn(); } catch (e) { console.error('Disposer error:', e); }
      }
    };
  }

  /** Attach a listener and auto-register its removal as a disposer. */
  addListener<K extends keyof HTMLElementEventMap>(
    target: HTMLElement | null | undefined,
    event: K,
    handler: (ev: HTMLElementEventMap[K]) => void,
    options?: AddEventListenerOptions,
  ): () => void {
    if (!target) return () => {};
    target.addEventListener(event, handler as EventListener, options);
    return this.add(() => {
      target.removeEventListener(event, handler as EventListener, options);
    });
  }

  disposeAll(): void {
    if (this.disposed) return;
    this.disposed = true;
    // Iterate backwards — later disposers might depend on earlier ones still being alive
    for (let i = this.disposers.length - 1; i >= 0; i--) {
      try { this.disposers[i](); } catch (e) { console.error('Disposer error:', e); }
    }
    this.disposers.length = 0;
  }
}