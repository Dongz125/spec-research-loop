import { Pool } from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import * as schema from './schema'

if (!process.env.DATABASE_URL) {
	throw new Error('Thiếu biến môi trường DATABASE_URL')
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

// Backend Express cần interactive transaction khi ghi một spec version.
// Dùng node-postgres qua Drizzle để toàn bộ truy vấn runtime đi qua ORM.
export const db = drizzle({ client: pool, schema })
