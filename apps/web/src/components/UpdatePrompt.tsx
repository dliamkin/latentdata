import { Button } from 'primereact/button';
import { useRegisterSW } from 'virtual:pwa-register/react';

export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh) return null;

  return (
    <div className="update-toast" role="status">
      <span className="pi pi-refresh mark--accent" aria-hidden="true" />
      <span className="update-toast-text">A newer version is available.</span>
      <Button
        label="Reload"
        size="small"
        severity="contrast"
        onClick={() => {
          void updateServiceWorker(true);
        }}
      />
      <Button
        label="Later"
        size="small"
        text
        onClick={() => {
          setNeedRefresh(false);
        }}
      />
    </div>
  );
}
