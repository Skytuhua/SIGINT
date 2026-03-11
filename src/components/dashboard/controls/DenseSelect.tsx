"use client";

interface DenseSelectProps {
  value: string;
  options: Array<{ label: string; value: string }>;
  onChange: (value: string) => void;
  ariaLabel: string;
}

export default function DenseSelect({ value, options, onChange, ariaLabel }: DenseSelectProps) {
  return (
    <label className="si-dense-select">
      <span className="sr-only">{ariaLabel}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={ariaLabel}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

