// Copies all app data from the prod database into the test database (read-only on prod).
// Usage: SOURCE_URL=<prod url> TARGET_URL=<test url> node scripts/copy-prod-to-test.js
// Refuses to run unless the target database name contains "test". Wipes the target first.
const { Client } = require("pg");

const TABLES = ["User", "Class", "Student", "TuitionPeriod", "TuitionPayment", "ReminderLog"];

async function main() {
  const { SOURCE_URL, TARGET_URL } = process.env;
  if (!SOURCE_URL || !TARGET_URL) throw new Error("SOURCE_URL and TARGET_URL are required");
  const targetDb = new URL(TARGET_URL).pathname.slice(1);
  if (!/test/i.test(targetDb)) throw new Error(`Refusing to write into "${targetDb}": target name must contain "test"`);
  if (new URL(SOURCE_URL).pathname === new URL(TARGET_URL).pathname) throw new Error("Source and target are the same database");

  const src = new Client({ connectionString: SOURCE_URL });
  const dst = new Client({ connectionString: TARGET_URL });
  await src.connect();
  await dst.connect();
  try {
    await dst.query("BEGIN");
    for (const t of [...TABLES].reverse()) await dst.query(`DELETE FROM "${t}"`);
    for (const t of TABLES) {
      const { rows, fields } = await src.query(`SELECT * FROM "${t}"`);
      const cols = fields.map((f) => `"${f.name}"`).join(", ");
      for (const row of rows) {
        const values = fields.map((f) => row[f.name]);
        const params = values.map((_, i) => `$${i + 1}`).join(", ");
        await dst.query(`INSERT INTO "${t}" (${cols}) VALUES (${params})`, values);
      }
      console.log(`${t}: ${rows.length} rows`);
    }
    await dst.query("COMMIT");
  } catch (e) {
    await dst.query("ROLLBACK");
    throw e;
  } finally {
    await src.end();
    await dst.end();
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
