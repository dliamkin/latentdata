import { useMemo, useState } from 'react';

import { Dropdown } from 'primereact/dropdown';
import { ToggleButton } from 'primereact/togglebutton';

import type { CatalogKind, Technology } from '@cert-tracker/core';

import { dropdownA11y } from '../a11y/dropdown.ts';
import {
  groupCatalog,
  matchesCatalogFilter,
  savingUsd,
  summarizeCatalog,
  type CatalogRow,
} from '../data/catalog.ts';
import { technologyCounts } from '../data/offers.ts';
import { priceLabel } from '../lib/format.ts';
import {
  CATALOG_KIND_LABELS,
  CATEGORY_LABELS,
  COVERAGE_TAGS,
  TECHNOLOGY_LABELS,
} from '../lib/labels.ts';
import { Segmented } from './Segmented.tsx';
import { Mark } from './Tags.tsx';
import { VendorMark } from './VendorMark.tsx';

type KindChoice = CatalogKind | 'all';

const KIND_OPTIONS = [
  { value: 'all' as const, label: 'All' },
  { value: 'exam' as const, label: 'Exams' },
  { value: 'course' as const, label: 'Courses' },
];

export function CatalogView({
  rows,
  onReveal,
}: {
  rows: CatalogRow[];
  onReveal: (offerId: string) => void;
}) {
  const [kind, setKind] = useState<KindChoice>('all');
  const [technology, setTechnology] = useState<Technology | null>(null);
  const [coveredOnly, setCoveredOnly] = useState(false);

  // the technology list is built before the technology filter applies, so a reader can always
  // switch to another one without clearing this one first
  const beforeTechnology = useMemo(
    () =>
      rows.filter((row) =>
        matchesCatalogFilter(row, {
          technology: null,
          kind: kind === 'all' ? null : kind,
          coveredOnly,
        }),
      ),
    [rows, kind, coveredOnly],
  );
  const visible = useMemo(
    () =>
      beforeTechnology.filter(
        (row) => technology === null || row.technologies.includes(technology),
      ),
    [beforeTechnology, technology],
  );

  const counts = summarizeCatalog(visible);
  const groups = useMemo(() => groupCatalog(visible), [visible]);
  const technologyOptions = useMemo(
    () =>
      technologyCounts(beforeTechnology).map(({ technology: id, count }) => ({
        value: id,
        label: TECHNOLOGY_LABELS[id],
        count,
      })),
    [beforeTechnology],
  );

  return (
    <section className="catalog" aria-labelledby="catalog-heading">
      <div className="panel-head">
        <div>
          <h2 id="catalog-heading" className="section-title">
            What people ask for <span className="section-count">· {counts.total}</span>
          </h2>
          <p className="section-lede">
            The certifications and course certificates most often asked for, whether or not an offer
            covers one today. {counts.freeNow} free right now, {counts.covered} with any live offer.
          </p>
        </div>
        <div className="catalog-controls">
          <Segmented
            label="Credential kind"
            value={kind}
            onChange={setKind}
            options={KIND_OPTIONS}
          />
          <Dropdown
            value={technology}
            options={technologyOptions}
            onChange={(event) => {
              setTechnology((event.value as Technology | null | undefined) ?? null);
            }}
            placeholder="Any technology"
            showClear
            itemTemplate={(option: { label: string; count: number }) => (
              <span className="filter-option">
                <span>{option.label}</span>
                <span className="filter-count">{option.count}</span>
              </span>
            )}
            {...dropdownA11y('Filter by technology')}
          />
          <ToggleButton
            checked={coveredOnly}
            onLabel="Offer now only"
            offLabel="Offer now only"
            onIcon="pi pi-filter-fill"
            offIcon="pi pi-filter"
            aria-label="Show only credentials with an offer right now"
            onChange={(event) => {
              setCoveredOnly(event.value);
            }}
          />
        </div>
      </div>

      {groups.length === 0 ? (
        <p className="empty-state">No certifications match.</p>
      ) : (
        groups.map((group) => (
          <section
            key={group.category}
            className="catalog-group"
            aria-label={CATEGORY_LABELS[group.category]}
          >
            <h3 className="group-label group-label--accent">
              <span>
                {CATEGORY_LABELS[group.category]} · {group.rows.length}
              </span>
              <span className="group-rule" aria-hidden="true" />
            </h3>
            <ul className="catalog-list">
              {group.rows.map((row) => {
                const best = row.offers[0];
                const saving = savingUsd(row);
                return (
                  <li key={row.id} className="catalog-row">
                    <div className="offer-cell">
                      <VendorMark vendor={row.vendor} />
                      <div className="offer-name">
                        <span className="offer-title">
                          {row.name}
                          {row.kind === 'course' && (
                            <span className="kind-badge">{CATALOG_KIND_LABELS.course}</span>
                          )}
                        </span>
                        <span className="offer-meta">
                          {[
                            row.vendor,
                            row.examCode,
                            row.technologies.map((id) => TECHNOLOGY_LABELS[id]).join(', ') || null,
                          ]
                            .filter((part): part is string => part !== null && part !== '')
                            .join(' · ')}
                        </span>
                      </div>
                    </div>
                    <div className="catalog-price">
                      <span className="mono">{priceLabel(row.listPriceUsd)}</span>
                      {row.priceNote !== '' && <span className="faint">{row.priceNote}</span>}
                    </div>
                    <div className="catalog-coverage">
                      <Mark
                        icon={COVERAGE_TAGS[row.coverage].icon}
                        tone={COVERAGE_TAGS[row.coverage].tone}
                        strong={COVERAGE_TAGS[row.coverage].strong === true}
                      >
                        {COVERAGE_TAGS[row.coverage].label}
                      </Mark>
                      {best !== undefined && (
                        <button
                          type="button"
                          className="text-link"
                          title={
                            best.match === 'vendor-wide'
                              ? `This offer covers any ${row.vendor} exam`
                              : 'Show this offer in the Offers tab'
                          }
                          onClick={() => {
                            onReveal(best.row.id);
                          }}
                        >
                          {best.row.name} <span className="pi pi-arrow-right" aria-hidden="true" />
                        </button>
                      )}
                      {saving !== null && (
                        <span className="faint">Saves {priceLabel(saving)} today</span>
                      )}
                    </div>
                    <a
                      className="icon-link"
                      href={row.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Open the ${row.name} certification page`}
                      title="Open the official certification page"
                    >
                      <span className="pi pi-external-link" aria-hidden="true" />
                    </a>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </section>
  );
}
