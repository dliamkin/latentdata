import { useRef } from 'react';

import { Button } from 'primereact/button';
import { Menu } from 'primereact/menu';
import type { MenuItem } from 'primereact/menuitem';

import { useAnnouncer } from '../a11y/announcerContext.ts';
import { useAdmin } from '../admin/adminContext.ts';
import { formatDateTime, relativeTime } from '../lib/format.ts';
import type { ThemeMode } from '../theme/theme.ts';
import { parseTracking } from '../tracking/tracking.ts';
import { useTracking } from '../tracking/trackingContext.ts';

const MENU_ID = 'topbar-menu';

export function TopBar({
  generatedAt,
  mode,
  onToggleTheme,
  onAbout,
}: {
  generatedAt: string;
  mode: ThemeMode;
  onToggleTheme: () => void;
  onAbout: () => void;
}) {
  const menu = useRef<Menu>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const { exportJson, replaceAll } = useTracking();
  const { announce } = useAnnouncer();
  const { openDialog, active } = useAdmin();

  const exportTracking = (): void => {
    const blob = new Blob([exportJson()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `cert-tracker-tracking-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    announce('Tracking exported');
  };

  const importTracking = async (file: File): Promise<void> => {
    try {
      replaceAll(parseTracking(await file.text()));
      announce('Tracking imported');
    } catch {
      announce('That file is not a tracking export.');
    }
  };

  const items: MenuItem[] = [
    { label: 'Export tracking', icon: 'pi pi-download', command: exportTracking },
    {
      label: 'Import tracking…',
      icon: 'pi pi-upload',
      command: () => fileInput.current?.click(),
    },
    { separator: true },
    {
      label: active ? 'Admin mode is on' : 'Admin…',
      icon: 'pi pi-lock',
      command: openDialog,
      disabled: active,
    },
    { label: 'About', icon: 'pi pi-info-circle', command: onAbout },
  ];

  const nextMode = mode === 'dark' ? 'light' : 'dark';

  return (
    <header className="topbar">
      <h1>Cert Promo Tracker</h1>
      <p className="data-as-of">
        data as of{' '}
        <time dateTime={generatedAt} title={formatDateTime(generatedAt)}>
          {relativeTime(generatedAt)}
        </time>
      </p>
      <span className="spacer" />
      <Button
        icon={mode === 'dark' ? 'pi pi-sun' : 'pi pi-moon'}
        rounded
        text
        aria-label={`Switch to ${nextMode} theme`}
        onClick={onToggleTheme}
        data-testid="theme-toggle"
      />
      <Menu model={items} popup ref={menu} id={MENU_ID} popupAlignment="right" />
      <Button
        icon="pi pi-ellipsis-v"
        rounded
        text
        aria-label="More options"
        aria-haspopup="menu"
        aria-controls={MENU_ID}
        onClick={(event) => menu.current?.toggle(event)}
      />
      <input
        ref={fileInput}
        type="file"
        accept="application/json,.json"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file !== undefined) void importTracking(file);
          event.target.value = '';
        }}
      />
    </header>
  );
}
