import "dotenv/config"
import { ensureSchema, getPool } from "../server/db"

async function main() {
  await ensureSchema()
  const tables = await getPool().query(`
    SELECT table_schema, table_name
    FROM information_schema.tables
    WHERE table_schema = 'kuti'
    ORDER BY table_name
  `)
  console.log("Tables in schema kuti:")
  console.table(tables.rows)
  const users = await getPool().query("SELECT id, username, role FROM users")
  console.log("Seed users:")
  console.table(users.rows)
  await getPool().end()
  console.log("Done.")
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
