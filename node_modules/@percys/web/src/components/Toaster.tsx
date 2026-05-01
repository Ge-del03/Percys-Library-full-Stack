import clsx from "clsx";
import { useToasts } from "../stores/toasts";

const icons: Record<string, React.ReactNode> = {
  info: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>,
  success: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 6L9 17l-5-5"/></svg>,
  warn: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>,
  error: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6"/><path d="M9 9l6 6"/></svg>,
};
function getToneStyles(tone: string) {
  // Use CSS variables set by ThemeProvider so toasts adapt to theme
  switch (tone) {
    case "success":
      return {
        border: "1px solid rgba(var(--pl-accent-rgb) / 0.12)",
        background: "linear-gradient(90deg, rgba(var(--pl-accent-rgb) / 0.06), rgba(var(--pl-accent-rgb) / 0.02))",
        color: "var(--pl-fg)",
        iconColor: "var(--pl-accent)",
      } as const;
    case "warn":
      return {
        border: "1px solid rgba(245,158,11,0.12)",
        background: "linear-gradient(90deg, rgba(245,158,11,0.06), rgba(245,158,11,0.02))",
        color: "var(--pl-fg)",
        iconColor: "#f59e0b",
      } as const;
    case "error":
      return {
        border: "1px solid rgba(239,68,68,0.12)",
        background: "linear-gradient(90deg, rgba(239,68,68,0.06), rgba(239,68,68,0.02))",
        color: "var(--pl-fg)",
        iconColor: "#ef4444",
      } as const;
    default:
      return {
        border: "1px solid rgba(var(--pl-accent-rgb) / 0.12)",
        background: "linear-gradient(90deg, rgba(var(--pl-accent-rgb) / 0.06), rgba(var(--pl-accent-rgb) / 0.02))",
        color: "var(--pl-fg)",
        iconColor: "var(--pl-accent)",
      } as const;
  }
}

export function Toaster() {
  const toasts = useToasts((s) => s.toasts);
  return (
    <div className="pointer-events-none fixed top-6 right-6 z-[100] flex flex-col gap-3 max-w-[calc(100vw-3rem)]">
      {toasts.map((t) => {
        const st = getToneStyles(t.tone);
        return (
          <div
            key={t.id}
            style={{ border: st.border, background: st.background, color: st.color }}
            className={clsx(
              "pointer-events-auto flex items-start gap-3 rounded-2xl px-5 py-3.5 text-sm font-semibold shadow-2xl backdrop-blur-xl max-w-md w-fit ml-auto",
              "animate-in fade-in slide-in-from-right-8 duration-300",
            )}
          >
            <div className="shrink-0 mt-0.5" style={{ color: st.iconColor }}>{icons[t.tone]}</div>
            <div style={{ color: "var(--pl-fg)" }} className="leading-relaxed break-words">{t.message}</div>
          </div>
        );
      })}
    </div>
  );
}
