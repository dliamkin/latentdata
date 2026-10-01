import { flushSync } from 'react-dom';

type Kind = 'theme' | 'tabs';

interface TransitionCapable {
  startViewTransition?: (update: () => void) => { finished: Promise<void> };
}

// runs a state update inside a View Transition when the browser has them and the visitor
// hasn't asked for reduced motion; `kind` lands on <html data-vt> so the stylesheet can decide
// what animates (the whole page crossfades for a theme change, only the tab indicator moves
// for a tab change). Elsewhere the update just runs.
export function withViewTransition(kind: Kind, update: () => void): Promise<void> {
  const doc = document as Document & TransitionCapable;
  if (
    typeof doc.startViewTransition !== 'function' ||
    matchMedia('(prefers-reduced-motion: reduce)').matches
  ) {
    update();
    return Promise.resolve();
  }
  document.documentElement.dataset.vt = kind;
  const transition = doc.startViewTransition(() => {
    flushSync(update);
  });
  // finished rejects when a newer transition supersedes this one; the attribute still clears
  return transition.finished
    .catch(() => undefined)
    .finally(() => {
      delete document.documentElement.dataset.vt;
    });
}
