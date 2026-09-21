# Moments

A calm, private app for a family to record difficult moments a child experiences — and
to understand them later.

One shared copy of everything, on every device. Record in about ten seconds. Works
without a signal and syncs by itself when the signal comes back.

---

## Setting it up

You need a free [Supabase](https://supabase.com) project. It holds your family's
information; nobody else's server ever sees it.

### 1. Create the database

1. Sign in to Supabase and create a new project. Choose a region near you and keep the
   database password somewhere safe.
2. Open **SQL Editor** in the project sidebar, click **New query**.
3. Paste the whole of [`supabase/schema.sql`](supabase/schema.sql) and run it.

That one file creates every table, every access rule, and the functions the app writes
through. Running it twice is safe.

### 2. Point the app at it

In Supabase, open **Project Settings → API** and copy the **Project URL** and the
**anon public** key.

```bash
cp .env.example .env
```

Then edit `.env`:

```
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key
```

The anon key is meant to be in the app — it grants nothing by itself. Every request is
authorised by the signed-in person against the rules in the database.

### 3. Run it

```bash
npm install
npm run dev
```

Open the address it prints. Create an account, then **Start a family** — that sets up
your family space, your child's profile and the starting list of triggers.

### 4. Put it on your devices

```bash
npm run build
```

Upload `dist/` to any static host that serves HTTPS — Netlify, Vercel, Cloudflare Pages
and GitHub Pages all work, and their free tiers are plenty. Then in Supabase open
**Authentication → URL Configuration** and add your site's address to the redirect list.

On the phone, open the site and choose **Add to Home Screen**. It then behaves like an
app, including offline.

---

## Inviting the rest of the family

Settings → Family → **Invite someone** produces a one-time code that expires in 14 days.
Send it however you would send anything private. There is no public link and Moments
never emails anyone.

Three roles, and the owner can adjust each permission individually:

| | Owner / Parent | Family member | Viewer |
|---|---|---|---|
| View moments | ✓ | ✓ (optional) | ✓ (optional) |
| Add moments | ✓ | ✓ (optional) | — |
| Edit moments | ✓ | ✓ (optional) | — |
| Delete moments | ✓ | optional | — |
| See statistics | ✓ | ✓ (optional) | ✓ (optional) |
| Manage members | ✓ | optional | — |

These are enforced by the database, not by hiding buttons. A member without permission to
delete cannot delete a moment even with a direct request to the API.

---

## How the one-shared-copy part works

**The database is the only source of truth.** Each device keeps a cache and a queue of
writes it has not managed to send. Neither is a second copy of your family's record.

- Every moment gets a UUID on the device that records it. That id is what the database
  stores, so a queued write can be re-sent safely — it lands on the same row.
- The outbox holds **at most one entry per moment**. Editing something that is still
  waiting replaces the entry rather than adding another. Replaying the queue therefore
  cannot produce a duplicate, however many times it runs.
- Every save carries the version it was based on. If another device got there first, the
  save comes back as a **conflict** instead of overwriting: both versions are kept, and
  the app asks which to keep, field by field. Nothing is lost either way.
- Saves, edits and deletes are appended to `event_edit_history`. Editing never erases
  what was there before.
- Deletes are soft (`deleted_at`), which is also how other devices find out about them.
- Realtime keeps every signed-in device current. On reconnect the app also fetches
  everything changed since its last sync, so a missed realtime message cannot leave a
  device behind.

You can see the whole of it in [`src/data/store.tsx`](src/data/store.tsx) and
`save_event()` in [`supabase/schema.sql`](supabase/schema.sql).

### Trying the offline path

1. Record a moment with the network off. The home screen says it is waiting to sync.
2. Record another. Edit the first one.
3. Turn the network back on. Both upload; there is one of each, not three.

---

## What is in it

**Home** — "How has today been?", today's count, average difficulty, total time and most
common trigger, a large **Record a Moment** button, and today's timeline.

**Recording** — start time (now by default), a timer or a typed duration, a 1–10
difficulty scale, triggers, what happened, what helped, where, notes, and optional notes
about the day (sleep, hunger, school day, unusual day).

**Quick Record** — press and hold the **+** button. Difficulty and trigger only; the rest
can be filled in later. Well under ten seconds.

**Live mode** — **Start Moment** writes the moment to the shared record straight away as
a draft and runs a timer. While it is happening there is nothing to do but tap a number.

**History** — today through all time, filters for difficulty, trigger, duration, place,
who recorded it and what helped, plus search.

**Calendar** — a month at a glance, a dot per moment shaded by recorded difficulty.

**Insights** — how often, average difficulty, duration, triggers, time of day, day of
week, what was recorded alongside shorter moments, plain observations, and period
comparisons with a direction for each measure.

**Reports** — pick a date range and what to include, then save as PDF (your browser's
print dialog) or CSV. Nothing is ever sent anywhere on its own.

---

## The language it uses

This is a record-keeping app. It counts what your family wrote down and describes it.
It does not assess, explain or diagnose anything, and it never frames a child as the
problem.

- "Moments where *quiet room* was recorded tended to be shorter" — not "quiet room
  works".
- Trends are ↑ higher, ↓ lower, → similar. Never better or worse.
- A 10 is styled exactly like a 1: the same calm blue, a little deeper. Nothing on the
  difficulty scale is red, and nothing suggests anyone did something wrong.

---

## Privacy

- Accounts are required; all traffic is HTTPS to your own Supabase project.
- Row level security isolates every family. A signed-in person can only read rows from a
  family they belong to, and only if their permissions allow it.
- Writes to moments go through `save_event()` / `delete_event()`, which check permissions
  server-side. The `events` table has no direct insert or update policy at all.
- No adverts, no analytics, no tracking, no public profiles, no public links, nothing
  sold or shared.
- Notifications never name a score, trigger or note — only that something is waiting in
  the app, so a lock screen reveals nothing.
- **Export my data** (JSON or CSV) and **Delete my data** are in Settings. For the owner,
  deleting removes the family and everything in it, for everyone. To remove the login
  itself, delete the user in Supabase → Authentication → Users.

---

## More than one child

The schema was built for several from the start: every moment belongs to a `profile_id`,
and `profiles` is a table, not a column. Settings → Child profile → **Add another child**
is all it takes; each child's moments, statistics and reports stay separate.

---

## The data model

`users` · `families` · `family_members` · `family_invites` · `profiles` (the children) ·
`events` · `triggers` · `event_triggers` · `helpful_actions` · `event_helpful_actions` ·
`event_edit_history`

An event holds: `id`, `family_id`, `profile_id`, `created_by`, `updated_by`,
`start_time`, `end_time`, `duration_seconds`, `difficulty`, `description`, `location`,
`notes`, the optional day context, `status`, `version`, `deleted_at`, `created_at`,
`updated_at`.

---

## Working on it

```bash
npm run dev        # development server
npm run typecheck  # TypeScript
npm test           # analysis logic + component rendering and accessibility
npm run build      # production build into dist/
```

`tests/logic.test.ts` covers the maths and the wording rules; `tests/render.test.tsx`
renders the components and checks the accessible labels the design depends on.

Layout:

```
src/
  data/store.tsx      sync engine: cache, outbox, realtime, conflicts
  lib/                types, database client, local cache, dates, statistics, export
  components/         design system, charts, difficulty scale, pickers
  screens/            one file per screen
  styles/app.css      tokens: light and dark, spacing, type, the difficulty ramp
supabase/schema.sql   tables, row level security, functions, realtime
```

## Accessibility

Sizes are in `rem`, so the browser's or phone's own text size applies; Settings adds
Large and Larger on top. Controls are at least 44px, animations respect
`prefers-reduced-motion` and the in-app Reduce motion switch, every chart has a
"Show the numbers" table, and nothing — difficulty, trend or calendar density — is
communicated by colour alone.
