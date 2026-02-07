/**
 * Hash-based router.
 *
 * Esempio:
 *   router.on('/positions/:id', (params) => console.log(params.id));
 *   router.navigate('/positions/123');
 */

type RouteHandler = (params: Record<string, string>) => void;

interface Route {
  pattern: string;
  regex: RegExp;
  paramNames: string[];
  handler: RouteHandler;
}

export class Router {
  private routes: Route[] = [];
  private fallback: RouteHandler = () => {};

  on(pattern: string, handler: RouteHandler): this {
    const paramNames: string[] = [];
    const regexStr = pattern.replace(/:([^/]+)/g, (_, name) => {
      paramNames.push(name);
      return '([^/]+)';
    });

    this.routes.push({
      pattern,
      regex: new RegExp(`^${regexStr}$`),
      paramNames,
      handler,
    });

    return this;
  }

  onFallback(handler: RouteHandler): this {
    this.fallback = handler;
    return this;
  }

  navigate(path: string) {
    window.location.hash = path;
  }

  get currentPath(): string {
    return window.location.hash.slice(1) || '/';
  }

  start() {
    window.addEventListener('hashchange', () => this.resolve());
    this.resolve();
  }

  private resolve() {
    const path = this.currentPath;

    for (const route of this.routes) {
      const match = path.match(route.regex);
      if (match) {
        const params: Record<string, string> = {};
        route.paramNames.forEach((name, i) => {
          params[name] = match[i + 1];
        });
        route.handler(params);
        return;
      }
    }

    this.fallback({});
  }
}