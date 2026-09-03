import { Pool } from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import * as schema from './schema'

if (!process.env.DATABASE_URL) {
	throw new Error('Thiếu biến môi trường DATABASE_URL')
}

const pool = new Pool({
	connectionString: process.env.DATABASE_URL,
	max: 5,
	idleTimeoutMillis: 30_000,
	connectionTimeoutMillis: 15_000,
	keepAlive: true,
})
pool.on('error', (error: Error & { code?: string }) => {
	console.error('PostgreSQL idle connection error:', {
		message: error.message,
		code: error.code,
	})
})

// Backend Express cần interactive transaction khi ghi một spec version.
// node-postgres dùng TCP pool ổn định cho tiến trình Node chạy lâu dài;
// mọi truy vấn runtime vẫn đi qua Drizzle.
export const db = drizzle({ client: pool, schema })
