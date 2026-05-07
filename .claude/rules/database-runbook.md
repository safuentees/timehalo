# Database runbook

Single page covering backups + restore for the production Turso
database. Read before touching prod data; rehearse the restore once
per quarter so the muscle memory is fresh when an incident actually
hits.

## Backup model (Turso)

Turso writes a backup at every `COMMIT` automatically — no cron, no
configuration. The retention window depends on the plan tier:

- **Free / Hobby** (current): 24 hours of point-in-time recovery
- **Developer**: 10 days
- **Scaler**: 30 days
- **Pro**: 90 days

The current launch sits on Free. If you cross the 70%-of-quota gate
documented in `PRODUCTION-READINESS.md` Section A and upgrade to
Developer, the 24h → 10d retention is automatic — no migration step.

### Snapshot dumps for off-site storage

PITR is provider-internal. For an extra off-site insurance layer
(useful for a yearly "the provider went away" tabletop), take a
weekly logical dump:

```bash
# Dump the whole DB to a portable .sql file (excludes libSQL/SQLite
# internal tables — `.dump` is documented as restoration-safe).
turso db shell <db-name> .dump > backups/$(date +%Y-%m-%d).sql
```

Store the file outside Turso (S3 bucket, encrypted local archive,
GitHub Actions artifact under retention). Don't commit dumps to git
— bookings table contains visitor PII.

## Restore procedure

Turso's PITR creates a NEW database with the recovered state. There
is NO in-place restore. The app must be repointed at the new
database's connection string after recovery.

### Step 1 — pick the recovery point

Find the wall-clock UTC timestamp you want to restore to. ISO-8601
format. If recovering from accidental data loss, pick a timestamp
~5 minutes before the bad write — the PITR is at-commit precision
but rounding gives you margin.

### Step 2 — create the recovery DB

```bash
turso db create <recovery-db-name> \
  --from-db <prod-db-name> \
  --timestamp 2026-05-07T14:23:00Z
```

Naming convention for the recovery DB: `<prod>-recovery-<YYYY-MM-DD>`.
Keeps the trail readable and easy to delete after the incident is
closed.

### Step 3 — verify the recovered data

Connect to the recovery DB via shell and spot-check the table the
incident touched:

```bash
turso db shell <recovery-db-name>
> SELECT count(*) FROM Booking WHERE deleted = 0;
> SELECT * FROM Booking ORDER BY createdAt DESC LIMIT 5;
> .quit
```

Compare row counts against what the app reported just before the
loss. If the count is wrong, repeat step 2 with a different
timestamp.

### Step 4 — mint a token for the recovery DB

The prod token does NOT work against the recovery DB — Turso scopes
tokens per-database (or per-group). Mint a fresh one:

```bash
turso db tokens create <recovery-db-name>
```

Capture the token; you'll need it for step 5.

### Step 5 — repoint the app

Update Vercel project env (or platform equivalent):

```
DATABASE_URL=libsql://<recovery-db-name>-<org>.turso.io
TURSO_AUTH_TOKEN=<token-from-step-4>
```

Trigger a redeploy. The app boots against the recovery DB. Verify
by hitting `/api/healthcheck` (if defined) or any authenticated
route — a successful response confirms the connection.

### Step 6 — clean up

After 7 days of running on the recovered DB without issues:

1. Take a final snapshot of the original prod DB (in case a forensic
   dive is needed later).
2. Delete the original prod DB: `turso db destroy <prod-db-name>`.
3. Optionally rename the recovery DB to the original prod name so
   future operators don't see "-recovery-2026-05-07" in the canonical
   path.

## Tabletop rehearsal (quarterly)

Schedule a 30-minute dry run:

1. Pick a timestamp 1 hour ago.
2. Run step 2–3 against the prod DB (this only creates a new
   read-only snapshot — no production impact).
3. Verify a known booking row appears at the expected `createdAt`.
4. Destroy the rehearsal DB: `turso db destroy <recovery-db-name>`.

Time the whole exercise. Sub-15-minute is the goal — anything
slower means the runbook needs sharpening.

## Quotas + cost gotchas

- Restored DBs count toward your plan's database quota. The Free
  tier allows 5 databases; if you're at the cap, delete an unused
  recovery DB before creating another.
- `turso db create --from-db` is metered as a fresh DB, not as a
  free PITR query. Plan accordingly during a real incident with
  multiple recovery attempts.

## When to escalate to Turso support

- PITR creates a DB but the data looks corrupt or partial.
- The 24h retention window claims to cover a timestamp but the
  restore returns "timestamp out of range."
- Group token rotation makes prod connections fail across multiple
  apps simultaneously.

Support: <https://discord.gg/turso> (community) or
<https://turso.tech/contact> (paid plans get a private channel).
File a support request with the prod DB name + the failing command +
the exact error. Do NOT include `TURSO_AUTH_TOKEN` values in the
request — rotate first if you suspect they leaked into the message.
