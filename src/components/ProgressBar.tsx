export function pct(done: number, target: number): number {
  if (target <= 0) return done > 0 ? 100 : 0;
  return Math.min(100, Math.round((done / target) * 100));
}

export default function ProgressBar({
  done,
  target,
  label,
}: {
  done: number;
  target: number;
  label?: string;
}) {
  const p = pct(done, target);
  const complete = target > 0 && done >= target;
  const color = complete
    ? "var(--color-ok)"
    : p > 0
      ? "var(--color-brand)"
      : "var(--color-line)";

  return (
    <div>
      {label && (
        <div className="mb-1 flex items-baseline justify-between text-xs">
          <span className="text-muted">{label}</span>
          <span className="nums font-semibold">
            {done}
            <span className="text-muted font-normal">/{target}</span>
          </span>
        </div>
      )}
      <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2 ring-1 ring-inset ring-line">
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{
            width: `${p}%`,
            background: color,
            boxShadow: p > 0 ? `0 0 8px ${color}66` : "none",
          }}
        />
      </div>
    </div>
  );
}
