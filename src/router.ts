/**
 * Hash-based router — fully synchronous.
 *
 * Pages do their async work in the background and guard DOM writes with
 * signal.aborted. The router never awaits anything, so navigation is
 * instant and can't get stuck behind a hung fetch.
 *
 * Usage:
 *   const router = new Router(appEl);
 *   router.on('/positions', createPositionsListPage);
 *   router.on('/login', createLoginPage, null);  // null = no wrapper
 *   router.setDefaultWrapper(sidebarWrapper);
 *   router.onFallback(() => router.navigate('/dashboard'));
 *   router.start();
 */

import type { PageContext, PageFactory, PageHandle } from './lib/page';
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

  // Current mount state
  private currentHandle: PageHandle | void | null = null;
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
    this.resolve();
  }

  /**
   * Synchronously unmount the old page and mount the new one.
   * Never awaits anything. Pages handle their own async work in the background.
   */
  private resolve(): void {
    // Tear down current page (sync: aborts its signal, runs disposers)
    this.unmountCurrent();

    const path = this.currentPath;
    const match = this.findRoute(path);

    if (!match) {
      this.fallback();
      return;
    }

    // Fresh state for the new page
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
      if (!c) return;  // wrapper declined (auth redirect, etc.)
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

    // Call the factory. It must render synchronously.
    // Any async work it kicks off is fire-and-forget (guarded by ctx.signal).
    try {
      this.currentHandle = match.route.factory(ctx) ?? null;
    } catch (e) {
      console.error('Page factory error:', e);
      this.currentHandle = null;
    }
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
   * Synchronously tear down the current page. Safe to call multiple times.
   */
  private unmountCurrent(): void {
    if (this.currentAbortController) {
      this.currentAbortController.abort();
      this.currentAbortController = null;
    }
    if (this.currentHandle && typeof (this.currentHandle as PageHandle).unmount === 'function') {
      try { (this.currentHandle as PageHandle).unmount!(); }
      catch (e) { console.error('Unmount error:', e); }
    }
    this.currentHandle = null;
    if (this.currentDisposers) {
      this.currentDisposers.disposeAll();
      this.currentDisposers = null;
    }
  }
}