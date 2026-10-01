import type { DropdownProps } from 'primereact/dropdown';

// PrimeReact's Dropdown has three things a screen reader can land on (a hidden input, a hidden
// <select>, the trigger) and only the first picks up a plain aria-label; the others need pt
export function dropdownA11y(label: string): Pick<DropdownProps, 'aria-label' | 'pt'> {
  return {
    'aria-label': label,
    pt: { select: { 'aria-label': label }, trigger: { 'aria-label': label } },
  };
}
