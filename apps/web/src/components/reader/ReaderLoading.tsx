interface Props {
  /** When the user opens the reader from the library grid we already
   * know the title; showing it on the loading screen feels more honest
   * than a generic "Cargando…" spinner. */
  title?: string | null;
}

/**
 * Full-screen loading state shown while the comic metadata + first page
 * are being fetched. Replaces the previous text-only "Cargando…" with a
 * polished card that fits the rest of the dark UI: stacked spinner,
 * pulsing skeleton, and an indeterminate progress bar reusing the same
 * keyframe the page-skeleton shimmer uses elsewhere.
 */
export function ReaderLoading({ title }: Props) {
  return (
    <div className="grid h-full w-full place-items-center bg-black px-6 text-center">
      <div className="flex w-full max-w-sm flex-col items-center gap-6">
        {/* Stacked page silhouette — gives the loader a comic-shaped
            anchor instead of just floating text. */}
        <div className="relative h-32 w-24">
          <div className="absolute inset-0 translate-x-2 translate-y-2 rounded-md border border-white/5 bg-white/[0.02]" />
          <div className="absolute inset-0 -translate-x-2 -translate-y-1 rounded-md border border-white/5 bg-white/[0.04]" />
          <div className="absolute inset-0 grid place-items-center overflow-hidden rounded-md border border-white/10 bg-white/[0.06] shadow-2xl">
            <span
              aria-hidden
              className="inline-block h-5 w-5 animate-spin rounded-full border-[3px] border-accent border-t-transparent"
            />
            <div
              aria-hidden
              className="absolute inset-y-0 -left-1/3 w-1/3 bg-gradient-to-r from-transparent via-white/10 to-transparent"
              style={{ animation: "loading-indeterminate 1.4s ease-in-out infinite" }}
            />
          </div>
        </div>

        <div className="flex flex-col items-center gap-1.5">
          <div className="text-xs font-bold uppercase tracking-[0.3em] text-slate-500">
            Cargando cómic
          </div>
          <div
            className="line-clamp-2 max-w-full text-base font-bold text-slate-100"
            title={title ?? undefined}
          >
            {title?.trim() || "Preparando lectura"}
          </div>
        </div>

        {/* Indeterminate progress bar — same keyframe as the per-page
            skeleton shimmer for visual consistency. */}
        <div className="relative h-1.5 w-48 overflow-hidden rounded-full bg-white/5">
          <div
            aria-hidden
            className="absolute inset-y-0 left-0 w-1/3 rounded-full bg-accent/70"
            style={{ animation: "loading-indeterminate 1.4s ease-in-out infinite" }}
          />
        </div>
      </div>
    </div>
  );
}
