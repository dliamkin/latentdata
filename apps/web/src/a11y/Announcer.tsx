import { useCallback, useMemo, useState, type ReactNode } from 'react';

import { AnnouncerContext } from './announcerContext.ts';

// one polite live region for the whole page: filter results, saves, errors all go through here
export function AnnouncerProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState('');

  const announce = useCallback((next: string) => {
    // clear first so repeating the same text is still read out
    setMessage('');
    requestAnimationFrame(() => {
      setMessage(next);
    });
  }, []);

  const value = useMemo(() => ({ announce }), [announce]);

  return (
    <AnnouncerContext.Provider value={value}>
      {children}
      <div className="sr-only" aria-live="polite" aria-atomic="true" data-testid="live-region">
        {message}
      </div>
    </AnnouncerContext.Provider>
  );
}
