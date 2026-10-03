import { useId } from 'react';

import { Button } from 'primereact/button';
import { Dialog } from 'primereact/dialog';

import { useAdmin } from './adminContext.ts';

// a stop before the redirect, so a stray Shift+A twice doesn't take anyone off the page
export function AdminDialog() {
  const { dialogOpen, closeDialog, signIn, signingIn, error, config } = useAdmin();
  const signInId = useId();
  const configured = config !== null;

  return (
    <Dialog
      header="Enter admin mode"
      visible={dialogOpen}
      onHide={closeDialog}
      // PrimeReact lands focus on the close icon; signing in is the only thing to do here
      onShow={() => document.getElementById(signInId)?.focus()}
      modal
      draggable={false}
      resizable={false}
      style={{ width: 'min(28rem, 92vw)' }}
    >
      <p className="dialog-lede">
        Unlocks the Review tab, where offers the pipeline found wait to be approved or dismissed.
      </p>
      <div className="dialog-form">
        {configured ? (
          <p className="field-help">
            Signing in happens on a separate page, with a password and an authenticator code, and
            brings you back here. The session lasts half an hour and ends when this tab closes.
          </p>
        ) : (
          <p className="callout callout--warning" role="note">
            <span className="pi pi-exclamation-circle" aria-hidden="true" /> Admin sign-in is not
            set up in this build.
          </p>
        )}
        {error !== null && (
          <p className="callout callout--warning" role="alert">
            <span className="pi pi-exclamation-circle" aria-hidden="true" /> {error}
          </p>
        )}
        <div className="dialog-actions">
          <Button type="button" label="Cancel" outlined onClick={closeDialog} />
          <Button
            id={signInId}
            type="button"
            label="Sign in"
            icon="pi pi-external-link"
            iconPos="right"
            disabled={!configured}
            loading={signingIn}
            onClick={signIn}
          />
        </div>
      </div>
    </Dialog>
  );
}
