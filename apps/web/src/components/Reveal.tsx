import { useEffect, useRef, type ReactNode } from 'react';

const OPEN_MS = 240;
const CLOSE_MS = 200;

// no animation under reduced motion, or where the Web Animations API is missing (jsdom, old
// browsers): the content then just appears and disappears
function skipAnimation(el: HTMLElement): boolean {
  return typeof el.animate !== 'function' || matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// grows its content open on mount and, when `closing` turns on, shrinks it away and then
// reports `onClosed` so the parent can unmount it. Heights are measured and animated with the
// Web Animations API rather than CSS classes: a finished promise is exact, and a browser won't
// replay a CSS animation whose name it has already run on the element.
export function Reveal({
  closing,
  onClosed,
  children,
}: {
  closing: boolean;
  onClosed: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const onClosedRef = useRef(onClosed);

  useEffect(() => {
    onClosedRef.current = onClosed;
  });

  useEffect(() => {
    const el = ref.current;
    if (el === null || skipAnimation(el)) return;
    el.style.overflow = 'hidden';
    const animation = el.animate(
      [
        { height: '0px', opacity: 0 },
        { height: `${String(el.scrollHeight)}px`, opacity: 1 },
      ],
      { duration: OPEN_MS, easing: 'ease-out' },
    );
    animation.finished
      .then(() => {
        el.style.overflow = '';
        // the row grew below the fold more often than not; bring its content into view
        el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      })
      .catch(() => undefined);
    return () => {
      animation.cancel();
    };
  }, []);

  useEffect(() => {
    if (!closing) return;
    const el = ref.current;
    if (el === null || skipAnimation(el)) {
      onClosedRef.current();
      return;
    }
    el.style.overflow = 'hidden';
    // keep the row that owns this expansion in view while the page below it shortens
    el.closest('tr')?.previousElementSibling?.scrollIntoView({
      block: 'nearest',
      behavior: 'smooth',
    });
    const animation = el.animate(
      [
        { height: `${String(el.getBoundingClientRect().height)}px`, opacity: 1 },
        { height: '0px', opacity: 0 },
      ],
      { duration: CLOSE_MS, easing: 'ease-in', fill: 'forwards' },
    );
    animation.finished
      .then(() => {
        onClosedRef.current();
      })
      .catch(() => undefined);
    return () => {
      animation.cancel();
    };
  }, [closing]);

  return (
    <div ref={ref} className="reveal">
      {children}
    </div>
  );
}
