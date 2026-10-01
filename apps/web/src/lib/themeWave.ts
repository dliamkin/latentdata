// after a theme switch, a ring of colour sweeps down the page: every panel, row and card
// pulses once, delayed by how far down the viewport it sits
const TARGETS = [
  '.brand-logo',
  '.topbar-tools > *',
  '.summary-strip li',
  '.tab',
  '.search-field',
  '.p-datatable .p-datatable-thead',
  '.p-datatable tr.data-row',
  '.fact-card',
  '.tracking-notes',
  '.watch-card',
  '.activity-event',
  '.calendar-panel',
  '.day-panel',
  '.review-panel',
].join(', ');

const SWEEP_MS = 450;
const PULSE_MS = 700;

export function runThemeWave(): void {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const viewport = window.innerHeight;
  const touched: HTMLElement[] = [];
  for (const el of document.querySelectorAll<HTMLElement>(TARGETS)) {
    const { top, bottom } = el.getBoundingClientRect();
    if (bottom < -40 || top > viewport + 40) continue;
    const delay = Math.round(Math.min(Math.max(top / viewport, 0), 1) * SWEEP_MS);
    el.style.setProperty('--wave-delay', `${String(delay)}ms`);
    el.classList.add('wave');
    touched.push(el);
  }
  window.setTimeout(
    () => {
      for (const el of touched) {
        el.classList.remove('wave');
        el.style.removeProperty('--wave-delay');
      }
    },
    SWEEP_MS + PULSE_MS + 50,
  );
}
