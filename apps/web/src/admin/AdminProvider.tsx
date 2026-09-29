import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

import { AdminContext, type AdminValue } from './adminContext.ts';

export const ADMIN_TOKEN_KEY = 'cert-tracker:admin-token:v1';
const DOUBLE_TAP_MS = 800;

// sessionStorage on purpose: a shared machine shouldn't stay in admin mode after the tab closes
function readToken(): string | null {
  try {
    return sessionStorage.getItem(ADMIN_TOKEN_KEY);
  } catch {
    return null;
  }
}

function writeToken(token: string | null): void {
  try {
    if (token === null) sessionStorage.removeItem(ADMIN_TOKEN_KEY);
    else sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
  } catch {
    // admin mode then only lasts for this page load
  }
}

function isEditable(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  );
}

export function AdminProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(readToken);
  const [dialogOpen, setDialogOpen] = useState(
    () => new URLSearchParams(window.location.search).has('admin') && readToken() === null,
  );
  const [dialogMounted, setDialogMounted] = useState(dialogOpen);

  useEffect(() => {
    let lastTap = 0;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'A' || !event.shiftKey || isEditable(event.target)) return;
      const now = Date.now();
      if (now - lastTap < DOUBLE_TAP_MS) {
        lastTap = 0;
        setDialogMounted(true);
        setDialogOpen(true);
      } else {
        lastTap = now;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  const openDialog = useCallback(() => {
    setDialogMounted(true);
    setDialogOpen(true);
  }, []);
  const closeDialog = useCallback(() => {
    setDialogOpen(false);
  }, []);
  const enter = useCallback((next: string) => {
    writeToken(next);
    setToken(next);
    setDialogOpen(false);
  }, []);
  const leave = useCallback(() => {
    writeToken(null);
    setToken(null);
  }, []);

  const value = useMemo<AdminValue>(
    () => ({
      active: token !== null,
      token,
      dialogOpen,
      dialogMounted,
      openDialog,
      closeDialog,
      enter,
      leave,
    }),
    [token, dialogOpen, dialogMounted, openDialog, closeDialog, enter, leave],
  );

  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
}
