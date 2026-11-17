export function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      className={`spinner inline-block h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent ${className}`}
      role="status"
      aria-label="Memproses"
    />
  );
}
