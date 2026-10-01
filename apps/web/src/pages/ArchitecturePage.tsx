import type { ReactNode } from 'react';

import {
  BrowserFigure,
  CostFigure,
  DeployFigure,
  MilestonesFigure,
  SignalFigure,
  SpineFigure,
  TableFigure,
} from './architectureFigures.tsx';

function Figure({ caption, children }: { caption: ReactNode; children: ReactNode }) {
  return (
    <figure className="doc-figure">
      <div className="doc-figure-frame">{children}</div>
      <figcaption>{caption}</figcaption>
    </figure>
  );
}

export default function ArchitecturePage() {
  return (
    <article className="doc">
      <header className="doc-head">
        <h2>How it works</h2>
        <p className="doc-meta">Seven figures, each answering one question</p>
      </header>

      <p className="doc-lede">
        This site is the last step of a pipeline that reads about forty vendor feeds, asks a small
        model whether anything looks like a certification promotion, asks a larger one to check it
        against the vendor&apos;s own page, and publishes what survives. Everything below describes
        what the code does today. Parts that are built but never run are drawn dashed, and the
        second figure is about nothing else.
      </p>

      <div className="doc-legend">
        <span>
          <i className="doc-swatch sw-live" /> the path a promotion actually travels
        </span>
        <span>
          <i className="doc-swatch sw-norm" /> supporting flow
        </span>
        <span>
          <i className="doc-swatch sw-idle" /> built, never fires
        </span>
        <span>
          <i className="doc-swatch sw-owed" /> owed by a later milestone
        </span>
      </div>

      <h3>1 · The spine</h3>
      <p>
        Read it top to bottom. The left column is what starts each step, the middle is what runs,
        the right is what it talks to outside AWS.
      </p>
      <Figure
        caption={
          <>
            <b>Two delays stack.</b> Each source carries its own polling interval, from one hour to
            twelve, and the hourly run fetches only the ones that are due — so a promotion waits one
            to twelve hours to become a signal. The publisher then sweeps every fifteen minutes. The
            dashed box is the honest part: the automated path can only ever write an offer marked
            unverified, and nothing in the deployed system can clear that.
          </>
        }
      >
        <SpineFigure />
      </Figure>

      <h3>2 · Running, idle, and owed</h3>
      <p>
        Three bands: what actually moves, what is fully provisioned and can never fire, and what a
        later milestone still owes.
      </p>
      <Figure
        caption={
          <>
            <b>The chain is broken in one specific place.</b> Events are written as rows in the
            database; nothing forwards them to the notification topic, because the piece that would
            is not built yet. So both subscriptions are wired and dead, and every publish comes from
            the fifteen-minute sweep rather than from a new offer arriving.
          </>
        }
      >
        <MilestonesFigure />
      </Figure>

      <h3>3 · Everything that can happen to one signal</h3>
      <p>
        A signal is one item a source produced. Nine of its eleven endings are quiet, and three are
        silent by design.
      </p>
      <Figure
        caption={
          <>
            <b>Four guards must all pass</b> for an offer to be accepted without a person: the model
            must be confident, no existing offer may already match, the link must be on a domain
            known to belong to that vendor, and the generated id must be free. Even then the offer
            is published marked as not yet checked by a human.
          </>
        }
      >
        <SignalFigure />
      </Figure>

      <h3>4 · One table, one index, one transaction</h3>
      <p>
        Ten kinds of record share a single DynamoDB table and a single secondary index. Every key is
        built in one module, and every change goes through one four-part transaction.
      </p>
      <Figure
        caption={
          <>
            <b>A lease, not a lock.</b> Three jobs each take a lease before running and release it
            after, so two copies of the same job cannot overlap — and each lease lasts exactly as
            long as the job is allowed to run, so a job that dies never holds one forever.
          </>
        }
      >
        <TableFigure />
      </Figure>

      <h3>5 · Two deploy paths, and one commit that skips both</h3>
      <p>
        The site and the infrastructure ship by completely separate mechanisms, and neither is
        triggered by the other. Then there is a third writer that goes around all of it.
      </p>
      <Figure
        caption={
          <>
            <b>Nothing in CI runs on the publisher&apos;s own commits.</b> The data file is excluded
            from the checks that run on a push, and the rest only run on pull requests. The one
            remaining gate is a schema check inside the site build — and if it fails, the site
            simply keeps serving the previous version.
          </>
        }
      >
        <DeployFigure />
      </Figure>

      <h3>6 · Where the money is capped</h3>
      <p>
        Everything on AWS is meant to sit inside the always-free allowances, so the only expected
        spend is the model. Each guard fails closed.
      </p>
      <Figure
        caption={
          <>
            <b>The database is deliberately fixed-capacity rather than on-demand</b>, because
            on-demand can climb past the free ceiling on its own. A write-throttle alarm here is
            read as a design smell, not as a signal to buy more capacity.
          </>
        }
      >
        <CostFigure />
      </Figure>

      <h3>7 · What the browser does</h3>
      <p>
        There is no API and no fetch. The data is a file that was committed into the bundle, checked
        once when the page loads, and narrowed by one lens before any tab sees it.
      </p>
      <Figure
        caption={
          <>
            <b>Every offer the pipeline adds grows the file a visitor downloads.</b> That is the
            trade for having no server at all: the whole dataset ships with the page, and in
            exchange the site costs nothing to run and keeps working offline.
          </>
        }
      >
        <BrowserFigure />
      </Figure>

      <p className="doc-foot">
        The same figures live as Mermaid in <code>docs/architecture.md</code> in the repository,
        where a reviewer sees them change in a diff.
      </p>
    </article>
  );
}
