// One-shot data migration: re-encrypt every existing
// CalendarCredential.accessToken + refreshToken row that's still in
// plaintext. Idempotent — already-encrypted (`v1:` envelope) rows are
// skipped. Safe to run repeatedly.
//
// Usage:
//   pnpm exec tsx scripts/encrypt-calendar-tokens.ts
//   pnpm exec tsx scripts/encrypt-calendar-tokens.ts --dry-run
//
// Pre-req:
//   CALENDAR_TOKEN_KEY must be set in .env (the script imports the
//   project's env validator, so the boot fails loud if it's missing).
//
// Why a script and not a Prisma SQL migration:
//   AES-256-GCM can't run inside SQLite. We could do it via a Prisma
//   migration `prisma db execute` step but the encryption requires
//   Node — so a tsx script invoked alongside `prisma migrate deploy`
//   is the cleanest shape. The data step is one-shot per environment,
//   not per-clone, so it doesn't belong in `prisma/migrations/`.

import { prisma } from "@/lib/prisma";
import {
  encryptToken,
  isEncryptedEnvelope,
} from "@/lib/calendar/encryption";

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  const rows = await prisma.calendarCredential.findMany({
    select: {
      id: true,
      provider: true,
      externalAccountEmail: true,
      accessToken: true,
      refreshToken: true,
    },
  });

  let alreadyEncrypted = 0;
  let toEncrypt = 0;
  for (const row of rows) {
    const accessEncrypted = isEncryptedEnvelope(row.accessToken);
    const refreshEncrypted = isEncryptedEnvelope(row.refreshToken);
    if (accessEncrypted && refreshEncrypted) {
      alreadyEncrypted++;
      continue;
    }
    toEncrypt++;
    if (dryRun) {
      console.log(
        `[dry-run] ${row.provider} (${row.externalAccountEmail ?? row.id}): would encrypt`,
      );
      continue;
    }
    await prisma.calendarCredential.update({
      where: { id: row.id },
      data: {
        accessToken: accessEncrypted ? row.accessToken : encryptToken(row.accessToken),
        refreshToken: refreshEncrypted
          ? row.refreshToken
          : encryptToken(row.refreshToken),
      },
    });
    console.log(
      `[encrypted] ${row.provider} (${row.externalAccountEmail ?? row.id})`,
    );
  }

  console.log(
    `\nTotal: ${rows.length} rows. Already encrypted: ${alreadyEncrypted}. ${dryRun ? "Would encrypt" : "Encrypted"}: ${toEncrypt}.`,
  );
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
