// One-shot dev seed for B.PT62 / B.PT62b — creates a team event type
// (>1 hosts) on a workspace so the visitor flow at
// `/w/<slug>/<eventTypeSlug>` can be exercised end-to-end while the
// host-side authoring UI is still deferred (B.PT62 branch A).
//
// Usage:
//   pnpm exec tsx scripts/seed-team-event-type.ts \
//     --workspace <workspace-slug> \
//     [--event-type <slug>]   default: intro-call
//     [--name <display-name>] default: "Intro call"
//     [--duration <minutes>]  default: 15
//     [--host <handle>]       repeat for each additional host;
//                             the workspace owner is always auto-added
//                             as a non-fixed pool member.
//
// What this does:
//   1. Looks up the workspace by slug.
//   2. Looks up the workspace owner (Membership where role = OWNER).
//   3. For each --host arg, looks up that user by handle.
//   4. Creates (or upserts) the EventType on (workspaceId, slug).
//   5. Adds an EventTypeHost row for the owner + each --host.
//   6. Prints the public URLs to visit.
//
// Idempotent: re-running with the same args is a no-op (upsert).
// Safe in dev — refuses to run when NODE_ENV === "production".

// Load `.env` so DATABASE_URL is available — Next.js + Playwright
// load `.env` automatically; a standalone tsx run does not. MUST be
// the first import so `@/lib/prisma`'s module-load reads
// `process.env.DATABASE_URL` after dotenv has populated it.
import "dotenv/config";

import { prisma } from "@/lib/prisma";

type CliArgs = {
  workspace: string;
  eventType: string;
  name: string;
  duration: number;
  hosts: string[];
};

function parseArgs(argv: string[]): CliArgs {
  const out: Partial<CliArgs> & { hosts: string[] } = { hosts: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--workspace" && next) {
      out.workspace = next;
      i++;
    } else if (arg === "--event-type" && next) {
      out.eventType = next;
      i++;
    } else if (arg === "--name" && next) {
      out.name = next;
      i++;
    } else if (arg === "--duration" && next) {
      out.duration = Number(next);
      i++;
    } else if (arg === "--host" && next) {
      out.hosts.push(next);
      i++;
    }
  }
  if (!out.workspace) {
    throw new Error("Missing required --workspace <slug>");
  }
  return {
    workspace: out.workspace,
    eventType: out.eventType ?? "intro-call",
    name: out.name ?? "Intro call",
    duration: out.duration ?? 15,
    hosts: out.hosts,
  };
}

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "seed-team-event-type.ts refuses to run in production — dev only.",
    );
  }

  const args = parseArgs(process.argv.slice(2));

  console.log(
    `[seed-team-event-type] workspace=${args.workspace} eventType=${args.eventType} duration=${args.duration} hosts=${args.hosts.join(",") || "(owner only)"}`,
  );

  // 1. Resolve workspace
  const workspace = await prisma.workspace.findUnique({
    where: { slug: args.workspace },
    select: {
      id: true,
      name: true,
      memberships: {
        where: { role: "OWNER" },
        select: { user: { select: { id: true, handle: true } } },
        take: 1,
      },
    },
  });
  if (!workspace) {
    throw new Error(`Workspace not found: ${args.workspace}`);
  }
  const owner = workspace.memberships[0]?.user;
  if (!owner) {
    throw new Error(
      `Workspace ${args.workspace} has no OWNER membership — can't seed.`,
    );
  }
  console.log(
    `[seed-team-event-type] resolved workspace "${workspace.name}" (owner=@${owner.handle ?? "<no-handle>"})`,
  );

  // 2. Resolve additional hosts
  const additionalHosts: Array<{ id: string; handle: string }> = [];
  for (const handle of args.hosts) {
    const u = await prisma.user.findUnique({
      where: { handle },
      select: { id: true, handle: true },
    });
    if (!u) {
      throw new Error(`Host not found by handle: ${handle}`);
    }
    if (u.id === owner.id) {
      console.log(
        `[seed-team-event-type] skipping owner ${handle} (already added)`,
      );
      continue;
    }
    additionalHosts.push({ id: u.id, handle: u.handle ?? handle });
  }

  // 3. Upsert EventType
  const eventType = await prisma.eventType.upsert({
    where: {
      workspaceId_slug: {
        workspaceId: workspace.id,
        slug: args.eventType,
      },
    },
    create: {
      workspaceId: workspace.id,
      slug: args.eventType,
      name: args.name,
      durationMins: args.duration,
    },
    update: {
      name: args.name,
      durationMins: args.duration,
    },
    select: { id: true },
  });
  console.log(`[seed-team-event-type] event type id=${eventType.id}`);

  // 4. Upsert hosts. Owner first (always non-fixed so they're in the
  //    rotation pool); then each --host arg. Insert order matches
  //    branch C's intent — the second/third host's recentAssignments
  //    starts at 0 because the upsert path doesn't go through
  //    addHostToEventType. For testing the insert-time backfill
  //    behavior in isolation, see the team-booking.test.ts cases.
  const allHosts = [
    { userId: owner.id, handle: owner.handle ?? "owner" },
    ...additionalHosts.map((h) => ({ userId: h.id, handle: h.handle })),
  ];
  for (const h of allHosts) {
    await prisma.eventTypeHost.upsert({
      where: {
        eventTypeId_userId: {
          eventTypeId: eventType.id,
          userId: h.userId,
        },
      },
      create: {
        eventTypeId: eventType.id,
        userId: h.userId,
        isFixed: false,
        priority: 2,
        weight: 1,
        recentAssignments: 0,
      },
      update: {},
    });
    console.log(`[seed-team-event-type]  + host @${h.handle}`);
  }

  // 5. Print URLs.
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001";
  console.log("");
  console.log("Done. Visit:");
  console.log(`  Directory: ${appUrl}/w/${args.workspace}`);
  console.log(
    `  Booking:   ${appUrl}/w/${args.workspace}/${args.eventType}`,
  );

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
