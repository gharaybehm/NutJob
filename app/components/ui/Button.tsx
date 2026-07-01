import { ButtonHTMLAttributes } from "react";

type BaseProps = ButtonHTMLAttributes<HTMLButtonElement>;

export function PrimaryButton({ className = "", children, ...props }: BaseProps) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-[11px] bg-gradient-to-b from-[#37905C] to-green px-4 py-2.5 text-sm font-semibold text-white shadow-[0_6px_16px_-4px_rgba(47,125,79,.5)] transition hover:brightness-105 disabled:opacity-60 disabled:cursor-not-allowed ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function SecondaryButton({ className = "", children, ...props }: BaseProps) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-[11px] border border-line bg-surface px-4 py-2.5 text-sm font-semibold text-ink transition hover:border-ink-4 disabled:opacity-60 disabled:cursor-not-allowed ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function GhostButton({ className = "", children, ...props }: BaseProps) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-3 py-1.5 text-sm font-semibold text-ink-3 transition hover:bg-tile-2 disabled:opacity-60 disabled:cursor-not-allowed ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
