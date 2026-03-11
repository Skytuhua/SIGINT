"use client";

import type { ReactNode } from "react";

interface PanelTabsProps<T extends string> {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}

export default function PanelTabs<T extends string>({ value, options, onChange }: PanelTabsProps<T>) {
  return (
    <div className="si-panel-tabs" role="tablist" aria-label="panel tabs">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={value === option.value}
          className={`si-panel-tab ${value === option.value ? "is-active" : ""}`}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

