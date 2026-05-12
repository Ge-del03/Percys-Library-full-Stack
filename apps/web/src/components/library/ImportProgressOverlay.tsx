import clsx from "clsx";
import { useEffect, useRef } from "react";

export interface ImportResultSummary {
  uploaded: { name: string; size: number }[];
  skipped: { name: string; reason: "already-exists" | "duplicated-in-batch" }[];
  added: number;
  registered?: number;
  unreadable?: number;
  removed: number;
  total: number;
}

export type ImportPhase =
  | { kind: "idle" }
  | { kind: "uploading"; loaded: number; total: number; fileCount: number }
  | { kind: "processing"; fileCount: number }
  | { kind: "done"; result: ImportResultSummary }
  | { kind: "error"; message: string };

interface Props {
  phase: ImportPhase;
  onClose: () => void;
}

function bytesToHuman(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

/**
 * Full-screen overlay shown while a comic import is in flight or right
 * after it finishes. The card transitions through three phases —
 *
 *  1. `uploading`: bytes-uploaded progress bar based on
 *     XMLHttpRequest's upload "progress" event.
 *  2. `processing`: indeterminate bar while the server unzips, parses
 *     and registers each archive (we get no granular feedback here).
 *  3. `done`: structured summary of what was added, what was skipped
 *     and what couldn't be parsed, with the original filenames listed.
 *
 * The error phase reuses the same card so the user lands on a single,
 * consistent piece of UI no matter what went wrong.
 */
export function ImportProgressOverlay({ phase, onClose }: Props) {
  const open = phase.kind !== "idle";
  const closeRef = useRef<HTMLButtonElement | null>(null);

  // While the import is running we don't allow Escape to dismiss it —
  // the user might lose feedback on a long upload otherwise. Once it
  // settles into "done" or "error", Escape works as expected.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (phase.kind === "done" || phase.kind === "error") {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, phase.kind, onClose]);

  // Auto-focus the close button when the import finishes so users can
  // dismiss with Enter/Space without having to grab the mouse.
  useEffect(() => {
    if (phase.kind === "done" || phase.kind === "error") {
      closeRef.current?.focus();
    }
  }, [phase.kind]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-overlay-title"
      className="fixed inset-0 z-[200] grid place-items-center bg-black/70 backdrop-blur-md p-4 animate-fade-in"
    >
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-[#0f111a]/95 p-6 shadow-[0_30px_120px_rgba(0,0,0,0.8)]">
        <div className="flex items-start justify-between gap-3 mb-5">
          <div className="flex items-center gap-3">
            <div
              className={clsx(
                "grid h-12 w-12 place-items-center rounded-2xl border",
                phase.kind === "done"
                  ? "bg-emerald-500/10 border-emerald-400/40"
                  : phase.kind === "error"
                    ? "bg-red-500/10 border-red-400/40"
                    : "bg-blue-500/10 border-blue-400/40",
              )}
            >
              {phase.kind === "done" ? (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-emerald-300"><path d="M5 12l4 4L19 7" /></svg>
              ) : phase.kind === "error" ? (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-red-300"><path d="M12 8v5M12 16.5v0M3 5h18l-9 16z" /></svg>
              ) : (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-blue-300"><path d="M12 3v12m-6-6 6 6 6-6M5 21h14" /></svg>
              )}
            </div>
            <div>
              <h2 id="import-overlay-title" className="text-base font-bold text-white">
                {phase.kind === "uploading"
                  ? "Subiendo archivos…"
                  : phase.kind === "processing"
                    ? "Procesando cómics…"
                    : phase.kind === "done"
                      ? "Importación completa"
                      : "No se pudo importar"}
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {phase.kind === "uploading"
                  ? `Enviando ${phase.fileCount} ${phase.fileCount === 1 ? "archivo" : "archivos"} al servidor`
                  : phase.kind === "processing"
                    ? "Extrayendo páginas y construyendo miniaturas"
                    : phase.kind === "done"
                      ? "Tu biblioteca está actualizada"
                      : "Revisa el error y vuelve a intentar"}
              </p>
            </div>
          </div>
          {(phase.kind === "done" || phase.kind === "error") && (
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="rounded-full p-1.5 text-slate-500 hover:text-white hover:bg-white/5 transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12" /></svg>
            </button>
          )}
        </div>

        {phase.kind === "uploading" && (
          <div className="space-y-3">
            <div
              className="h-2 w-full overflow-hidden rounded-full bg-white/5 border border-white/5"
              aria-label="Progreso de carga"
            >
              <div
                className="h-full rounded-full bg-gradient-to-r from-blue-600 to-blue-400 shadow-[0_0_10px_rgba(59,130,246,0.4)] transition-[width] duration-150"
                style={{
                  width: `${phase.total > 0 ? Math.min(100, (phase.loaded / phase.total) * 100) : 0}%`,
                }}
              />
            </div>
            <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
              <span>{bytesToHuman(phase.loaded)} de {bytesToHuman(phase.total)}</span>
              <span className="font-bold text-blue-300">
                {phase.total > 0 ? Math.min(100, Math.round((phase.loaded / phase.total) * 100)) : 0}%
              </span>
            </div>
          </div>
        )}

        {phase.kind === "processing" && (
          <div className="space-y-3">
            <div className="relative h-2 w-full overflow-hidden rounded-full bg-white/5 border border-white/5">
              <div
                aria-hidden
                className="absolute inset-y-0 left-0 w-1/3 rounded-full bg-blue-500/70"
                style={{ animation: "loading-indeterminate 1.4s ease-in-out infinite" }}
              />
            </div>
            <p className="text-xs text-slate-400 font-medium">
              {phase.fileCount === 1
                ? "Procesando 1 archivo. Suele tardar pocos segundos."
                : `Procesando ${phase.fileCount} archivos. Suele tardar pocos segundos.`}
            </p>
          </div>
        )}

        {phase.kind === "done" && <ResultSummary result={phase.result} />}

        {phase.kind === "error" && (
          <div className="rounded-2xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-100">
            <div className="font-bold">Algo falló durante la importación</div>
            <div className="mt-1 text-xs text-red-200/90 break-words">{phase.message}</div>
          </div>
        )}

        {(phase.kind === "done" || phase.kind === "error") && (
          <button
            type="button"
            onClick={onClose}
            className="mt-5 w-full pl-btn-primary !py-2.5"
          >
            Cerrar
          </button>
        )}
      </div>
    </div>
  );
}

function ResultSummary({ result }: { result: ImportResultSummary }) {
  const failed = result.unreadable ?? 0;
  const sentBytes = result.uploaded.reduce((s, f) => s + (f.size || 0), 0);
  const dupes = result.skipped.filter((s) => s.reason === "already-exists");
  const batchDupes = result.skipped.filter((s) => s.reason === "duplicated-in-batch");

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <Metric label="Añadidos" value={result.added} tone="positive" />
        <Metric label="Saltados" value={result.skipped.length} tone={result.skipped.length > 0 ? "warning" : "muted"} />
        <Metric label="Errores" value={failed} tone={failed > 0 ? "negative" : "muted"} />
      </div>

      <div className="text-xs text-slate-400 font-medium">
        {result.added > 0 && (
          <p>
            Se añadieron {result.added} {result.added === 1 ? "cómic nuevo" : "cómics nuevos"} a tu biblioteca
            {sentBytes > 0 ? ` (${bytesToHuman(sentBytes)} en total).` : "."}
          </p>
        )}
        {result.added === 0 && result.skipped.length > 0 && failed === 0 && (
          <p>No hubo cómics nuevos para añadir — los archivos ya estaban registrados.</p>
        )}
      </div>

      {dupes.length > 0 && (
        <Section title="Ya existían en la biblioteca" tone="warning">
          {dupes.slice(0, 6).map((s) => (
            <li key={`d-${s.name}`} className="truncate">{s.name}</li>
          ))}
          {dupes.length > 6 && <li className="text-slate-500">…y {dupes.length - 6} más</li>}
        </Section>
      )}

      {batchDupes.length > 0 && (
        <Section title="Duplicados en este lote" tone="warning">
          {batchDupes.slice(0, 6).map((s) => (
            <li key={`b-${s.name}`} className="truncate">{s.name}</li>
          ))}
          {batchDupes.length > 6 && <li className="text-slate-500">…y {batchDupes.length - 6} más</li>}
        </Section>
      )}

      {failed > 0 && (
        <Section title="No se pudieron leer" tone="negative">
          <li>{failed} {failed === 1 ? "archivo" : "archivos"} (formato inválido o corrupto)</li>
        </Section>
      )}
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: number; tone: "positive" | "warning" | "negative" | "muted" }) {
  const cls =
    tone === "positive"
      ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
      : tone === "warning"
        ? "border-amber-400/30 bg-amber-500/10 text-amber-200"
        : tone === "negative"
          ? "border-red-400/30 bg-red-500/10 text-red-200"
          : "border-white/10 bg-white/[0.02] text-slate-400";
  return (
    <div className={clsx("rounded-2xl border px-3 py-2.5 text-center", cls)}>
      <div className="text-xl font-black tabular-nums">{value}</div>
      <div className="text-[10px] font-bold uppercase tracking-widest opacity-80">{label}</div>
    </div>
  );
}

function Section({ title, tone, children }: { title: string; tone: "warning" | "negative"; children: React.ReactNode }) {
  const accent =
    tone === "warning" ? "text-amber-200/90" : "text-red-200/90";
  return (
    <details className="rounded-2xl border border-white/5 bg-white/[0.02] p-3 text-xs">
      <summary className={clsx("cursor-pointer select-none font-bold", accent)}>{title}</summary>
      <ul className="mt-2 space-y-1 text-slate-300">{children}</ul>
    </details>
  );
}
