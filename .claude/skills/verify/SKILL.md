---
name: verify
description: Build, run and drive the Data-Manager app (Next.js + Prisma/MySQL) to observe a change working end-to-end. Use when verifying UI or server-action changes in this repo.
---

# Verify Data-Manager

Next.js 15 App Router + React 19 + Tailwind v4 (CSS-first, no config file) + Prisma/MySQL.
No `src/app/api` — writes go through **Server Actions** in `src/app/actions/`.

## Launch

```bash
npm run dev            # http://localhost:3000, ready in ~3s
```

The DB is a **remote MySQL box** (`DB_HOST` in `.env`), not a local container.
There is no throwaway dataset — **anything you write is real data. Restore any
value you change**, and prefer read-only observation where you can.

`scripts/with-db-url.mjs` assembles `DATABASE_URL` from the `DB_*` vars. To run a
one-off Prisma probe, put the script **in the repo root** (it needs to resolve
`@prisma/client` from local `node_modules`) and run:

```bash
node scripts/with-db-url.mjs node ./probe.tmp.mjs
```

## Login

Every route except `/login` is behind auth middleware. Creds come from `.env`
(`ADMIN_USERNAME` / `ADMIN_PASSWORD`, defaults `admin` / `admin123`):

```js
await page.goto("http://localhost:3000/login");
await page.fill('input[name="username"]', "admin");
await page.fill('input[name="password"]', "admin123");
await page.click('button[type="submit"]');
await page.waitForURL("http://localhost:3000/");
```

## Browser automation

Playwright is **not** a project dependency. Don't add it — install it into a
scratch dir and run the script from there:

```bash
cd "$SCRATCH" && npm init -y && npm i playwright && npx playwright install chromium
node drive.mjs      # imports "playwright", talks to localhost:3000
```

## Driving the desktop LSX table (`/`)

`/` renders **both** layouts server-side and hides one with Tailwind: mobile is
`lg:hidden`, desktop is `hidden lg:block`. **Use a viewport ≥ 1024px wide** or you
will be driving the mobile list and think the desktop grid is missing.

The desktop grid (`src/components/sheet/OrdersGrid.tsx`) is a CSS-grid tree, not a
`<table>`. Hooks for tests:

- Every navigable row has `data-nav`, and the id is a **path**:
  `order-239` → `order-239/stage-457` → `order-239/stage-457/mv-72-all`;
  under a "Gửi may" mục there's an extra part tier
  (`order-355/stage-445/part-1154`).
- Size cells carry `data-col="<index>"`; the leftmost frozen cell is `.sheet-freeze`.
- Expand/collapse: click the row's `button[aria-label]` (chevron). `Shift+ArrowRight`
  expands everything, `Shift+ArrowLeft` collapses.
- Inline edit: click a `[data-col=N]` cell, type, `Enter`. It calls a server action
  then `router.refresh()` — **wait ~2s** before asserting; the value round-trips
  through the server.
- Only `SEW_IN` / `EMB_IN` / `EMB_OUT` mục rows have editable target cells.
  "Gửi may" (`SEW_OUT`) parent cells are **read-only** (they sum the part định mức).

Useful fixtures in the current DB: `?q=2607020` is an LSX with EMB mục and one
received đợt; most other LSX have SEW_OUT + parts but no đợt.

## Gotchas found the hard way

- The app root sets `color-scheme: dark`. Anything light-themed must declare
  `color-scheme: light` on its scope or native checkboxes/date pickers render as
  black boxes.
- Sampling "the first size cell" to check a colour is a bad probe — the first size
  columns are legitimately empty (`–`) for most orders. Pick a column with data.
