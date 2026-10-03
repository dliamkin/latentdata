// The architecture figures. Hand-drawn inline SVG rather than a diagramming library: these
// never change at runtime, so a parser in the bundle would buy nothing, and drawing them by hand
// lets every stroke take its colour from the Grove tokens in styles/tokens.css. Each figure states
// one claim; the prose that frames them lives in ArchitecturePage.tsx.
//
// Marker ids are per-figure (f1h, f2h, …) because several figures can be in the DOM at once.

export function SpineFigure() {
  return (
    <svg
      className="d"
      viewBox="0 0 880 800"
      role="img"
      aria-label="A top-to-bottom pipeline: an hourly scheduler starts poll, which fetches only due sources from 42 feeds; poll writes signal rows and enqueues them to the triage queue; triage calls Haiku and enqueues those scoring at least 0.6 to the verify queue; verify fetches the page and calls Sonnet, then writes either an unverified offer or a candidate to one DynamoDB table; a 15-minute scheduler runs publish, which commits a snapshot to GitHub main, and Cloudflare Pages rebuilds latentdata.org. A dashed arrow shows that promoting an unverified offer requires a person and no code for it exists."
    >
      <defs>
        <marker
          id="f1h"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <polygon className="hd" points="0,1 10,5 0,9" />
        </marker>
        <marker
          id="f1ha"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <polygon className="hda" points="0,1 10,5 0,9" />
        </marker>
        <marker
          id="f1hw"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <polygon className="hdw" points="0,1 10,5 0,9" />
        </marker>
      </defs>

      <text className="band" x="20" y="24">
        WHAT STARTS IT
      </text>
      <text className="band" x="325" y="24">
        WHAT RUNS
      </text>
      <text className="band" x="655" y="24">
        WHAT IT TALKS TO
      </text>

      {/* row 1: poll */}
      <rect className="box-s" x="20" y="46" width="160" height="40" rx="6" />
      <text className="t" x="100" y="63" textAnchor="middle">
        Scheduler
      </text>
      <text className="ts" x="100" y="78" textAnchor="middle">
        cron 7 * * * ? *
      </text>

      <rect className="box-a" x="325" y="40" width="230" height="52" rx="6" />
      <text className="t" x="440" y="62" textAnchor="middle">
        poll
      </text>
      <text className="ts" x="440" y="79" textAnchor="middle">
        512 MB · 5 min · lease 300 s
      </text>

      <rect className="box" x="655" y="36" width="205" height="60" rx="6" />
      <text className="t" x="757" y="56" textAnchor="middle">
        52 sources, 47 enabled
      </text>
      <text className="ts" x="757" y="72" textAnchor="middle">
        18 RSS · 23 page-diff
      </text>
      <text className="ts" x="757" y="86" textAnchor="middle">
        9 Reddit · 2 GitHub
      </text>

      <line className="e" x1="182" y1="66" x2="317" y2="66" markerEnd="url(#f1h)" />
      <line className="e" x1="557" y1="56" x2="647" y2="56" markerEnd="url(#f1h)" />
      <text className="el" x="602" y="48" textAnchor="middle">
        due ones only
      </text>
      <line className="e" x1="647" y1="78" x2="557" y2="78" markerEnd="url(#f1h)" />
      <text className="el" x="602" y="95" textAnchor="middle">
        items
      </text>

      {/* row 2: triage queue */}
      <rect className="box" x="325" y="134" width="230" height="52" rx="6" />
      <text className="t" x="440" y="156" textAnchor="middle">
        SQS triage
      </text>
      <text className="ts" x="440" y="173" textAnchor="middle">
        vis 720 s · batch 10 · conc 2
      </text>
      <line className="ea" x1="440" y1="92" x2="440" y2="128" markerEnd="url(#f1ha)" />
      <text className="ela" x="452" y="114">
        only rows the conditional put created
      </text>

      {/* row 3: triage */}
      <rect className="box-s" x="20" y="234" width="160" height="40" rx="6" />
      <text className="t" x="100" y="251" textAnchor="middle">
        budget guard
      </text>
      <text className="ts" x="100" y="266" textAnchor="middle">
        $1 / day, fails closed
      </text>

      <rect className="box-a" x="325" y="228" width="230" height="52" rx="6" />
      <text className="t" x="440" y="250" textAnchor="middle">
        triage
      </text>
      <text className="ts" x="440" y="267" textAnchor="middle">
        256 MB · 2 min
      </text>

      <rect className="box" x="655" y="230" width="205" height="48" rx="6" />
      <text className="t" x="757" y="250" textAnchor="middle">
        claude-haiku-4-5
      </text>
      <text className="ts" x="757" y="266" textAnchor="middle">
        one call per batch of 10
      </text>

      <line className="ea" x1="440" y1="186" x2="440" y2="222" markerEnd="url(#f1ha)" />
      <line className="e" x1="182" y1="254" x2="317" y2="254" markerEnd="url(#f1h)" />
      <line className="e" x1="557" y1="254" x2="647" y2="254" markerEnd="url(#f1h)" />

      {/* row 4: verify queue */}
      <rect className="box" x="325" y="322" width="230" height="52" rx="6" />
      <text className="t" x="440" y="344" textAnchor="middle">
        SQS verify
      </text>
      <text className="ts" x="440" y="361" textAnchor="middle">
        vis 1080 s · batch 1 · conc 2
      </text>
      <line className="ea" x1="440" y1="280" x2="440" y2="316" markerEnd="url(#f1ha)" />
      <text className="ela" x="452" y="302">
        relevant AND confidence ≥ 0.6
      </text>

      {/* row 5: verify */}
      <rect className="box-a" x="325" y="416" width="230" height="52" rx="6" />
      <text className="t" x="440" y="438" textAnchor="middle">
        verify
      </text>
      <text className="ts" x="440" y="455" textAnchor="middle">
        512 MB · 3 min
      </text>

      <rect className="box" x="655" y="412" width="205" height="60" rx="6" />
      <text className="t" x="757" y="432" textAnchor="middle">
        claude-sonnet-5-5
      </text>
      <text className="ts" x="757" y="448" textAnchor="middle">
        the page + up to 2 links,
      </text>
      <text className="ts" x="757" y="462" textAnchor="middle">
        capped at 12 000 chars
      </text>

      <line className="ea" x1="440" y1="374" x2="440" y2="410" markerEnd="url(#f1ha)" />
      <line className="e" x1="557" y1="442" x2="647" y2="442" markerEnd="url(#f1h)" />

      {/* row 6: table */}
      <rect className="box-s" x="20" y="516" width="160" height="40" rx="6" />
      <text className="t" x="100" y="533" textAnchor="middle">
        status
      </text>
      <text className="ts" x="100" y="548" textAnchor="middle">
        daily 04:17 UTC
      </text>

      <rect className="box-a" x="325" y="510" width="230" height="52" rx="6" />
      <text className="t" x="440" y="532" textAnchor="middle">
        DynamoDB, one table
      </text>
      <text className="ts" x="440" y="549" textAnchor="middle">
        5+5 RCU/WCU · GSI1 3+3
      </text>

      <line className="ea" x1="440" y1="468" x2="440" y2="504" markerEnd="url(#f1ha)" />
      <text className="ela" x="452" y="490">
        an OFFER at status 'unverified', or a CANDIDATE
      </text>
      <line className="e" x1="182" y1="536" x2="317" y2="536" markerEnd="url(#f1h)" />

      {/* row 7: publish */}
      <rect className="box-s" x="20" y="610" width="160" height="40" rx="6" />
      <text className="t" x="100" y="627" textAnchor="middle">
        Scheduler
      </text>
      <text className="ts" x="100" y="642" textAnchor="middle">
        rate 15 minutes
      </text>

      <rect className="box-a" x="325" y="604" width="230" height="52" rx="6" />
      <text className="t" x="440" y="626" textAnchor="middle">
        publish
      </text>
      <text className="ts" x="440" y="643" textAnchor="middle">
        256 MB · 2 min · lease 120 s
      </text>

      <line className="ea" x1="440" y1="562" x2="440" y2="598" markerEnd="url(#f1ha)" />
      <text className="ela" x="428" y="584" textAnchor="end">
        is lastChangeAt newer than lastPublishedAt?
      </text>
      <line className="e" x1="182" y1="630" x2="317" y2="630" markerEnd="url(#f1h)" />

      {/* row 8: main + pages */}
      <rect className="box-a" x="325" y="698" width="230" height="52" rx="6" />
      <text className="t" x="440" y="720" textAnchor="middle">
        GitHub main
      </text>
      <text className="ts" x="440" y="737" textAnchor="middle">
        apps/web/src/data/snapshot.json
      </text>

      <rect className="box" x="655" y="700" width="205" height="48" rx="6" />
      <text className="t" x="757" y="720" textAnchor="middle">
        Cloudflare Pages
      </text>
      <text className="ts" x="757" y="736" textAnchor="middle">
        latentdata.org
      </text>

      <line className="ea" x1="440" y1="656" x2="440" y2="692" markerEnd="url(#f1ha)" />
      <text className="ela" x="452" y="678">
        GitHub App commit · at most 200 a month
      </text>
      <line className="ea" x1="557" y1="724" x2="647" y2="724" markerEnd="url(#f1ha)" />
      <text className="ela" x="602" y="716" textAnchor="middle">
        push
      </text>

      {/* the human gap */}
      <rect className="box-w" x="617" y="526" width="243" height="60" rx="6" />
      <text className="t" x="738" y="546" textAnchor="middle">
        a person
      </text>
      <text className="ts" x="738" y="562" textAnchor="middle">
        promote 'unverified' → 'active'
      </text>
      <text className="ts" x="738" y="576" textAnchor="middle">
        no code can do this (M4)
      </text>
      <path className="ew" d="M617 556 L580 556 L580 540 L563 540" markerEnd="url(#f1hw)" />
    </svg>
  );
}

