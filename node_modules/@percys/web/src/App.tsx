import { useEffect, useState } from "react";
import { Route, Routes, useLocation, NavLink } from "react-router-dom";
import clsx from "clsx";
import { Sidebar } from "./components/Sidebar";
import { Toaster } from "./components/Toaster";
import { ThemeProvider } from "./components/ThemeProvider";
import { Library } from "./routes/Library";
import { Reader } from "./routes/Reader";
import { Stats } from "./routes/Stats";
import { Achievements } from "./routes/Achievements";
import { Settings } from "./routes/Settings";
import { useSettingsStore } from "./stores/settings";
import { useLibraryStore } from "./stores/library";
import { useToasts } from "./stores/toasts";

export function App() {
  const loadSettings = useSettingsStore((s) => s.load);
  const scan = useLibraryStore((s) => s.scan);
  const push = useToasts((s) => s.push);
  const location = useLocation();
  const isReader = location.pathname.startsWith("/read/");
  const animationsEnabled = useSettingsStore((s) => s.settings?.animationsEnabled ?? true);
  const [knownAchievements, setKnownAchievements] = useState<string[]>([]);
  // achievements api will be imported dynamically inside the effect

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    const handler = async () => {
      try {
        const r = await scan();
        push(`Biblioteca sincronizada: +${r.added} · -${r.removed} · total ${r.total}`, "success");
      } catch (err) {
        push("Error al sincronizar la biblioteca", "error");
      }
    };
    window.addEventListener("pl-scan", handler);
    return () => window.removeEventListener("pl-scan", handler);
  }, [scan, push]);

  // Poll achievements and show toast when new ones unlock.
  useEffect(() => {
    let cancelled = false;
    async function fetchOnce() {
      try {
        const { api } = await import("./lib/api");
        const list = await api.achievements();
        if (cancelled) return;
        const unlocked = list.filter((a) => a.unlocked).map((a) => a.id);
        // first time fill
        if (knownAchievements.length === 0) {
          setKnownAchievements(unlocked);
          return;
        }
        // detect new
        for (const id of unlocked) {
          if (!knownAchievements.includes(id)) {
            const a = list.find((x) => x.id === id);
            if (a) push(`${a.title} · ${a.description}`, "success");
          }
        }
        setKnownAchievements(unlocked);
      } catch (err) {
        // ignore polling errors
      }
    }
    // initial fetch
    void fetchOnce();
    const iv = setInterval(() => void fetchOnce(), 20_000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [knownAchievements, push]);

  if (isReader) {
    return (
      <ThemeProvider>
        <div data-anim={animationsEnabled ? "1" : "0"} className="h-full w-full">
          <Routes>
            <Route path="/read/:id" element={<Reader />} />
          </Routes>
        </div>
        <Toaster />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <div data-anim={animationsEnabled ? "1" : "0"} className="flex h-screen w-screen overflow-hidden bg-transparent text-ink-100">
        <Sidebar />
        <main className="flex-1 overflow-hidden relative pb-16 md:pb-0">
          <div key={location.pathname} className="h-full w-full animate-fade-in overflow-hidden flex flex-col">
            <Routes location={location}>
              <Route path="/" element={<Library />} />
              <Route path="/favorites" element={<Library scope="favorites" />} />
              <Route path="/stats" element={<Stats />} />
              <Route path="/achievements" element={<Achievements />} />
              <Route path="/settings/*" element={<Settings />} />
            </Routes>
          </div>
        </main>
        <MobileNav />
        <Toaster />
      </div>
    </ThemeProvider>
  );
}

function MobileNav() {
  const items = [
    { to: "/", label: "Biblioteca", icon: "📚" },
    { to: "/favorites", label: "Favoritos", icon: "⭐" },
    { to: "/stats", label: "Estadísticas", icon: "📊" },
    { to: "/achievements", label: "Logros", icon: "🏆" },
    { to: "/settings/profile", label: "Configuración", icon: "⚙️" },
  ];
  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-[100] bg-black/80 backdrop-blur-xl border-t border-white/5 px-6 py-2 flex items-center justify-between pb-safe">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === "/"}
          className={({ isActive }) =>
            clsx(
              "flex flex-col items-center gap-1 p-2 rounded-xl transition-all",
              isActive ? "text-blue-500 scale-110" : "text-slate-500"
            )
          }
        >
          <span className="text-lg">{item.icon}</span>
          <span className="text-[10px] font-black uppercase tracking-tighter">{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
