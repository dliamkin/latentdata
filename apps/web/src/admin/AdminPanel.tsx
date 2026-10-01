import { Button } from 'primereact/button';

import { useAdmin } from './adminContext.ts';

// code-split placeholder: candidate review, sources, jobs and subscribers arrive with the admin API
export default function AdminPanel({ onLeave }: { onLeave: () => void }) {
  const { leave } = useAdmin();
  const apiBase = import.meta.env.VITE_API_BASE_URL as string | undefined;
  const configured = apiBase !== undefined && apiBase !== '';

  return (
    <section aria-labelledby="review-heading" className="review">
      <div className="admin-bar">
        <span className="admin-badge">Admin mode</span>
        <span className="muted">API</span>
        <code className="mono">{configured ? apiBase : 'not configured'}</code>
        <span className={`mark mark--${configured ? 'accent' : 'muted'}`}>
          <span className="pi pi-circle-fill mark-icon" aria-hidden="true" />
          {configured ? 'configured' : 'not deployed'}
        </span>
        <span className="admin-bar-spacer" />
        <Button
          label="Leave admin mode"
          outlined
          size="small"
          onClick={() => {
            leave();
            onLeave();
          }}
        />
      </div>
      <div className="panel review-panel">
        <h2 id="review-heading" className="section-title">
          Review
        </h2>
        <p className="section-lede">
          The admin API is not deployed yet. Once it is, this tab holds the candidate queue (offers
          the pipeline found, with confidence and approve/reject), source health, job triggers and
          subscribers.
        </p>
      </div>
    </section>
  );
}
