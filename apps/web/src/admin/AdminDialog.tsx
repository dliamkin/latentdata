import { useId, useRef, useState, type SyntheticEvent } from 'react';

import { Button } from 'primereact/button';
import { Dialog } from 'primereact/dialog';
import { InputText } from 'primereact/inputtext';

import { useAdmin } from './adminContext.ts';

export function AdminDialog() {
  const { dialogOpen, closeDialog, enter } = useAdmin();
  const [token, setToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();
  const helpId = useId();
  const errorId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const submit = (event: SyntheticEvent): void => {
    event.preventDefault();
    const trimmed = token.trim();
    if (trimmed === '') {
      setError('Enter a token to continue.');
      return;
    }
    enter(trimmed);
    setToken('');
    setError(null);
  };

  const cancel = (): void => {
    setToken('');
    setError(null);
    closeDialog();
  };

  return (
    <Dialog
      header="Enter admin mode"
      visible={dialogOpen}
      onHide={cancel}
      // PrimeReact lands focus on the close icon; the token field is the only thing to do here
      onShow={() => inputRef.current?.focus()}
      modal
      draggable={false}
      resizable={false}
      style={{ width: 'min(28rem, 92vw)' }}
    >
      <p className="dialog-lede">
        Unlocks the Review tab for candidate offers, source health and job triggers.
      </p>
      <form className="dialog-form" onSubmit={submit} noValidate>
        <label htmlFor={inputId} className="field-label">
          Admin token
        </label>
        <InputText
          ref={inputRef}
          id={inputId}
          type="password"
          autoComplete="off"
          className="mono"
          value={token}
          onChange={(event) => {
            setToken(event.target.value);
          }}
          aria-describedby={error === null ? helpId : `${helpId} ${errorId}`}
          aria-invalid={error !== null}
        />
        <small id={helpId} className="field-help">
          Kept in this tab&apos;s session storage only; closing the tab forgets it.
        </small>
        {error !== null && (
          <p id={errorId} className="callout callout--warning" role="alert">
            <span className="pi pi-exclamation-circle" aria-hidden="true" /> {error}
          </p>
        )}
        <div className="dialog-actions">
          <Button type="button" label="Cancel" outlined onClick={cancel} />
          <Button type="submit" label="Enter admin mode" />
        </div>
      </form>
    </Dialog>
  );
}
