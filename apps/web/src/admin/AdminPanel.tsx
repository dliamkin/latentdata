import { Button } from 'primereact/button';

import { useAdmin } from './adminContext.ts';

// code-split placeholder: candidate review, sources, jobs and subscribers arrive with the admin API
export default function AdminPanel({ onLeave }: { onLeave: () => void }) {
  const { leave } = useAdmin();
  const apiBase = import.meta.env.VITE_API_BASE_URL as string | undefined;

  return (
    <section aria-labelledby="review-heading">
      <h2 id="review-heading">Review</h2>
      <p>
        The admin API is not deployed yet. Candidate review, source health, job triggers and
        subscribers land here once it is.
      </p>
      <p>
        API base URL:{' '}
        <code>{apiBase !== undefined && apiBase !== '' ? apiBase : 'not configured'}</code>
      </p>
      <Button
        label="Leave admin mode"
        icon="pi pi-sign-out"
        severity="secondary"
        onClick={() => {
          leave();
          onLeave();
        }}
      />
    </section>
  );
}
