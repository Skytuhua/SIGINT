"use client";

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}

export default function Toggle({ checked, onChange, label }: ToggleProps) {
  return (
    <label className="wv-toggle">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="wv-toggle-indicator" />
      <span className="wv-toggle-label">{label}</span>
    </label>
  );
}

