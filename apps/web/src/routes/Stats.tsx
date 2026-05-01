import { useEffect, useState } from "react";
import clsx from "clsx";
import { api, type StatsDto } from "../lib/api";
import { useSettingsStore } from "../stores/settings";

export function Stats() {
  const [stats, setStats] = useState<StatsDto | null>(null);
  const goal = useSettingsStore((s) => s.settings?.dailyGoalPages ?? 0);
  const autoScrollSpeed = useSettingsStore((s) => s.settings?.autoScrollSpeed ?? 80);
  const updateSettings = useSettingsStore((s) => s.update);
  useEffect(() => {
    void api.stats().then(setStats);
  }, []);

  if (!stats) return <div className="p-12 text-slate-500 animate-pulse">Analizando actividad...</div>;

  return (
    <div className="flex-1 overflow-y-auto px-8 py-10 pl-gradient-bg">
      <div className="max-w-5xl mx-auto space-y-10 animate-fade-in">
        <header>
          <h1 className="text-4xl font-bold tracking-tight text-white">Estadísticas</h1>
          <p className="text-slate-400 mt-2 font-medium">Tu viaje a través de las páginas</p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Goal Section */}
          <div className="lg:col-span-2 pl-card p-8 flex items-center gap-10 relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-600/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <GoalRing pages={stats.todayPages} goal={goal} />
            <div className="flex-1 space-y-2 relative z-10">
              <h3 className="text-xl font-bold text-white">Meta Diaria</h3>
              <p className="text-slate-400 text-sm font-medium">
                {goal > 0 
                  ? (stats.todayPages >= goal 
                      ? "¡Felicidades! Has completado tu objetivo hoy." 
                      : `Te faltan ${goal - stats.todayPages} páginas para alcanzar tu meta.`)
                  : "Establece una meta en configuración para medir tu progreso diario."}
              </p>
              {goal > 0 && (
                <div className="pt-4 flex gap-6">
                  <div>
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Hoy</div>
                    <div className="text-xl font-bold text-white">{stats.todayPages} <span className="text-xs text-slate-500">pág</span></div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Objetivo</div>
                    <div className="text-xl font-bold text-blue-500">{goal} <span className="text-xs text-slate-500">pág</span></div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Quick Streak Card */}
          <div className="pl-card p-8 flex flex-col justify-center items-center text-center bg-gradient-to-br from-blue-600/10 to-transparent border-blue-500/20 shadow-lg shadow-blue-500/5">
            <div className="text-4xl mb-2">🔥</div>
            <div className="text-3xl font-black text-white">{stats.currentStreak} Días</div>
            <div className="text-[10px] font-bold text-blue-400 uppercase tracking-widest mt-1">Racha Actual</div>
            <div className="mt-4 text-xs text-slate-500 font-medium">Racha máxima: {stats.longestStreak} días</div>
          </div>
        </div>

        <div className="pl-card p-8 space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-white">Metas y Ritmo</h3>
            <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Control inteligente</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <div className="text-xs font-bold text-slate-300">Meta diaria ({goal} páginas)</div>
              <input
                type="range"
                min={0}
                max={500}
                step={5}
                value={goal}
                onChange={(e) => void updateSettings({ dailyGoalPages: parseInt(e.target.value, 10) })}
                className="w-full accent-blue-500"
              />
              <div className="flex flex-wrap gap-2">
                {[0, 25, 50, 100, 150].map((n) => (
                  <button key={n} onClick={() => void updateSettings({ dailyGoalPages: n })} className={clsx("pl-btn !px-3 !py-1.5 !text-[11px]", goal === n && "!bg-blue-600 !text-white")}>
                    {n === 0 ? "Off" : `${n} pág`}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-3">
              <div className="text-xs font-bold text-slate-300">Auto-scroll ({autoScrollSpeed} px/s)</div>
              <input
                type="range"
                min={20}
                max={300}
                step={10}
                value={autoScrollSpeed}
                onChange={(e) => void updateSettings({ autoScrollSpeed: parseInt(e.target.value, 10) })}
                className="w-full accent-blue-500"
              />
              <p className="text-xs text-slate-500">Ajusta la velocidad ideal para sesiones largas en Webtoon/Scroll.</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard icon="📚" label="Colección" value={stats.totalComics} sub="Cómics" />
          <StatCard icon="✅" label="Leídos" value={stats.completedComics} sub="Finalizados" />
          <StatCard icon="📄" label="Total" value={stats.pagesRead.toLocaleString()} sub="Páginas" />
          <StatCard icon="⭐️" label="Favoritos" value={stats.favorites} sub="Destacados" />
        </div>

        <div className="pl-card p-8 space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-white">Actividad Reciente</h3>
            <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Últimos 30 días</span>
          </div>
          <div className="flex h-48 items-end gap-1.5 px-2">
            {last30Days(stats.days).map((d) => {
              const max = Math.max(1, ...last30Days(stats.days).map((x) => x.pagesRead));
              const h = Math.round((d.pagesRead / max) * 100);
              return (
                <div 
                  key={d.date} 
                  className="group relative flex-1"
                >
                  <div 
                    className={clsx(
                      "w-full rounded-t-md transition-all duration-500 ease-out min-h-[4px]",
                      d.pagesRead > 0 ? "bg-gradient-to-t from-blue-600 to-blue-400" : "bg-white/5"
                    )}
                    style={{ height: `${h}%` }}
                  />
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-white text-black text-[10px] font-bold rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none shadow-xl z-50">
                    {new Date(d.date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}: {d.pagesRead} pág
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex justify-between px-2 text-[10px] font-bold text-slate-600 uppercase tracking-widest">
            <span>Hace 30 días</span>
            <span>Hoy</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, sub }: { icon: string, label: string; value: number | string, sub: string }) {
  return (
    <div className="pl-card p-6 group hover:border-blue-500/30 transition-colors">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">{icon}</span>
        <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-slate-500">{label}</div>
      </div>
      <div className="flex items-baseline gap-1.5">
        <div className="text-2xl font-bold text-white">{value}</div>
        <div className="text-[10px] font-bold text-slate-600 uppercase">{sub}</div>
      </div>
    </div>
  );
}

function GoalRing({ pages, goal }: { pages: number; goal: number }) {
  const ratio = goal > 0 ? Math.min(1, pages / goal) : 0;
  const r = 36;
  const circ = 2 * Math.PI * r;
  const dash = ratio * circ;
  return (
    <div className="relative h-32 w-32 shrink-0">
      <svg viewBox="0 0 80 80" className="h-full w-full -rotate-90">
        <circle cx="40" cy="40" r={r} stroke="currentColor" className="text-white/5" strokeWidth="6" fill="none" />
        <circle
          cx="40"
          cy="40"
          r={r}
          stroke="currentColor"
          className="text-blue-500 drop-shadow-[0_0_8px_rgba(59,130,246,0.5)]"
          strokeWidth="6"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circ - dash}`}
          style={{ transition: "stroke-dasharray 1s ease-out" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center leading-none">
        <span className="text-2xl font-black text-white">{Math.round(ratio * 100)}%</span>
        <span className="text-[10px] text-slate-500 font-bold mt-1 uppercase tracking-tighter">Progreso</span>
      </div>
    </div>
  );
}

function last30Days(days: { date: string; pagesRead: number }[]) {
  const now = new Date();
  now.setUTCHours(0, 0, 0, 0);
  const map = new Map(days.map((d) => [d.date, d.pagesRead]));
  const out: { date: string; pagesRead: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    const iso = d.toISOString().slice(0, 10);
    out.push({ date: iso, pagesRead: map.get(iso) ?? 0 });
  }
  return out;
}
