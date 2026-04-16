-- CreateTable
CREATE TABLE "Post" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "title" TEXT NOT NULL,
    "excerpt" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "readTime" TEXT NOT NULL,
    "tag" TEXT NOT NULL
);
