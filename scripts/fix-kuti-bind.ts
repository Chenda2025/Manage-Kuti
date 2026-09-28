import 'dotenv/config'
import { getPool, initDb } from '../server/db.ts'
import { resolveHomeKutiId, syncFromPagoda } from '../server/pagoda.ts'

await initDb()
const sync = await syncFromPagoda(true)
const homeId = await resolveHomeKutiId()
const { rows } = await getPool().query(
  `SELECT id, kuti_name, manager_name, external_key,
          LEFT(COALESCE(share_token, ''), 16) AS tok
   FROM kutis
   WHERE id = $1 OR share_token IS NOT NULL
   ORDER BY id`,
  [homeId],
)
const residents = homeId
  ? await getPool().query(
      `SELECT COUNT(*)::int AS n FROM residents WHERE kuti_id = $1`,
      [homeId],
    )
  : { rows: [{ n: 0 }] }

console.log(JSON.stringify({ sync, homeId, rows, residentCount: residents.rows[0]?.n }, null, 2))
process.exit(0)