export function MilestonesFigure() {
  return (
    <svg
      className="d"
      viewBox="0 0 880 430"
      role="img"
      aria-label="Three bands. Running: poll, SQS triage, triage, SQS verify, verify, one table, publish, main, Pages. Built but never fires: the DynamoDB stream with no consumer, the SNS events topic with no publisher, the publish queue which is always empty, and the notify queue which has no consumer Lambda. Owed by milestones four and five: the outbox Lambda, the notify Lambda, the digest Lambda, the admin HTTP API and the candidate review interface."
    >
      <defs>
        <marker
          id="f2h"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <polygon className="hda" points="0,1 10,5 0,9" />
        </marker>
        <marker
          id="f2hi"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <polygon className="hdi" points="0,1 10,5 0,9" />
        </marker>
      </defs>

      <text className="band" x="20" y="22">
        RUNNING
      </text>
      <rect className="box-a" x="20" y="34" width="118" height="44" rx="6" />
      <text className="t" x="79" y="61" textAnchor="middle">
        poll
      </text>
      <rect className="box-a" x="162" y="34" width="118" height="44" rx="6" />
      <text className="t" x="221" y="61" textAnchor="middle">
        SQS triage
      </text>
      <rect className="box-a" x="304" y="34" width="118" height="44" rx="6" />
      <text className="t" x="363" y="61" textAnchor="middle">
        triage
      </text>
      <rect className="box-a" x="446" y="34" width="118" height="44" rx="6" />
      <text className="t" x="505" y="61" textAnchor="middle">
        SQS verify
      </text>
      <rect className="box-a" x="588" y="34" width="118" height="44" rx="6" />
      <text className="t" x="647" y="61" textAnchor="middle">
        verify
      </text>
      <rect className="box-a" x="730" y="34" width="130" height="44" rx="6" />
      <text className="t" x="795" y="61" textAnchor="middle">
        one table
      </text>
      <line className="ea" x1="140" y1="56" x2="155" y2="56" markerEnd="url(#f2h)" />
      <line className="ea" x1="282" y1="56" x2="297" y2="56" markerEnd="url(#f2h)" />
      <line className="ea" x1="424" y1="56" x2="439" y2="56" markerEnd="url(#f2h)" />
      <line className="ea" x1="566" y1="56" x2="581" y2="56" markerEnd="url(#f2h)" />
      <line className="ea" x1="708" y1="56" x2="723" y2="56" markerEnd="url(#f2h)" />

      <rect className="box-a" x="304" y="100" width="118" height="44" rx="6" />
      <text className="t" x="363" y="127" textAnchor="middle">
        publish
      </text>
      <rect className="box-a" x="446" y="100" width="118" height="44" rx="6" />
      <text className="t" x="505" y="127" textAnchor="middle">
        main
      </text>
      <rect className="box-a" x="588" y="100" width="118" height="44" rx="6" />
      <text className="t" x="647" y="127" textAnchor="middle">
        Pages
      </text>
      <rect className="box-a" x="162" y="100" width="118" height="44" rx="6" />
      <text className="t" x="221" y="127" textAnchor="middle">
        status
      </text>
      <path className="ea" d="M795 80 L795 122 L570 122" markerEnd="url(#f2h)" />
      <line className="ea" x1="424" y1="122" x2="439" y2="122" markerEnd="url(#f2h)" />
      <line className="ea" x1="566" y1="122" x2="581" y2="122" markerEnd="url(#f2h)" />
      <path className="ea" d="M280 122 L292 122" markerEnd="url(#f2h)" />

      <line className="rule" x1="20" y1="170" x2="860" y2="170" />

      <text className="band" x="20" y="196">
        BUILT, PROVISIONED, NEVER FIRES
      </text>
      <rect className="box-i" x="20" y="208" width="195" height="58" rx="6" />
      <text className="t" x="117" y="229" textAnchor="middle">
        table stream
      </text>
      <text className="ts" x="117" y="245" textAnchor="middle">
        NEW_AND_OLD_IMAGES
      </text>
      <text className="ts" x="117" y="259" textAnchor="middle">
        no consumer, still billed
      </text>

      <rect className="box-i" x="238" y="208" width="195" height="58" rx="6" />
      <text className="t" x="335" y="229" textAnchor="middle">
        SNS events topic
      </text>
      <text className="ts" x="335" y="245" textAnchor="middle">
        nothing is granted
      </text>
      <text className="ts" x="335" y="259" textAnchor="middle">
        sns:Publish
      </text>

      <rect className="box-i" x="456" y="208" width="186" height="58" rx="6" />
      <text className="t" x="549" y="229" textAnchor="middle">
        SQS publish
      </text>
      <text className="ts" x="549" y="245" textAnchor="middle">
        subscribed, filtered,
      </text>
      <text className="ts" x="549" y="259" textAnchor="middle">
        always empty
      </text>

      <rect className="box-i" x="665" y="208" width="195" height="58" rx="6" />
      <text className="t" x="762" y="229" textAnchor="middle">
        SQS notify
      </text>
      <text className="ts" x="762" y="245" textAnchor="middle">
        subscribed,
      </text>
      <text className="ts" x="762" y="259" textAnchor="middle">
        no consumer λ
      </text>

      <line className="ei" x1="435" y1="228" x2="450" y2="228" markerEnd="url(#f2hi)" />
      <path
        className="ei"
        d="M433 252 L444 252 L444 280 L700 280 L700 270"
        markerEnd="url(#f2hi)"
      />

      <line className="rule" x1="20" y1="310" x2="860" y2="310" />

      <text className="band" x="20" y="336">
        OWED BY M4 AND M5
      </text>
      <rect className="box-w" x="20" y="348" width="150" height="46" rx="6" />
      <text className="t" x="95" y="369" textAnchor="middle">
        outbox λ
      </text>
      <text className="ts" x="95" y="384" textAnchor="middle">
        the missing publisher
      </text>
      <rect className="box-w" x="190" y="348" width="160" height="46" rx="6" />
      <text className="t" x="270" y="369" textAnchor="middle">
        notify λ
      </text>
      <text className="ts" x="270" y="384" textAnchor="middle">
        ntfy · Push · SES
      </text>
      <rect className="box-w" x="370" y="348" width="140" height="46" rx="6" />
      <text className="t" x="440" y="369" textAnchor="middle">
        digest λ
      </text>
      <text className="ts" x="440" y="384" textAnchor="middle">
        daily 13:00
      </text>
      <rect className="box-w" x="530" y="348" width="150" height="46" rx="6" />
      <text className="t" x="605" y="369" textAnchor="middle">
        admin HTTP API
      </text>
      <text className="ts" x="605" y="384" textAnchor="middle">
        M4
      </text>
      <rect className="box-w" x="700" y="348" width="160" height="46" rx="6" />
      <text className="t" x="780" y="369" textAnchor="middle">
        review UI
      </text>
      <text className="ts" x="780" y="384" textAnchor="middle">
        approves candidates
      </text>
    </svg>
  );
}

