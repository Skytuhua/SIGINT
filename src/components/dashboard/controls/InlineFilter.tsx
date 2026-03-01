"use client";

interface InlineFilterProps {
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
}

export default function InlineFilter({ value, placeholder = "Filter", onChange }: InlineFilterProps) {
  return (
    <input
      className="wv-inline-filter"
      value={value}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
      aria-label={placeholder}
    />
  );
}

