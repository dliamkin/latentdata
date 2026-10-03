const CONTACT = 'support@codeyouknow.com';

interface StoreRow {
  key: string;
  where: string;
  what: string;
  when: string;
}

// every key the app writes. If you add one, add it here: this table is the policy.
const STORED: readonly StoreRow[] = [
  {
    key: 'cert-tracker:theme:v1',
    where: 'localStorage',
    what: 'The word light or dark, and nothing else.',
    when: 'When you use the theme button in the top bar.',
  },
  {
    key: 'cert-tracker:tracking:v1',
    where: 'localStorage',
    what: 'Your own notes about offers: a status you picked (applied, in progress, earned, dismissed) and any text you typed in a note field.',
    when: 'On your first visit, as an empty record, and then whenever you set a status or type a note.',
  },
  {
    key: 'cert-tracker:lastVisitAt:v1',
    where: 'localStorage',
    what: 'The date and time of your previous visit, so the Activity tab can draw a line at what is new since.',
    when: 'The first time you open the Activity tab.',
  },
  {
    key: 'cert-tracker:admin-token:v1',
    where: 'sessionStorage',
    what: "The site owner's sign-in token, good for half an hour. It is not created for ordinary visitors.",
    when: 'Only if the owner signs in to admin mode. It is deleted when the tab closes.',
  },
  {
    key: 'cert-tracker:admin-signin:v1',
    where: 'sessionStorage',
    what: 'Two random values that tie a sign-in to the tab that started it. Not created for ordinary visitors.',
    when: 'Only when the owner presses Sign in, and removed as soon as the sign-in page sends them back.',
  },
];

export default function PrivacyPage() {
  return (
    <article className="doc">
      <header className="doc-head">
        <h2>Privacy</h2>
        <p className="doc-meta">Last updated 3 October 2026</p>
      </header>

      <p className="doc-lede">
        LatentData has no accounts, no cookies, no analytics and no server of its own. It is a set
        of static files. Everything it remembers about you is stored in your own browser, stays
        there, and can be erased by you at any time.
      </p>

      <h3>What the site stores in your browser</h3>
      <p>
        Four keys, and only the first three can ever appear for a visitor. None of them is an
        identifier: nothing here distinguishes you from anyone else, and nothing is ever read back
        by us, because there is nowhere for it to be sent.
      </p>
      <div className="doc-scroller">
        <table className="doc-table">
          <thead>
            <tr>
              <th scope="col">Key</th>
              <th scope="col">Where</th>
              <th scope="col">What it holds</th>
              <th scope="col">When it is written</th>
            </tr>
          </thead>
          <tbody>
            {STORED.map((row) => (
              <tr key={row.key}>
                <th scope="row">
                  <code>{row.key}</code>
                </th>
                <td>{row.where}</td>
                <td>{row.what}</td>
                <td>{row.when}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        The site also keeps a copy of its own files (HTML, styles, scripts, fonts and logos) in your
        browser&apos;s cache storage so that it loads quickly and works offline. That cache holds
        only files served from this site. It contains nothing about you.
      </p>

      <h3>What leaves your device</h3>
      <p>
        Nothing that you do on the site. There is no form that submits anywhere, no telemetry, no
        error reporting, and no request to any other company&apos;s servers. The certification data
        you see is not fetched while you browse: it is compiled into the page before it is
        published, so the site works with no further network access at all once it has loaded.
      </p>
      <p>
        The typefaces are served from this site rather than from a font service, so visiting
        LatentData does not tell Google, or anyone else, that you were here.
      </p>

      <h3>Who else is necessarily involved</h3>
      <p>
        The site is hosted on Cloudflare Pages. To send you the page at all, Cloudflare has to
        receive a request from your device, which includes your IP address and the kind of browser
        you are using. That is true of every website you visit, and it is handled under{' '}
        <a
          href="https://www.cloudflare.com/privacypolicy/"
          rel="noreferrer noopener"
          target="_blank"
        >
          Cloudflare&apos;s privacy policy
        </a>
        . We do not add any analytics or visitor measurement on top of it, and we do not look at
        those logs.
      </p>

      <h3>Links to other sites</h3>
      <p>
        Offers link out to the vendor&apos;s own page — Microsoft, AWS, Google Cloud and the rest.
        Once you follow one, you are on their site under their rules, and this policy no longer
        applies. We get nothing back when you do: no click is reported to us, because there is
        nobody here to report it to.
      </p>

      <h3>Erasing what is stored</h3>
      <p>
        Clearing site data for latentdata.org in your browser removes all of it, immediately and
        permanently. You can also dismiss individual offers or clear your notes from the offer row
        itself, and the More menu in the top bar will export your notes to a file if you want to
        keep them. Because none of it was ever sent anywhere, there is nothing left for us to delete
        at our end, and no request you need to make to us.
      </p>

      <h3>Children</h3>
      <p>
        The site is aimed at people pursuing professional certifications. It does not knowingly
        collect anything from anyone, of any age, because it does not collect anything.
      </p>

      <h3>Changes</h3>
      <p>
        If the site ever starts collecting something — an account system, a newsletter, or usage
        measurement — this page will say so before that ships, and the date at the top will change.
        The page lives in the same public repository as the site, so its history is visible to
        anyone.
      </p>

      <h3>Getting in touch</h3>
      <p>
        Questions about any of this go to <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
      </p>
    </article>
  );
}
