// one ellipse turned through half a circle draws the rosette printed on certificate paper
const PETALS = Array.from({ length: 36 }, (_, index) => index * 5);

export function Banner() {
  return (
    <div className="banner">
      <svg className="banner-rosette" viewBox="-100 -100 200 200" aria-hidden="true">
        {PETALS.map((angle) => (
          <ellipse key={angle} rx="96" ry="36" transform={`rotate(${String(angle)})`} />
        ))}
        <circle r="98" />
        <circle r="35" />
      </svg>
      <div className="banner-inner">
        <p className="banner-text">
          Free and discounted IT certification exams,{' '}
          <strong>
            <i className="pi pi-verified" aria-hidden="true" />
            checked against each vendor&apos;s own page.
          </strong>
        </p>
      </div>
    </div>
  );
}
