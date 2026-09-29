import { createContext, useContext } from 'react';

export interface AnnouncerValue {
  announce: (message: string) => void;
}

export const AnnouncerContext = createContext<AnnouncerValue>({ announce: () => undefined });

export function useAnnouncer(): AnnouncerValue {
  return useContext(AnnouncerContext);
}
