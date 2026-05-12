# Percy's Library

Lector de cómics moderno, rápido, minimalista. Full-stack: React + TypeScript + Tailwind + Zustand en el frontend, Express + Prisma + PostgreSQL (Supabase) en el backend.

## Características principales

- **Pipeline unificado**: cualquier formato (CBZ, CBR, PDF, carpeta de imágenes) se expone al reader como una secuencia de imágenes.
- **Extractores nativos**: `adm-zip` (CBZ), `node-unrar-js` (CBR sin binario externo), `pdfjs-dist` + `@napi-rs/canvas` (PDF), filesystem (carpetas).
- **Caché inteligente**: LRU en memoria + LRU en disco para portadas, páginas, miniaturas (con poda automática).
- **Reader profesional**: 5 modos (scroll vertical continuo / paginado horizontal / doble página / paginado vertical / webtoon), pantalla completa real, zoom (Ctrl+rueda), pinch-to-zoom táctil, drag-to-pan, fit ancho / alto / original, dirección LTR/RTL, click izquierda/derecha, atajos `← →`, espacio, `F`, `T`, `Esc`, `G`, `?`, `Ctrl+0`.
- **Thumbnail strip** virtualizado con lazy loading (IntersectionObserver) y highlight de página actual.
- **Preload inteligente** de páginas cercanas; liberación automática de páginas lejanas.
- **UI auto-oculta**: aparece al mover el mouse y desaparece tras 2.5 s.
- **Biblioteca**: grid limpio con barra de progreso sutil, búsqueda, filtros (todos / en progreso / leídos / favoritos), favoritos.
- **Estadísticas**: cómics totales/leídos, páginas leídas, racha actual y máxima, gráfico de últimos 30 días.
- **+100 logros** desbloqueables: hitos, páginas, rachas, favoritos, biblioteca, formatos, categorías y secretos.
- **+50 temas** seleccionables: clásicos, vibrantes, neón, tierra, monocromo, pastel, alto contraste y especiales (Nord, Drácula, Solarized, Matrix, Game Boy…).
- **Subida directa**: arrastra archivos `.cbz`, `.cbr`, `.pdf`, `.zip` o `.rar` a la biblioteca para añadirlos sin tocar el sistema de archivos.
- **Configuración persistente** y un saludo personalizado por hora del día.

## Stack

| Capa     | Tecnología |
|----------|------------|
| Frontend | React 18, TypeScript, Vite, TailwindCSS, Zustand, React Router |
| Backend  | Node.js, Express, Prisma, PostgreSQL (Supabase) |
| Procesamiento | sharp, adm-zip, node-unrar-js, pdfjs-dist, @napi-rs/canvas |

## Estructura

```
apps/
  server/        # API Express + Prisma + extractores + caché
  web/           # Frontend React + Vite
```

## Setup

Requiere Node.js >= 18.18 y una base de datos PostgreSQL.

### Opción A — Postgres local con Docker (recomendado para desarrollo)

```bash
cp apps/server/.env.example apps/server/.env   # ya viene con la URL local
npm run db:up                                   # levanta Postgres en :5432
npm install
npm run setup                                   # prisma generate + db push
npm run dev                                     # backend + frontend
```

El `docker-compose.yml` incluido expone Postgres 16 con la URL
`postgresql://postgres:postgres@localhost:5432/percys` (la misma que viene
por defecto en `.env.example`). `npm run db:up` / `npm run db:down`
lo controlan; `npm run db:logs` muestra los logs.

### Opción B — Supabase