export function SignalFigure() {
  return (
    <svg
      className="d"
      viewBox="0 0 880 600"
      role="img"
      aria-label="A decision tree for one signal. The keyword prefilter or a seen fingerprint drops it. Otherwise a signal row is created, or parked as deferred when the daily LLM cap is reached, returning only after midnight UTC. Triage either stalls it below 0.6 confidence, fails it on a refusal, or queues it. Verify either finds no offer, fails on an unreachable page, writes an offer when all four guards pass, or parks a candidate. Both of the last two terminate needing a person."
    >
      <defs>
        <marker
          id="f3h"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <polygon className="hd" points="0,1 10,5 0,9" />
        </marker>
        <marker
          id="f3ha"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <polygon className="hda" points="0,1 10,5 0,9" />
        </marker>
        <marker
          id="f3hw"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <polygon className="hdw" points="0,1 10,5 0,9" />
        </marker>
      </defs>

      <rect className="box" x="300" y="24" width="200" height="44" rx="6" />
      <text className="t" x="400" y="51" textAnchor="middle">
        an item from a source
      </text>

      <rect className="box-a" x="300" y="112" width="200" height="52" rx="6" />
      <text className="t" x="400" y="134" textAnchor="middle">
        prefilter + fingerprint
      </text>
      <text className="ts" x="400" y="151" textAnchor="middle">
        22 include · 11 exclude
      </text>
      <line className="ea" x1="400" y1="68" x2="400" y2="106" markerEnd="url(#f3ha)" />

      <rect className="box-s" x="640" y="114" width="220" height="48" rx="6" />
      <text className="t" x="750" y="134" textAnchor="middle">
        dropped
      </text>
      <text className="ts" x="750" y="150" textAnchor="middle">
        rejected, or already seen
      </text>
      <line className="e" x1="502" y1="138" x2="632" y2="138" markerEnd="url(#f3h)" />

      <rect className="box-a" x="300" y="208" width="200" height="52" rx="6" />
      <text className="t" x="400" y="230" textAnchor="middle">
        SIGNAL created
      </text>
      <text className="ts" x="400" y="247" textAnchor="middle">
        conditional put won
      </text>
      <line className="ea" x1="400" y1="164" x2="400" y2="202" markerEnd="url(#f3ha)" />

      <rect className="box-s" x="20" y="206" width="220" height="56" rx="6" />
      <text className="t" x="130" y="226" textAnchor="middle">
        deferred
      </text>
      <text className="ts" x="130" y="242" textAnchor="middle">
        the whole batch parks when
      </text>
      <text className="ts" x="130" y="256" textAnchor="middle">
        the $1 day cap is reached
      </text>
      <line className="e" x1="298" y1="226" x2="248" y2="226" markerEnd="url(#f3h)" />
      <path className="e" d="M130 264 L130 288 L390 288 L390 266" markerEnd="url(#f3h)" />
      <text className="el" x="262" y="302" textAnchor="middle">
        returns on the first poll after midnight UTC, not the next hour
      </text>

      <rect className="box-a" x="300" y="326" width="200" height="52" rx="6" />
      <text className="t" x="400" y="348" textAnchor="middle">
        triage · Haiku
      </text>
      <text className="ts" x="400" y="365" textAnchor="middle">
        verdict stored
      </text>
      <line className="ea" x1="400" y1="260" x2="400" y2="320" markerEnd="url(#f3ha)" />

      <rect className="box-s" x="640" y="304" width="220" height="44" rx="6" />
      <text className="t" x="750" y="322" textAnchor="middle">
        stalled
      </text>
      <text className="ts" x="750" y="338" textAnchor="middle">
        relevant, confidence &lt; 0.6
      </text>
      <line className="e" x1="502" y1="340" x2="632" y2="326" markerEnd="url(#f3h)" />

      <rect className="box-s" x="640" y="358" width="220" height="44" rx="6" />
      <text className="t" x="750" y="376" textAnchor="middle">
        failed
      </text>
      <text className="ts" x="750" y="392" textAnchor="middle">
        refusal — no retry, by design
      </text>
      <line className="e" x1="502" y1="358" x2="632" y2="376" markerEnd="url(#f3h)" />

      <rect className="box-a" x="300" y="430" width="200" height="52" rx="6" />
      <text className="t" x="400" y="452" textAnchor="middle">
        verify · Sonnet
      </text>
      <text className="ts" x="400" y="469" textAnchor="middle">
        fetch, extract, maybe search
      </text>
      <line className="ea" x1="400" y1="378" x2="400" y2="424" markerEnd="url(#f3ha)" />
      <text className="ela" x="412" y="404">
        confidence ≥ 0.6
      </text>

      <rect className="box-s" x="20" y="420" width="220" height="58" rx="6" />
      <text className="t" x="130" y="440" textAnchor="middle">
        nothing found / failed
      </text>
      <text className="ts" x="130" y="456" textAnchor="middle">
        isOffer false is a success;
      </text>
      <text className="ts" x="130" y="470" textAnchor="middle">
        an unreachable page is not
      </text>
      <line className="e" x1="298" y1="450" x2="248" y2="450" markerEnd="url(#f3h)" />

      <rect className="box-a" x="238" y="528" width="180" height="48" rx="6" />
      <text className="t" x="328" y="548" textAnchor="middle">
        OFFER
      </text>
      <text className="ts" x="328" y="564" textAnchor="middle">
        status 'unverified'
      </text>
      <path className="ea" d="M370 482 L370 504 L328 504 L328 522" markerEnd="url(#f3ha)" />
      <text className="ela" x="140" y="510">
        all four guards pass
      </text>

      <rect className="box-w" x="450" y="528" width="180" height="48" rx="6" />
      <text className="t" x="540" y="548" textAnchor="middle">
        CANDIDATE
      </text>
      <text className="ts" x="540" y="564" textAnchor="middle">
        no approver exists
      </text>
      <path className="ew" d="M430 482 L430 504 L540 504 L540 522" markerEnd="url(#f3hw)" />
      <text className="elw" x="636" y="510">
        anything else
      </text>

      <rect className="box-w" x="660" y="528" width="200" height="48" rx="6" />
      <text className="t" x="760" y="548" textAnchor="middle">
        waits for a person
      </text>
      <text className="ts" x="760" y="564" textAnchor="middle">
        M4 · no code path
      </text>
      <line className="ew" x1="632" y1="552" x2="652" y2="552" markerEnd="url(#f3hw)" />
      <path className="ew" d="M420 552 L440 552" markerEnd="url(#f3hw)" />
    </svg>
  );
}

