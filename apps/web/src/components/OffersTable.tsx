import { useEffect, useId, useMemo, useReducer, useRef, type ReactNode } from 'react';

import { FilterMatchMode } from 'primereact/api';
import { Badge } from 'primereact/badge';
import { Column, type ColumnFilterElementTemplateOptions } from 'primereact/column';
import {
  DataTable,
  type DataTableExpandedRows,
  type DataTableFilterMeta,
  type DataTableSortMeta,
} from 'primereact/datatable';
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
} from '@cert-tracker/core';

import { useAnnouncer } from '../a11y/announcerContext.ts';
import { matchesQuickFilter, type OfferRow, type QuickFilter } from '../data/offers.ts';
import { plural, windowLabel } from '../lib/format.ts';
import {
  CATEGORY_LABELS,
  STATUS_TAGS,
  WEIGHT_TAGS,
  WHAT_IS_FREE_TAGS,
  toOptions,
  type SelectOption,
} from '../lib/labels.ts';
import { TRACK_STATUSES, isTrackStatus, type TrackStatus } from '../tracking/tracking.ts';
import { useTracking } from '../tracking/trackingContext.ts';
import { OfferExpansion } from './OfferExpansion.tsx';
import { EligibilityTags, StatusTag, WeightTag, WhatIsFreeTag } from './Tags.tsx';

const PAGE_SIZES = [25, 50, 100];
const DEFAULT_PAGE_SIZE = 25;
const ANNOUNCE_DELAY_MS = 400;

const TRACK_LABELS: Record<TrackStatus, string> = {
  applied: 'Applied',
  'in-progress': 'In progress',
  earned: 'Earned',
  dismissed: 'Dismissed',
};

// PrimeReact's Dropdown has three things a screen reader can land on (a hidden input, a hidden
// <select>, the trigger) and only the first picks up a plain aria-label; the others need pt
function dropdownA11y(label: string): Pick<DropdownProps, 'aria-label' | 'pt'> {
  return {
    'aria-label': label,
    pt: { select: { 'aria-label': label }, trigger: { 'aria-label': label } },
  };
}

interface TableState {
  showExpired: boolean;
  globalFilter: string;
  filters: DataTableFilterMeta;
  expandedRows: DataTableExpandedRows;
  first: number;
  rows: number;
  multiSortMeta: DataTableSortMeta[];
}

type TableAction =
  | { type: 'showExpired'; value: boolean }
  | { type: 'globalFilter'; value: string }
  | { type: 'filters'; value: DataTableFilterMeta }
  | { type: 'expandedRows'; value: DataTableExpandedRows }
  | { type: 'page'; first: number; rows: number }
  | { type: 'sort'; value: DataTableSortMeta[] };

function initialFilters(): DataTableFilterMeta {
  return {
    global: { value: null, matchMode: FilterMatchMode.CONTAINS },
    name: { value: null, matchMode: FilterMatchMode.CONTAINS },
    category: { value: null, matchMode: FilterMatchMode.EQUALS },
    whatIsFree: { value: null, matchMode: FilterMatchMode.EQUALS },
    credentialWeight: { value: null, matchMode: FilterMatchMode.EQUALS },
    derivedStatus: { value: null, matchMode: FilterMatchMode.EQUALS },
  };
}

// a reveal (deep link, "show in offers") is the table's starting point: no filters that could
// hide the row, the row expanded, the page it sits on
function initialState(target: OfferRow | null, index: number): TableState {
  return {
    showExpired: target?.derivedStatus === 'expired',
    globalFilter: '',
    filters: initialFilters(),
    expandedRows: target === null ? {} : { [target.id]: true },
    first: Math.floor(Math.max(index, 0) / DEFAULT_PAGE_SIZE) * DEFAULT_PAGE_SIZE,
    rows: DEFAULT_PAGE_SIZE,
    multiSortMeta: [],
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
      return { ...state, multiSortMeta: action.value };
  }
}

function enumFilter(
  options: SelectOption<string>[],
  name: string,
): (opts: ColumnFilterElementTemplateOptions) => ReactNode {
  return function EnumFilter(opts) {
    return (
      <Dropdown
        value={opts.value as string | null}
        options={options}
        onChange={(event) => {
          opts.filterApplyCallback(event.value as string | null);
        }}
        placeholder="Any"
        showClear
        {...dropdownA11y(`Filter by ${name}`)}
      />
    );
  };
}

const categoryFilter = enumFilter(
  toOptions(OFFER_CATEGORIES, (c) => CATEGORY_LABELS[c]),
  'category',
);
const whatIsFreeFilter = enumFilter(
  toOptions(WHAT_IS_FREE, (w) => WHAT_IS_FREE_TAGS[w].label),
  "what's free",
);
const weightFilter = enumFilter(
  toOptions(CREDENTIAL_WEIGHTS, (w) => WEIGHT_TAGS[w].label),
  'weight',
);
const statusFilter = enumFilter(
  toOptions(OFFER_STATUSES, (s) => STATUS_TAGS[s].label),
  'status',
);