1. Crea un proyecto en [Supabase](https://supabase.com) (capa gratuita basta).
2. Copia la connection string de tipo URI desde **Project Settings → Database → Connection string** y úsala como `DATABASE_URL`:

   ```bash
   cp apps/server/.env.example apps/server/.env
   # editar DATABASE_URL=postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres
   ```

3. Instala dependencias y arranca:

   ```bash
   npm install
   npm run setup
   npm run dev
   ```

- Backend: <http://localhost:4000>
- Frontend: <http://localhost:5173>

Para añadir cómics:

- **Arrastra y suelta** archivos `.cbz`, `.cbr`, `.pdf`, `.zip` o `.rar` directamente en la biblioteca, o usa el botón **Subir**.
- O coloca archivos / carpetas de imágenes en `apps/server/data/library/` y pulsa **Escanear** (también disponible vía `POST /api/library/scan`).

Configurable vía variables en `apps/server/.env` (ver `.env.example`):

| Variable                      | Descripción                                            |
|-------------------------------|--------------------------------------------------------|
| `DATABASE_URL`                | URL Postgres (`postgresql://...`). Obligatoria.        |
| `NODE_ENV`                    | `development` (default) / `test` / `production`        |
| `LIBRARY_PATH`                | Carpeta raíz con tus cómics                            |
| `CACHE_DIR`                   | Carpeta donde se guarda la caché en disco              |
| `PORT`                        | Puerto del backend (default `4000`)                    |
| `LOG_LEVEL`                   | `debug`/`info`/`warn`/`error`/`silent`                 |
| `CORS_ORIGINS`                | Allow-list separada por comas (`*` por defecto)        |
| `RATE_LIMIT_WINDOW_SECONDS`   | Ventana del rate limiter (default `60`)                |
| `RATE_LIMIT_MAX`              | Reqs/IP/ventana en endpoints de escritura (`600`)      |
| `RATE_LIMIT_UPLOAD_MAX`       | Reqs/IP/ventana en `/api/library/upload` (`30`)        |
| `JSON_BODY_LIMIT`             | Tamaño máximo de body JSON (default `10mb`)            |
| `PAGE_MEMORY_CACHE_ITEMS`     | Páginas en LRU en memoria (`60`)                       |

## Scripts

```bash
npm run dev          # backend + frontend en paralelo
npm run build        # build de producción de ambos
npm run lint         # ESLint en ambos
npm run typecheck    # TypeScript en ambos
npm test             # tests con node:test (servidor + web)
npm run db:up        # docker compose up -d postgres
npm run db:down      # docker compose down
npm run db:logs      # logs de Postgres
npm run stress       # stress test (autocannon) contra :4000
```

### Stress testing

El harness en `scripts/stress.mjs` corre escenarios secuenciales
contra los endpoints más calientes y reporta rps/p50/p99. Útil para
validar cambios que toquen middleware, queries Prisma o el pipeline
de imágenes:

```bash
npm run stress -- --duration=10 --connections=64
node scripts/stress-pages.mjs 8       # /covers /pages /thumbs
node scripts/stress-mutations.mjs     # bulk + setProgress concurrentes
```

## Arquitectura del Reader

```
useImagePreload  ──►  pre-fetch de páginas cercanas
useIdleUI        ──►  auto-oculta UI tras 2.5 s
useFullscreen    ──►  fullscreen real
useKeybinds      ──►  ← → espacio F T Esc
ContinuousView   ──►  scroll vertical infinito + IntersectionObserver
PagedView        ──►  paginado con click-zone, fit, zoom, fade
ThumbnailStrip   ──►  miniaturas virtualizadas con lazy load
QuickSettings    ──►  cambia modo / fit / dirección sin salir
```

## API

| Método | Ruta                                  | Descripción |
|--------|---------------------------------------|-------------|
| `GET`  | `/api/health`                         | Liveness (proceso arriba) |
| `GET`  | `/api/health/ready`                   | Readiness (DB respondiendo) |
| `GET`  | `/api/library`                        | Lista cómics (paginada, filtrable: `q`, `format`, `status`, `category`, `sort`, `order`, `limit`, `offset`) |
| `GET`  | `/api/library/summary`                | Conteos agregados (total / completed / inProgress / unread / favorites + bytes) |
| `GET`  | `/api/library/export`                 | Export JSON (o `?format=ndjson`) |
| `POST` | `/api/library/scan`                   | Re-escanea biblioteca |
| `POST` | `/api/library/upload`                 | Subida multipart (rate-limit dedicado) |
| `GET`  | `/api/comics/random`                  | Cómic al azar (`?scope=all/unread/in-progress/favorites`) |
| `GET`  | `/api/comics/:id`                     | Metadata |
| `GET`  | `/api/comics/:id/cover`               | Portada (webp, caché) |
| `GET`  | `/api/comics/:id/pages/:n`            | Página rasterizada |
| `GET`  | `/api/comics/:id/thumbs/:n`           | Miniatura (webp) |
| `POST` | `/api/comics/:id/progress`            | Guarda progreso |
| `POST` | `/api/comics/:id/favorite`            | Toggle favorito |
| `POST` | `/api/comics/:id/category`            | Asigna categoría |
| `POST` | `/api/comics/:id/categories`          | Reemplaza tags (multi-tag) |
| `POST` | `/api/comics/bulk`                    | Operaciones masivas (favorite, categoryAdd/Remove, delete...) |
| `GET`  | `/api/settings`                       | Lee settings |
| `PUT`  | `/api/settings`                       | Actualiza settings |
| `GET`  | `/api/stats`                          | Estadísticas |
| `GET`  | `/api/achievements`                   | Lista logros |

## Licencia

MIT
