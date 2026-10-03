import { createContext, useContext } from 'react';

import type { AdminConfig } from './auth.ts';

export interface AdminValue {
  active: boolean;
  // the Cognito ID token, sent to the admin API as a bearer token
  token: string | null;
  // null when this build has no admin API to talk to
  config: AdminConfig | null;
  dialogOpen: boolean;
  // true from the first open onwards, so the dialog's chunk is only fetched when needed
  dialogMounted: boolean;
  openDialog: () => void;
  closeDialog: () => void;
  // leaves the page for the hosted sign-in
  signIn: () => void;
  signingIn: boolean;
  // why the last sign-in did not finish, for the dialog to show
  error: string | null;
  // forgets the token in this tab; what a 401 or an expired token does
  leave: () => void;
  // forgets the token and ends the hosted pages' session as well
  signOut: () => void;
}

export const AdminContext = createContext<AdminValue | null>(null);

export function useAdmin(): AdminValue {
  const value = useContext(AdminContext);
  if (value === null) throw new Error('useAdmin needs an AdminProvider');
  return value;
}
