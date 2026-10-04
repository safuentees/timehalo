import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { DEFAULT_AVAILABILITY_ROWS } from "@/lib/schedule";
import { DEFAULT_REMINDER_WORKFLOW } from "@/lib/workflows";

export async function createGuestAccount() {
  const id = randomUUID();
  const handle = `guest-${randomBytes(10).toString("hex")}`;

  // One atomic nested write establishes the same account invariants as signup.
  // No shared login, supplied identity, password or deliverable mailbox.
  return prisma.user.create({
    data: {
      id,
      name: "Guest",
      email: `${handle}@guest.timehalo.invalid`,
      handle,
      availabilityRanges: { createMany: { data: [...DEFAULT_AVAILABILITY_ROWS] } },
      workflows: { create: { ...DEFAULT_REMINDER_WORKFLOW } },
      ownedWorkspaces: {
        create: {
          slug: handle,
          name: "Personal",
          memberships: { create: { userId: id, role: "OWNER" } },
          eventTypes: {
            create: {
              slug: handle,
              name: "Quick chat",
              durationMins: 15,
              durationMinsList: JSON.stringify([15]),
              hosts: { create: { userId: id, isFixed: true } },
            },
          },
        },
      },
    },
    select: { id: true, name: true, email: true, image: true },
  });
}
