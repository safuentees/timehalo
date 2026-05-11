-- AlterTable: add booking-horizon days (nullable = unlimited).
ALTER TABLE "User" ADD COLUMN "bookingHorizonDays" INTEGER;
