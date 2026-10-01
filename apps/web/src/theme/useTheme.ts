import { useCallback, useEffect, useState } from 'react';

import { runThemeWave } from '../lib/themeWave.ts';
import { withViewTransition } from '../lib/viewTransition.ts';
import { applyTheme, initialMode, persistMode, type ThemeMode } from './theme.ts';

export function useTheme(): { mode: ThemeMode; toggle: () => void } {
  const [mode, setMode] = useState<ThemeMode>(initialMode);

  useEffect(() => {
    void applyTheme(mode);
  }, [mode]);

  const toggle = useCallback(() => {
    const next: ThemeMode = mode === 'dark' ? 'light' : 'dark';
    persistMode(next);
    // the attribute flips inside the transition so the new snapshot already has the colours
    void withViewTransition('theme', () => {
      void applyTheme(next);
      setMode(next);
    }).then(runThemeWave);
  }, [mode]);

  return { mode, toggle };
}
