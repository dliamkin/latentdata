import { useRef, type KeyboardEvent, type ReactNode } from 'react';

import { panelElementId, tabElementId, type TabId } from '../routing/tabs.ts';

export interface TabSpec {
  id: TabId;
  label: string;
  // mono count after the label; the design shows one for Offers and Watch list
  count?: number;
  // a small badge after the label (the admin-only Review tab)
  badge?: string;
}

// a hand-rolled tablist instead of PrimeReact's TabView so the search box can share the row
// (slot) and the tab row can scroll on narrow screens; roving tabindex with arrow keys
export function TabBar({
  tabs,
  active,
  onChange,
  slot,
}: {
  tabs: readonly TabSpec[];
  active: TabId;
  onChange: (tab: TabId) => void;
  slot?: ReactNode;
}) {
  const listRef = useRef<HTMLDivElement>(null);

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>): void => {
    const index = tabs.findIndex((tab) => tab.id === active);
    let next: number | null = null;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    if (next === null) return;
    event.preventDefault();
    const target = tabs[next];
    if (target === undefined) return;
    onChange(target.id);
    listRef.current?.querySelector<HTMLElement>(`#${tabElementId(target.id)}`)?.focus();
  };

  return (
    <div className="tabbar">
      <div className="tabbar-tabs" role="tablist" aria-label="Sections" ref={listRef}>
        {tabs.map((tab) => {
          const selected = tab.id === active;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={tabElementId(tab.id)}
              aria-selected={selected}
              aria-controls={panelElementId(tab.id)}
              tabIndex={selected ? 0 : -1}
              className={selected ? 'tab tab--active' : 'tab'}
              onClick={() => {
                onChange(tab.id);
              }}
              onKeyDown={onKeyDown}
            >
              {tab.label}
              {tab.count !== undefined && <span className="tab-count">{tab.count}</span>}
              {tab.badge !== undefined && <span className="tab-badge">{tab.badge}</span>}
              {selected && <span className="tab-indicator" aria-hidden="true" />}
            </button>
          );
        })}
      </div>
      {slot !== undefined && <div className="tabbar-slot">{slot}</div>}
    </div>
  );
}

export function TabPanel({
  id,
  active,
  children,
}: {
  id: TabId;
  active: TabId;
  children: ReactNode;
}) {
  if (id !== active) return null;
  return (
    <div
      role="tabpanel"
      id={panelElementId(id)}
      aria-labelledby={tabElementId(id)}
      className="tabpanel"
    >
      {children}
    </div>
  );
}
