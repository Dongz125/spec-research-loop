import { Router } from 'express'
import { and, desc, eq } from 'drizzle-orm'
import { requireAuth } from '../auth'
import { db } from '../db/db'
import { projects, specVersions } from '../db/schema'

export const router = Router()
const asyncHandler = (handler: (...args: any[]) => Promise<unknown>) =>
	(req: any, res: any, next: any) => Promise.resolve(handler(req, res, next)).catch(next)

router.use(requireAuth)

router.post('/', asyncHandler(async (req: any, res) => {
	const { title } = req.body
	const [project] = await db
		.insert(projects)
		.values({
			userId: req.userId,
			title: title || 'Ý tưởng nghiên cứu chưa đặt tên',
		})
		.returning()
	res.status(201).json(project)
}))

router.get('/', asyncHandler(async (req: any, res) => {
	const rows = await db.query.projects.findMany({
		where: eq(projects.userId, req.userId),
		orderBy: [desc(projects.updatedAt)],
	})
	res.json(rows)
}))

router.get('/:id', asyncHandler(async (req: any, res) => {
	const [project] = await db
		.select()
		.from(projects)
		.where(and(eq(projects.id, req.params.id), eq(projects.userId, req.userId)))
	if (!project) return res.status(404).json({ error: 'Không tìm thấy project' })

	const [latestSpec] = await db
		.select()
		.from(specVersions)
		.where(eq(specVersions.projectId, req.params.id))
		.orderBy(desc(specVersions.versionNumber))
		.limit(1)

	res.json({ project, latest_spec: latestSpec ?? null })
}))

router.delete('/:id', asyncHandler(async (req: any, res) => {
	const [deleted] = await db
		.delete(projects)
		.where(and(eq(projects.id, req.params.id), eq(projects.userId, req.userId)))
		.returning({ id: projects.id })

	if (!deleted) return res.status(404).json({ error: 'Không tìm thấy project' })
	res.json({ id: deleted.id })
}))
