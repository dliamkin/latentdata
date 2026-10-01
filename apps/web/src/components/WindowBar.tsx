// how much of an offer's window is gone, draining toward the deadline colour
export function WindowBar({ progress, daysLeft }: { progress: number; daysLeft: number | null }) {
  const left = Math.max(0, Math.min(1, 1 - progress));
  const percent = String(Math.round(left * 100));
  const label =
    daysLeft === null
      ? `${percent}% of the window left`
      : `${String(daysLeft)} days left, ${percent}% of the window`;
  return (
    <span className="window-bar" role="img" aria-label={label} title={label}>
      <span className="window-bar-fill" style={{ width: `${percent}%` }} />
    </span>
  );
}
