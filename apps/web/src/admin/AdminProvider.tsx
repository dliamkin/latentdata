import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { useAnnouncer } from '../a11y/announcerContext.ts';
import { AdminContext, type AdminValue } from './adminContext.ts';
import {
  adminConfig,
  authorizeUrl,
  challengeFor,
  completeSignIn,
  randomToken,
  readToken,
  redirectUri,
  savePending,
  signOutUrl,
  tokenExpiry,
  writeToken,
} from './auth.ts';

const DOUBLE_TAP_MS = 800;

function isEditable(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  );
}

export function AdminProvider({ children }: { children: ReactNode }) {
  const { announce } = useAnnouncer();
  const config = useMemo(() => adminConfig(), []);
  const [token, setToken] = useState<string | null>(readToken);
  const [error, setError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(
    () => new URLSearchParams(window.location.search).has('admin') && readToken() === null,
  );
  const [dialogMounted, setDialogMounted] = useState(dialogOpen);

  // the hosted pages send the browser back with ?code=…; trade it for a token, once. The ref
  // survives StrictMode's second run of this effect, which would otherwise find the code spent.
  const completing = useRef(false);
  useEffect(() => {
    if (completing.current) return;
    completing.current = true;
    void completeSignIn(config).then((result) => {
      if (result.kind === 'signed-in') {
        writeToken(result.token);
        setToken(result.token);
        announce('Signed in. The Review tab is unlocked.');
        window.location.hash = 'review';
      } else if (result.kind === 'failed') {
        setError(result.message);
        setDialogMounted(true);
        setDialogOpen(true);
      }
    });
  }, [config, announce]);

  // the token is good for half an hour; when it runs out the Review tab goes with it rather
  // than sitting there answering 401
  useEffect(() => {
    if (token === null) return;
    const remaining = (tokenExpiry(token) ?? 0) - Date.now();
    const timer = window.setTimeout(
      () => {
        writeToken(null);
        setToken(null);
        announce('The admin session ended. Sign in again to continue.');
      },
      Math.max(remaining, 0),
    );
    return () => {
      window.clearTimeout(timer);
    };
  }, [token, announce]);

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
    setError(null);
  }, []);
  const signIn = useCallback(() => {
    if (config === null) return;
    setSigningIn(true);
    setError(null);
    const state = randomToken();
    const verifier = randomToken();
    void challengeFor(verifier)
      .then((challenge) => {
        savePending({ state, verifier });
        window.location.assign(
          authorizeUrl(config, { state, challenge, redirectUri: redirectUri() }),
        );
      })
      .catch(() => {
        setSigningIn(false);
        setError('This browser could not start the sign-in.');
      });
  }, [config]);
  const leave = useCallback(() => {
    writeToken(null);
    setToken(null);
  }, []);
  const signOut = useCallback(() => {
    writeToken(null);
    setToken(null);
    if (config !== null) window.location.assign(signOutUrl(config, redirectUri()));
  }, [config]);

  const value = useMemo<AdminValue>(
    () => ({
      active: token !== null,
      token,
      config,
      dialogOpen,
      dialogMounted,
      openDialog,
      closeDialog,
      signIn,
      signingIn,
      error,
      leave,
      signOut,
    }),
    [
      token,
      config,
      dialogOpen,
      dialogMounted,
      openDialog,
      closeDialog,
      signIn,
      signingIn,
      error,
      leave,
      signOut,
    ],
  );

  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
}
