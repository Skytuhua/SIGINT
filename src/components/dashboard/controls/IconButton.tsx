"use client";

interface IconButtonProps {
  label: string;
  text?: string;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
}

export default function IconButton({
  label,
  text,
  onClick,
  active = false,
  disabled = false,
}: IconButtonProps) {
  return (
    <button
      type="button"
      className={`wv-icon-button ${active ? "is-active" : ""}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
    >
      {text ?? label}
    </button>
  );
}

