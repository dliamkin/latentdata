export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  count?: number;
}

// a row of joined toggle buttons where exactly one is pressed
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly SegmentOption<T>[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          onClick={() => {
            onChange(option.value);
          }}
        >
          {option.label}
          {option.count !== undefined && <span className="segment-count">{option.count}</span>}
        </button>
      ))}
    </div>
  );
}
