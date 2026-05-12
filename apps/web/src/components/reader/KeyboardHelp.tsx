import type { ShortcutMap } from "../../lib/shortcuts";
import { formatShortcutKey } from "../../lib/shortcuts";

interface Props {
  open: boolean;
  onClose: () => void;
  shortcuts: ShortcutMap;
}

interface ShortcutGroup {
  title: string;
  rows: { keys: string[]; label: string }[];
}

export function KeyboardHelp({ open, onClose, shortcuts }: Props) {
  const groups: ShortcutGroup[] = [
    {
      title: "Navegación",
      rows: [
        { keys: [formatShortcutKey(shortcuts.prev), formatShortcutKey(shortcuts.next)], label: "Página anterior / siguiente" },
        { keys: ["Espacio"], label: "Avanzar / scroll abajo" },
        { keys: ["Inicio", "Fin"], label: "Primera / última página" },
        { keys: ["1", "…", "9", "0"], label: "Saltar al 10–100%" },
        { keys: [formatShortcutKey(shortcuts.goto)], label: "Ir a página específica" },
      ],
    },
    {
      title: "Visualización",
      rows: [
        { keys: [formatShortcutKey(shortcuts.toggleFs)], label: "Pantalla completa" },
        { keys: ["Ctrl", "Rueda"], label: "Zoom" },
        { keys: ["+", "−"], label: "Acercar / alejar" },
        { keys: ["Ctrl", "0"], label: "Restablecer zoom (1:1)" },
        { keys: [formatShortcutKey(shortcuts.toggleStrip)], label: "Mostrar / ocultar miniaturas" },
      ],
    },
    {
      title: "Herramientas",
      rows: [
        { keys: [formatShortcutKey(shortcuts.toggleBookmarks)], label: "Panel de marcadores" },
        { keys: ["M"], label: "Marcador rápido en página actual" },
        { keys: [formatShortcutKey(shortcuts.toggleHelp)], label: "Esta ayuda" },
        { keys: [formatShortcutKey(shortcuts.exit)], label: "Salir del lector" },
      ],
    },
  ];

  if (!open) return null;

  return (
    <div
      className="absolute inset-0 z-40 grid place-items-center bg-black/70 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Atajos de teclado"
    >
      <div
        className="pointer-events-auto w-full max-w-lg rounded-2xl bg-[#0f111a]/95 p-6 shadow-2xl border border-white/10 backdrop-blur-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between border-b border-white/5 pb-4">
          <div className="flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-blue-400"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M8 12h.01M12 12h.01M16 12h.01M8 16h8"/></svg>
            <h2 className="text-sm font-black uppercase tracking-widest text-slate-300">Atajos de teclado</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 hover:bg-white/5 text-slate-500 hover:text-white transition-colors"
            aria-label="Cerrar"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>

        <div className="space-y-5 max-h-[60vh] overflow-y-auto pr-1 custom-scrollbar">
          {groups.map((g) => (
            <div key={g.title}>
              <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-600 mb-2">{g.title}</div>
              <ul className="space-y-1.5">
                {g.rows.map((r) => (
                  <li key={r.label} className="flex items-center justify-between gap-3 rounded-xl px-3 py-2 hover:bg-white/[0.03] transition-colors">
                    <span className="text-xs font-medium text-slate-400">{r.label}</span>
                    <span className="flex flex-wrap items-center gap-1 shrink-0">
                      {r.keys.map((k, i) => (
                        <kbd
                          key={i}
                          className="inline-flex min-w-[1.5rem] items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-[11px] font-bold text-slate-300 shadow-sm"
                        >
                          {k}
                        </kbd>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-5 pt-4 border-t border-white/5">
          <p className="text-[11px] text-slate-500 leading-relaxed">
            <span className="font-bold text-slate-400">Táctil:</span> Toca el centro para mostrar/ocultar controles. Pellizca para zoom. Desliza para mover cuando hay zoom activo.
          </p>
        </div>
      </div>
    </div>
  );
}
