/**
 * Hash-based router with page lifecycle.
 *
 * Re-entrancy model:
 *   Instead of locking during navigation, we use a monotonically increasing
 *   generation counter. Each resolve() captures its generation at start;
 *   if the generation has changed by the time an async step completes, it
 *   knows a newer navigation has started and bails out silently.
 *
 *   Benefits:
 *   - Nothing to get "stuck" in a true/false flag
 *   - If a fetch hangs (e.g., from a backgrounded tab), a subsequent nav
 *     just supersedes it; the stuck one is a harmless no-op when it resumes
 *   - Per-navigation AbortController kills in-flight fetches on supersede
 */

import type { Page, PageContext, PageFactory } from './lib/page';
import { createScopedQuery, DisposerSet } from './lib/dom';

interface Route {
  pattern: string;
  regex: RegExp;
  paramNames: string[];
  factory: PageFactory;
  wrapper?: PageWrapper | null;
}

export type PageWrapper = (args: {
  root: HTMLElement;
  router: Router;
  currentPath: string;
  disposers: DisposerSet;
}) => HTMLElement | null;

export class Router {
  private routes: Route[] = [];
  private fallback: () => void = () => {};
  private root: HTMLElement;
  private defaultWrapper: PageWrapper | undefined;

  // Generation counter — incremented on every resolve() call.
  // An async flow that sees its captured generation != current one bails out.
  private generation = 0;

  // Lifecycle state for the CURRENTLY mounted page
  private currentPage: Page | null = null;
  private currentDisposers: DisposerSet | null = null;
  private currentAbortController: AbortController | null = null;

  constructor(root: HTMLElement) {
    this.root = root;
  }

  on(pattern: string, factory: PageFactory, wrapper?: PageWrapper | null): this {
    const paramNames: string[] = [];
    const regexStr = pattern.replace(/:([^/]+)/g, (_, name) => {
      paramNames.push(name);
      return '([^/]+)';
    });
    this.routes.push({
      pattern,
      regex: new RegExp(`^${regexStr}$`),
      paramNames,
      factory,
      wrapper,
    });
    return this;
  }

  setDefaultWrapper(wrapper: PageWrapper): this {
    this.defaultWrapper = wrapper;
    return this;
  }

  onFallback(handler: () => void): this {
    this.fallback = handler;
    return this;
  }

  navigate(path: string): void {
    if (window.location.hash.slice(1) === path) {
      // Same path — force a re-resolve
      this.resolve();
    } else {
      window.location.hash = path;
    }
  }

  get currentPath(): string {
    const hash = window.location.hash.slice(1);
    const [path] = hash.split('?');
    return path || '/';
  }

  get currentQuery(): Record<string, string> {
    const hash = window.location.hash.slice(1);
    const [, qs] = hash.split('?');
    if (!qs) return {};
    const out: Record<string, string> = {};
    new URLSearchParams(qs).forEach((v, k) => { out[k] = v; });
    return out;
  }

  start(): void {
    window.addEventListener('hashchange', () => this.resolve());

    // When the tab becomes visible again, re-resolve to recover from any
    // mounts that were hung by background throttling. Idempotent.
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) this.resolve();
    });

    this.resolve();
  }

  private async resolve(): Promise<void> {
    // Bump generation. Any in-flight resolve with an older generation
    // will detect this on its next await and bail silently.
    const gen = ++this.generation;

    // Unmount whatever was mounted (synchronously kicks off abort)
    this.unmountCurrent();

    const path = this.currentPath;
    const match = this.findRoute(path);

    if (!match) {
      this.fallback();
      return;
    }

    // Fresh lifecycle state
    const disposers = new DisposerSet();
    const abortController = new AbortController();
    this.currentDisposers = disposers;
    this.currentAbortController = abortController;

    // Wrapper resolution
    const wrapper = match.route.wrapper === null
      ? null
      : (match.route.wrapper ?? this.defaultWrapper);

    let container: HTMLElement;
    if (wrapper) {
      const c = wrapper({
        root: this.root,
        router: this,
        currentPath: path,
        disposers,
      });
      if (gen !== this.generation) return;  // superseded during wrapper (unlikely but possible)
      if (!c) return;                        // wrapper declined (e.g., auth redirect)
      container = c;
    } else {
      this.root.innerHTML = '';
      container = this.root;
    }

    // Build page context
    const scoped = createScopedQuery(container);
    const ctx: PageContext = {
      container,
      params: match.params,
      query: this.currentQuery,
      router: this,
      signal: abortController.signal,
      on: (target, event, handler, options) =>
        disposers.addListener(target, event, handler, options),
      $: scoped.$,
      $$: scoped.$$,
      onCleanup: (fn) => { disposers.add(fn); },
    };

    const page = match.route.factory(ctx);
    this.currentPage = page;

    try {
      await page.mount();
    } catch (e) {
      if (gen === this.generation) {
        console.error('Page mount error:', e);
      }
      // If superseded, swallow — a newer page is already mounted
    }

    // If a newer navigation happened, the new resolve has already unmounted
    // us and reassigned currentPage. Nothing to do.
  }

  private findRoute(path: string): { route: Route; params: Record<string, string> } | null {
    for (const route of this.routes) {
      const match = path.match(route.regex);
      if (match) {
        const params: Record<string, string> = {};
        route.paramNames.forEach((name, i) => { params[name] = match[i + 1]; });
        return { route, params };
      }
    }
    return null;
  }

  /**
   * Tear down the currently mounted page. Synchronous — just fires the
   * abort signal and calls disposers. Any awaits inside mount() will either
   * receive AbortError from their fetch or see the generation mismatch.
   */
  private unmountCurrent(): void {
    if (this.currentAbortController) {
      this.currentAbortController.abort();
      this.currentAbortController = null;
    }
    if (this.currentPage?.unmount) {
      try { this.currentPage.unmount(); } catch (e) { console.error('Unmount error:', e); }
    }
    this.currentPage = null;
    if (this.currentDisposers) {
      this.currentDisposers.disposeAll();
      this.currentDisposers = null;
    }
  }
}