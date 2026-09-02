import { Router } from 'express'
import { eq } from 'drizzle-orm'
import {
	createAccessToken,
	hashPassword,
	requireAuth,
	verifyPassword,
} from '../auth'
import { db } from '../db/db'
import { users } from '../db/schema'

export const router = Router()
const asyncHandler = (handler: (...args: any[]) => Promise<unknown>) =>
	(req: any, res: any, next: any) => Promise.resolve(handler(req, res, next)).catch(next)

function normalizeEmail(value: unknown) {
	return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

function passwordError(password: unknown) {
	if (typeof password !== 'string' || password.length < 8) {
		return 'Mật khẩu phải có ít nhất 8 ký tự'
	}
	if (password.length > 128) return 'Mật khẩu không được vượt quá 128 ký tự'
	return null
}

function authResponse(user: { id: string; email: string; name: string | null }) {
	return {
		token: createAccessToken(user.id),
		user: { id: user.id, email: user.email, name: user.name },
	}
}

router.post('/login', asyncHandler(async (req, res) => {
	const email = normalizeEmail(req.body.email)
	const { password } = req.body
	if (!email) return res.status(400).json({ error: 'Vui lòng nhập email' })
	const invalidPassword = passwordError(password)
	if (invalidPassword) return res.status(400).json({ error: invalidPassword })

	const [user] = await db.select().from(users).where(eq(users.email, email))
	if (!user) return res.status(401).json({ error: 'Email hoặc mật khẩu không đúng' })

	// Tài khoản từ phiên bản cũ đặt mật khẩu ở lần đăng nhập đầu tiên.
	if (!user.passwordHash) {
		const passwordHash = await hashPassword(password)
		await db.update(users).set({ passwordHash }).where(eq(users.id, user.id))
		return res.json(authResponse(user))
	}

	if (!(await verifyPassword(password, user.passwordHash))) {
		return res.status(401).json({ error: 'Email hoặc mật khẩu không đúng' })
	}

	res.json(authResponse(user))
}))

router.post('/register', asyncHandler(async (req, res) => {
	const email = normalizeEmail(req.body.email)
	const name = typeof req.body.name === 'string' ? req.body.name.trim() : ''
	const { password } = req.body
	if (!email) return res.status(400).json({ error: 'Vui lòng nhập email' })
	const invalidPassword = passwordError(password)
	if (invalidPassword) return res.status(400).json({ error: invalidPassword })

	const existing = await db.select().from(users).where(eq(users.email, email))
	if (existing.length > 0) {
		return res.status(409).json({ error: 'Email này đã được sử dụng' })
	}

	const [newUser] = await db
		.insert(users)
		.values({
			email,
			name: name || email.split('@')[0],
			passwordHash: await hashPassword(password),
		})
		.returning()

	res.status(201).json(authResponse(newUser))
}))

router.get('/me', requireAuth, asyncHandler(async (req: any, res) => {
	const [user] = await db.select().from(users).where(eq(users.id, req.userId))
	if (!user) return res.status(404).json({ error: 'Không tìm thấy tài khoản' })
	res.json({ id: user.id, email: user.email, name: user.name })
}))

router.patch('/me', requireAuth, asyncHandler(async (req: any, res) => {
	const [user] = await db.select().from(users).where(eq(users.id, req.userId))
	if (!user) return res.status(404).json({ error: 'Không tìm thấy tài khoản' })

	const updates: { name?: string; passwordHash?: string } = {}
	if (req.body.name !== undefined) {
		const name = typeof req.body.name === 'string' ? req.body.name.trim() : ''
		if (!name) return res.status(400).json({ error: 'Tên người dùng không được để trống' })
		if (name.length > 100) {
			return res.status(400).json({ error: 'Tên người dùng không được vượt quá 100 ký tự' })
		}
		updates.name = name
	}

	if (req.body.newPassword) {
		const invalidPassword = passwordError(req.body.newPassword)
		if (invalidPassword) return res.status(400).json({ error: invalidPassword })
		if (
			!user.passwordHash ||
			typeof req.body.currentPassword !== 'string' ||
			!(await verifyPassword(req.body.currentPassword, user.passwordHash))
		) {
			return res.status(400).json({ error: 'Mật khẩu hiện tại không đúng' })
		}
		updates.passwordHash = await hashPassword(req.body.newPassword)
	}

	if (Object.keys(updates).length === 0) {
		return res.status(400).json({ error: 'Không có thông tin cần cập nhật' })
	}

	const [updated] = await db
		.update(users)
		.set(updates)
		.where(eq(users.id, req.userId))
		.returning()
	res.json({ id: updated.id, email: updated.email, name: updated.name })
}))