export function TableFigure() {
  return (
    <svg
      className="d"
      viewBox="0 0 880 540"
      role="img"
      aria-label="On the left, the ten key patterns built by keys.ts: OFFER, CANDIDATE, SIGNAL, SOURCE, CERT, EVENT, EVENTKEY, META system, BUDGET and LOCK. In the middle, the writeChange transaction with four items in order: an idempotency guard put, the event put, the entity write with a condition, and a touch of lastChangeAt. A cancellation at item zero means duplicate, anywhere else means stale. On the right, GSI1 serves every list read, and publish compares lastChangeAt with lastPublishedAt."
    >
      <defs>
        <marker
          id="f4h"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <polygon className="hd" points="0,1 10,5 0,9" />
        </marker>
        <marker
          id="f4ha"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <polygon className="hda" points="0,1 10,5 0,9" />
        </marker>
      </defs>

      <text className="band" x="20" y="22">
        KEY PATTERNS (keys.ts)
      </text>
      <rect className="box-s" x="20" y="34" width="250" height="306" rx="6" />
      <text className="ts" x="36" y="58">
        OFFER#id / META
      </text>
      <text className="ts" x="36" y="88">
        CAND#ulid / META
      </text>
      <text className="ts" x="36" y="118">
        SIG#sourceId / fingerprint
      </text>
      <text className="ts" x="36" y="148">
        SOURCE#sourceId / META
      </text>
      <text className="ts" x="36" y="178">
        CERT#id / META
      </text>
      <text className="ts" x="36" y="208">
        EVENT#YYYY-MM / at#id
      </text>
      <text className="ts" x="36" y="238">
        EVENTKEY#key / META
      </text>
      <text className="ts" x="36" y="268">
        META#system / META
      </text>
      <text className="ts" x="36" y="298">
        BUDGET#YYYY-MM-DD / META
      </text>
      <text className="ts" x="36" y="328">
        LOCK#name / META
      </text>

      <text className="band" x="320" y="22">
        writeChange — FOUR ITEMS, ALL OR NOTHING
      </text>
      <rect className="box-a" x="320" y="34" width="290" height="50" rx="6" />
      <text className="t" x="336" y="55">
        0 · EVENTKEY put
      </text>
      <text className="ts" x="336" y="72">
        attribute_not_exists → duplicate
      </text>

      <rect className="box-a" x="320" y="100" width="290" height="40" rx="6" />
      <text className="t" x="336" y="125">
        1 · EVENT put
      </text>

      <rect className="box-a" x="320" y="156" width="290" height="50" rx="6" />
      <text className="t" x="336" y="177">
        2 · the entity write
      </text>
      <text className="ts" x="336" y="194">
        with a condition → stale
      </text>

      <rect className="box-a" x="320" y="222" width="290" height="50" rx="6" />
      <text className="t" x="336" y="243">
        3 · touch lastChangeAt
      </text>
      <text className="ts" x="336" y="260">
        on META#system
      </text>

      <line className="ea" x1="465" y1="84" x2="465" y2="96" markerEnd="url(#f4ha)" />
      <line className="ea" x1="465" y1="140" x2="465" y2="152" markerEnd="url(#f4ha)" />
      <line className="ea" x1="465" y1="206" x2="465" y2="218" markerEnd="url(#f4ha)" />

      <rect className="box-s" x="320" y="292" width="290" height="48" rx="6" />
      <text className="t" x="336" y="312">
        writeEventOnly — two items
      </text>
      <text className="ts" x="336" y="328">
        no lastChangeAt touch, deliberately
      </text>

      <rect className="box" x="655" y="34" width="205" height="60" rx="6" />
      <text className="t" x="757" y="56" textAnchor="middle">
        GSI1
      </text>
      <text className="ts" x="757" y="72" textAnchor="middle">
        the only index. every
      </text>
      <text className="ts" x="757" y="86" textAnchor="middle">
        list read in the system.
      </text>

      <rect className="box-a" x="655" y="124" width="205" height="78" rx="6" />
      <text className="t" x="757" y="146" textAnchor="middle">
        publish
      </text>
      <text className="ts" x="757" y="163" textAnchor="middle">
        4 GSI1 queries:
      </text>
      <text className="ts" x="757" y="178" textAnchor="middle">
        offers, catalog,
      </text>
      <text className="ts" x="757" y="192" textAnchor="middle">
        events, sources
      </text>

      <line className="e" x1="272" y1="60" x2="312" y2="60" markerEnd="url(#f4h)" />
      <path className="e" d="M612 60 L647 60" markerEnd="url(#f4h)" />
      <line className="ea" x1="757" y1="94" x2="757" y2="118" markerEnd="url(#f4ha)" />
      <path
        className="ea"
        d="M612 247 L636 247 L636 214 L757 214 L757 208"
        markerEnd="url(#f4ha)"
      />
      <text className="ela" x="648" y="228">
        lastChangeAt
      </text>

      <line className="rule" x1="20" y1="372" x2="860" y2="372" />
      <text className="band" x="20" y="398">
        WHAT PUBLISH DOES WITH THAT, IN ORDER
      </text>
      <rect className="box" x="20" y="412" width="132" height="44" rx="6" />
      <text className="t" x="86" y="439" textAnchor="middle">
        take the lease
      </text>
      <rect className="box" x="172" y="412" width="140" height="44" rx="6" />
      <text className="t" x="242" y="433" textAnchor="middle">
        newer than
      </text>
      <text className="ts" x="242" y="449" textAnchor="middle">
        lastPublishedAt?
      </text>
      <rect className="box" x="332" y="412" width="128" height="44" rx="6" />
      <text className="t" x="396" y="433" textAnchor="middle">
        15 min window
      </text>
      <text className="ts" x="396" y="449" textAnchor="middle">
        minus 60 s
      </text>
      <rect className="box" x="480" y="412" width="118" height="44" rx="6" />
      <text className="t" x="539" y="433" textAnchor="middle">
        200 a month
      </text>
      <text className="ts" x="539" y="449" textAnchor="middle">
        hard stop
      </text>
      <rect className="box" x="618" y="412" width="110" height="44" rx="6" />
      <text className="t" x="673" y="439" textAnchor="middle">
        build it
      </text>
      <rect className="box-a" x="748" y="412" width="112" height="44" rx="6" />
      <text className="t" x="804" y="433" textAnchor="middle">
        byte-compare
      </text>
      <text className="ts" x="804" y="449" textAnchor="middle">
        then commit
      </text>
      <line className="e" x1="154" y1="434" x2="166" y2="434" markerEnd="url(#f4h)" />
      <line className="e" x1="314" y1="434" x2="326" y2="434" markerEnd="url(#f4h)" />
      <line className="e" x1="462" y1="434" x2="474" y2="434" markerEnd="url(#f4h)" />
      <line className="e" x1="600" y1="434" x2="612" y2="434" markerEnd="url(#f4h)" />
      <line className="e" x1="730" y1="434" x2="742" y2="434" markerEnd="url(#f4h)" />
      <text className="el" x="20" y="490">
        The comparison blanks generatedAt, lastPollAt and lastStatusRunAt first, so a snapshot
        differing only in run
      </text>
      <text className="el" x="20" y="508">
        timestamps never costs a commit or a Cloudflare build. The 'identical' path still stamps
        lastPublishedAt.
      </text>
    </svg>
  );
}

