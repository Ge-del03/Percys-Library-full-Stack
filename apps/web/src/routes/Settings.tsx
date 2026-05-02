import { useEffect, useRef, useState, useMemo } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useSettingsStore } from "../stores/settings";
import clsx from "clsx";
import { useToasts } from "../stores/toasts";
import type { SettingsDto } from "../lib/api";
import { Avatar, AvatarPresetGrid } from "../components/AvatarPresets";
import { ThemePicker } from "../components/ThemePicker";
import { THEMES, type ThemePreset } from "../lib/themes";
import { DEFAULT_SHORTCUTS, formatShortcutKey, normalizeShortcutKey, parseShortcutMap, type ShortcutAction, type ShortcutMap } from "../lib/shortcuts";
import { api } from "../lib/api";

const ACCENT_PALETTE = [
  "#7c5cff", // violet (default)
  "#3b82f6", // blue
  "#10b981", // emerald
  "#f59e0b", // amber
  "#ef4444", // red
  "#ec4899", // pink
  "#22d3ee", // cyan
  "#84cc16", // lime
];

// Read a File as a data URL (used for the avatar upload). Resolved value
// is what we store directly in the Settings row.
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.readAsDataURL(file);
  });
}

export function Settings() {
  const settings = useSettingsStore((s) => s.settings);
  const update = useSettingsStore((s) => s.update);
  const push = useToasts((s) => s.push);
  const location = useLocation();
  const navigate = useNavigate();

  const activeSection = useMemo(() => {
    const section = location.pathname.split("/")[2] || "profile";
    return ["profile", "appearance", "library", "reading", "shortcuts"].includes(section)
      ? section
      : "profile";
  }, [location.pathname]);

  const [isCreatingTheme, setIsCreatingTheme] = useState(false);
  const [newThemeName, setNewThemeName] = useState("");
  const [newThemeDraft, setNewThemeDraft] = useState<ThemePreset | null>(null);
  const [pendingPatch, setPendingPatch] = useState<Partial<SettingsDto>>({});
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const settingsView = useMemo(() => ({ ...settings, ...pendingPatch } as SettingsDto), [settings, pendingPatch]);
  const shortcutMap = useMemo(() => parseShortcutMap(settingsView?.keyboardShortcuts), [settingsView?.keyboardShortcuts]);

  const customThemesList: ThemePreset[] = useMemo(() => {
    try {
      return JSON.parse(settingsView.customThemes || "[]");
    } catch (error) {
      console.warn("No se pudieron leer los temas personalizados", error);
      return [];
    }
  }, [settingsView.customThemes]);
  const activeCustomTheme = customThemesList.find(t => t.id === settingsView.theme);

  const baseTheme = activeCustomTheme || THEMES.find((t) => t.id === settingsView.theme) || THEMES[0];

  useEffect(() => {
    if (location.pathname === "/settings") {
      navigate("/settings/profile", { replace: true });
    }
  }, [location.pathname, navigate]);

  useEffect(() => {
    if (!isCreatingTheme || !settings) return;
    setNewThemeDraft((prev) => prev ?? { ...baseTheme });
  }, [baseTheme, isCreatingTheme, settings]);

  // Warn the user once when they leave Settings while changes are still
  // pending. `pendingRef` keeps the latest pendingPatch so the cleanup
  // doesn't fire on every keystroke (the previous version re-ran on
  // every change which spammed the notification rail).
  const pendingRef = useRef({ pending: pendingPatch, autoApply: settingsView.autoApplySettings });
  useEffect(() => {
    pendingRef.current = { pending: pendingPatch, autoApply: settingsView.autoApplySettings };
  }, [pendingPatch, settingsView.autoApplySettings]);
  useEffect(() => {
    return () => {
      const { pending, autoApply } = pendingRef.current;
      if (!autoApply && Object.keys(pending).length > 0) {
        push("Saliste sin aplicar cambios pendientes", "warn");
      }
    };
  }, [push]);

  if (!settings) return <div className="p-12 text-slate-500 animate-pulse">Cargando perfil...</div>;

  async function patch<K extends keyof SettingsDto>(key: K, value: SettingsDto[K]) {
    if (!settingsView.autoApplySettings) {
      setPendingPatch((p) => ({ ...p, [key]: value }));
      return;
    }
    await update({ [key]: value } as Partial<SettingsDto>);
  }

  async function applyPendingChanges() {
    const patchData: Partial<SettingsDto> = { ...pendingPatch };
    if (Object.keys(patchData).length === 0) {
      push("No hay cambios pendientes", "info");
      return;
    }
    await update(patchData);
    setPendingPatch({});
    push("Cambios aplicados", "success");
  }

  function cancelPendingChanges() {
    setPendingPatch({});
    push("Cambios descartados", "warn");
  }

  async function createCustomTheme() {
    const name = newThemeName.trim();
    if (!name) return;

    const id = "custom-" + Date.now();
    const source = newThemeDraft ?? baseTheme;
    const newTheme: ThemePreset = { ...source, id, name };

    const nextList = [...customThemesList, newTheme];
    await update({ customThemes: JSON.stringify(nextList), theme: id });
    setIsCreatingTheme(false);
    setNewThemeName("");
    setNewThemeDraft(null);
    push("Tema creado", "success");
  }

  async function deleteCustomTheme() {
    if (!activeCustomTheme) return;
    const nextList = customThemesList.filter(t => t.id !== activeCustomTheme.id);
    await update({ customThemes: JSON.stringify(nextList), theme: "dark" });
    push("Tema eliminado", "success");
  }

  async function patchCustomTheme(key: keyof ThemePreset, value: string | boolean) {
    if (!activeCustomTheme) return;
    const nextList = customThemesList.map(t => t.id === activeCustomTheme.id ? { ...t, [key]: value } : t);
    await update({ customThemes: JSON.stringify(nextList) });
  }
  async function patchCustomThemeBatch(nextTheme: ThemePreset) {
    if (!activeCustomTheme) return;
    const nextList = customThemesList.map((t) => (t.id === activeCustomTheme.id ? nextTheme : t));
    await update({ customThemes: JSON.stringify(nextList) });
    push("Tema autoajustado para mejor legibilidad", "success");
  }

  function improveThemeContrast(theme: ThemePreset): ThemePreset {
    const onDark = isDark(theme.bg);
    const fg = ensureContrast(theme.fg, theme.bg, 4.5, onDark);
    const text1 = ensureContrast(theme.text1, theme.bg, 4.5, onDark);
    const text2 = ensureContrast(theme.text2, theme.bg, 3.2, onDark);
    const text3 = ensureContrast(theme.text3, theme.bg, 2.4, onDark);
    const border = ensureContrast(theme.border, theme.bg, 1.6, onDark);
    return { ...theme, fg, text1, text2, text3, border };
  }

  async function onPickAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 250_000) {
      push("La imagen es demasiado grande (máx. 250KB)", "error");
      return;
    }
    try {
      const url = await fileToDataUrl(file);
      await update({ avatar: url });
      push("Avatar actualizado", "success");
    } catch {
      push("No se pudo leer la imagen", "error");
    } finally {
      e.target.value = "";
    }
  }

  async function patchShortcut(action: ShortcutAction, key: string) {
    const next: ShortcutMap = { ...shortcutMap, [action]: normalizeShortcutKey(key) };
    await patch("keyboardShortcuts", JSON.stringify(next));
  }

  async function resetShortcuts() {
    await patch("keyboardShortcuts", JSON.stringify(DEFAULT_SHORTCUTS));
  }

  async function resetDefaults() {
    await api.resetDefaults();
    await update({});
    setPendingPatch({});
    setResetConfirmOpen(false);
    push("Configuración restablecida", "success");
  }

  return (
    <div className="flex-1 overflow-y-auto px-8 py-10 pl-gradient-bg">
      <div className="max-w-6xl mx-auto space-y-8 animate-fade-in">
        <header className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-6 md:p-8 shadow-2xl shadow-black/20">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl space-y-3">
              <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-black uppercase tracking-[0.2em] text-slate-300">
                Centro de control
              </span>
              <div>
                <h1 className="text-4xl md:text-5xl font-black tracking-tight text-white">Configuración</h1>
                <p className="mt-3 max-w-2xl text-slate-400 font-medium leading-relaxed">
                  Organiza tu perfil, tu lector y tu biblioteca en pantallas separadas para que cada ajuste tenga su lugar.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 min-w-[min(100%,34rem)]">
              <SummaryCard label="Perfil" value={settingsView.userName || "Lector"} hint="Avatar y nombre" />
              <SummaryCard label="Tema" value={settingsView.theme} hint={settingsView.autoApplySettings ? "Auto" : "Manual"} />
              <SummaryCard label="Lector" value={settingsView.readingMode} hint={`${settingsView.uiHideDelayMs} ms`} />
            </div>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          <aside className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-4 lg:sticky lg:top-6 h-fit">
            <div className="mb-4 px-2">
              <div className="text-[11px] font-black uppercase tracking-[0.25em] text-slate-500">Secciones</div>
            </div>
            <nav className="grid gap-2">
              {[
                ["profile", "Perfil"],
                ["appearance", "Apariencia"],
                ["library", "Biblioteca"],
                ["reading", "Lectura"],
                ["shortcuts", "Atajos"],
                              ].map(([section, label]) => (
                <NavLink
                  key={section}
                  to={`/settings/${section}`}
                  className={({ isActive }) =>
                    clsx(
                      "rounded-2xl border px-4 py-3 text-left transition-all",
                      isActive
                        ? "border-blue-500/30 bg-blue-600/10 text-white shadow-lg shadow-blue-500/10"
                        : "border-white/5 bg-white/[0.02] text-slate-400 hover:border-white/10 hover:bg-white/[0.04] hover:text-slate-200",
                    )
                  }
                >
                  <div className="text-sm font-bold">{label}</div>
                </NavLink>
              ))}
            </nav>
            <div className="mt-4 rounded-2xl border border-white/5 bg-black/20 p-4 space-y-2">
              <div className="text-xs font-bold text-slate-300">Aplicación de cambios</div>
              <p className="text-[11px] leading-relaxed text-slate-500">
                {settingsView.autoApplySettings ? "Automático: cada cambio se guarda al instante." : "Manual: usa Aplicar o Cancelar para confirmar."}
              </p>
            </div>
          </aside>

          <main className="space-y-8">

        <section className={clsx("space-y-6", activeSection !== "profile" && "hidden")}>
          <div className="flex items-center gap-2 border-b border-white/5 pb-2">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-blue-500"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            <h2 className="text-lg font-bold text-white">Perfil de Usuario</h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
            <Field label="Avatar de usuario">
              <div className="flex items-start gap-6">
                <Avatar value={settingsView.avatar} size={80} className="rounded-2xl shadow-2xl border border-white/10" fallbackText={`${settingsView.userName?.[0] ?? ""}${settingsView.userLastName?.[0] ?? ""}`} />
                <div className="flex-1 space-y-4">
                  <AvatarPresetGrid value={settingsView.avatar} onChange={(v) => patch("avatar", v)} />
                  <div className="flex items-center gap-4">
                    <label className="pl-btn !bg-white/5 border border-white/10 cursor-pointer text-xs font-bold hover:!bg-white/10">
                      Subir personalizado
                      <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={onPickAvatar} />
                    </label>
                    {settingsView.avatar && (
                      <button onClick={() => patch("avatar", null)} className="text-xs font-bold text-slate-500 hover:text-red-400 transition-colors">
                        Eliminar
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </Field>

            <Field label="Nombre para mostrar">
              <input
                value={settingsView.userName ?? ""}
                onChange={(e) => void patch("userName", e.target.value)}
                placeholder="¿Cómo te llamas?"
                maxLength={40}
                className="w-full rounded-xl bg-white/[0.03] border border-white/10 px-4 py-3 text-sm text-white focus:outline-none focus:border-blue-500/50 transition-all shadow-inner"
              />
            </Field>

            <Field label="Apellido (opcional)">
              <input
                value={settingsView.userLastName ?? ""}
                onChange={(e) => void patch("userLastName", e.target.value || null)}
                placeholder="Tu apellido"
                maxLength={40}
                className="w-full rounded-xl bg-white/[0.03] border border-white/10 px-4 py-3 text-sm text-white focus:outline-none focus:border-blue-500/50 transition-all shadow-inner"
              />
            </Field>

            <Field label="Pantalla de bienvenida">
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={async () => {
                    await update({ hasOnboarded: false });
                    push("Te llevaremos a la bienvenida en un momento", "info");
                    setTimeout(() => navigate("/welcome", { replace: true }), 250);
                  }}
                  className="pl-btn text-xs"
                >
                  Volver a verla
                </button>
                <span className="text-xs text-slate-500">
                  Vuelve a abrir la bienvenida sin perder tu biblioteca.
                </span>
              </div>
            </Field>
          </div>
        </section>
        {!settingsView.autoApplySettings && (
          <SectionActions pendingCount={Object.keys(pendingPatch).length} onApply={() => void applyPendingChanges()} onCancel={cancelPendingChanges} />
        )}

        <section className={clsx("space-y-6", activeSection !== "appearance" && "hidden")}>
          <div className="flex items-center gap-2 border-b border-white/5 pb-2">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-blue-500"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>
            <h2 className="text-lg font-bold text-white">Apariencia y Estilo</h2>
          </div>
          <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4 flex flex-wrap items-center gap-3 justify-between">
            <div className="space-y-1">
              <div className="text-xs font-bold text-white">Aplicación de cambios</div>
              <div className="text-[11px] text-slate-500">
                {settingsView.autoApplySettings ? "Automático: se guarda al instante." : "Manual: usa Aplicar/Cancelar para confirmar."}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => patch("autoApplySettings", !settingsView.autoApplySettings)} className="pl-btn text-xs">
                {settingsView.autoApplySettings ? "Modo manual" : "Modo automático"}
              </button>
              <button onClick={() => patch("animationsEnabled", !settingsView.animationsEnabled)} className="pl-btn text-xs">
                Animaciones: {settingsView.animationsEnabled ? "On" : "Off"}
              </button>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <Field label="Tema de la interfaz">
              <ThemePicker value={settingsView.theme} onChange={(v) => patch("theme", v)} />
            </Field>

            <Field label="Color de acento">
              <div className="flex flex-wrap items-center gap-3">
                {ACCENT_PALETTE.map((c) => (
                  <button
                    key={c}
                    onClick={() => patch("accentColor", c)}
                    className={clsx(
                      "h-8 w-8 rounded-xl ring-2 ring-offset-4 ring-offset-black transition-all transform hover:scale-110",
                      settingsView.accentColor.toLowerCase() === c.toLowerCase() ? "ring-white" : "ring-transparent"
                    )}
                    style={{ backgroundColor: c }}
                  />
                ))}
                <label className="ml-2 inline-flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-slate-300 cursor-pointer">
                  Custom
                  <input
                    type="color"
                    value={settingsView.accentColor}
                    onChange={(e) => patch("accentColor", e.target.value.toLowerCase())}
                    className="h-8 w-10 cursor-pointer rounded-lg border border-white/10 bg-transparent p-0"
                  />
                </label>
              </div>
            </Field>

            <div className="col-span-1 md:col-span-2 pt-2 flex flex-col gap-3">
              {isCreatingTheme ? (
                <div className="space-y-4 rounded-2xl bg-white/[0.02] border border-white/5 p-4">
                  <div className="flex gap-2">
                    <input
                      value={newThemeName}
                      onChange={(e) => setNewThemeName(e.target.value)}
                      placeholder="Nombre del nuevo tema..."
                      autoFocus
                      className="flex-1 rounded-xl bg-white/[0.03] border border-white/10 px-4 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") createCustomTheme();
                        if (e.key === "Escape") {
                          setIsCreatingTheme(false);
                          setNewThemeDraft(null);
                        }
                      }}
                    />
                    <button onClick={() => createCustomTheme()} className="pl-btn-primary px-4 py-2">Guardar</button>
                    <button onClick={() => { setIsCreatingTheme(false); setNewThemeDraft(null); }} className="pl-btn px-4 py-2">Cancelar</button>
                  </div>
                  {newThemeDraft && (
                    <div className="space-y-3">
                      <ContrastAlert
                        theme={newThemeDraft}
                        onAutoFix={() => setNewThemeDraft((prev) => (prev ? improveThemeContrast(prev) : prev))}
                      />
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                      <ColorField label="Fondo (bg)" value={newThemeDraft.bg} onChange={(v) => setNewThemeDraft((prev) => prev ? { ...prev, bg: v } : prev)} />
                      <ColorField label="Texto (fg)" value={newThemeDraft.fg} onChange={(v) => setNewThemeDraft((prev) => prev ? { ...prev, fg: v } : prev)} />
                      <ColorField label="Superficie 1" value={newThemeDraft.surface1} onChange={(v) => setNewThemeDraft((prev) => prev ? { ...prev, surface1: v } : prev)} />
                      <ColorField label="Superficie 2" value={newThemeDraft.surface2} onChange={(v) => setNewThemeDraft((prev) => prev ? { ...prev, surface2: v } : prev)} />
                      <ColorField label="Superficie 3" value={newThemeDraft.surface3} onChange={(v) => setNewThemeDraft((prev) => prev ? { ...prev, surface3: v } : prev)} />
                      <ColorField label="Acento" value={newThemeDraft.accent} onChange={(v) => setNewThemeDraft((prev) => prev ? { ...prev, accent: v } : prev)} />
                      <ColorField label="Texto 1" value={newThemeDraft.text1} onChange={(v) => setNewThemeDraft((prev) => prev ? { ...prev, text1: v } : prev)} />
                      <ColorField label="Texto 2" value={newThemeDraft.text2} onChange={(v) => setNewThemeDraft((prev) => prev ? { ...prev, text2: v } : prev)} />
                      <ColorField label="Texto 3" value={newThemeDraft.text3} onChange={(v) => setNewThemeDraft((prev) => prev ? { ...prev, text3: v } : prev)} />
                      <ColorField label="Bordes" value={newThemeDraft.border} onChange={(v) => setNewThemeDraft((prev) => prev ? { ...prev, border: v } : prev)} />
                      <ColorField label="Fondo Lector" value={newThemeDraft.readerBg} onChange={(v) => setNewThemeDraft((prev) => prev ? { ...prev, readerBg: v } : prev)} />
                      <Field label="Modo Oscuro">
                        <button onClick={() => setNewThemeDraft((prev) => prev ? { ...prev, dark: !prev.dark } : prev)} className="w-full text-xs font-bold bg-white/5 py-1.5 rounded-lg hover:bg-white/10">
                          {newThemeDraft.dark ? "Sí (Oscuro)" : "No (Claro)"}
                        </button>
                      </Field>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <button onClick={() => { setIsCreatingTheme(true); setNewThemeDraft({ ...baseTheme }); }} className="pl-btn text-xs w-max">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
                  Clonar como Tema Personalizado
                </button>
              )}
            </div>

            {activeCustomTheme && (
              <div className="col-span-1 md:col-span-2 mt-4 p-6 rounded-2xl bg-white/[0.02] border border-white/5 space-y-6">
                <div className="flex items-center justify-between border-b border-white/5 pb-2">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                    Editar &quot;{activeCustomTheme.name}&quot;
                  </h3>
                  <button onClick={deleteCustomTheme} className="text-xs font-bold text-red-400 hover:text-red-300 transition-colors">Eliminar Tema</button>
                </div>
                <ContrastAlert
                  theme={activeCustomTheme}
                  onAutoFix={() => void patchCustomThemeBatch(improveThemeContrast(activeCustomTheme))}
                />
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                  <ColorField label="Fondo (bg)" value={activeCustomTheme.bg} onChange={(v) => patchCustomTheme("bg", v)} />
                  <ColorField label="Texto (fg)" value={activeCustomTheme.fg} onChange={(v) => patchCustomTheme("fg", v)} />
                  <ColorField label="Superficie 1" value={activeCustomTheme.surface1} onChange={(v) => patchCustomTheme("surface1", v)} />
                  <ColorField label="Superficie 2" value={activeCustomTheme.surface2} onChange={(v) => patchCustomTheme("surface2", v)} />
                  <ColorField label="Texto 1" value={activeCustomTheme.text1} onChange={(v) => patchCustomTheme("text1", v)} />
                  <ColorField label="Texto 2" value={activeCustomTheme.text2} onChange={(v) => patchCustomTheme("text2", v)} />
                  <ColorField label="Texto 3" value={activeCustomTheme.text3} onChange={(v) => patchCustomTheme("text3", v)} />
                  <ColorField label="Bordes" value={activeCustomTheme.border} onChange={(v) => patchCustomTheme("border", v)} />
                  <ColorField label="Fondo Lector" value={activeCustomTheme.readerBg} onChange={(v) => patchCustomTheme("readerBg", v)} />
                  <Field label="Modo Oscuro">
                    <button onClick={() => patchCustomTheme("dark", !activeCustomTheme.dark)} className="w-full text-xs font-bold bg-white/5 py-1.5 rounded-lg hover:bg-white/10">
                      {activeCustomTheme.dark ? "Sí (Oscuro)" : "No (Claro)"}
                    </button>
                  </Field>
                </div>
              </div>
            )}
          </div>
        </section>
          {!settingsView.autoApplySettings && (
            <SectionActions pendingCount={Object.keys(pendingPatch).length} onApply={() => void applyPendingChanges()} onCancel={cancelPendingChanges} />
          )}

        <section className={clsx("space-y-6", activeSection !== "library" && "hidden")}>
          <div className="flex items-center gap-2 border-b border-white/5 pb-2">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-blue-500"><path d="M4 5h6v14H4zM14 7h6v12h-6z" /></svg>
            <h2 className="text-lg font-bold text-white">Biblioteca</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <Field label="Vista inicial">
              <Group value={settingsView.libraryView} onChange={(v) => patch("libraryView", v as SettingsDto["libraryView"])} options={[["grid", "Cuadrícula"], ["list", "Lista"]]} />
            </Field>
            <Field label="Orden de catálogo">
              <Group value={settingsView.librarySort} onChange={(v) => patch("librarySort", v as SettingsDto["librarySort"])} options={[["lastReadAt", "Última lectura"], ["progress", "Progreso"], ["addedAt", "Agregado"], ["title", "Título"]]} />
            </Field>
            <Field label="Tamaño de portadas">
              <Group value={settingsView.coverSize} onChange={(v) => patch("coverSize", v as SettingsDto["coverSize"])} options={[["sm", "Mini"], ["md", "Estándar"], ["lg", "Grande"]]} />
            </Field>
          </div>
        </section>

        {!settingsView.autoApplySettings && (
          <SectionActions pendingCount={Object.keys(pendingPatch).length} onApply={() => void applyPendingChanges()} onCancel={cancelPendingChanges} />
        )}

        <section className={clsx("space-y-6", activeSection !== "reading" && "hidden")}>
          <div className="flex items-center gap-2 border-b border-white/5 pb-2">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-blue-500"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
            <h2 className="text-lg font-bold text-white">Preferencias de Lectura</h2>
          </div>
          
          <div className="grid grid-cols-1 gap-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <Field label="Modo de lectura preferido">
                <Group value={settingsView.readingMode} onChange={(v) => patch("readingMode", v as SettingsDto["readingMode"])} options={[["scroll-v", "Scroll vertical"], ["paged-h", "Paginado"], ["paged-h-2", "Doble página"], ["paged-v", "Vertical"], ["webtoon", "Webtoon"]]} />
              </Field>
              <Field label="Ajuste de imagen">
                <Group value={settingsView.fitMode} onChange={(v) => patch("fitMode", v as SettingsDto["fitMode"])} options={[["fit-width", "Ancho"], ["fit-height", "Alto"], ["original", "Original"]]} />
              </Field>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <Field label="Dirección de lectura">
                <Group value={settingsView.direction} onChange={(v) => patch("direction", v as SettingsDto["direction"])} options={[["ltr", "Izquierda → Derecha"], ["rtl", "Derecha → Izquierda"]]} />
              </Field>
              <Field label="Tamaño de portadas en biblioteca">
                <Group value={settingsView.coverSize} onChange={(v) => patch("coverSize", v as SettingsDto["coverSize"])} options={[["sm", "Mini"], ["md", "Estándar"], ["lg", "Cinemático"]]} />
              </Field>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <Field label="Recorte automático">
                  <Group value={String(settingsView.autoCropMargins)} onChange={(v) => patch("autoCropMargins", v === "true")} options={[["false", "Off"], ["true", "On"]]} />
              </Field>
              <Field label="Auto-avance">
                <Group value={String(settingsView.autoAdvanceToNext)} onChange={(v) => patch("autoAdvanceToNext", v === "true")} options={[["false", "Off"], ["true", "On"]]} />
              </Field>
              <Field label="Barra de progreso">
                <Group value={String(settingsView.showTopProgress)} onChange={(v) => patch("showTopProgress", v === "true")} options={[["true", "On"], ["false", "Off"]]} />
              </Field>
            </div>
          </div>
        </section>

        {!settingsView.autoApplySettings && (
          <SectionActions pendingCount={Object.keys(pendingPatch).length} onApply={() => void applyPendingChanges()} onCancel={cancelPendingChanges} />
        )}

        <section className={clsx("space-y-6 pb-20", activeSection !== "appearance" && "hidden")}>
          <div className="flex items-center gap-2 border-b border-white/5 pb-2">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-blue-500"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>
            <h2 className="text-lg font-bold text-white">Animaciones y Fluidez</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <Field label="Animaciones globales">
              <Group value={String(settingsView.animationsEnabled)} onChange={(v) => patch("animationsEnabled", v === "true")} options={[["true", "On"], ["false", "Off"]]} />
            </Field>
            <Field label="Reducir movimiento">
              <Group value={String(settingsView.reduceMotion)} onChange={(v) => patch("reduceMotion", v === "true")} options={[["false", "Normal"], ["true", "Reducido"]]} />
            </Field>
            <Field label={`Ocultar UI: ${settingsView.uiHideDelayMs}ms`}>
              <div className="flex flex-col gap-2">
                <input type="range" min={1000} max={8000} step={250} value={settingsView.uiHideDelayMs} onChange={(e) => patch("uiHideDelayMs", parseInt(e.target.value, 10))} className="w-full accent-blue-500" />
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Tiempo para ocultar controles en lector</p>
              </div>
            </Field>
          </div>
        </section>

        {!settingsView.autoApplySettings && (
          <SectionActions pendingCount={Object.keys(pendingPatch).length} onApply={() => void applyPendingChanges()} onCancel={cancelPendingChanges} />
        )}

        <section className={clsx("space-y-6 pb-20", activeSection !== "shortcuts" && "hidden")}>
          <div className="flex items-center gap-2 border-b border-white/5 pb-2">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-blue-500"><path d="M10 8h.01M14 8h.01M8 12h8M7 4h10a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3z"/></svg>
            <h2 className="text-lg font-bold text-white">Atajos de Teclado</h2>
          </div>
          <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <ShortcutField label="Siguiente página" value={shortcutMap.next} onCapture={(k) => void patchShortcut("next", k)} />
              <ShortcutField label="Página anterior" value={shortcutMap.prev} onCapture={(k) => void patchShortcut("prev", k)} />
              <ShortcutField label="Pantalla completa" value={shortcutMap.toggleFs} onCapture={(k) => void patchShortcut("toggleFs", k)} />
              <ShortcutField label="Miniaturas" value={shortcutMap.toggleStrip} onCapture={(k) => void patchShortcut("toggleStrip", k)} />
              <ShortcutField label="Marcadores" value={shortcutMap.toggleBookmarks} onCapture={(k) => void patchShortcut("toggleBookmarks", k)} />
              <ShortcutField label="Ir a página" value={shortcutMap.goto} onCapture={(k) => void patchShortcut("goto", k)} />
              <ShortcutField label="Ayuda" value={shortcutMap.toggleHelp} onCapture={(k) => void patchShortcut("toggleHelp", k)} />
              <ShortcutField label="Salir lector" value={shortcutMap.exit} onCapture={(k) => void patchShortcut("exit", k)} />
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-white/5">
              <p className="text-xs text-slate-500">Pulsa una tecla dentro de cada campo para reasignar el atajo.</p>
              <button onClick={() => void resetShortcuts()} className="pl-btn text-xs">Restaurar por defecto</button>
            </div>
          </div>
        </section>
        {/* Per-section actions: rendered inside each section when manual apply mode is active */}
          </main>
        </div>
      </div>
      {resetConfirmOpen && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-ink-900 p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white">Restablecer configuración</h3>
            <p className="mt-2 text-sm text-slate-300">Se restaurarán los valores por defecto de toda la configuración.</p>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setResetConfirmOpen(false)} className="pl-btn">Cancelar</button>
              <button onClick={() => void resetDefaults()} className="rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-500">Confirmar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SectionActions({ pendingCount, onApply, onCancel }: { pendingCount: number; onApply: () => void; onCancel: () => void }) {
  if (pendingCount === 0) return null;
  return (
    <div className="mt-4 pt-4 border-t border-white/5 flex items-center justify-between gap-3">
      <div className="text-xs text-slate-300">Cambios pendientes: {pendingCount}</div>
      <div className="flex items-center gap-2">
        <button onClick={onCancel} className="pl-btn text-xs">Cancelar</button>
        <button onClick={onApply} className="pl-btn-primary text-xs">Aplicar</button>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4 shadow-lg shadow-black/10">
      <div className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">{label}</div>
      <div className="mt-2 text-sm font-bold text-white truncate">{value}</div>
      <div className="mt-1 text-[11px] text-slate-500">{hint}</div>
    </div>
  );
}

function ShortcutField({ label, value, onCapture }: { label: string; value: string; onCapture: (key: string) => void }) {
  return (
    <label className="rounded-xl border border-white/5 bg-white/[0.01] p-3 flex items-center justify-between gap-3">
      <span className="text-xs font-semibold text-slate-300">{label}</span>
      <input
        readOnly
        value={formatShortcutKey(value)}
        onKeyDown={(e) => {
          e.preventDefault();
          if (e.key === "Tab") return;
          onCapture(e.key);
        }}
        className="w-24 rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1 text-center text-xs font-black text-white focus:outline-none focus:border-blue-500/50"
      />
    </label>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-slate-500">{label}</div>
      <div className="bg-white/[0.01] rounded-2xl p-1">{children}</div>
    </div>
  );
}

function Group({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <div className="flex flex-wrap gap-1.5 p-1.5 rounded-2xl bg-white/[0.03] border border-white/10 shadow-inner">
      {options.map(([v, l]) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={clsx(
            "flex-1 px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap",
            value === v ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20" : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
          )}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <div className="text-[10px] uppercase tracking-[0.1em] font-bold text-slate-500 truncate">{label}</div>
      <label className="flex items-center gap-2 cursor-pointer group bg-white/[0.02] p-1.5 rounded-xl border border-white/5 hover:bg-white/5 transition-colors">
        <div className="h-6 w-6 rounded border border-white/10 shadow-inner group-hover:scale-110 transition-transform" style={{ backgroundColor: value }} />
        <span className="text-xs text-slate-300 font-mono">{value}</span>
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="hidden" />
      </label>
    </div>
  );
}

function ContrastAlert({ theme, onAutoFix }: { theme: ThemePreset; onAutoFix: () => void }) {
  const base = contrastRatio(theme.fg, theme.bg);
  const secondary = contrastRatio(theme.text2, theme.bg);
  const isBad = base < 4.5 || secondary < 3;
  if (!isBad) return null;
  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200 flex items-center justify-between gap-3">
      <span>
        Contraste bajo detectado (texto principal {base.toFixed(2)}:1, secundario {secondary.toFixed(2)}:1).
      </span>
      <button onClick={onAutoFix} className="pl-btn !px-3 !py-1.5 !text-[11px] !bg-amber-500/20 hover:!bg-amber-500/30">
        Autoajustar
      </button>
    </div>
  );
}

function normalizeHex(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  return m ? `#${m[1].toLowerCase()}` : "#000000";
}

function toRgb(hex: string): [number, number, number] {
  const h = normalizeHex(hex);
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function luminance(hex: string): number {
  const [r, g, b] = toRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(a: string, b: string): number {
  const l1 = luminance(a);
  const l2 = luminance(b);
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

function isDark(hex: string): boolean {
  return luminance(hex) < 0.35;
}

function ensureContrast(fg: string, bg: string, min: number, preferLight: boolean): string {
  if (contrastRatio(fg, bg) >= min) return normalizeHex(fg);
  const white = "#ffffff";
  const black = "#000000";
  const goodWhite = contrastRatio(white, bg) >= min;
  const goodBlack = contrastRatio(black, bg) >= min;
  if (preferLight && goodWhite) return white;
  if (!preferLight && goodBlack) return black;
  if (goodWhite) return white;
  if (goodBlack) return black;
  return preferLight ? white : black;
}
