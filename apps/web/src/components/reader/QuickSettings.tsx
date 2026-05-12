import clsx from "clsx";
import { useSettingsStore } from "../../stores/settings";

interface Props {
  open: boolean;
  onClose: () => void;
}

const modes = [
  { id: "scroll-v", label: "Scroll vertical" },
  { id: "paged-h", label: "Paginado horizontal" },
  { id: "paged-h-2", label: "Doble página" },
  { id: "paged-v", label: "Paginado vertical" },
  { id: "webtoon", label: "Webtoon" },
] as const;

const fits = [
  { id: "fit-width", label: "Ajustar ancho" },
  { id: "fit-height", label: "Ajustar alto" },
  { id: "original", label: "Tamaño original" },
] as const;

const dirs = [
  { id: "ltr", label: "Izquierda → derecha" },
  { id: "rtl", label: "Derecha → izquierda (manga)" },
] as const;

export function QuickSettings({ open, onClose }: Props) {
  const settings = useSettingsStore((s) => s.settings);
  const update = useSettingsStore((s) => s.update);
  if (!settings) return null;

  return (
    <div
      className={clsx(
        "absolute right-6 top-16 z-50 w-[22rem] rounded-3xl bg-[#0f111a]/95 p-6 shadow-2xl border border-white/10 backdrop-blur-2xl transition-all duration-300",
        open ? "opacity-100 translate-y-0 scale-100" : "pointer-events-none opacity-0 -translate-y-4 scale-95",
      )}
      role="dialog"
      aria-modal="true"
      aria-label="Ajustes rápidos del lector"
    >
      <div className="mb-6 flex items-center justify-between border-b border-white/5 pb-4">
        <div className="flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-blue-500"><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Ajustes Rápidos</span>
        </div>
        <button
          onClick={onClose}
          className="rounded-full p-1 hover:bg-white/5 text-slate-500 hover:text-white transition-colors"
          aria-label="Cerrar"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>

      <div className="space-y-6 max-h-[70vh] overflow-y-auto pr-2 custom-scrollbar">
        <Section title="Visualización">
          <div className="flex flex-col gap-3">
            <div className="space-y-1.5">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">Modo</span>
              <div className="flex flex-wrap gap-1.5">
                {modes.map((m) => (
                  <Pill key={m.id} active={settings.readingMode === m.id} onClick={() => update({ readingMode: m.id })}>
                    {m.label}
                  </Pill>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">Ajuste</span>
              <div className="flex flex-wrap gap-1.5">
                {fits.map((f) => (
                  <Pill key={f.id} active={settings.fitMode === f.id} onClick={() => update({ fitMode: f.id })}>
                    {f.label}
                  </Pill>
                ))}
              </div>
            </div>
          </div>
        </Section>

        <Section title="Calidad de imagen">
          <div className="flex flex-wrap gap-1.5">
            {(["high", "balanced", "fast"] as const).map((q) => (
              <Pill key={q} active={settings.imageQuality === q} onClick={() => update({ imageQuality: q })}>
                {q === "high" ? "Alta" : q === "balanced" ? "Balance" : "Rápida"}
              </Pill>
            ))}
          </div>
        </Section>

        <Section title="Experiencia">
          <div className="grid grid-cols-2 gap-3">
            <Toggle label="Recortar margen" active={settings.autoCropMargins} onClick={() => update({ autoCropMargins: !settings.autoCropMargins })} />
            <Toggle label="Miniaturas" active={settings.showThumbStrip} onClick={() => update({ showThumbStrip: !settings.showThumbStrip })} />
            <Toggle label="Auto siguiente" active={settings.autoAdvanceToNext} onClick={() => update({ autoAdvanceToNext: !settings.autoAdvanceToNext })} />
            <Toggle label="Barra superior" active={settings.showTopProgress} onClick={() => update({ showTopProgress: !settings.showTopProgress })} />
            <Toggle label="Reducir mov." active={settings.reduceMotion} onClick={() => update({ reduceMotion: !settings.reduceMotion })} />
            <Toggle label="Animaciones" active={settings.animationsEnabled} onClick={() => update({ animationsEnabled: !settings.animationsEnabled })} />
          </div>
        </Section>

        <Section title="Filtros de imagen">
          <div className="flex flex-wrap gap-1.5">
            {(["none", "sepia", "night", "high-contrast"] as const).map((f) => (
              <Pill
                key={f}
                active={settings.imageFilter === f}
                onClick={() => update({ imageFilter: f })}
              >
                {f === "none" ? "Original" : f === "sepia" ? "Sepia" : f === "night" ? "Noche" : "Contraste"}
              </Pill>
            ))}
          </div>
        </Section>

        <Section title="Lectura">
          <div className="space-y-1.5">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">Dirección</span>
            <div className="flex gap-1.5">
              {dirs.map((d) => (
                <Pill key={d.id} active={settings.direction === d.id} onClick={() => update({ direction: d.id })}>
                  {d.id === "ltr" ? "Normal" : "Manga (RTL)"}
                </Pill>
              ))}
            </div>
          </div>
        </Section>

        <Section title="Diseño de página">
          <SliderRow
            label="Ancho máximo"
            value={settings.readerMaxWidth}
            min={600}
            max={2000}
            step={20}
            unit="px"
            onChange={(v) => update({ readerMaxWidth: v })}
          />
          <SliderRow
            label="Espacio entre páginas"
            value={settings.readerPageGap}
            min={0}
            max={64}
            step={2}
            unit="px"
            onChange={(v) => update({ readerPageGap: v })}
          />
          <SliderRow
            label="Margen lateral"
            value={settings.readerSidePadding}
            min={0}
            max={120}
            step={4}
            unit="px"
            onChange={(v) => update({ readerSidePadding: v })}
          />
          <SliderRow
            label="Pre-carga"
            value={settings.readerPagePreload}
            min={1}
            max={10}
            step={1}
            unit=" pág"
            onChange={(v) => update({ readerPagePreload: v })}
          />
        </Section>

        <Section title="Brillo y contraste">
          <SliderRow
            label="Brillo"
            value={settings.readerBrightness ?? 100}
            min={40}
            max={150}
            step={5}
            unit="%"
            onChange={(v) => update({ readerBrightness: v })}
          />
          <SliderRow
            label="Contraste"
            value={settings.readerContrast ?? 100}
            min={60}
            max={150}
            step={5}
            unit="%"
            onChange={(v) => update({ readerContrast: v })}
          />
          {((settings.readerBrightness ?? 100) !== 100 || (settings.readerContrast ?? 100) !== 100) && (
            <button
              onClick={() => update({ readerBrightness: 100, readerContrast: 100 })}
              className="w-full mt-1 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-1.5 text-[10px] font-bold text-slate-400 hover:text-white transition-colors"
            >
              Restablecer valores
            </button>
          )}
        </Section>

        <Section title="Auto-scroll">
          <SliderRow
            label="Velocidad"
            value={settings.autoScrollSpeed}
            min={20}
            max={400}
            step={10}
            unit=" px/s"
            onChange={(v) => update({ autoScrollSpeed: v })}
          />
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2.5">
      <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-600">{title}</div>
      {children}
    </div>
  );
}

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        "rounded-xl px-3 py-1.5 text-[11px] font-bold transition-all border",
        active
          ? "bg-blue-600 border-blue-400 text-white shadow-lg shadow-blue-600/20"
          : "bg-white/5 border-white/5 text-slate-400 hover:text-slate-200 hover:bg-white/10",
      )}
    >
      {children}
    </button>
  );
}

function Toggle({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={clsx(
        "flex items-center justify-between rounded-2xl p-3 border transition-all",
        active
          ? "bg-blue-600/10 border-blue-500/30 text-blue-400"
          : "bg-white/[0.02] border-white/5 text-slate-500 hover:border-white/10"
      )}
    >
      <span className="text-[10px] font-bold uppercase tracking-tight">{label}</span>
      <div className={clsx(
        "h-1.5 w-1.5 rounded-full",
        active ? "bg-blue-500 shadow-[0_0_5px_rgba(59,130,246,1)]" : "bg-slate-700"
      )} />
    </button>
  );
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">
          {label}
        </span>
        <span className="text-[10px] font-black tabular-nums text-blue-400">
          {value}
          {unit}
        </span>
      </div>
      <div className="flex items-center gap-2 rounded-2xl bg-white/[0.03] px-3 py-2 border border-white/5">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseInt(e.target.value, 10))}
          className="flex-1 accent-blue-500"
          aria-label={label}
        />
      </div>
    </div>
  );
}
