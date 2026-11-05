const CONTACT = 'support@codeyouknow.com';
// Google's terms ask every site that uses Analytics to link this page
const GOOGLE_PARTNER_SITES = 'https://policies.google.com/technologies/partner-sites';
const GOOGLE_OPT_OUT = 'https://tools.google.com/dlpage/gaoptout';

interface StoreRow {
  key: string;
  where: string;
  what: string;
  when: string;
}

// every key the app writes and every cookie it lets Google Analytics write. If you add one, add it
// here: this table is the policy.
const STORED: readonly StoreRow[] = [
  {
    key: 'cert-tracker:theme:v1',
    where: 'localStorage',
    what: 'The word light or dark, and nothing else.',
    when: 'When you use the theme button in the top bar.',
  },
  {
    key: 'cert-tracker:claim:v1',
    where: 'localStorage',
    what: 'The groups you said you belong to (student, partner, customer, event attendee, eligible for aid), so offers you cannot claim stay hidden.',
    when: 'When you press one of the "I am" buttons above the summary numbers. Pressing it again removes it.',
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
    key: '_ga',
    where: 'cookie',
    what: 'A random number that Google Analytics uses to count a returning browser once rather than as a new visitor each time. It is not your name, your email or anything else about you: the site has none of those.',
    when: 'When a page loads, by the Google Analytics script. It lasts two years from your last visit.',
  },
  {
    key: '_ga_EKTCZ42NYH',
    where: 'cookie',
    what: "Google Analytics' record of your current visit: when it started and how many pages it has counted so far.",
    when: 'When a page loads, by the Google Analytics script. It lasts two years from your last visit.',
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
        <p className="doc-meta">Last updated 5 November 2026</p>
      </header>

      <p className="doc-lede">
        LatentData has no accounts and no server of its own. It is a set of static files. It uses
        Google Analytics to count visits, which sets two cookies, described below. Everything else
        it remembers about you is stored in your own browser, stays there, and can be erased by you
        at any time.
      </p>

      <h3>What the site stores in your browser</h3>
      <p>
        Eight entries. Four are keys any visitor may get, two are the Google Analytics cookies, and
        the last two appear only when the site owner signs in. The keys are not identifiers: nothing
        in them tells you apart from anyone else, and we never read them back, because they never
        leave your browser. The first cookie is an identifier, a random number, so that Google
        Analytics counts a returning browser once rather than twice. Neither cookie carries a name,
        an email or anything else about you: the site has none of those to put in it.
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
        Two things. The first is the request that fetches the page, which goes to Cloudflare and is
        covered below. The second is a set of usage figures sent to Google Analytics each time a
        page loads and each time you move between tabs: the address and title of the page you are
        on, the page that sent you here, your screen size, browser, operating system and language,
        the random number from the <code>_ga</code> cookie, and your IP address, which Google uses
        to work out a rough location, to the city at best, and says it does not keep. With the
        standard settings, which are the ones in use, Google Analytics also notes when you scroll
        most of the way down a page and when you follow a link to another site, including which
        link.
      </p>
      <p>
        None of that includes anything you type or choose. Your notes, your statuses and the groups
        you say you belong to stay in your browser and are sent neither to Google nor to us. We see
        the figures only as counts: how many visits, from which countries, on which tabs, to which
        offers. There is no form that submits anywhere and no error reporting. The certification
        data you see is not fetched while you browse: it is compiled into the page before it is
        published.
      </p>
      <p>
        The typefaces are served from this site rather than from a font service. Google Analytics is
        the only other company your browser talks to while you are here.
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
        . We do not look at those logs.
      </p>
      <p>
        Google receives the usage figures described above and keeps them for us. Google explains{' '}
        <a href={GOOGLE_PARTNER_SITES} rel="noreferrer noopener" target="_blank">
          how it uses data from sites that use its services
        </a>
        , and the rest is under Google&apos;s privacy policy. Google Analytics keeps the individual
        records for two months; after that only the totals remain.
      </p>

      <h3>Links to other sites</h3>
      <p>
        Offers link out to the vendor&apos;s own page — Microsoft, AWS, Google Cloud and the rest.
        Once you follow one, you are on their site under their rules, and this policy no longer
        applies. The one thing recorded when you do is a line in the Google Analytics figures saying
        that a link to that address was followed, so we can see which offers people actually use.
        The vendor tells us nothing, and we tell the vendor nothing.
      </p>

      <h3>Erasing what is stored</h3>
      <p>
        Clearing site data for latentdata.org in your browser removes all of it, the keys and the
        cookies alike, immediately and permanently. You can also dismiss individual offers or clear
        your notes from the offer row itself, and the More menu in the top bar will export your
        notes to a file if you want to keep them.
      </p>
      <p>
        The figures already counted by Google Analytics cannot be traced back to you by us. They
        carry no name, email or account, so we have no way to pick out the ones that were yours, and
        Google deletes the individual records after two months. To keep your browser out of the
        count altogether, use{' '}
        <a href={GOOGLE_OPT_OUT} rel="noreferrer noopener" target="_blank">
          Google&apos;s opt-out add-on
        </a>{' '}
        or any content blocker. The site works exactly the same without the script.
      </p>

      <h3>Children</h3>
      <p>
        The site is aimed at people pursuing professional certifications. It does not knowingly
        collect personal information from anyone, of any age: the usage figures carry no name, email
        or account, and nothing you type leaves your browser.
      </p>

      <h3>Changes</h3>
      <p>
        This page used to say the site had no analytics. Google Analytics arrived with the update
        dated at the top of this page, and the page changed in the same release. If the site ever
        starts collecting anything more — an account system, a newsletter — this page will say so
        before that ships, and the date at the top will change. The page lives in the same public
        repository as the site, so its history is visible to anyone.
      </p>

      <h3>Getting in touch</h3>
      <p>
        Questions about any of this go to <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
      </p>
    </article>
  );
}
