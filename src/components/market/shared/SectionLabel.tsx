"use client";

interface Props {
  label: string;
  sub?: string;
}

export default function SectionLabel({ label, sub }: Props) {
  return (
    <div className="si-overview-section-label">
      <span className="si-overview-section-title">{label}</span>
      {sub && <span className="si-overview-section-sub">{sub}</span>}
      <div className="si-overview-section-rule" />
    </div>
  );
}
