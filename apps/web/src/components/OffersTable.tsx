import { useEffect, useId, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { FilterMatchMode, FilterService } from 'primereact/api';
import { Column, type ColumnFilterElementTemplateOptions } from 'primereact/column';
import { DataTable, type DataTableFilterMeta, type DataTableSortMeta } from 'primereact/datatable';
import { Dropdown, type DropdownProps } from 'primereact/dropdown';
import { InputText } from 'primereact/inputtext';
import type {
  PaginatorRowsPerPageDropdownOptions,
  PaginatorTemplateOptions,
} from 'primereact/paginator';
import { ToggleButton } from 'primereact/togglebutton';

import {
  CREDENTIAL_WEIGHTS,
  OFFER_CATEGORIES,
  OFFER_STATUSES,
  WHAT_IS_FREE,
  type CredentialWeight,
  type OfferCategory,
} from '@cert-tracker/core';

import { useAnnouncer } from '../a11y/announcerContext.ts';
import {
  matchesQuickFilter,
  type OfferGroup,
  type OfferRow,
  type QuickFilter,
} from '../data/offers.ts';
import { plural, windowLabel } from '../lib/format.ts';
import {
  CATEGORY_LABELS,
  STATUS_TAGS,
  WEIGHT_TAGS,
  WHAT_IS_FREE_TAGS,
  toOptions,
  type SelectOption,
  type Tone,
} from '../lib/labels.ts';
import { TRACK_STATUSES, isTrackStatus, type TrackStatus } from '../tracking/tracking.ts';
import { useTracking } from '../tracking/trackingContext.ts';
import { OfferExpansion } from './OfferExpansion.tsx';
import { EligibilityTags, StatusTag, WhatIsFreeTag } from './Tags.tsx';

const PAGE_SIZES = [25, 50, 100];
const DEFAULT_PAGE_SIZE = 25;
const ANNOUNCE_DELAY_MS = 400;

const TRACK_LABELS: Record<TrackStatus, string> = {
  applied: 'Applied',
  'in-progress': 'In progress',
  earned: 'Earned',
  dismissed: 'Dismissed',
};

const GROUP_LABELS: Record<OfferGroup, { label: string; tone: Tone }> = {
  ending: { label: 'Ending soon', tone: 'deadline' },
  open: { label: 'Open now', tone: 'accent' },
  later: { label: 'Opening later', tone: 'upcoming' },
  always: { label: 'Always on', tone: 'muted' },
  check: { label: 'Needs a check', tone: 'deadline' },
  expired: { label: 'Expired', tone: 'grey' },
};

// rows stay grouped whatever the visitor sorts by: the group is always the first sort key
const GROUP_SORT: DataTableSortMeta = { field: 'groupRank', order: 1 };
const DEFAULT_SORT: DataTableSortMeta[] = [{ field: 'windowEndSort', order: 1 }];

// PrimeReact's Dropdown has three things a screen reader can land on (a hidden input, a hidden
// <select>, the trigger) and only the first picks up a plain aria-label; the others need pt
function dropdownA11y(label: string): Pick<DropdownProps, 'aria-label' | 'pt'> {
  return {
    'aria-label': label,
    pt: { select: { 'aria-label': label }, trigger: { 'aria-label': label } },
  };
}

// the Offer column folds three filters into one popover; null means "no constraint"
interface OfferFilter {
  name: string | null;
  category: OfferCategory | null;
  weight: CredentialWeight | null;
}

function normalizeOfferFilter(value: OfferFilter): OfferFilter | null {
  return value.name === null && value.category === null && value.weight === null ? null : value;
}

// a custom filter only sees its own cell, so each row carries the three fields as one value
interface TableRow extends OfferRow {
  offerKey: OfferFilter;
}

// registered by hand: PrimeReact only wires a column's filterFunction for uncontrolled filters
FilterService.register('custom_offerKey', (value: OfferFilter, filter: OfferFilter | null) => {
  if (filter === null) return true;
  if (filter.category !== null && value.category !== filter.category) return false;
  if (filter.weight !== null && value.weight !== filter.weight) return false;
  if (filter.name !== null && !(value.name ?? '').toLowerCase().includes(filter.name.toLowerCase()))
    return false;
  return true;
});

interface TableState {
  showExpired: boolean;
  globalFilter: string;
  filters: DataTableFilterMeta;
  // an array, not the keyed object: PrimeReact wants one whenever rows are grouped
  expandedRows: OfferRow[];
  first: number;
  rows: number;
  multiSortMeta: DataTableSortMeta[];
}

type TableAction =
  | { type: 'showExpired'; value: boolean }
  | { type: 'globalFilter'; value: string }
  | { type: 'filters'; value: DataTableFilterMeta }
  | { type: 'expandedRows'; value: OfferRow[] }
  | { type: 'page'; first: number; rows: number }
  | { type: 'sort'; value: DataTableSortMeta[] };

function initialFilters(): DataTableFilterMeta {
  return {
    global: { value: null, matchMode: FilterMatchMode.CONTAINS },
    offerKey: { value: null, matchMode: FilterMatchMode.CUSTOM },
    whatIsFree: { value: null, matchMode: FilterMatchMode.EQUALS },
    derivedStatus: { value: null, matchMode: FilterMatchMode.EQUALS },
  };
}

// the order rows take before the visitor touches anything: by group, then soonest end first
function defaultOrder(a: OfferRow, b: OfferRow): number {
  return a.groupRank - b.groupRank || a.windowEndSort.localeCompare(b.windowEndSort);
}

// a reveal (deep link, "show in offers") is the table's starting point: no filters that could
// hide the row, the row expanded, the page it sits on
function initialState(target: OfferRow | null, index: number): TableState {
  return {
    showExpired: target?.derivedStatus === 'expired',
    globalFilter: '',
    filters: initialFilters(),
    expandedRows: target === null ? [] : [target],
    first: Math.floor(Math.max(index, 0) / DEFAULT_PAGE_SIZE) * DEFAULT_PAGE_SIZE,
    rows: DEFAULT_PAGE_SIZE,
    multiSortMeta: DEFAULT_SORT,
  };
}

function reducer(state: TableState, action: TableAction): TableState {
  switch (action.type) {
    case 'showExpired':
      return { ...state, showExpired: action.value, first: 0 };
    case 'globalFilter':
      return {
        ...state,
        globalFilter: action.value,
        filters: {
          ...state.filters,
          global: {
            value: action.value === '' ? null : action.value,
            matchMode: FilterMatchMode.CONTAINS,
          },
        },
        first: 0,
      };
    case 'filters':
      return { ...state, filters: action.value, first: 0 };
    case 'expandedRows':
      return { ...state, expandedRows: action.value };
    case 'page':
      return { ...state, first: action.first, rows: action.rows };
    case 'sort':
      return { ...state, multiSortMeta: action.value.filter((m) => m.field !== GROUP_SORT.field) };
  }
}

type Counts = Readonly<Record<string, number>>;

function countBy(rows: readonly OfferRow[], pick: (row: OfferRow) => string): Counts {
  const counts: Record<string, number> = {};
  for (const row of rows) counts[pick(row)] = (counts[pick(row)] ?? 0) + 1;
  return counts;
}

function sameCounts(a: Counts, b: Counts): boolean {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((k) => a[k] === b[k]);
}

// a dropdown whose options show how many visible rows carry each value
function CountedDropdown({
  value,
  options,
  counts,
  label,
  onChange,
}: {
  value: string | null;
  options: SelectOption<string>[];
  counts: Counts;
  label: string;
  onChange: (value: string | null) => void;
}) {
  return (
    <Dropdown
      value={value}
      options={options}
      onChange={(event) => {
        onChange((event.value as string | null | undefined) ?? null);
      }}
      placeholder="Any"
      showClear
      itemTemplate={(option: SelectOption<string>) => (
        <span className="filter-option">
          <span>{option.label}</span>
          <span className="filter-count">{counts[option.value] ?? 0}</span>
        </span>
      )}
      {...dropdownA11y(label)}
    />
  );
}

const categoryOptions = toOptions(OFFER_CATEGORIES, (c) => CATEGORY_LABELS[c]);
const weightOptions = toOptions(CREDENTIAL_WEIGHTS, (w) => WEIGHT_TAGS[w].label);
const whatIsFreeOptions = toOptions(WHAT_IS_FREE, (w) => WHAT_IS_FREE_TAGS[w].label);
const statusOptions = toOptions(OFFER_STATUSES, (s) => STATUS_TAGS[s].label);

const paginatorTemplate: PaginatorTemplateOptions = {
  layout: 'CurrentPageReport RowsPerPageDropdown PrevPageLink PageLinks NextPageLink',
  RowsPerPageDropdown: (options: PaginatorRowsPerPageDropdownOptions) => (
    <Dropdown
      value={options.value as number}
      options={options.options as number[]}
      onChange={(event) => {
        if (event.originalEvent) {
          options.onChange({ ...event, originalEvent: event.originalEvent });
        }
      }}
      // the selected option arrives as {label, value}, not the bare number
      valueTemplate={(option: { label: string } | null) => (
        <span>{option?.label ?? ''} per page</span>
      )}
      {...dropdownA11y('Rows per page')}
    />
  ),
};

export interface OffersTableProps {
  rows: OfferRow[];
  quickFilter: QuickFilter | null;
  newIds: ReadonlySet<string>;
  // the parent remounts the table (key) for every new reveal request
  initialReveal: string | null;
  // where the search box and the expired toggle render (the tab row); null until it mounts,
  // undefined to keep them above the table
  toolbarSlot?: HTMLElement | null;
}

export function OffersTable({
  rows,
  quickFilter,
  newIds,
  initialReveal,
  toolbarSlot,
}: OffersTableProps) {
  const revealTarget =
    initialReveal === null ? null : (rows.find((r) => r.id === initialReveal) ?? null);
  const [state, dispatch] = useReducer(reducer, revealTarget, (target) => {
    if (target === null) return initialState(null, 0);
    const ordered = rows
      .filter((row) => target.derivedStatus === 'expired' || row.derivedStatus !== 'expired')
      .sort(defaultOrder);
    return initialState(target, ordered.indexOf(target));
  });
  const { entries, setStatus } = useTracking();
  const { announce } = useAnnouncer();
  const searchId = useId();
  const tableRef = useRef<HTMLDivElement>(null);
  const announceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastAnnounced = useRef<number | null>(null);

  const visible = useMemo(
    () =>
      rows
        .filter(
          (row) =>
            (state.showExpired || row.derivedStatus !== 'expired') &&
            matchesQuickFilter(row, quickFilter, newIds),
        )
        .map((row): TableRow => ({
          ...row,
          offerKey: { name: row.name, category: row.category, weight: row.credentialWeight },
        })),
    [rows, state.showExpired, quickFilter, newIds],
  );

  // group header counts follow the processed rows (onValueChange); PrimeReact only reports
  // those after the first update, so the initial value is counted here, when no column or
  // global filter can be set yet
  const [groupCounts, setGroupCounts] = useState<Counts>(() => countBy(visible, (r) => r.group));

  // the filter popovers show a count per value, taken before the column filters apply
  const valueCounts = useMemo(
    () => ({
      category: countBy(visible, (r) => r.category),
      weight: countBy(visible, (r) => r.credentialWeight),
      whatIsFree: countBy(visible, (r) => r.whatIsFree),
      status: countBy(visible, (r) => r.derivedStatus),
    }),
    [visible],
  );

  // PrimeReact only recounts (onValueChange) when the filters prop changes identity, so a fresh
  // object rides along with every change to the rows we hand it
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const filters = useMemo(() => ({ ...state.filters }), [state.filters, visible]);
  const multiSortMeta = useMemo(() => [GROUP_SORT, ...state.multiSortMeta], [state.multiSortMeta]);

  useEffect(() => {
    if (initialReveal === null) return;
    if (revealTarget === null) {
      announce('That offer is not in the current data.');
      return;
    }
    const cell = tableRef.current?.querySelector<HTMLElement>(`[data-offer-id="${initialReveal}"]`);
    const tr = cell?.closest('tr');
    if (!tr) return;
    tr.tabIndex = -1;
    tr.focus({ preventScroll: true });
    tr.scrollIntoView({ block: 'center' });
    // mount-only on purpose: a reveal is a new mount, see the key in App
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(
    () => () => {
      if (announceTimer.current !== null) clearTimeout(announceTimer.current);
    },
    [],
  );

  const onValueChange = (processed: OfferRow[]): void => {
    const counts = countBy(processed, (r) => r.group);
    setGroupCounts((current) => (sameCounts(current, counts) ? current : counts));
    if (announceTimer.current !== null) clearTimeout(announceTimer.current);
    announceTimer.current = setTimeout(() => {
      if (lastAnnounced.current === processed.length) return;
      lastAnnounced.current = processed.length;
      announce(`${plural(processed.length, 'offer')} shown`);
    }, ANNOUNCE_DELAY_MS);
  };

  const offerFilter = (opts: ColumnFilterElementTemplateOptions): ReactNode => {
    const current = (opts.value as OfferFilter | null) ?? {
      name: null,
      category: null,
      weight: null,
    };
    const apply = (patch: Partial<OfferFilter>): void => {
      opts.filterApplyCallback(normalizeOfferFilter({ ...current, ...patch }));
    };
    return (
      <div className="offer-filter">
        <InputText
          value={current.name ?? ''}
          placeholder="Name contains"
          aria-label="Filter by name"
          onChange={(event) => {
            apply({ name: event.target.value === '' ? null : event.target.value });
          }}
        />
        <span className="field-label" aria-hidden="true">
          Category
        </span>
        <CountedDropdown
          value={current.category}
          options={categoryOptions}
          counts={valueCounts.category}
          label="Filter by category"
          onChange={(value) => {
            apply({ category: value as OfferCategory | null });
          }}
        />
        <span className="field-label" aria-hidden="true">
          Weight
        </span>
        <CountedDropdown
          value={current.weight}
          options={weightOptions}
          counts={valueCounts.weight}
          label="Filter by weight"
          onChange={(value) => {
            apply({ weight: value as CredentialWeight | null });
          }}
        />
      </div>
    );
  };

  const toolbar = (
    <div className="table-toolbar">
      <label htmlFor={searchId} className="sr-only">
        Search offers
      </label>
      <span className="search-field">
        <span className="pi pi-search" aria-hidden="true" />
        <InputText
          id={searchId}
          type="search"
          placeholder="Search name, vendor, certification, exam code"
          value={state.globalFilter}
          onChange={(event) => {
            dispatch({ type: 'globalFilter', value: event.target.value });
          }}
        />
      </span>
      <ToggleButton
        checked={state.showExpired}
        onLabel="Hide expired"
        offLabel="Show expired"
        onIcon="pi pi-eye-slash"
        offIcon="pi pi-eye"
        aria-label="Show expired offers"
        onChange={(event) => {
          dispatch({ type: 'showExpired', value: event.value });
        }}
      />
    </div>
  );

  return (
    <div ref={tableRef} className="offers">
      {toolbarSlot === undefined
        ? toolbar
        : toolbarSlot !== null && createPortal(toolbar, toolbarSlot)}
      <DataTable
        value={visible}
        dataKey="id"
        paginator
        first={state.first}
        rows={state.rows}
        rowsPerPageOptions={PAGE_SIZES}
        onPage={(event) => {
          dispatch({ type: 'page', first: event.first, rows: event.rows });
        }}
        paginatorTemplate={paginatorTemplate}
        currentPageReportTemplate="{first}–{last} of {totalRecords}"
        sortMode="multiple"
        removableSort
        multiSortMeta={multiSortMeta}
        onSort={(event) => {
          dispatch({ type: 'sort', value: event.multiSortMeta ?? [] });
        }}
        rowGroupMode="subheader"
        groupRowsBy="group"
        // PrimeReact emits an empty role=row footer per group even without a footer template
        pt={{ rowGroupFooter: { role: 'presentation', hidden: true } }}
        rowGroupHeaderTemplate={(row: OfferRow) => {
          const spec = GROUP_LABELS[row.group];
          return (
            <span className={`group-label group-label--${spec.tone}`}>
              <span>
                {spec.label} · {groupCounts[row.group] ?? 0}
              </span>
              <span className="group-rule" aria-hidden="true" />
            </span>
          );
        }}
        filterDisplay="menu"
        filters={filters}
        onFilter={(event) => {
          dispatch({ type: 'filters', value: event.filters });
        }}
        globalFilterFields={['name', 'vendor', 'certifications', 'examCode']}
        onValueChange={onValueChange}
        expandedRows={state.expandedRows}
        onRowToggle={(event) => {
          dispatch({ type: 'expandedRows', value: event.data as OfferRow[] });
        }}
        rowExpansionTemplate={(row: OfferRow) => <OfferExpansion row={row} />}
        rowClassName={(row: OfferRow) =>
          [
            'data-row',
            row.whatIsFree === 'training-only' ? 'row-muted' : '',
            state.expandedRows.some((r) => r.id === row.id) ? 'row-expanded' : '',
          ]
            .filter(Boolean)
            .join(' ')
        }
        // stack mode below the md breakpoint; PrimeReact 10 only exposes it through this prop
        // eslint-disable-next-line @typescript-eslint/no-deprecated
        responsiveLayout="stack"
        breakpoint="767px"
        emptyMessage="No offers match."
      >
        <Column
          expander
          header={<span className="sr-only">Details</span>}
          headerStyle={{ width: '2.5rem' }}
          // PrimeReact points aria-controls at an id it never renders; aria-expanded carries the state
          pt={{ rowToggler: { 'aria-controls': undefined } }}
        />
        <Column
          field="name"
          filterField="offerKey"
          header="Offer"
          sortable
          filter
          filterHeader="Filter · Offer"
          filterElement={offerFilter}
          showFilterMatchModes={false}
          showFilterOperator={false}
          showAddButton={false}
          body={(row: OfferRow) => (
            <div className="offer-name" data-offer-id={row.id}>
              <span className="offer-title">
                {row.name}
                {row.isNew && <span className="new-badge">NEW</span>}
              </span>
              <span className="offer-meta">
                {row.vendor} · {CATEGORY_LABELS[row.category]} ·{' '}
                {WEIGHT_TAGS[row.credentialWeight].label} weight
              </span>
            </div>
          )}
        />
        <Column
          field="whatIsFreeRank"
          filterField="whatIsFree"
          header="What's free"
          headerStyle={{ width: '9rem' }}
          sortable
          filter
          filterHeader="Filter · What's free"
          filterElement={(opts) => (
            <CountedDropdown
              value={opts.value as string | null}
              options={whatIsFreeOptions}
              counts={valueCounts.whatIsFree}
              label="Filter by what's free"
              onChange={(value) => {
                opts.filterApplyCallback(value);
              }}
            />
          )}
          showFilterMatchModes={false}
          showFilterOperator={false}
          showAddButton={false}
          body={(row: OfferRow) => <WhatIsFreeTag value={row.whatIsFree} />}
        />
        <Column
          header="Eligibility"
          headerStyle={{ width: '8.5rem' }}
          body={(row: OfferRow) => <EligibilityTags values={row.eligibility} />}
        />
        <Column
          field="windowEndSort"
          header="Window"
          headerStyle={{ width: '11rem' }}
          sortable
          body={(row: OfferRow) => (
            <span className={`mono${row.windowEnd === null ? ' faint' : ''}`}>
              {windowLabel(row.windowStart, row.windowEnd)}
            </span>
          )}
        />
        <Column
          field="derivedStatus"
          header="Status"
          headerStyle={{ width: '9.5rem' }}
          sortable
          filter
          filterHeader="Filter · Status"
          filterElement={(opts) => (
            <CountedDropdown
              value={opts.value as string | null}
              options={statusOptions}
              counts={valueCounts.status}
              label="Filter by status"
              onChange={(value) => {
                opts.filterApplyCallback(value);
              }}
            />
          )}
          showFilterMatchModes={false}
          showFilterOperator={false}
          showAddButton={false}
          body={(row: OfferRow) => (
            <StatusTag
              status={row.derivedStatus}
              expiringSoon={row.expiringSoon}
              daysLeft={row.daysLeft}
            />
          )}
        />
        <Column
          header="Mine"
          headerStyle={{ width: '9rem' }}
          body={(row: OfferRow) => {
            const status = entries[row.id]?.status ?? '';
            return (
              // a native select: one element per row instead of PrimeReact's dozen, and the
              // browser's own keyboard handling
              <select
                className={`status-select${status === '' ? ' status-select--empty' : ''}`}
                aria-label={`My status for ${row.name}`}
                value={status}
                onChange={(event) => {
                  const next = event.target.value;
                  setStatus(row.id, isTrackStatus(next) ? next : null);
                }}
              >
                <option value="">Not tracked</option>
                {TRACK_STATUSES.map((track) => (
                  <option key={track} value={track}>
                    {TRACK_LABELS[track]}
                  </option>
                ))}
              </select>
            );
          }}
        />
        <Column
          header={<span className="sr-only">Link</span>}
          headerStyle={{ width: '2.5rem' }}
          body={(row: OfferRow) => (
            <a
              className="icon-link"
              href={row.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Open ${row.name} offer page`}
            >
              <span className="pi pi-external-link" aria-hidden="true" />
            </a>
          )}
        />
      </DataTable>
    </div>
  );
}
