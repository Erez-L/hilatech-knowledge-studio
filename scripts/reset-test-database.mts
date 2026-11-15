/** Drops and recreates the schema of the TEST database. Refuses any database whose name does not contain "test". */
import { resetDatabase } from "../packages/database/test/helpers.ts";

const url = process.env.DATABASE_MIGRATION_URL ?? "";
const name = new URL(url).pathname.slice(1);
if (!name.includes("test")) {
  console.error(`Refusing to reset "${name}": not a test database.`);
  process.exit(1);
}
const applied = await resetDatabase();
console.log(`reset ${name}: ${applied.length} migrations applied`);
