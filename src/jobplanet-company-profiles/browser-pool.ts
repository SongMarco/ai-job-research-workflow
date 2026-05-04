export interface BrowserPage {
  goto(url: string, options?: { readonly waitUntil?: string; readonly timeout?: number }): Promise<{
    status(): number;
  } | null>;
  waitForSelector(selector: string, options?: { readonly timeout?: number }): Promise<unknown>;
  evaluate<T>(fn: () => T): Promise<T>;
  title(): Promise<string>;
  close(options?: { readonly runBeforeUnload?: boolean }): Promise<void>;
  context(): {
    close(): Promise<void>;
  };
}

interface BrowserContext {
  newPage(): Promise<BrowserPage>;
  close(): Promise<void>;
}

interface Browser {
  newContext(): Promise<BrowserContext>;
  close(): Promise<void>;
}

export interface BrowserPoolLike {
  acquirePage(): Promise<BrowserPage>;
  releasePage(page: BrowserPage): Promise<void>;
  close?(): Promise<void>;
}

export class BrowserPool implements BrowserPoolLike {
  private browserPromise?: Promise<Browser>;

  constructor(private readonly options: { readonly headless: boolean }) {}

  private async getBrowser(): Promise<Browser> {
    if (!this.browserPromise) {
      this.browserPromise = import('playwright')
        .then(({ chromium }) => chromium.launch({ headless: this.options.headless }) as Promise<Browser>)
        .catch((error) => {
          this.browserPromise = undefined;
          throw error;
        });
    }
    return this.browserPromise;
  }

  async acquirePage(): Promise<BrowserPage> {
    const browser = await this.getBrowser();
    const context = await browser.newContext();
    return context.newPage();
  }

  async releasePage(page: BrowserPage): Promise<void> {
    try {
      const context = page.context();
      await page.close({ runBeforeUnload: false }).catch(() => undefined);
      await context.close().catch(() => undefined);
    } catch {
      // Best-effort cleanup only.
    }
  }

  async close(): Promise<void> {
    if (!this.browserPromise) return;

    const browserPromise = this.browserPromise;
    this.browserPromise = undefined;
    const browser = await browserPromise.catch(() => null);
    if (!browser) return;
    await browser.close().catch(() => undefined);
  }
}
