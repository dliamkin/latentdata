import { useCallback, useEffect, useState } from 'react';

import { applyTheme, initialMode, persistMode, type ThemeMode } from './theme.ts';

export function useTheme(): { mode: ThemeMode; toggle: () => void } {
  const [mode, setMode] = useState<ThemeMode>(initialMode);

  useEffect(() => {
    void applyTheme(mode);
  }, [mode]);

  const toggle = useCallback(() => {
    setMode((current) => {
      const next = current === 'dark' ? 'light' : 'dark';
      persistMode(next);
      return next;
    });
  }, []);

  return { mode, toggle };
}
