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

  private currentPage: Page | null = null;
  private currentDisposers: DisposerSet | null = null;
  private currentAbortController: AbortController | null = null;
  private defaultWrapper: PageWrapper | undefined;

  // Re-entrancy: if a new nav comes in while we're resolving, just set the flag.
  // The loop inside resolve() checks this after each mount and re-runs if needed.
  private navigating = false;
  private needsRerun = false;

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
    this.resolve();
  }

  private async resolve(): Promise<void> {
    if (this.navigating) {
      this.needsRerun = true;
      return;
    }

    this.navigating = true;

    try {
      // Loop: keep resolving until no new nav comes in during a mount
      // eslint-disable-next-line no-constant-condition
      while (true) {
        this.needsRerun = false;
        const path = this.currentPath;

        await this.unmountCurrent();

        const match = this.findRoute(path);
        if (!match) {
          this.fallback();
          if (!this.needsRerun) break;
          continue;
        }

        const disposers = new DisposerSet();
        const abortController = new AbortController();
        this.currentDisposers = disposers;
        this.currentAbortController = abortController;

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
            if (!this.needsRerun) break;
            continue;
          }
          container = c;
        } else {
          this.root.innerHTML = '';
          container = this.root;
        }

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
          console.error('Page mount error:', e);
        }

        if (!this.needsRerun) break;
      }
    } finally {
      this.navigating = false;
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