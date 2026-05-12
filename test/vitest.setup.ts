import { config } from "dotenv";

config();

const testUrl = process.env.DATABASE_TEST_URL;
const databaseUrl = process.env.DATABASE_URL;

if (testUrl) {
  if (testUrl === databaseUrl) {
    throw new Error(
      "DATABASE_TEST_URL must differ from DATABASE_URL. Tests must run against a separate DB.",
    );
  }
  process.env.DATABASE_URL = testUrl;
  process.env.TURSO_AUTH_TOKEN = process.env.TURSO_TEST_AUTH_TOKEN ?? "";
}
