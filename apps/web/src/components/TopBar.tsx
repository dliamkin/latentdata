import { useRef } from 'react';

import { Button } from 'primereact/button';
import { Menu } from 'primereact/menu';
import type { MenuItem, MenuItemOptions } from 'primereact/menuitem';

import { useAnnouncer } from '../a11y/announcerContext.ts';
import { useAdmin } from '../admin/adminContext.ts';
import { formatDateTime, relativeTime } from '../lib/format.ts';
import { logoSrc, type ThemeMode } from '../theme/theme.ts';
import { parseTracking } from '../tracking/tracking.ts';
import { useTracking } from '../tracking/trackingContext.ts';

const MENU_ID = 'topbar-menu';

// label plus a muted hint on the right (file type, shortcut); the template replaces the whole
// content block, so it rebuilds the wrapper Lara styles. The <li> around it carries
// role=menuitem, the click handler and the accessible name.
function hinted(hint: string) {
  return function HintedItem(item: MenuItem, options: MenuItemOptions) {
    return (
      <div className="p-menuitem-content">
        <span className={options.className}>
          <span className={options.labelClassName}>{item.label}</span>
          <span className="menu-hint" aria-hidden="true">
            {hint}
          </span>
        </span>
      </div>
    );
  };
}

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
    { label: 'Export tracking', command: exportTracking, template: hinted('.json') },
    { label: 'Import tracking…', command: () => fileInput.current?.click() },
    { separator: true },
    {
      label: active ? 'Admin mode is on' : 'Admin…',
      command: openDialog,
      disabled: active,
      template: active ? undefined : hinted('⇧A ⇧A'),
    },
    { label: 'About', command: onAbout },
  ];

  const nextMode = mode === 'dark' ? 'light' : 'dark';

  return (
    <header className="topbar">
      <div className="topbar-inner">
        <div className="brand">
          <h1 className="brand-logo">
            <img src={logoSrc(mode)} alt="LatentData Cert Promo Tracker" width={123} height={40} />
          </h1>
          <span className="brand-divider" aria-hidden="true" />
          <p className="tagline">
            Free and discounted IT certification exams, checked against each vendor&apos;s own page.
          </p>
        </div>
        <div className="topbar-tools">
          <p className="data-as-of">
            data as of{' '}
            <time dateTime={generatedAt} title={formatDateTime(generatedAt)}>
              {relativeTime(generatedAt)}
            </time>
          </p>
          <Button
            outlined
            size="small"
            icon={mode === 'dark' ? 'pi pi-sun' : 'pi pi-moon'}
            label={mode === 'dark' ? 'Light' : 'Dark'}
            aria-label={`Switch to ${nextMode} theme`}
            title={`Switch to the ${nextMode} theme`}
            onClick={onToggleTheme}
            data-testid="theme-toggle"
          />
          <Menu model={items} popup ref={menu} id={MENU_ID} popupAlignment="right" />
          <Button
            outlined
            size="small"
            icon="pi pi-ellipsis-v"
            aria-label="More options"
            title="Export or import tracking, admin, about"
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
        </div>
      </div>
    </header>
  );
}
