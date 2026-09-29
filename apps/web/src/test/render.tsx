import { render, type RenderResult } from '@testing-library/react';
import { PrimeReactProvider } from 'primereact/api';
import type { ReactElement } from 'react';

import { AnnouncerProvider } from '../a11y/Announcer.tsx';
import { AdminProvider } from '../admin/AdminProvider.tsx';
import { TrackingProvider } from '../tracking/TrackingProvider.tsx';

export function renderWithProviders(ui: ReactElement): RenderResult {
  return render(
    <PrimeReactProvider value={{ ripple: false }}>
      <AnnouncerProvider>
        <TrackingProvider>
          <AdminProvider>{ui}</AdminProvider>
        </TrackingProvider>
      </AnnouncerProvider>
    </PrimeReactProvider>,
  );
}
