"use client";

interface Props {
  label: string;
  sub?: string;
}

export default function SectionLabel({ label, sub }: Props) {
  return (
    <div className="wv-overview-section-label">
      <span className="wv-overview-section-title">{label}</span>
      {sub && <span className="wv-overview-section-sub">{sub}</span>}
      <div className="wv-overview-section-rule" />
    </div>
  );
}
