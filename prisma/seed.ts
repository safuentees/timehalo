import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";

const adapter = new PrismaLibSql({
  url: process.env.DATABASE_URL || "file:./dev.db",
});
const prisma = new PrismaClient({ adapter });

async function main() {
  await prisma.post.createMany({
    data: [
      {
        title: "Rethinking State Machines in Modern UI",
        excerpt:
          "Why finite automata deserve a second look now that component models have matured beyond simple prop drilling.",
        date: "2026-04-12",
        readTime: "6 min",
        tag: "Architecture",
      },
      {
        title: "The Case Against Premature Abstraction",
        excerpt:
          "Three similar lines of code is better than a premature abstraction. A look at when DRY becomes a liability.",
        date: "2026-04-08",
        readTime: "4 min",
        tag: "Opinion",
      },
      {
        title: "Edge Functions Changed How I Think About Latency",
        excerpt:
          "Moving compute closer to the user sounds obvious in hindsight. Here is what I learned deploying a real app to the edge.",
        date: "2026-03-29",
        readTime: "8 min",
        tag: "Infrastructure",
      },
      {
        title: "Type-Safe APIs Without the Ceremony",
        excerpt:
          "tRPC, Zod, and Prisma form a stack where the types write themselves. A walkthrough of the ergonomics.",
        date: "2026-03-21",
        readTime: "5 min",
        tag: "TypeScript",
      },
      {
        title: "Why I Stopped Using CSS-in-JS",
        excerpt:
          "After three years of runtime stylesheets, I switched back to utility classes. Performance was only part of the reason.",
        date: "2026-03-14",
        readTime: "7 min",
        tag: "CSS",
      },
    ],
  });

  console.log("Seeded 5 posts");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
