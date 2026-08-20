import { Router } from 'express'
import { query } from '../db'

export const router = Router()

// Demo: dùng 1 user cố định, chưa làm auth thật.
// Khi cần auth, thêm middleware xác thực và lấy userId từ đó.
const DEMO_USER_EMAIL = 'student@example.com'

async function getOrCreateDemoUser() {
	const [existing] = await query<{ id: string }>(
		`SELECT id FROM users WHERE email = $1`,
		[DEMO_USER_EMAIL],
	)
	if (existing) return existing.id
	const [created] = await query<{ id: string }>(
		`INSERT INTO users (email, name) VALUES ($1, $2) RETURNING id`,
		[DEMO_USER_EMAIL, 'Demo Student'],
	)
	return created.id
}

router.post('/projects', async (req, res) => {
	const { title } = req.body as { title: string }
	const userId = await getOrCreateDemoUser()
	const [project] = await query(
		`INSERT INTO projects (user_id, title) VALUES ($1, $2) RETURNING *`,
		[userId, title || 'Ý tưởng nghiên cứu chưa đặt tên'],
	)
	res.json(project)
})

router.get('/projects', async (_req, res) => {
	const userId = await getOrCreateDemoUser()
	const rows = await query(
		`SELECT * FROM projects WHERE user_id = $1 ORDER BY updated_at DESC`,
		[userId],
	)
	res.json(rows)
})

router.get('/projects/:id', async (req, res) => {
	const [project] = await query(`SELECT * FROM projects WHERE id = $1`, [
		req.params.id,
	])
	if (!project)
		return res.status(404).json({ error: 'Không tìm thấy project' })

	const [latestSpec] = await query(
		`SELECT * FROM spec_versions WHERE project_id = $1
     ORDER BY version_number DESC LIMIT 1`,
		[req.params.id],
	)

	res.json({ project, latest_spec: latestSpec ?? null })
})