export function DeployFigure() {
  return (
    <svg
      className="d"
      viewBox="0 0 880 520"
      role="img"
      aria-label="A pull request fans out to five gates: ci.yml, e2e.yml, codeql.yml, data-guard.yml and infra-diff.yml. A push to main triggers Cloudflare Pages, which clones and builds the site, and infra-deploy.yml, which waits on a required reviewer and then assumes four CDK bootstrap roles to deploy. Separately the publish Lambda commits straight to main as a ruleset bypass actor, skipping every gate, and a failed Pages build leaves the site serving the previous deployment with nothing in AWS observing it."
    >
      <defs>
        <marker
          id="f5h"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <polygon className="hd" points="0,1 10,5 0,9" />
        </marker>
        <marker
          id="f5ha"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <polygon className="hda" points="0,1 10,5 0,9" />
        </marker>
        <marker
          id="f5hw"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <polygon className="hdw" points="0,1 10,5 0,9" />
        </marker>
      </defs>

      <rect className="box" x="20" y="36" width="120" height="44" rx="6" />
      <text className="t" x="80" y="63" textAnchor="middle">
        pull request
      </text>

      <text className="band" x="190" y="24">
        FIVE GATES
      </text>
      <rect className="box-s" x="190" y="30" width="280" height="40" rx="6" />
      <text className="ts" x="202" y="54">
        ci.yml · lint → typecheck → test → build
      </text>
      <rect className="box-s" x="190" y="76" width="280" height="40" rx="6" />
      <text className="ts" x="202" y="100">
        e2e.yml · Playwright + axe, then lhci
      </text>
      <rect className="box-s" x="190" y="122" width="280" height="40" rx="6" />
      <text className="ts" x="202" y="146">
        codeql.yml · push, PR, weekly
      </text>
      <rect className="box-w" x="190" y="168" width="280" height="40" rx="6" />
      <text className="ts" x="202" y="192">
        data-guard.yml · blocks snapshot edits
      </text>
      <rect className="box-s" x="190" y="214" width="280" height="40" rx="6" />
      <text className="ts" x="202" y="238">
        infra-diff.yml · cdk diff as a comment
      </text>

      <path className="e" d="M142 58 L166 58 L166 50 L182 50" markerEnd="url(#f5h)" />
      <path className="e" d="M166 58 L166 96 L182 96" markerEnd="url(#f5h)" />
      <path className="e" d="M166 58 L166 142 L182 142" markerEnd="url(#f5h)" />
      <path className="e" d="M166 58 L166 188 L182 188" markerEnd="url(#f5h)" />
      <path className="e" d="M166 58 L166 234 L182 234" markerEnd="url(#f5h)" />

      <rect className="box-a" x="490" y="112" width="150" height="48" rx="6" />
      <text className="t" x="565" y="132" textAnchor="middle">
        push to main
      </text>
      <text className="ts" x="565" y="148" textAnchor="middle">
        the only trigger
      </text>
      <line className="e" x1="472" y1="56" x2="482" y2="118" markerEnd="url(#f5h)" />

      <rect className="box-a" x="490" y="212" width="370" height="82" rx="6" />
      <text className="t" x="506" y="233">
        Cloudflare Pages — its own GitHub App, not a workflow
      </text>
      <text className="ts" x="506" y="250">
        clones main, npm ci, npm run build -w apps/web
      </text>
      <text className="ts" x="506" y="266">
        prebuild runs validate-snapshot.ts;
      </text>
      <text className="ts" x="506" y="282">
        exit 1 fails the build, nothing deploys
      </text>
      <line className="ea" x1="565" y1="160" x2="565" y2="206" markerEnd="url(#f5ha)" />

      <rect className="box" x="490" y="390" width="370" height="66" rx="6" />
      <text className="t" x="506" y="411">
        infra-deploy.yml — on infra/ services/ packages/ lock
      </text>
      <text className="ts" x="506" y="428">
        environment: prod — its required reviewer IS the gate
      </text>
      <text className="ts" x="506" y="444">
        OIDC → assume 4 cdk bootstrap roles → cdk deploy
      </text>
      <path className="e" d="M640 136 L872 136 L872 423 L866 423" markerEnd="url(#f5h)" />

      <rect className="box-a" x="20" y="320" width="200" height="48" rx="6" />
      <text className="t" x="120" y="340" textAnchor="middle">
        publish λ
      </text>
      <text className="ts" x="120" y="356" textAnchor="middle">
        ruleset bypass actor
      </text>
      <path className="ea" d="M222 344 L476 344 L476 142 L482 142" markerEnd="url(#f5ha)" />
      <text className="ela" x="238" y="392">
        straight to main — no branch, no PR, and
      </text>
      <text className="ela" x="238" y="408">
        ci.yml paths-ignores this exact file
      </text>

      <rect className="box-w" x="490" y="306" width="370" height="62" rx="6" />
      <text className="t" x="506" y="327">
        if the Pages build fails
      </text>
      <text className="ts" x="506" y="344">
        the site keeps serving the previous deployment.
      </text>
      <text className="ts" x="506" y="360">
        no alarm, topic or metric in AWS observes it.
      </text>
      <path className="ew" d="M675 294 L675 300" markerEnd="url(#f5hw)" />
    </svg>
  );
}

