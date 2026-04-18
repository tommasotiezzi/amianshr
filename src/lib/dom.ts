/**
 * DOM helpers used by the page context.
 *
 * Pages use these indirectly via ctx.on / ctx.$ / ctx.$$ / ctx.onCleanup.
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

type EventTargetLike = HTMLElement | Document | Window | null | undefined;

/**
 * Disposer tracker — collects cleanup functions so they all fire on unmount.
 */
export class DisposerSet {
  private disposers: Array<() => void> = [];
  private disposed = false;

  add(fn: () => void): () => void {
    if (this.disposed) {
      // Already disposed → run immediately
      try { fn(); } catch (e) { console.error('Disposer error:', e); }
      return () => {};
    }
    this.disposers.push(fn);
    return () => {
      const i = this.disposers.indexOf(fn);
      if (i >= 0) {
        this.disposers.splice(i, 1);
        try { fn(); } catch (e) { console.error('Disposer error:', e); }
      }
    };
  }

  /** Attach a listener and register its removal as a disposer. */
  addListener<K extends keyof HTMLElementEventMap>(
    target: EventTargetLike,
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
    for (let i = this.disposers.length - 1; i >= 0; i--) {
      try { this.disposers[i](); } catch (e) { console.error('Disposer error:', e); }
    }
    this.disposers.length = 0;
  }
}