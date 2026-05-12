export type ShortcutAction =
  | "next"
  | "prev"
  | "toggleFs"
  | "toggleStrip"
  | "toggleBookmarks"
  | "quickBookmark"
  | "goto"
  | "toggleHelp"
  | "exit";

export type ShortcutMap = Record<ShortcutAction, string>;

export const DEFAULT_SHORTCUTS: ShortcutMap = {
  next: "ArrowRight",
  prev: "ArrowLeft",
  toggleFs: "f",
  toggleStrip: "t",
  toggleBookmarks: "b",
  quickBookmark: "m",
  goto: "g",
  toggleHelp: "?",
  exit: "Escape",
};

export const ACTIONS: ShortcutAction[] = [
  "next",
  "prev",
  "toggleFs",
  "toggleStrip",
  "toggleBookmarks",
  "quickBookmark",
  "goto",
  "toggleHelp",
  "exit",
];

export const ACTION_LABELS: Record<ShortcutAction, string> = {
  next: "Página siguiente",
  prev: "Página anterior",
  toggleFs: "Pantalla completa",
  toggleStrip: "Mostrar/ocultar miniaturas",
  toggleBookmarks: "Marcadores",
  quickBookmark: "Marcador rápido (página actual)",
  goto: "Saltar a página",
  toggleHelp: "Mostrar ayuda",
  exit: "Salir del lector",
};

export function parseShortcutMap(raw: string | null | undefined): ShortcutMap {
  let parsed: unknown = {};
  try {
    parsed = JSON.parse(raw || "{}");
  } catch {
    parsed = {};
  }
  const input = (parsed && typeof parsed === "object" ? parsed : {}) as Record<string, unknown>;
  const out = { ...DEFAULT_SHORTCUTS };
  for (const action of ACTIONS) {
    const v = input[action];
    if (typeof v === "string" && v.trim()) out[action] = normalizeShortcutKey(v);
  }
  return out;
}

export function normalizeShortcutKey(key: string): string {
  const k = key.trim();
  if (k.length === 1) return k.toLowerCase();
  return k;
}

/**
 * Compare a stored shortcut against an actual KeyboardEvent.key value.
 * Single character keys match case-insensitively (so "a" works whether
 * the user has caps lock on or holds Shift). Named keys (ArrowRight,
 * Escape, etc.) match exactly.
 */
export function keysMatch(stored: string, key: string): boolean {
  if (!stored || !key) return false;
  if (stored.length === 1 && key.length === 1) {
    return stored.toLowerCase() === key.toLowerCase();
  }
  return stored === key;
}

export function formatShortcutKey(key: string): string {
  switch (key) {
    case " ":
      return "Espacio";
    case "Escape":
      return "Esc";
    case "ArrowRight":
      return "→";
    case "ArrowLeft":
      return "←";
    case "ArrowUp":
      return "↑";
    case "ArrowDown":
      return "↓";
    case "Enter":
      return "Enter";
    case "Tab":
      return "Tab";
    case "Backspace":
      return "Borrar";
    case "Delete":
      return "Supr";
    case "Home":
      return "Inicio";
    case "End":
      return "Fin";
    case "PageUp":
      return "Re Pág";
    case "PageDown":
      return "Av Pág";
    default:
      return key.length === 1 ? key.toUpperCase() : key;
  }
}

/**
 * Find duplicate shortcut bindings within a map. Returns a record
 * mapping the conflicting key to the actions sharing it. Empty when
 * there are no conflicts.
 */
export function findShortcutConflicts(
  map: ShortcutMap,
): Record<string, ShortcutAction[]> {
  const buckets = new Map<string, ShortcutAction[]>();
  for (const action of ACTIONS) {
    const k = normalizeShortcutKey(map[action]);
    const list = buckets.get(k) ?? [];
    list.push(action);
    buckets.set(k, list);
  }
  const out: Record<string, ShortcutAction[]> = {};
  for (const [k, list] of buckets) {
    if (list.length > 1) out[k] = list;
  }
  return out;
}

