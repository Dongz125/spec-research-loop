import { Router } from 'express'
import { db } from '../db/db'
import { users } from '../db/schema'
import { eq } from 'drizzle-orm'

export const router = Router()

// Đăng nhập
router.post('/login', async (req, res) => {
	const { email } = req.body
	if (!email) return res.status(400).json({ error: 'Vui lòng nhập email' })

	const userRows = await db.select().from(users).where(eq(users.email, email))

	if (userRows.length === 0) {
		return res
			.status(404)
			.json({ error: 'Không tìm thấy tài khoản. Vui lòng đăng ký.' })
	}

	res.json(userRows[0])
})

// Đăng ký mới
router.post('/register', async (req, res) => {
	const { email, name } = req.body
	if (!email) return res.status(400).json({ error: 'Vui lòng nhập email' })

	const existing = await db.select().from(users).where(eq(users.email, email))
	if (existing.length > 0) {
		return res.status(400).json({ error: 'Email này đã được sử dụng' })
	}

	const [newUser] = await db
		.insert(users)
		.values({
			email,
			name: name || email.split('@')[0],
		})
		.returning()

	res.json(newUser)
})
