import { Pool } from 'pg'

export const pool = new Pool({
	connectionString: process.env.DATABASE_URL,
})

export async function query<T = any>(text: string, params?: unknown[]) {
	const res = await pool.query(text, params)
	return res.rows as T[]
}
