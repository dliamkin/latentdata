import { useState, type Dispatch, type SetStateAction } from 'react';

// stands in for virtual:pwa-register/react under vitest, where the PWA plugin is disabled
export function useRegisterSW(): {
  needRefresh: [boolean, Dispatch<SetStateAction<boolean>>];
  offlineReady: [boolean, Dispatch<SetStateAction<boolean>>];
  updateServiceWorker: (reloadPage?: boolean) => Promise<void>;
} {
  const needRefresh = useState(false);
  const offlineReady = useState(false);
  return { needRefresh, offlineReady, updateServiceWorker: () => Promise.resolve() };
}