const paginatorTemplate: PaginatorTemplateOptions = {
  layout:
    'FirstPageLink PrevPageLink PageLinks NextPageLink LastPageLink RowsPerPageDropdown CurrentPageReport',
  RowsPerPageDropdown: (options: PaginatorRowsPerPageDropdownOptions) => (
    <Dropdown
      value={options.value as number}
      options={options.options as number[]}
      onChange={(event) => {
        if (event.originalEvent) {
          options.onChange({ ...event, originalEvent: event.originalEvent });
        }
      }}
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
}

export function OffersTable({ rows, quickFilter, newIds, initialReveal }: OffersTableProps) {
  const revealTarget =
    initialReveal === null ? null : (rows.find((r) => r.id === initialReveal) ?? null);
  const [state, dispatch] = useReducer(reducer, revealTarget, (target) =>
    initialState(target, target === null ? 0 : rows.indexOf(target)),
  );
  const { entries, setStatus } = useTracking();
  const { announce } = useAnnouncer();
  const searchId = useId();
  const tableRef = useRef<HTMLDivElement>(null);
  const announceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastAnnounced = useRef<number | null>(null);

  const visible = useMemo(
    () =>
      rows.filter(
        (row) =>
          (state.showExpired || row.derivedStatus !== 'expired') &&
          matchesQuickFilter(row, quickFilter, newIds),
      ),
    [rows, state.showExpired, quickFilter, newIds],
  );

  // PrimeReact only recounts (onValueChange) when the filters prop changes identity, so a fresh
  // object rides along with every change to the rows we hand it
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const filters = useMemo(() => ({ ...state.filters }), [state.filters, visible]);

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
    if (announceTimer.current !== null) clearTimeout(announceTimer.current);
    announceTimer.current = setTimeout(() => {
      if (lastAnnounced.current === processed.length) return;
      lastAnnounced.current = processed.length;
      announce(`${plural(processed.length, 'offer')} shown`);
    }, ANNOUNCE_DELAY_MS);
  };

  const header = (
    <div className="table-toolbar">
      <label htmlFor={searchId} className="sr-only">
        Search offers
      </label>
      <InputText
        id={searchId}
        type="search"
        placeholder="Search name, vendor, certification"
        value={state.globalFilter}
        onChange={(event) => {
          dispatch({ type: 'globalFilter', value: event.target.value });
        }}
      />
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
    <div ref={tableRef}>
      <DataTable
        value={visible}
        dataKey="id"
        header={header}
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
        multiSortMeta={state.multiSortMeta}
        onSort={(event) => {
          dispatch({ type: 'sort', value: event.multiSortMeta ?? [] });
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
          dispatch({ type: 'expandedRows', value: event.data as DataTableExpandedRows });
        }}
        rowExpansionTemplate={(row: OfferRow) => <OfferExpansion row={row} />}
        rowClassName={(row: OfferRow) => (row.whatIsFree === 'training-only' ? 'row-muted' : '')}
        stripedRows
        // stack mode below the md breakpoint; PrimeReact 10 only exposes it through this prop
        // eslint-disable-next-line @typescript-eslint/no-deprecated
        responsiveLayout="stack"
        breakpoint="767px"
        emptyMessage="No offers match."
      >
        <Column
          expander
          header={<span className="sr-only">Details</span>}
          headerStyle={{ width: '3rem' }}
          // PrimeReact points aria-controls at an id it never renders; aria-expanded carries the state
          pt={{ rowToggler: { 'aria-controls': undefined } }}
        />
        <Column
          field="name"
          header="Name"
          sortable
          filter
          filterPlaceholder="Name contains"
          showFilterMatchModes={false}
          showFilterOperator={false}
          showAddButton={false}
          body={(row: OfferRow) => (
            <div className="offer-name" data-offer-id={row.id}>
              <span className="offer-title">
                {row.name}
                {row.isNew && <Badge value="NEW" />}
              </span>
              <span className="offer-vendor">{row.vendor}</span>
            </div>
          )}
        />
        <Column
          field="category"
          header="Category"
          sortable
          filter
          filterElement={categoryFilter}
          showFilterMatchModes={false}
          showFilterOperator={false}
          showAddButton={false}
          body={(row: OfferRow) => CATEGORY_LABELS[row.category]}
        />
        <Column
          field="whatIsFreeRank"
          filterField="whatIsFree"
          header="What's free"
          sortable
          filter
          filterElement={whatIsFreeFilter}
          showFilterMatchModes={false}
          showFilterOperator={false}
          showAddButton={false}
          body={(row: OfferRow) => <WhatIsFreeTag value={row.whatIsFree} />}
        />
        <Column
          field="weightRank"
          filterField="credentialWeight"
          header="Weight"
          sortable
          filter
          filterElement={weightFilter}
          showFilterMatchModes={false}
          showFilterOperator={false}
          showAddButton={false}
          body={(row: OfferRow) => <WeightTag value={row.credentialWeight} />}
        />
        <Column
          header="Eligibility"
          body={(row: OfferRow) => <EligibilityTags values={row.eligibility} />}
        />
        <Column
          field="windowEndSort"
          header="Window"
          sortable
          body={(row: OfferRow) => windowLabel(row.windowStart, row.windowEnd)}
        />
        <Column
          field="derivedStatus"
          header="Status"
          sortable
          filter
          filterElement={statusFilter}
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
          header="My status"
          body={(row: OfferRow) => (
            // a native select: one element per row instead of PrimeReact's dozen, and the
            // browser's own keyboard handling
            <select
              className="p-inputtext p-component status-select"
              aria-label={`My status for ${row.name}`}
              value={entries[row.id]?.status ?? ''}
              onChange={(event) => {
                const next = event.target.value;
                setStatus(row.id, isTrackStatus(next) ? next : null);
              }}
            >
              <option value="">Not tracked</option>
              {TRACK_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {TRACK_LABELS[status]}
                </option>
              ))}
            </select>
          )}
        />
        <Column
          header="Link"
          body={(row: OfferRow) => (
            <a
              className="p-button p-button-text p-button-rounded p-button-icon-only"
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
