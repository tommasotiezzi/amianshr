/**
 * Hash-based router with page lifecycle.
 *
 * Responsibilities:
 *   - Match hash URLs against registered patterns
 *   - Call unmount() on the outgoing page before mounting the next
 *   - Fire AbortSignal when a page is unmounted (kills in-flight fetches)
 *   - Build PageContext for each mount (scoped $, auto-cleanup on())
 *
 * Usage in main.ts:
 *   const router = new Router(appEl);
 *   router.on('/positions', createPositionsListPage);
 *   router.on('/positions/:id/edit', createPositionFormPage);
 *   router.onFallback(() => router.navigate('/dashboard'));
 *   router.start();
 *
 * To wrap pages in the sidebar layout, use a layout factory — see sidebar-layout.ts.
 */

import type { Page, PageContext, PageFactory } from './lib/page';
import { createScopedQuery, DisposerSet } from './lib/dom';

interface Route {
  pattern: string;
  regex: RegExp;
  paramNames: string[];
  factory: PageFactory;
  /**
   * Wrapper behaviour:
   *   - undefined: use the default wrapper set via setDefaultWrapper()
   *   - null: no wrapper — page renders directly into the root (e.g. login)
   *   - PageWrapper: override the default with this specific wrapper
   */
  wrapper?: PageWrapper | null;
}

/**
 * A wrapper mounts shared chrome (sidebar, header) around a page and returns
 * the inner container where the page should render.
 *
 * Wrappers are called ONCE per navigation (same as pages). The returned
 * container is what the page's ctx.container points to.
 */
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

  // Current mounted page + its lifecycle state
  private currentPage: Page | null = null;
  private currentDisposers: DisposerSet | null = null;
  private currentAbortController: AbortController | null = null;
  private defaultWrapper: PageWrapper | undefined;

  // Guard against re-entrant resolves (e.g. page mounts and immediately navigates)
  private navigating = false;
  private pendingPath: string | null = null;

  constructor(root: HTMLElement) {
    this.root = root;
  }

  /**
   * Register a route.
   * @param wrapper undefined (use default), null (no wrapper), or a specific PageWrapper
   */
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

  /** Set a default wrapper applied to all routes that don't override one. */
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
      // Same path — force a re-resolve (useful for list pages refreshing after an action)
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

  private async resolve(): Promise<void> {
    // If already navigating, queue the new path; the in-flight resolve will pick it up
    if (this.navigating) {
      this.pendingPath = this.currentPath;
      return;
    }
    this.navigating = true;

    try {
      const path = this.currentPath;

      // Unmount the current page first
      await this.unmountCurrent();

      // Find matching route
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

      // Apply wrapper to determine the container.
      // - wrapper === null → page has explicitly opted out, render into root
      // - wrapper === undefined → use default wrapper
      // - wrapper is a function → use it
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
        if (!c) {
          // Wrapper chose not to render the page (e.g. auth redirect)
          return;
        }
        container = c;
      } else {
        this.root.innerHTML = '';
        container = this.root;
      }

      // Build the page context
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

      // Create and mount the page
      const page = match.route.factory(ctx);
      this.currentPage = page;

      try {
        await page.mount();
      } catch (e) {
        console.error('Page mount error:', e);
      }
    } finally {
      this.navigating = false;

      // If a navigation queued up while we were resolving, handle it now
      if (this.pendingPath !== null && this.pendingPath !== this.currentPath) {
        this.pendingPath = null;
        this.resolve();
      } else {
        this.pendingPath = null;
      }
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

  private async unmountCurrent(): Promise<void> {
    // Abort in-flight fetches first so they don't write into a stale DOM
    if (this.currentAbortController) {
      this.currentAbortController.abort();
      this.currentAbortController = null;
    }

    // Call page.unmount() if defined
    if (this.currentPage?.unmount) {
      try { this.currentPage.unmount(); } catch (e) { console.error('Unmount error:', e); }
    }
    this.currentPage = null;

    // Dispose all listeners, timers, subscriptions
    if (this.currentDisposers) {
      this.currentDisposers.disposeAll();
      this.currentDisposers = null;
    }
  }
}