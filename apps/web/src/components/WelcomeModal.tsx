import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { useSettingsStore } from "../stores/settings";
import { useToasts } from "../stores/toasts";
import { type SettingsDto } from "../lib/api";
import { Avatar, AvatarPresetGrid } from "./AvatarPresets";
import { THEMES } from "../lib/themes";

const READING_MODE_LABEL: Record<string, string> = {
  "paged-h": "Paginado",
  "paged-h-2": "Doble página",
  "paged-v": "Paginado vertical",
  "scroll-v": "Scroll",
  webtoon: "Webtoon",
};

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.readAsDataURL(file);
  });
}

export function WelcomeModal() {
  const settings = useSettingsStore((s) => s.settings);
  const update = useSettingsStore((s) => s.update);
  const load = useSettingsStore((s) => s.load);
  const push = useToasts((s) => s.push);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [avatar, setAvatar] = useState<string | null>(null);
  const [themeId, setThemeId] = useState("dark");
  const [accentColor, setAccentColor] = useState("#7c5cff");
  const [readingMode, setReadingMode] = useState("paged-h");
  const [direction, setDirection] = useState("ltr");
  const [coverSize, setCoverSize] = useState("md");
  const [saving, setSaving] = useState(false);
  const hydrated = useRef(false);

  useEffect(() => {
    if (!settings || settings.hasOnboarded || hydrated.current) return;
    hydrated.current = true;
    setThemeId(settings.theme || "dark");
    setAccentColor(settings.accentColor || "#7c5cff");
    setReadingMode(settings.readingMode || "paged-h");
    setDirection(settings.direction || "ltr");
    setCoverSize(settings.coverSize || "md");
    setFirst(settings.userName ?? "");
    setLast(settings.userLastName ?? "");
    setAvatar(settings.avatar ?? null);
  }, [settings]);

  if (!settings || settings.hasOnboarded) return null;

  const chosenTheme = THEMES.find((t) => t.id === themeId) ?? THEMES[0];
  const readingLabel = READING_MODE_LABEL[readingMode] ?? readingMode;

  async function finish(skip = false) {
    if (saving) return;
    setSaving(true);
    try {
      const firstName = skip ? "Lector" : first.trim() || "Lector";
      const lastName = skip ? null : (last.trim() || null);
      await update({
        userName: firstName,
        userLastName: lastName,
        avatar,
        theme: themeId,
        accentColor,
        readingMode: readingMode as SettingsDto["readingMode"],
        direction: direction as SettingsDto["direction"],
        coverSize: coverSize as SettingsDto["coverSize"],
        libraryView: "grid",
        librarySort: "lastReadAt",
        showThumbStrip: true,
        autoApplySettings: true,
        animationsEnabled: true,
        hasOnboarded: true,
      });
      await load();
      push(`Tu biblioteca está lista, ${firstName}`, "success");
    } catch (error) {
      const msg = error instanceof Error ? error.message : "No se pudo completar la bienvenida";
      push(msg, "error");
    } finally {
      setSaving(false);
    }
  }

  async function closeAssistant() {
    if (saving) return;
    setSaving(true);
    try {
      await update({ hasOnboarded: true });
      await load();
      push("Asistente cerrado", "info");
    } catch (error) {
      const msg = error instanceof Error ? error.message : "No se pudo cerrar el asistente";
      push(msg, "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[120] overflow-y-auto bg-gradient-to-br from-slate-100 via-violet-100/40 to-indigo-50/90 px-4 py-6 md:px-8 md:py-10 backdrop-blur-sm">
      <div className="mx-auto flex min-h-full max-w-6xl items-center">
        <div className="relative grid w-full overflow-hidden rounded-[2rem] border border-violet-200/60 bg-white shadow-[0_25px_80px_-20px_rgba(67,56,202,0.35)] lg:grid-cols-[1.08fr_1fr]">
          <button
            type="button"
            onClick={() => void closeAssistant()}
            disabled={saving}
            className="absolute right-4 top-4 z-20 rounded-full border border-slate-200 bg-white/90 px-3 py-1.5 text-xs font-bold text-slate-600 shadow-sm hover:bg-white disabled:opacity-50"
          >
            ✕
          </button>

          <section className="relative overflow-hidden p-8 md:p-10 lg:p-12">
            <div
              className="pointer-events-none absolute -right-20 top-10 h-72 w-72 rounded-full bg-violet-300/40 blur-3xl"
              aria-hidden
            />
            <div
              className="pointer-events-none absolute -bottom-16 left-10 h-64 w-64 rounded-full bg-amber-200/50 blur-3xl"
              aria-hidden
            />
            <div className="relative space-y-8">
              <div className="space-y-4 max-w-xl">
                <span className="inline-flex items-center rounded-full border border-violet-200 bg-violet-100/80 px-3 py-1 text-[11px] font-black uppercase tracking-[0.25em] text-violet-800">
                  Welcome
                </span>
                <div>
                  <h2 className="text-4xl font-black tracking-tight text-indigo-950 md:text-5xl">
                    Bienvenida a tu biblioteca
                  </h2>
                  <p className="mt-2 text-lg font-semibold text-amber-700/90 md:text-xl">
                    Un solo paso y empiezas a leer
                  </p>
                  <p className="mt-4 text-base leading-relaxed text-slate-600 md:text-lg">
                    Elige nombre, avatar y cómo te gusta leer. Siempre podrás afinar todo en Configuración.
                  </p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  ["Perfil", "Nombre y avatar"],
                  ["Biblioteca", "Portadas y orden"],
                  ["Lectura", "Modo y dirección"],
                ].map(([title, desc]) => (
                  <div
                    key={title}
                    className="rounded-2xl border border-violet-100 bg-white/80 p-4 shadow-sm shadow-violet-100/50"
                  >
                    <div className="text-sm font-bold text-indigo-950">{title}</div>
                    <div className="mt-1 text-xs text-slate-500">{desc}</div>
                  </div>
                ))}
              </div>

              <div className="rounded-[1.75rem] border border-violet-100 bg-gradient-to-br from-white to-violet-50/80 p-5 shadow-inner">
                <div className="flex items-start gap-4">
                  <Avatar
                    value={avatar}
                    size={72}
                    className="rounded-2xl border border-violet-100 shadow-lg shadow-violet-200/50"
                    fallbackText={`${first[0] ?? ""}${last[0] ?? ""}`}
                  />
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="text-[11px] font-black uppercase tracking-[0.2em] text-violet-400">Vista previa</div>
                    <div className="truncate text-xl font-bold text-indigo-950">{first.trim() || "Lector nuevo"}</div>
                    <div className="text-sm text-slate-600">
                      {chosenTheme.name} · {readingLabel} · {direction === "rtl" ? "RTL" : "LTR"}
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-violet-100">
                      <div className="h-full rounded-full bg-gradient-to-r from-violet-600 to-cyan-500" style={{ width: "72%" }} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="border-t border-violet-100 bg-ink-900 p-8 md:p-10 lg:border-l lg:border-t-0">
            <div className="space-y-6">
              <div>
                <h3 className="text-2xl font-black text-white">Configura tu perfil</h3>
                <p className="mt-2 text-sm text-slate-400">Puedes cambiar todo esto después en Configuración.</p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <input
                  value={first}
                  onChange={(e) => setFirst(e.target.value)}
                  placeholder="Nombre"
                  className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:border-blue-500/50 focus:outline-none"
                />
                <input
                  value={last}
                  onChange={(e) => setLast(e.target.value)}
                  placeholder="Apellido"
                  className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:border-blue-500/50 focus:outline-none"
                />
              </div>

              <div className="space-y-3">
                <div className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">Avatar</div>
                <AvatarPresetGrid value={avatar} onChange={setAvatar} />
                <div className="flex flex-wrap items-center gap-3">
                  <button type="button" onClick={() => inputRef.current?.click()} className="pl-btn">
                    Subir foto
                  </button>
                  <button type="button" onClick={() => setAvatar(null)} className="pl-btn">
                    Sin foto
                  </button>
                  <span className="text-xs text-slate-500">PNG, JPG, WEBP o SVG. Máx. 350 KB.</span>
                </div>
                <input
                  ref={inputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (file.size > 350_000) {
                      push("La imagen es demasiado grande (máx. 350KB)", "error");
                      return;
                    }
                    const data = await fileToDataUrl(file);
                    setAvatar(data);
                  }}
                />
              </div>

              <div className="space-y-3">
                <div className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">Tema inicial</div>
                <div className="grid grid-cols-3 gap-3">
                  {THEMES.slice(0, 6).map((theme) => (
                    <button
                      key={theme.id}
                      type="button"
                      onClick={() => setThemeId(theme.id)}
                      className={clsx(
                        "rounded-2xl border p-3 text-left transition-all",
                        themeId === theme.id ? "border-blue-500/40 ring-2 ring-blue-500/40" : "border-white/10 hover:border-white/20",
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
                <div className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">Acento y lectura</div>
                <div className="flex flex-wrap gap-2">
                  {["#7c5cff", "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#ec4899"].map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setAccentColor(color)}
                      className={clsx(
                        "h-9 w-9 rounded-xl ring-2 ring-offset-2 ring-offset-ink-900 transition-transform hover:scale-110",
                        accentColor === color ? "ring-white" : "ring-transparent",
                      )}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-bold text-slate-300">
                    Personalizado
                    <input type="color" value={accentColor} onChange={(e) => setAccentColor(e.target.value.toLowerCase())} className="h-8 w-9 cursor-pointer rounded-md border border-white/10 bg-transparent p-0" />
                  </label>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <div className="text-xs font-bold text-slate-300">Modo de lectura</div>
                    <div className="flex flex-wrap gap-2">
                      {[
                        ["paged-h", "Paginado"],
                        ["paged-h-2", "Doble"],
                        ["paged-v", "Vertical"],
                        ["scroll-v", "Scroll"],
                        ["webtoon", "Webtoon"],
                      ].map(([id, label]) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => setReadingMode(id)}
                          className={clsx("pl-btn text-xs", readingMode === id && "!bg-blue-600 !text-white")}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="text-xs font-bold text-slate-300">Dirección</div>
                    <div className="flex flex-wrap gap-2">
                      {["ltr", "rtl"].map((dir) => (
                        <button key={dir} type="button" onClick={() => setDirection(dir)} className={clsx("pl-btn text-xs", direction === dir && "!bg-blue-600 !text-white")}>{dir === "ltr" ? "Izq → Der" : "Der → Izq"}</button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <div className="text-xs font-bold text-slate-300">Tamaño de portadas</div>
                    <div className="flex flex-wrap gap-2">
                      {[["sm", "Mini"], ["md", "Estándar"], ["lg", "Grande"]].map(([id, label]) => (
                        <button key={id} type="button" onClick={() => setCoverSize(id)} className={clsx("pl-btn text-xs", coverSize === id && "!bg-blue-600 !text-white")}>{label}</button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <button type="button" onClick={() => void finish(true)} className="pl-btn" disabled={saving}>
                  Omitir por ahora
                </button>
                <button type="button" onClick={() => void finish(false)} className="pl-btn-primary w-full" disabled={saving}>
                  {saving ? "Preparando tu biblioteca..." : "Continuar"}
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
