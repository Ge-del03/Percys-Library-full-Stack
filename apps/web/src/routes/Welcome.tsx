import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import clsx from "clsx";
import { useSettingsStore } from "../stores/settings";
import { useToasts } from "../stores/toasts";
import { Avatar, AvatarPresetGrid } from "../components/AvatarPresets";
import { THEMES } from "../lib/themes";
import type { ReadingMode, SettingsDto } from "../lib/api";

const READING_MODES: { id: ReadingMode; label: string; hint: string }[] = [
  { id: "paged-h", label: "Paginado", hint: "Una página a la vez" },
  { id: "paged-h-2", label: "Doble página", hint: "Como un libro abierto" },
  { id: "paged-v", label: "Paginado vertical", hint: "Página a página, hacia abajo" },
  { id: "scroll-v", label: "Scroll", hint: "Desplazamiento continuo" },
  { id: "webtoon", label: "Webtoon", hint: "Tira larga estilo manhwa" },
];

const ACCENT_PALETTE = [
  "#7c5cff",
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#ec4899",
  "#22d3ee",
  "#84cc16",
] as const;

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.readAsDataURL(file);
  });
}

type Step = 0 | 1 | 2;

export function Welcome() {
  const settings = useSettingsStore((s) => s.settings);
  const update = useSettingsStore((s) => s.update);
  const load = useSettingsStore((s) => s.load);
  const push = useToasts((s) => s.push);
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [step, setStep] = useState<Step>(0);
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [avatar, setAvatar] = useState<string | null>(null);
  const [themeId, setThemeId] = useState("dark");
  const [accentColor, setAccentColor] = useState<string>("#7c5cff");
  const [readingMode, setReadingMode] = useState<ReadingMode>("paged-h");
  const [direction, setDirection] = useState<"ltr" | "rtl">("ltr");
  const [coverSize, setCoverSize] = useState<"sm" | "md" | "lg">("md");
  const [saving, setSaving] = useState(false);
  const [showFirstError, setShowFirstError] = useState(false);
  const [readerPageGap, setReaderPageGap] = useState(8);
  const [readerSidePadding, setReaderSidePadding] = useState(0);

  // If the user already onboarded, never show this page — bounce home.
  useEffect(() => {
    if (settings?.hasOnboarded) {
      navigate("/", { replace: true });
    }
  }, [settings?.hasOnboarded, navigate]);

  // Hydrate the form once from the server-side defaults so accent/theme
  // pre-selections match whatever the server seeded.
  const hydrated = useRef(false);
  useEffect(() => {
    if (!settings || hydrated.current) return;
    hydrated.current = true;
    setThemeId(settings.theme || "dark");
    setAccentColor(settings.accentColor || "#7c5cff");
    setReadingMode(settings.readingMode || "paged-h");
    setDirection(settings.direction || "ltr");
    setCoverSize(settings.coverSize || "md");
    if (settings.userName) setFirst(settings.userName);
    if (settings.userLastName) setLast(settings.userLastName);
    setAvatar(settings.avatar ?? null);
    setReaderPageGap(settings.readerPageGap ?? 8);
    setReaderSidePadding(settings.readerSidePadding ?? 0);
  }, [settings]);

  const chosenTheme = useMemo(
    () => THEMES.find((t) => t.id === themeId) ?? THEMES[0],
    [themeId],
  );
  const initials = `${first[0] ?? ""}${last[0] ?? ""}`.toUpperCase();
  const previewName = first.trim() || "Tu nombre";

  async function finish(skip = false) {
    if (saving) return;
    setSaving(true);
    try {
      const firstName = skip ? "" : first.trim();
      const lastName = skip ? null : last.trim() || null;
      const patch: Partial<SettingsDto> = {
        userName: firstName || "Lector",
        userLastName: lastName,
        avatar,
        theme: themeId,
        accentColor,
        readingMode,
        direction,
        coverSize,
        readerPageGap,
        readerSidePadding,
        hasOnboarded: true,
      };
      await update(patch);
      await load();
      const greeting = firstName ? `Listo, ${firstName}` : "Listo";
      push(`${greeting} · Tu biblioteca te espera`, "success");
      navigate("/", { replace: true });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "No se pudo completar la bienvenida";
      push(msg, "error");
    } finally {
      setSaving(false);
    }
  }

  // Don't flash the welcome to a returning user before the bounce effect runs.
  if (settings?.hasOnboarded) return null;

  const canAdvanceFromStep0 = first.trim().length > 0;

  return (
    <div className="welcome-shell relative min-h-screen w-full overflow-y-auto bg-[#04050b] text-white">
      <div
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(circle at 12% 18%, rgba(124,92,255,0.28), transparent 55%), radial-gradient(circle at 92% 12%, rgba(34,211,238,0.18), transparent 55%), radial-gradient(circle at 50% 100%, rgba(236,72,153,0.18), transparent 55%)",
        }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 -z-10 opacity-40"
        style={{
          backgroundImage:
            "radial-gradient(rgba(255,255,255,0.06) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
        aria-hidden
      />

      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-10 md:px-10 lg:px-14">
        <header className="flex items-center justify-between gap-4">
          <div>
            <div className="pl-brand text-2xl font-black tracking-tight md:text-3xl">
              Percy&apos;s Library
            </div>
            <div className="pl-brand-sub mt-1 text-[10px] font-bold uppercase tracking-[0.3em]">
              Tu archivo digital de cómics
            </div>
          </div>
          <div className="hidden items-center gap-2 text-xs font-semibold text-slate-400 md:flex">
            <span className={clsx("h-2 w-2 rounded-full", step >= 0 ? "bg-violet-400" : "bg-slate-700")} />
            <span className={clsx("h-2 w-2 rounded-full", step >= 1 ? "bg-violet-400" : "bg-slate-700")} />
            <span className={clsx("h-2 w-2 rounded-full", step >= 2 ? "bg-violet-400" : "bg-slate-700")} />
            <span className="ml-2 uppercase tracking-[0.25em] text-slate-500">Paso {step + 1} de 3</span>
          </div>
        </header>

        <main className="mt-10 grid flex-1 gap-8 lg:mt-14 lg:grid-cols-[1.1fr_1fr]">
          {/* LEFT — narrative & preview */}
          <section className="space-y-8">
            <div className="space-y-5">
              <span className="inline-flex items-center rounded-full border border-violet-400/30 bg-violet-500/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.3em] text-violet-200">
                Bienvenida
              </span>
              <h1 className="text-4xl font-black leading-tight tracking-tight md:text-5xl lg:text-6xl">
                Tu colección de cómics,
                <span className="block bg-gradient-to-r from-violet-300 via-fuchsia-200 to-cyan-200 bg-clip-text text-transparent">
                  ordenada y a tu medida.
                </span>
              </h1>
              <p className="max-w-xl text-base leading-relaxed text-slate-300 md:text-lg">
                Importa, lee y sigue tu progreso de cómics CBZ, CBR y PDF en un solo lugar.
                Configura tu perfil una vez y entra directo a leer la próxima vez.
              </p>
            </div>

            {/* Live preview card — reflects user choices in real time */}
            <div
              className="relative rounded-[2rem] border border-white/10 p-6 shadow-2xl shadow-black/40 backdrop-blur-md"
              style={{ backgroundColor: chosenTheme.surface1 }}
            >
              <div className="flex items-center gap-4">
                <div
                  className="rounded-2xl border p-1 shadow-lg"
                  style={{ borderColor: chosenTheme.border, backgroundColor: chosenTheme.bg }}
                >
                  <Avatar value={avatar} size={68} className="rounded-2xl" fallbackText={initials} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-black uppercase tracking-[0.25em]" style={{ color: chosenTheme.text2 }}>
                    Vista previa
                  </div>
                  <div className="mt-1 truncate text-2xl font-black" style={{ color: chosenTheme.fg }}>
                    {previewName}
                  </div>
                  <div className="mt-1 text-sm" style={{ color: chosenTheme.text2 }}>
                    {chosenTheme.name} · {READING_MODES.find((m) => m.id === readingMode)?.label} · {direction === "rtl" ? "Der → Izq" : "Izq → Der"}
                  </div>
                </div>
              </div>
              <div className="mt-5 grid grid-cols-3 gap-2">
                {[1, 2, 3].map((n) => (
                  <div
                    key={n}
                    className="aspect-[2/3] rounded-xl border"
                    style={{
                      borderColor: chosenTheme.border,
                      background: `linear-gradient(135deg, ${accentColor}33, ${chosenTheme.surface2})`,
                    }}
                  />
                ))}
              </div>
              <div className="mt-5 flex items-center gap-3">
                <div
                  className="h-2 flex-1 overflow-hidden rounded-full"
                  style={{ backgroundColor: chosenTheme.surface2 }}
                >
                  <div
                    className="h-full rounded-full"
                    style={{ width: "62%", backgroundColor: accentColor }}
                  />
                </div>
                <div className="text-xs font-bold" style={{ color: chosenTheme.text1 }}>
                  62% leído
                </div>
              </div>
            </div>

            <ul className="grid gap-3 sm:grid-cols-3">
              {[
                ["Importa", "Arrastra archivos CBZ/CBR/PDF y se organizan solos."],
                ["Lee", "5 modos de lectura, atajos de teclado y zoom inteligente."],
                ["Sigue tu ritmo", "Estadísticas, marcadores y logros para tu hábito."],
              ].map(([title, desc]) => (
                <li
                  key={title}
                  className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm shadow-inner"
                >
                  <div className="text-xs font-black uppercase tracking-widest text-violet-200">{title}</div>
                  <div className="mt-2 text-slate-300">{desc}</div>
                </li>
              ))}
            </ul>
          </section>

          {/* RIGHT — multi-step form */}
          <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-black/30 backdrop-blur-md md:p-8">
            <div className="mb-6 flex items-center justify-between gap-4">
              <div>
                <div className="text-[11px] font-black uppercase tracking-[0.3em] text-violet-200">
                  {step === 0 ? "Tu perfil" : step === 1 ? "Estilo" : "Cómo lees"}
                </div>
                <h2 className="mt-1 text-2xl font-black md:text-3xl">
                  {step === 0
                    ? "Cuéntanos de ti"
                    : step === 1
                      ? "Elige el aspecto"
                      : "Tu experiencia de lectura"}
                </h2>
              </div>
              <div className="flex items-center gap-1.5 md:hidden">
                {[0, 1, 2].map((n) => (
                  <span
                    key={n}
                    className={clsx(
                      "h-2 w-2 rounded-full",
                      step >= n ? "bg-violet-400" : "bg-slate-700",
                    )}
                  />
                ))}
              </div>
            </div>

            {step === 0 && (
              <div className="space-y-6">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="space-y-2">
                    <span className="text-[11px] font-black uppercase tracking-widest text-slate-400">
                      Nombre
                    </span>
                    <input
                      autoFocus
                      value={first}
                      onChange={(e) => {
                        setFirst(e.target.value);
                        if (showFirstError && e.target.value.trim()) setShowFirstError(false);
                      }}
                      placeholder="¿Cómo te llamas?"
                      maxLength={40}
                      aria-invalid={showFirstError}
                      className={clsx(
                        "w-full rounded-2xl border bg-white/[0.04] px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2",
                        showFirstError
                          ? "border-rose-400/70 focus:border-rose-400/80 focus:ring-rose-400/20"
                          : "border-white/10 focus:border-violet-400/60 focus:ring-violet-400/20",
                      )}
                    />
                    {showFirstError && (
                      <span className="block text-xs font-bold text-rose-300">
                        Necesitamos al menos un nombre para personalizar la biblioteca.
                      </span>
                    )}
                  </label>
                  <label className="space-y-2">
                    <span className="text-[11px] font-black uppercase tracking-widest text-slate-400">
                      Apellido <span className="font-normal text-slate-600">(opcional)</span>
                    </span>
                    <input
                      value={last}
                      onChange={(e) => setLast(e.target.value)}
                      placeholder="Tu apellido"
                      maxLength={40}
                      className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:border-violet-400/60 focus:outline-none focus:ring-2 focus:ring-violet-400/20"
                    />
                  </label>
                </div>

                <div className="space-y-3">
                  <div className="text-[11px] font-black uppercase tracking-widest text-slate-400">
                    Avatar
                  </div>
                  <AvatarPresetGrid value={avatar} onChange={setAvatar} />
                  <div className="flex flex-wrap items-center gap-3">
                    <button type="button" className="pl-btn" onClick={() => fileInputRef.current?.click()}>
                      Subir foto
                    </button>
                    {avatar && (
                      <button type="button" className="pl-btn" onClick={() => setAvatar(null)}>
                        Sin foto
                      </button>
                    )}
                    <span className="text-xs text-slate-500">PNG, JPG, WEBP o SVG · máx. 250 KB</span>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      if (file.size > 250_000) {
                        push("La imagen es demasiado grande (máx. 250KB)", "error");
                        e.target.value = "";
                        return;
                      }
                      try {
                        const data = await fileToDataUrl(file);
                        setAvatar(data);
                      } catch {
                        push("No se pudo leer la imagen", "error");
                      } finally {
                        e.target.value = "";
                      }
                    }}
                  />
                </div>
              </div>
            )}

            {step === 1 && (
              <div className="space-y-6">
                <div className="space-y-3">
                  <div className="text-[11px] font-black uppercase tracking-widest text-slate-400">
                    Tema base
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {THEMES.slice(0, 6).map((theme) => (
                      <button
                        key={theme.id}
                        type="button"
                        onClick={() => setThemeId(theme.id)}
                        className={clsx(
                          "rounded-2xl border p-3 text-left transition-all",
                          themeId === theme.id
                            ? "border-violet-400/60 ring-2 ring-violet-400/40"
                            : "border-white/10 hover:border-white/20",
                        )}
                        style={{ backgroundColor: theme.bg }}
                      >
                        <div className="text-sm font-bold" style={{ color: theme.fg }}>
                          {theme.name}
                        </div>
                        <div className="mt-2 flex gap-1.5">
                          <span className="h-3 w-3 rounded-full" style={{ backgroundColor: theme.surface1 }} />
                          <span className="h-3 w-3 rounded-full" style={{ backgroundColor: theme.surface2 }} />
                          <span className="h-3 w-3 rounded-full" style={{ backgroundColor: theme.accent }} />
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="text-[11px] font-black uppercase tracking-widest text-slate-400">
                    Color de acento
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {ACCENT_PALETTE.map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setAccentColor(color)}
                        aria-label={`Acento ${color}`}
                        className={clsx(
                          "h-10 w-10 rounded-xl ring-2 ring-offset-2 ring-offset-[#04050b] transition-transform hover:scale-110",
                          accentColor === color ? "ring-white" : "ring-transparent",
                        )}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                    <label className="ml-1 inline-flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-bold text-slate-300">
                      Personalizado
                      <input
                        type="color"
                        value={accentColor}
                        onChange={(e) => setAccentColor(e.target.value.toLowerCase())}
                        className="h-7 w-9 cursor-pointer rounded-md border border-white/10 bg-transparent p-0"
                      />
                    </label>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="text-[11px] font-black uppercase tracking-widest text-slate-400">
                    Tamaño de portadas
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {([
                      ["sm", "Mini"],
                      ["md", "Estándar"],
                      ["lg", "Grande"],
                    ] as const).map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setCoverSize(id)}
                        className={clsx("pl-btn text-xs", coverSize === id && "!bg-violet-600 !text-white")}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-6">
                <div className="space-y-3">
                  <div className="text-[11px] font-black uppercase tracking-widest text-slate-400">
                    Modo de lectura por defecto
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {READING_MODES.map((mode) => (
                      <button
                        key={mode.id}
                        type="button"
                        onClick={() => setReadingMode(mode.id)}
                        className={clsx(
                          "rounded-2xl border px-4 py-3 text-left text-sm transition-all",
                          readingMode === mode.id
                            ? "border-violet-400/60 bg-violet-500/15 text-white"
                            : "border-white/10 bg-white/[0.02] text-slate-300 hover:border-white/20 hover:bg-white/[0.04]",
                        )}
                      >
                        <div className="font-bold">{mode.label}</div>
                        <div className="text-xs text-slate-400">{mode.hint}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="text-[11px] font-black uppercase tracking-widest text-slate-400">
                    Dirección de lectura
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {([
                      ["ltr", "Izquierda → Derecha"],
                      ["rtl", "Derecha → Izquierda (manga)"],
                    ] as const).map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setDirection(id)}
                        className={clsx("pl-btn text-xs", direction === id && "!bg-violet-600 !text-white")}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="space-y-2 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                    <span className="text-[11px] font-black uppercase tracking-widest text-slate-400">
                      Espacio entre páginas
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={48}
                      step={2}
                      value={readerPageGap}
                      onChange={(e) => setReaderPageGap(parseInt(e.target.value, 10))}
                      className="w-full accent-violet-400"
                    />
                    <div className="flex justify-between text-[11px] font-bold text-slate-500">
                      <span>{readerPageGap}px</span>
                      <span>{readerPageGap === 0 ? "Sin gap" : readerPageGap > 24 ? "Espacioso" : "Normal"}</span>
                    </div>
                  </label>
                  <label className="space-y-2 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                    <span className="text-[11px] font-black uppercase tracking-widest text-slate-400">
                      Márgenes laterales
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={80}
                      step={4}
                      value={readerSidePadding}
                      onChange={(e) => setReaderSidePadding(parseInt(e.target.value, 10))}
                      className="w-full accent-violet-400"
                    />
                    <div className="flex justify-between text-[11px] font-bold text-slate-500">
                      <span>{readerSidePadding}px</span>
                      <span>{readerSidePadding === 0 ? "A pantalla" : "Con aire"}</span>
                    </div>
                  </label>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm leading-relaxed text-slate-400">
                  Vas a empezar como{" "}
                  <span className="font-bold text-white">
                    {first.trim() || "Lector"}
                    {last.trim() ? ` ${last.trim()}` : ""}
                  </span>
                  , con tema <span className="font-bold text-white">{chosenTheme.name}</span> y modo de lectura{" "}
                  <span className="font-bold text-white">
                    {READING_MODES.find((m) => m.id === readingMode)?.label}
                  </span>
                  . Podrás ajustar todo en Configuración cuando quieras.
                </div>
              </div>
            )}

            <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-6">
              <button
                type="button"
                onClick={() => void finish(true)}
                disabled={saving}
                className="text-xs font-bold uppercase tracking-widest text-slate-500 hover:text-slate-300 disabled:opacity-50"
              >
                Saltar y entrar como Lector
              </button>
              <div className="flex items-center gap-3">
                {step > 0 && (
                  <button
                    type="button"
                    onClick={() => setStep((s) => (s > 0 ? ((s - 1) as Step) : s))}
                    disabled={saving}
                    className="pl-btn"
                  >
                    Atrás
                  </button>
                )}
                {step < 2 ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (step === 0 && !canAdvanceFromStep0) {
                        setShowFirstError(true);
                        return;
                      }
                      setShowFirstError(false);
                      setStep((s) => ((s + 1) as Step));
                    }}
                    disabled={saving}
                    className="pl-btn-primary"
                  >
                    Continuar
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void finish(false)}
                    disabled={saving}
                    className="pl-btn-primary"
                  >
                    {saving ? "Preparando…" : "Entrar a la biblioteca"}
                  </button>
                )}
              </div>
            </div>
          </section>
        </main>

        <footer className="mt-10 text-center text-[11px] font-bold uppercase tracking-widest text-slate-600">
          Percy&apos;s Library · Tu biblioteca, tus reglas
        </footer>
      </div>
    </div>
  );
}
