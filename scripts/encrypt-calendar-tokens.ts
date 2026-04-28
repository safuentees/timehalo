
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
