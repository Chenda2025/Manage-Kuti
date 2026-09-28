import { Pool } from 'pg'
import { hashPassword } from './auth'

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'manager',
  teacher_id INTEGER,
  student_id INTEGER,
  is_active BOOLEAN NOT NULL DEFAULT true,
  avatar_url TEXT,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower ON users (lower(username));

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pagodas (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  abbot_name TEXT NOT NULL DEFAULT '',
  phone TEXT
);

CREATE TABLE IF NOT EXISTS kutis (
  id SERIAL PRIMARY KEY,
  pagoda_id INTEGER NOT NULL REFERENCES pagodas(id) ON DELETE RESTRICT,
  kuti_name TEXT NOT NULL,
  manager_name TEXT NOT NULL DEFAULT '',
  external_key TEXT,
  share_token TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS kutis_external_key_uidx ON kutis (external_key)
  WHERE external_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS rooms (
  id SERIAL PRIMARY KEY,
  kuti_id INTEGER NOT NULL REFERENCES kutis(id) ON DELETE CASCADE,
  room_name TEXT NOT NULL,
  manager_name TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rooms_kuti_id_idx ON rooms (kuti_id);

CREATE TABLE IF NOT EXISTS residents (
  id SERIAL PRIMARY KEY,
  student_code TEXT NOT NULL UNIQUE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  latin_name TEXT,
  gender TEXT,
  monk_status TEXT,
  position TEXT,
  vassa_years INTEGER,
  phone TEXT,
  kuti_id INTEGER REFERENCES kutis(id) ON DELETE SET NULL,
  room_id INTEGER REFERENCES rooms(id) ON DELETE SET NULL,
  pagoda_id INTEGER REFERENCES pagodas(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active',
  image_url TEXT,
  external_id INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS residents_external_id_uidx ON residents (external_id);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS attendance_kuti (
  id SERIAL PRIMARY KEY,
  kuti_id INTEGER NOT NULL REFERENCES kutis(id) ON DELETE CASCADE,
  resident_id INTEGER NOT NULL REFERENCES residents(id) ON DELETE CASCADE,
  attendance_type TEXT NOT NULL,
  attend_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'present',
  excuse_period TEXT,
  marked_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS attendance_kuti_uidx
  ON attendance_kuti (kuti_id, resident_id, attendance_type, attend_date);
CREATE INDEX IF NOT EXISTS attendance_kuti_date_type_idx
  ON attendance_kuti (attend_date, attendance_type);

CREATE TABLE IF NOT EXISTS telegram_outbox (
  id SERIAL PRIMARY KEY,
  chat_id TEXT,
  message_id INTEGER,
  kind TEXT NOT NULL DEFAULT 'message',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'sent',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
`

let pool: Pool | null = null
let schemaReady: Promise<void> | null = null

function databaseUrl() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set')
  return url
}

export function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: databaseUrl(),
      options: '-c search_path=kuti,public',
    })
  }
  return pool
}

export async function ensureSchema() {
  if (!schemaReady) {
    schemaReady = bootstrap().catch((error) => {
      schemaReady = null
      throw error
    })
  }
  await schemaReady
}

async function bootstrap() {
  const setup = new Pool({ connectionString: databaseUrl() })
  try {
    await setup.query('CREATE SCHEMA IF NOT EXISTS kuti')
  } finally {
    await setup.end()
  }
  await getPool().query(SCHEMA_SQL)
  await getPool().query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT`)
  await getPool().query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name TEXT`)
  await getPool().query(
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS managed_pages JSONB NOT NULL DEFAULT '[]'::jsonb`,
  )
  await getPool().query(
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS managed_attendance_types JSONB NOT NULL DEFAULT '[]'::jsonb`,
  )
  await getPool().query(`ALTER TABLE kutis ADD COLUMN IF NOT EXISTS external_key TEXT`)
  await getPool().query(`ALTER TABLE kutis ADD COLUMN IF NOT EXISTS share_token TEXT`)
  await getPool().query(`ALTER TABLE residents ADD COLUMN IF NOT EXISTS external_id INTEGER`)
  await getPool().query(`ALTER TABLE attendance_kuti ADD COLUMN IF NOT EXISTS excuse_period TEXT`)
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS rooms (
      id SERIAL PRIMARY KEY,
      kuti_id INTEGER NOT NULL REFERENCES kutis(id) ON DELETE CASCADE,
      room_name TEXT NOT NULL,
      manager_name TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `)
  await getPool().query(`CREATE INDEX IF NOT EXISTS rooms_kuti_id_idx ON rooms (kuti_id)`)
  await getPool().query(
    `ALTER TABLE residents ADD COLUMN IF NOT EXISTS room_id INTEGER REFERENCES rooms(id) ON DELETE SET NULL`,
  )
  await getPool().query(`ALTER TABLE residents ADD COLUMN IF NOT EXISTS position TEXT`)
  await getPool().query(`ALTER TABLE residents ADD COLUMN IF NOT EXISTS vassa_years INTEGER`)
  await getPool().query(`ALTER TABLE residents ADD COLUMN IF NOT EXISTS education_level TEXT`)
  await getPool().query(
    `CREATE UNIQUE INDEX IF NOT EXISTS kutis_external_key_uidx ON kutis (external_key)
     WHERE external_key IS NOT NULL`,
  )
  await getPool().query(
    `CREATE UNIQUE INDEX IF NOT EXISTS residents_external_id_uidx ON residents (external_id)`,
  )
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS attendance_groups (
      id SERIAL PRIMARY KEY,
      attendance_type TEXT NOT NULL,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `)
  await getPool().query(
    `CREATE INDEX IF NOT EXISTS attendance_groups_type_idx ON attendance_groups (attendance_type)`,
  )
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS attendance_group_members (
      attendance_type TEXT NOT NULL,
      group_id INTEGER NOT NULL REFERENCES attendance_groups(id) ON DELETE CASCADE,
      resident_id INTEGER NOT NULL REFERENCES residents(id) ON DELETE CASCADE,
      PRIMARY KEY (attendance_type, resident_id)
    )
  `)
  await getPool().query(
    `CREATE INDEX IF NOT EXISTS attendance_group_members_group_idx ON attendance_group_members (group_id)`,
  )

  const pagodas = await getPool().query('SELECT id FROM pagodas LIMIT 1')
  if (!pagodas.rowCount) {
    await getPool().query(
      `INSERT INTO pagodas (name, abbot_name) VALUES ($1, $2)`,
      ['វត្តនិរោធរង្សី', ''],
    )
  }

  const users = await getPool().query('SELECT id FROM users LIMIT 1')
  if (!users.rowCount) {
    const passwordHash = await hashPassword(process.env.ADMIN_PASSWORD || 'admin123')
    await getPool().query(
      `INSERT INTO users (username, password_hash, role, is_active)
       VALUES ($1, $2, 'admin', true)`,
      [process.env.ADMIN_USERNAME || 'admin', passwordHash],
    )
  }

  await getPool().query(
    `INSERT INTO settings (key, value)
     VALUES ('leaders', $1::jsonb)
     ON CONFLICT (key) DO NOTHING`,
    [
      JSON.stringify([
        { title: 'មេកុដិ', name: 'អ្នកដឹកនាំកុដិ' },
        { title: 'អនុកុដិ', name: 'អ្នកជួយដឹកនាំកុដិ' },
      ]),
    ],
  )

  const { ensureDefaultSettings } = await import('./settings')
  await ensureDefaultSettings()
}