export function CostFigure() {
  return (
    <svg
      className="d"
      viewBox="0 0 880 300"
      role="img"
      aria-label="Six cost guards shown as tiles with their values: DynamoDB provisioned at eight read and eight write units with no autoscaling; the LLM capped at one dollar a day; publish capped at two hundred commits a month; two monthly AWS budgets at one and ten dollars in production only; ten custom metric names; and seven single-metric alarms. Below, a note that the daily cap is enforced per invocation rather than per call, so a day can overshoot."
    >
      <defs>
        <marker
          id="f6h"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <polygon className="hdw" points="0,1 10,5 0,9" />
        </marker>
      </defs>

      <rect className="box-a" x="20" y="34" width="190" height="78" rx="6" />
      <text className="band" x="36" y="56">
        DYNAMODB
      </text>
      <text className="t" x="36" y="80">
        8 RCU / 8 WCU
      </text>
      <text className="ts" x="36" y="98">
        provisioned, no autoscale
      </text>

      <rect className="box-a" x="230" y="34" width="190" height="78" rx="6" />
      <text className="band" x="246" y="56">
        THE MODEL
      </text>
      <text className="t" x="246" y="80">
        $1 per day
      </text>
      <text className="ts" x="246" y="98">
        read from SSM, atomic ADD
      </text>

      <rect className="box-a" x="440" y="34" width="190" height="78" rx="6" />
      <text className="band" x="456" y="56">
        COMMITS
      </text>
      <text className="t" x="456" y="80">
        200 per month
      </text>
      <text className="ts" x="456" y="98">
        a hard stop in publish.ts
      </text>

      <rect className="box-a" x="650" y="34" width="210" height="78" rx="6" />
      <text className="band" x="666" y="56">
        AWS BUDGETS
      </text>
      <text className="t" x="666" y="80">
        $1 and $10 monthly
      </text>
      <text className="ts" x="666" y="98">
        prod only — dev has none
      </text>

      <rect className="box" x="20" y="130" width="190" height="78" rx="6" />
      <text className="band" x="36" y="152">
        CUSTOM METRICS
      </text>
      <text className="t" x="36" y="176">
        10 names
      </text>
      <text className="ts" x="36" y="194">
        3 belong to unbuilt code
      </text>

      <rect className="box" x="230" y="130" width="190" height="78" rx="6" />
      <text className="band" x="246" y="152">
        ALARMS
      </text>
      <text className="t" x="246" y="176">
        7, all single-metric
      </text>
      <text className="ts" x="246" y="194">
        metric math is billed
      </text>

      <rect className="box-w" x="440" y="130" width="420" height="78" rx="6" />
      <text className="band" x="456" y="152">
        WHERE THE CAP LEAKS
      </text>
      <text className="ts" x="456" y="174">
        check() runs once per invocation, not per call.
      </text>
      <text className="ts" x="456" y="190">
        verify spends up to 3 billed calls; a day can overshoot.
      </text>

      <text className="el" x="20" y="246">
        Two copies of the same number can drift: the runtime cap is the SSM parameter
        llm/dailyCapUsd, while the
      </text>
      <text className="el" x="20" y="264">
        CloudWatch alarm threshold is baked in at synth from infra/config/&lt;stage&gt;.json.
        Raising one and not the
      </text>
      <text className="el" x="20" y="282">
        other leaves the alarm firing at the old figure.
      </text>
    </svg>
  );
}

