export function Feedback({ error, info }: { error: string | null; info: string | null }) {
  if (!error && !info) return null;
  return error ? (
    <p className="text-xs font-medium text-brand-600">{error}</p>
  ) : (
    <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300">{info}</p>
  );
}
