import { createContext, useContext } from 'react';

export interface AdminValue {
  active: boolean;
  token: string | null;
  dialogOpen: boolean;
  // true from the first open onwards, so the dialog's chunk is only fetched when needed
  dialogMounted: boolean;
  openDialog: () => void;
  closeDialog: () => void;
  enter: (token: string) => void;
  leave: () => void;
}

export const AdminContext = createContext<AdminValue | null>(null);

export function useAdmin(): AdminValue {
  const value = useContext(AdminContext);
  if (value === null) throw new Error('useAdmin needs an AdminProvider');
  return value;
}
