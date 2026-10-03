import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { API, candidate, fakeToken, stubAdminEnv, stubFetch } from '../test/admin.ts';
import { renderWithProviders } from '../test/render.tsx';
import AdminPanel from './AdminPanel.tsx';
import { ADMIN_TOKEN_KEY, readToken } from './auth.ts';

const LIST = `GET ${API}/admin/candidates`;
const ID = '01J9Z0G6V2QK8X7N3B4C5D6E7F';

let token: string;

beforeEach(() => {
  stubAdminEnv();
  token = fakeToken();
  window.sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('AdminPanel', () => {
  it('shows the queue it read with the bearer token', async () => {
    const fetcher = stubFetch({ [LIST]: { body: { candidates: [candidate()] } } });
    renderWithProviders(<AdminPanel onLeave={() => undefined} />);
    const card = await screen.findByRole('listitem');
    expect(within(card).getByRole('heading', { name: 'Vendor free exam week' })).toBeVisible();
    expect(within(card).getByText('Medium confidence')).toBeVisible();
    expect(within(card).getByRole('link', { name: 'Source checked' })).toHaveAttribute(
      'href',
      'https://vendor.example/terms',
    );
    const [, init] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(init.headers).toEqual({ authorization: `Bearer ${token}` });
  });

  it('says so when nothing is waiting', async () => {
    stubFetch({ [LIST]: { body: { candidates: [] } } });
    renderWithProviders(<AdminPanel onLeave={() => undefined} />);
    expect(await screen.findByText('Nothing is waiting for review.')).toBeVisible();
  });

  it('approves a candidate and takes it off the list', async () => {
    const user = userEvent.setup();
    const fetcher = stubFetch({
      [LIST]: { body: { candidates: [candidate()] } },
      [`POST ${API}/admin/candidates/${ID}/approve`]: { body: { offer: {} } },
    });
    renderWithProviders(<AdminPanel onLeave={() => undefined} />);
    await user.click(await screen.findByRole('button', { name: 'Approve' }));
    await waitFor(() => {
      expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
    });
    expect(fetcher).toHaveBeenCalledWith(
      `${API}/admin/candidates/${ID}/approve`,
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('will not approve a candidate that updates an existing offer', async () => {
    stubFetch({
      [LIST]: { body: { candidates: [candidate({ matchesExistingId: 'vendor-offer-2026' })] } },
    });
    renderWithProviders(<AdminPanel onLeave={() => undefined} />);
    expect(await screen.findByRole('button', { name: 'Approve' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeEnabled();
  });

  it('keeps the card and shows why when a decision is refused', async () => {
    const user = userEvent.setup();
    stubFetch({
      [`POST ${API}/admin/candidates/${ID}/dismiss`]: {
        status: 409,
        body: { error: 'this candidate has already been decided' },
      },
      [LIST]: { body: { candidates: [candidate()] } },
    });
    renderWithProviders(<AdminPanel onLeave={() => undefined} />);
    await user.click(await screen.findByRole('button', { name: 'Dismiss' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('already been decided');
  });

  it('leaves admin mode when the API refuses the token', async () => {
    const onLeave = vi.fn();
    stubFetch({ [LIST]: { status: 401, body: { message: 'Unauthorized' } } });
    renderWithProviders(<AdminPanel onLeave={onLeave} />);
    await waitFor(() => {
      expect(onLeave).toHaveBeenCalled();
    });
    expect(readToken()).toBeNull();
  });
});