export function BrowserFigure() {
  return (
    <svg
      className="d"
      viewBox="0 0 880 480"
      role="img"
      aria-label="snapshot.json is aliased by vite.config.ts and parsed once by SnapshotSchema at module load, so a bad snapshot throws before anything renders. useOffers derives rows, the audience lens filters them once, and every tab receives the result. The Offers tab ships in the entry chunk; Calendar, Watch list, Certifications, Activity, About and the admin surfaces are lazy-loaded. The catalog join runs in the browser on every render."
    >
      <defs>
        <marker
          id="f7h"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <polygon className="hd" points="0,1 10,5 0,9" />
        </marker>
        <marker
          id="f7ha"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <polygon className="hda" points="0,1 10,5 0,9" />
        </marker>
      </defs>

      <rect className="box-a" x="20" y="40" width="200" height="56" rx="6" />
      <text className="t" x="120" y="62" textAnchor="middle">
        snapshot.json
      </text>
      <text className="ts" x="120" y="79" textAnchor="middle">
        committed into src/, bundled
      </text>

      <rect className="box" x="260" y="40" width="200" height="56" rx="6" />
      <text className="t" x="360" y="62" textAnchor="middle">
        SnapshotSchema.parse
      </text>
      <text className="ts" x="360" y="79" textAnchor="middle">
        once, at module load
      </text>

      <rect className="box-a" x="500" y="40" width="180" height="56" rx="6" />
      <text className="t" x="590" y="62" textAnchor="middle">
        useOffers()
      </text>
      <text className="ts" x="590" y="79" textAnchor="middle">
        the only door in
      </text>

      <rect className="box-a" x="720" y="40" width="140" height="56" rx="6" />
      <text className="t" x="790" y="62" textAnchor="middle">
        audience lens
      </text>
      <text className="ts" x="790" y="79" textAnchor="middle">
        one filter, once
      </text>

      <line className="ea" x1="222" y1="68" x2="252" y2="68" markerEnd="url(#f7ha)" />
      <line className="ea" x1="462" y1="68" x2="492" y2="68" markerEnd="url(#f7ha)" />
      <line className="ea" x1="682" y1="68" x2="712" y2="68" markerEnd="url(#f7ha)" />
      <text className="el" x="360" y="114" textAnchor="middle">
        a bad snapshot throws before anything renders
      </text>

      <line className="rule" x1="20" y1="150" x2="860" y2="150" />
      <text className="band" x="20" y="176">
        IN THE ENTRY CHUNK
      </text>
      <rect className="box-a" x="20" y="188" width="180" height="56" rx="6" />
      <text className="t" x="110" y="210" textAnchor="middle">
        Offers
      </text>
      <text className="ts" x="110" y="227" textAnchor="middle">
        OffersTable
      </text>

      <text className="band" x="240" y="176">
        LAZY, BEHIND SUSPENSE
      </text>
      <rect className="box" x="240" y="188" width="140" height="56" rx="6" />
      <text className="t" x="310" y="210" textAnchor="middle">
        Calendar
      </text>
      <text className="ts" x="310" y="227" textAnchor="middle">
        PrimeReact
      </text>
      <rect className="box" x="392" y="188" width="140" height="56" rx="6" />
      <text className="t" x="462" y="216" textAnchor="middle">
        Watch list
      </text>
      <rect className="box" x="544" y="188" width="150" height="56" rx="6" />
      <text className="t" x="619" y="210" textAnchor="middle">
        Certifications
      </text>
      <text className="ts" x="619" y="227" textAnchor="middle">
        the catalog join
      </text>
      <rect className="box" x="706" y="188" width="154" height="56" rx="6" />
      <text className="t" x="783" y="216" textAnchor="middle">
        Activity
      </text>

      <path className="ea" d="M790 96 L790 120 L110 120 L110 182" markerEnd="url(#f7ha)" />
      <path className="e" d="M310 120 L310 182" markerEnd="url(#f7h)" />
      <path className="e" d="M462 120 L462 182" markerEnd="url(#f7h)" />
      <path className="e" d="M619 120 L619 182" markerEnd="url(#f7h)" />
      <path className="e" d="M783 120 L783 182" markerEnd="url(#f7h)" />

      <rect className="box-s" x="20" y="276" width="400" height="74" rx="6" />
      <text className="t" x="36" y="297">
        catalogMatch() runs in the browser
      </text>
      <text className="ts" x="36" y="314">
        79 catalog entries × every offer, on every render.
      </text>
      <text className="ts" x="36" y="330">
        Nothing stores that an offer covers a credential, so a
      </text>
      <text className="ts" x="36" y="344">
        wrong match is one publish away from fixed.
      </text>
      <line className="e" x1="619" y1="246" x2="440" y2="300" markerEnd="url(#f7h)" />

      <rect className="box-s" x="450" y="276" width="410" height="74" rx="6" />
      <text className="t" x="466" y="297">
        the URL hash is the router
      </text>
      <text className="ts" x="466" y="314">
        #offers #calendar #watchlist #catalog #activity #review,
      </text>
      <text className="ts" x="466" y="330">
        each wrapped in a View Transition. ?offer= forces
      </text>
      <text className="ts" x="466" y="344">
        the Offers tab and remounts the table around that row.
      </text>

      <rect className="box" x="20" y="382" width="400" height="58" rx="6" />
      <text className="t" x="36" y="403">
        status is never trusted from the file
      </text>
      <text className="ts" x="36" y="420">
        deriveStatus() recomputes it from the window dates on
      </text>
      <text className="ts" x="36" y="434">
        every render, so the site and the jobs cannot disagree.
      </text>

      <rect className="box" x="450" y="382" width="410" height="58" rx="6" />
      <text className="t" x="466" y="403">
        the service worker prompts, never auto-reloads
      </text>
      <text className="ts" x="466" y="420">
        injectManifest with a hand-written sw.ts and
      </text>
      <text className="ts" x="466" y="434">
        registerType 'prompt', surfaced by UpdatePrompt.
      </text>
    </svg>
  );
}
