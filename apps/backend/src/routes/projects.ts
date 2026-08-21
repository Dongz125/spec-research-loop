import { Router } from 'express'
import { db } from '../db/db'
import { projects, specVersions } from '../db/schema'
import { eq, desc } from 'drizzle-orm'

export const router = Router()

// Middleware lấy userId từ header (frontend sẽ gửi lên)
function getUserId(req: any, res: any, next: any) {
	const userId = req.headers['x-user-id']
	if (!userId) return res.status(401).json({ error: 'Chưa đăng nhập' })
	req.userId = userId
	next()
}

router.post('/', getUserId, async (req: any, res) => {
	const { title } = req.body
	const [project] = await db
		.insert(projects)
		.values({
			userId: req.userId,
			title: title || 'Ý tưởng nghiên cứu chưa đặt tên',
		})
		.returning()
	res.json(project)
})

router.get('/', getUserId, async (req: any, res) => {
	const rows = await db.query.projects.findMany({
		where: eq(projects.userId, req.userId),
		orderBy: [desc(projects.updatedAt)],
	})
	res.json(rows)
})

router.get('/:id', async (req, res) => {
	const [project] = await db
		.select()
		.from(projects)
		.where(eq(projects.id, req.params.id))
	if (!project)
		return res.status(404).json({ error: 'Không tìm thấy project' })

	const [latestSpec] = await db
		.select()
		.from(specVersions)
		.where(eq(specVersions.projectId, req.params.id))
		.orderBy(desc(specVersions.versionNumber))
		.limit(1)

	res.json({ project, latest_spec: latestSpec ?? null })
})
