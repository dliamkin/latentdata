export type ThemeMode = 'light' | 'dark';

export const THEME_KEY = 'cert-tracker:theme:v1';
const LINK_ID = 'theme-link';
const LOAD_TIMEOUT_MS = 2000;

export function themeHref(mode: ThemeMode): string {
  return `/themes/lara-${mode}-blue/theme.css`;
}

// the logo files are named by the theme they sit on, not by their own colour
export function logoSrc(mode: ThemeMode): string {
  return `/logo-${mode}.png`;
}

// the other theme's stylesheet is fetched at low priority so a toggle doesn't wait on it
export function prefetchOtherTheme(mode: ThemeMode): void {
  const link = document.createElement('link');
  link.rel = 'prefetch';
  link.as = 'style';
  link.href = themeHref(mode === 'dark' ? 'light' : 'dark');
  document.head.append(link);
}

// dark unless the visitor chose light; the OS preference is not consulted (index.html agrees)
export function initialMode(): ThemeMode {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    // storage blocked; the default applies
  }
  return 'dark';
}

export function persistMode(mode: ThemeMode): void {
  try {
    localStorage.setItem(THEME_KEY, mode);
  } catch {
    // nothing to do; the choice just won't survive a reload
  }
}

// index.html creates the link before any script runs; this only exists for tests and for a
// document that somehow lost it
function themeLink(): HTMLLinkElement {
  const existing = document.getElementById(LINK_ID);
  if (existing instanceof HTMLLinkElement) return existing;
  const link = document.createElement('link');
  link.id = LINK_ID;
  link.rel = 'stylesheet';
  document.head.append(link);
  return link;
}

// swaps the theme <link>; resolves once the stylesheet is in so the first render isn't unstyled
export function applyTheme(mode: ThemeMode): Promise<void> {
  document.documentElement.dataset.theme = mode;
  const link = themeLink();
  const href = themeHref(mode);
  if (link.getAttribute('href') === href && link.sheet !== null) return Promise.resolve();
  return new Promise((resolve) => {
    const done = (): void => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(done, LOAD_TIMEOUT_MS);
    link.addEventListener('load', done, { once: true });
    link.addEventListener('error', done, { once: true });
    if (link.getAttribute('href') !== href) link.href = href;
  });
}
