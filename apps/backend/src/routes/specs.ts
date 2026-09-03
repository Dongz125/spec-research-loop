import { Router } from 'express'
import { and, desc, eq, inArray } from 'drizzle-orm'
import { db } from '../db/db'
import {
	aiCallLogs,
	judgeReviews,
	projects,
	relatedWorkEntries,
	sources,
	specVersions,
} from '../db/schema'
import { buildContext } from '../ai/contextBuilder'
import { runInterpreter } from '../ai/agents/interpreter'
import { runRelatedWorkResearcher } from '../ai/agents/relatedWorkResearcher'
import { runGapProposer } from '../ai/agents/gapProposer'
import { runAllJudges } from '../ai/agents/judges'
import { runContributionProposer } from '../ai/agents/contributionProposer'
import { runExperimentDesigner } from '../ai/agents/experimentDesigner'
import { runFeasibilityEstimator } from '../ai/agents/feasibilityEstimator'
import { runJudgeResolutionProposer } from '../ai/agents/judgeResolutionProposer'
import { StepId } from '../types'
import { requireAuth } from '../auth'
import { formatCitation, searchOpenAlex } from '../sources/openAlex'

export const router = Router({mergeParams: true})
const asyncHandler = (handler: (...args: any[]) => Promise<unknown>) =>
	(req: any, res: any, next: any) => Promise.resolve(handler(req, res, next)).catch(next)

const DOWNSTREAM_FIELDS: Partial<Record<StepId, string[]>> = {
	idea_capture: [
		'research_questions',
		'related_work_matrix',
		'gap_candidates',
		'selected_gap_direction',
		'contributions',
		'claim_evidence_matrix',
		'experimental_protocol',
		'compute_budget',
		'risks_and_limitations',
		'open_issues',
	],
	related_work: [
		'gap_candidates',
		'selected_gap_direction',
		'contributions',
		'claim_evidence_matrix',
		'experimental_protocol',
		'compute_budget',
		'risks_and_limitations',
		'open_issues',
	],
	gap: [
		'contributions',
		'claim_evidence_matrix',
		'experimental_protocol',
		'compute_budget',
		'risks_and_limitations',
		'open_issues',
	],
	contribution: [
		'experimental_protocol',
		'compute_budget',
		'risks_and_limitations',
		'open_issues',
	],
	experiment_design: [
		'compute_budget',
		'risks_and_limitations',
		'open_issues',
	],
	feasibility: ['risks_and_limitations', 'open_issues'],
}

router.use(requireAuth)
router.use(async (req: any, res, next) => {
	try {
		const [project] = await db
			.select({ id: projects.id })
			.from(projects)
			.where(
				and(
					eq(projects.id, req.params.id),
					eq(projects.userId, req.userId),
				),
			)
			.limit(1)
		if (!project) return res.status(404).json({ error: 'Không tìm thấy project' })
		next()
	} catch (error) {
		next(error)
	}
})

// ---------------------------------------------------------------------
// POST /sources/search — tìm metadata paper thật từ OpenAlex và lưu vào project.
// AI chỉ được phân tích các nguồn đã đi qua endpoint này.
// ---------------------------------------------------------------------
router.post('/sources/search', asyncHandler(async (req: any, res) => {
	const { id: projectId } = req.params
	const keywords = Array.isArray(req.body?.keywords)
		? req.body.keywords.map(String).map((item: string) => item.trim()).filter(Boolean)
		: []
	const sourceTypes = Array.isArray(req.body?.sourceTypes)
		? req.body.sourceTypes.map(String).filter((type: string) =>
				['article', 'preprint', 'review'].includes(type),
			)
		: []
	if (keywords.length === 0) {
		return res.status(400).json({ error: 'Cần ít nhất một từ khóa để tìm nguồn.' })
	}

	const openAlexQuery = keywords
		.slice(0, 6)
		.map((item: string) => {
			const escaped = item.replace(/"/g, '').trim()
			return escaped.includes(' ') ? `"${escaped}"` : escaped
		})
		.join(' OR ')
	const openAlexResults = await searchOpenAlex(openAlexQuery, 20)
	const found = openAlexResults
		.filter((source) => sourceTypes.length === 0 || sourceTypes.includes(source.workType))
		.slice(0, 10)
	const stored = []
	for (const source of found) {
		const [existing] = await db
			.select({ id: sources.id })
			.from(sources)
			.where(
				and(eq(sources.projectId, projectId), eq(sources.url, source.url)),
			)
			.limit(1)
		// OpenAlex xác minh metadata, không chấm độ đúng/sai của kết luận paper.
		const reliability = null
		if (existing) {
			const [updated] = await db
				.update(sources)
				.set({
					title: source.title,
					authors: source.authors,
					year: source.year,
					venue: source.venue,
					summary: source.summary,
					reliabilityScore: reliability,
					createdAt: new Date(),
				})
				.where(
					and(eq(sources.id, existing.id), eq(sources.projectId, projectId)),
				)
				.returning({
					id: sources.id,
					title: sources.title,
					authors: sources.authors,
					year: sources.year,
					venue: sources.venue,
					url: sources.url,
					summary: sources.summary,
				})
			stored.push({ ...source, ...updated, metadata_verified: true })
		} else {
			const [inserted] = await db
				.insert(sources)
				.values({
					projectId,
					title: source.title,
					authors: source.authors,
					year: source.year,
					venue: source.venue,
					url: source.url,
					summary: source.summary,
					reliabilityScore: reliability,
				})
				.returning({
					id: sources.id,
					title: sources.title,
					authors: sources.authors,
					year: sources.year,
					venue: sources.venue,
					url: sources.url,
					summary: sources.summary,
				})
			stored.push({ ...source, ...inserted, metadata_verified: true })
		}
	}

	res.json({ sources: stored })
}))

// ---------------------------------------------------------------------
// POST /steps/:step/generate
// Gọi AI để (re)generate gợi ý cho 1 bước, dựa trên prompt tự do của user.
// Đây KHÔNG ghi version mới ngay — chỉ trả preview để user xác nhận.
// ---------------------------------------------------------------------
router.post('/steps/:step/generate', asyncHandler(async (req: any, res) => {
	const { id: projectId } = req.params
	const step = req.params.step as StepId
	const { instruction } = req.body as { instruction: string }

	const context = await buildContext(projectId, step, instruction ?? '')

	let result
	switch (step) {
		case 'idea_capture':
			{
				const generated = await runInterpreter(instruction, instruction)
				const data = generated.data as { research_questions?: unknown }
				if (
					!Array.isArray(data.research_questions) ||
					data.research_questions.length === 0
				) {
					throw new Error(
						'AI chưa tạo được Research Questions. Hãy phân tích lại ý tưởng.',
					)
				}
				result = generated
			}
			break
		case 'related_work':
			{
				if (!Array.isArray(context.sources) || context.sources.length < 5) {
					throw new Error(
						`OpenAlex mới cung cấp ${Array.isArray(context.sources) ? context.sources.length : 0} nguồn phù hợp. Cần ít nhất 5 nguồn; hãy thêm hoặc đổi từ khóa rồi tìm lại.`,
					)
				}
				const generated = await runRelatedWorkResearcher(context)
				const data = generated.data as {
					related_work_matrix?: Array<{
						source_id?: string
						did_what?: string
						feedback_used?: string
						gap_note?: string
					}>
					search_keywords_used?: string[]
				}
				const sourceMap = new Map(
					(context.sources as any[]).map(
						(source): [string, any] => [source.id, source],
					),
				)
				const seenSourceIds = new Set<string>()
				const groundedRows = (data.related_work_matrix ?? []).flatMap((row) => {
					const source = row.source_id ? sourceMap.get(row.source_id) : null
					if (!source || seenSourceIds.has(source.id)) return []
					seenSourceIds.add(source.id)
					const doi =
						typeof source.url === 'string' && source.url.includes('doi.org/')
							? source.url
							: null
					return [
						{
							id: source.id,
							source_id: source.id,
							title: source.title,
							authors: source.authors || '',
							year: source.year,
							venue: source.venue || '',
							url: source.url,
							doi,
							abstract: source.summary || '',
							citation: formatCitation({ ...source, doi }),
							did_what: row.did_what || 'Chưa có phân tích',
							feedback_used: row.feedback_used || 'Không nêu rõ',
							gap_note: row.gap_note || 'Chưa xác định',
							verified: true,
						},
					]
				})
				if (groundedRows.length < 5) {
					throw new Error(
						`AI chỉ phân tích hợp lệ được ${groundedRows.length}/5 nguồn OpenAlex tối thiểu. Nguồn đã tìm vẫn được giữ; hãy chạy lại bước phân tích related-work.`,
					)
				}
				result = {
					...generated,
					data: { ...data, related_work_matrix: groundedRows },
				}
			}
			break
		case 'gap':
			{
				const relatedRows = (context.spec_slice as any).related_work_matrix?.value
				const verifiedSourceCount = new Set(
					(Array.isArray(relatedRows) ? relatedRows : [])
						.filter((row: any) => row?.verified && row?.source_id && row?.url)
						.map((row: any) => row.source_id),
				).size
				if (verifiedSourceCount < 5) {
					throw new Error(
						`Cần ít nhất 5 nguồn related-work đã xác minh trước khi đề xuất research gap. Hiện có ${verifiedSourceCount} nguồn.`,
					)
				}
				const generated = await runGapProposer(context)
				const data = generated.data as {
					gap_candidates?: Array<Record<string, any>>
					options_for_user?: unknown[]
					insufficient_evidence?: boolean
				}
				const allowedIds = new Set(
					(Array.isArray(relatedRows) ? relatedRows : [])
						.map((row: any) => row.source_id)
						.filter(Boolean),
				)
				const groundedGaps = (data.gap_candidates ?? []).map((gap) => ({
					...gap,
					evidence_source_ids: Array.from(
						new Set(
							(Array.isArray(gap.evidence_source_ids)
								? gap.evidence_source_ids
								: []
							).filter((id: unknown): id is string =>
								typeof id === 'string' && allowedIds.has(id),
							),
						),
					),
				}))
				if (
					!data.insufficient_evidence &&
					(groundedGaps.length === 0 ||
						groundedGaps.some((gap) => gap.evidence_source_ids.length === 0))
				) {
					throw new Error(
						'AI chưa liên kết research gap với nguồn OpenAlex hợp lệ. Hãy tạo lại gap.',
					)
				}
				result = {
					...generated,
					data: { ...data, gap_candidates: groundedGaps },
				}
			}
			break
		case 'contribution':
			{
				const generated = await runContributionProposer(context)
				const data = generated.data as {
					contributions?: string[]
					claim_evidence_matrix?: Array<Record<string, any>>
				}
				const relatedRows = (context.spec_slice as any).related_work_matrix?.value
				const allowedIds = new Set(
					(Array.isArray(relatedRows) ? relatedRows : [])
						.map((row: any) => row.source_id)
						.filter(Boolean),
				)
				const groundedClaims = (data.claim_evidence_matrix ?? []).map((claim) => ({
					...claim,
					evidence_source_ids: Array.from(
						new Set(
							(Array.isArray(claim.evidence_source_ids)
								? claim.evidence_source_ids
								: []
							).filter((id: unknown): id is string =>
								typeof id === 'string' && allowedIds.has(id),
							),
						),
					),
				}))
				if (
					groundedClaims.length === 0 ||
					groundedClaims.some((claim) => claim.evidence_source_ids.length === 0)
				) {
					throw new Error(
						'AI chưa liên kết đầy đủ claim với các citation đã xác minh. Hãy tạo lại contribution.',
					)
				}
				result = {
					...generated,
					data: { ...data, claim_evidence_matrix: groundedClaims },
				}
			}
			break
		case 'experiment_design':
			result = await runExperimentDesigner(context)
			break
		case 'feasibility':
			{
				const generated = await runFeasibilityEstimator(context)
				const data = generated.data as {
					compute_budget?: unknown
					risks_and_limitations?: unknown
					open_issues?: unknown
				}
				if (
					!data.compute_budget ||
					!Array.isArray(data.risks_and_limitations) ||
					data.risks_and_limitations.length === 0 ||
					!Array.isArray(data.open_issues) ||
					data.open_issues.length === 0
				) {
					throw new Error(
						'AI chưa tạo đủ Compute Budget, Risks & Limitations và Open Issues. Hãy tạo lại kiểm tra tính khả thi.',
					)
				}
				result = generated
			}
			break
		case 'judge_resolution':
			{
				const generated = await runJudgeResolutionProposer(context)
				const data = generated.data as {
					change_summary?: string
					updated_fields?: Record<string, unknown>
				}
				const allowedFields = new Set([
					'gap_candidates',
					'selected_gap_direction',
					'contributions',
					'claim_evidence_matrix',
					'experimental_protocol',
					'compute_budget',
					'risks_and_limitations',
					'open_issues',
				])
				const updatedFields = Object.fromEntries(
					Object.entries(data.updated_fields ?? {}).filter(
						([field, value]) => allowedFields.has(field) && value !== undefined,
					),
				)
				const changedFieldNames = Object.keys(updatedFields)
				if (changedFieldNames.length === 0 || changedFieldNames.length > 3) {
					throw new Error(
						'AI phải đề xuất thay đổi từ 1 đến 3 field hợp lệ trong spec.',
					)
				}
				for (const [field, value] of Object.entries(updatedFields)) {
					const currentValue = (context.spec_slice as any)[field]?.value
					const hasNestedSpecWrapper =
						value !== null &&
						typeof value === 'object' &&
						'value' in value &&
						'status' in value
					const sameShape = Array.isArray(currentValue)
						? Array.isArray(value)
						: currentValue !== null && typeof currentValue === 'object'
							? value !== null && typeof value === 'object' && !Array.isArray(value)
							: typeof value === typeof currentValue
					if (hasNestedSpecWrapper || !sameShape) {
						throw new Error(`AI trả về sai cấu trúc cho field ${field}.`)
					}
				}

				const relatedRows = (context.spec_slice as any).related_work_matrix?.value
				const allowedSourceIds = new Set(
					(Array.isArray(relatedRows) ? relatedRows : [])
						.map((row: any) => row.source_id)
						.filter(Boolean),
				)
				for (const field of ['gap_candidates', 'claim_evidence_matrix']) {
					if (!(field in updatedFields)) continue
					const rows = updatedFields[field]
					if (
						!Array.isArray(rows) ||
						rows.length === 0 ||
						rows.some(
							(row: any) =>
								!Array.isArray(row?.evidence_source_ids) ||
								row.evidence_source_ids.length === 0 ||
								row.evidence_source_ids.some(
									(id: unknown) =>
										typeof id !== 'string' || !allowedSourceIds.has(id),
								),
						)
					) {
						throw new Error(
							`AI sửa ${field} nhưng không giữ liên kết citation hợp lệ.`,
						)
					}
				}

				result = {
					...generated,
					data: {
						change_summary: data.change_summary || 'Áp dụng đề xuất của Judge',
						updated_fields: updatedFields,
					},
				}
			}
			break
		default:
			return res
				.status(400)
				.json({ error: `Chưa cấu hình agent cho step ${step}` })
	}

	// Ghi log để audit/debug — KHÔNG dùng lại bảng này làm context sau này
	await db.insert(aiCallLogs).values({
		projectId,
		agentName: step,
		step,
		model: result.model,
		inputContext: context,
		output: result.data,
		inputTokens: result.input_tokens,
		outputTokens: result.output_tokens,
		latencyMs: result.latency_ms,
	})

	res.json({
		preview: result.data,
		based_on_version: context.current_version,
	})
}))

// ---------------------------------------------------------------------
// POST /steps/:step/confirm
// User xác nhận (hoặc chỉnh sửa tay) preview -> ghi thành spec_version MỚI.
// Đây là điểm mấu chốt: mỗi lần confirm tạo 1 dòng mới trong spec_versions,
// không ghi đè — cho phép "Lịch sử phiên bản" và quay lại bất kỳ lúc nào.
// ---------------------------------------------------------------------
router.post('/steps/:step/confirm', asyncHandler(async (req: any, res) => {
	const { id: projectId } = req.params
	const step = req.params.step as StepId
	const { updatedFields, changeSummary } = req.body as {
		updatedFields: Record<string, unknown>
		changeSummary: string
	}

	const version = await db.transaction(async (tx) => {
		const [prev] = await tx
			.select({
				id: specVersions.id,
				data: specVersions.data,
				versionNumber: specVersions.versionNumber,
			})
			.from(specVersions)
			.where(eq(specVersions.projectId, projectId))
			.orderBy(desc(specVersions.versionNumber))
			.limit(1)
			.for('update')
		const prevData = (prev?.data ?? {}) as Record<string, any>
		const nextVersion = (prev?.versionNumber ?? 0) + 1

		const invalidatedFields = DOWNSTREAM_FIELDS[step] ?? []
		const mergedData = { ...prevData }
		const removedFields = invalidatedFields.filter(
			(field) => field in mergedData,
		)
		for (const field of invalidatedFields) delete mergedData[field]
		Object.assign(mergedData, updatedFields)

		if (step === 'judge') {
			const relatedRows = Array.isArray(prevData.related_work_matrix?.value)
				? prevData.related_work_matrix.value
				: []
			const allowedSourceIds = new Set(
				relatedRows.map((row: any) => row.source_id).filter(Boolean),
			)
			const citationRows = ['gap_candidates', 'claim_evidence_matrix'].flatMap(
				(field) => {
					const value = (updatedFields as any)[field]?.value
					return value === undefined ? [] : [{ field, value }]
				},
			)
			const citedIds = new Set<string>()
			for (const { field, value } of citationRows) {
				if (
					!Array.isArray(value) ||
					value.length === 0 ||
					value.some(
						(row: any) =>
							!Array.isArray(row?.evidence_source_ids) ||
							row.evidence_source_ids.length === 0 ||
							row.evidence_source_ids.some((id: unknown) => {
								if (typeof id !== 'string' || !allowedSourceIds.has(id)) {
									return true
								}
								citedIds.add(id)
								return false
							}),
					)
				) {
					throw new Error(
						`Không thể áp dụng bản sửa vì ${field} có citation không hợp lệ.`,
					)
				}
			}
			if (citedIds.size > 0) {
				const existingCitations = await tx
					.select({ id: sources.id })
					.from(sources)
					.where(
						and(
							eq(sources.projectId, projectId),
							inArray(sources.id, Array.from(citedIds)),
						),
					)
				if (existingCitations.length !== citedIds.size) {
					throw new Error('Một hoặc nhiều citation trong bản sửa không còn tồn tại.')
				}
			}
		}

		if (step === 'gap' || step === 'contribution') {
			const confirmedSources = Array.isArray(prevData.related_work_matrix?.value)
				? prevData.related_work_matrix.value
				: []
			const allowedSourceIds = new Set(
				confirmedSources.map((row: any) => row.source_id).filter(Boolean),
			)
			const citationRows =
				step === 'gap'
					? ((updatedFields as any).gap_candidates?.value ?? [])
					: ((updatedFields as any).claim_evidence_matrix?.value ?? [])
			if (
				!Array.isArray(citationRows) ||
				citationRows.length === 0 ||
				citationRows.some(
					(row: any) =>
						!Array.isArray(row.evidence_source_ids) ||
						row.evidence_source_ids.length === 0 ||
						row.evidence_source_ids.some(
							(id: unknown) =>
								typeof id !== 'string' || !allowedSourceIds.has(id),
						),
				)
			) {
				throw new Error(
					'Không thể xác nhận vì có nội dung chưa liên kết citation hợp lệ.',
				)
			}
			const citedIds = Array.from(
				new Set(citationRows.flatMap((row: any) => row.evidence_source_ids)),
			)
			const existingCitations = await tx
				.select({ id: sources.id })
				.from(sources)
				.where(
					and(
						eq(sources.projectId, projectId),
						inArray(sources.id, citedIds as string[]),
					),
				)
			if (existingCitations.length !== citedIds.length) {
				throw new Error('Một hoặc nhiều citation đã bị xóa khỏi project.')
			}
		}

		const relatedWorkRows =
			step === 'related_work' &&
			Array.isArray((updatedFields as any).related_work_matrix?.value)
				? ((updatedFields as any).related_work_matrix.value as any[])
				: null
		if (relatedWorkRows) {
			if (relatedWorkRows.length === 0) {
				throw new Error('Bảng related-work phải có ít nhất một nguồn.')
			}
			const sourceIds = Array.from(
				new Set(
					relatedWorkRows
						.map((row) => row.source_id)
						.filter((id): id is string => typeof id === 'string' && id.length > 0),
				),
			)
			if (sourceIds.length !== relatedWorkRows.length) {
				throw new Error('Bảng related-work có nguồn không hợp lệ hoặc bị trùng.')
			}
			const ownedSources = await tx
				.select({ id: sources.id })
				.from(sources)
				.where(
					and(
						eq(sources.projectId, projectId),
						inArray(sources.id, sourceIds),
					),
				)
			if (ownedSources.length !== sourceIds.length) {
				throw new Error('Có citation không thuộc project hoặc chưa được xác minh.')
			}
			await tx
				.delete(relatedWorkEntries)
				.where(eq(relatedWorkEntries.projectId, projectId))
			await tx.insert(relatedWorkEntries).values(
				relatedWorkRows.map((row) => ({
					projectId,
					sourceId: row.source_id,
					didWhat: row.did_what || null,
					feedbackUsed: row.feedback_used || null,
					gapNote: row.gap_note || null,
				})),
			)
		}
		const changedFields = Array.from(
			new Set([...Object.keys(updatedFields), ...removedFields]),
		)

		const [inserted] = await tx
			.insert(specVersions)
			.values({
				projectId,
				versionNumber: nextVersion,
				parentVersionId: prev?.id ?? null,
				step,
				data: mergedData,
				changedFields,
				changeSummary: changeSummary ?? null,
				createdBy: 'user',
			})
			.returning({
				id: specVersions.id,
				version_number: specVersions.versionNumber,
			})

		await tx
			.update(projects)
			.set({ currentStep: step, updatedAt: new Date() })
			.where(eq(projects.id, projectId))

		return inserted
	})

	res.json({ version })
}))

// ---------------------------------------------------------------------
// GET /versions  — lịch sử phiên bản, cho UI "Lịch sử phiên bản"
// ---------------------------------------------------------------------
router.get('/versions', asyncHandler(async (req: any, res) => {
	const rows = await db
		.select({
			id: specVersions.id,
			version_number: specVersions.versionNumber,
			step: specVersions.step,
			changed_fields: specVersions.changedFields,
			change_summary: specVersions.changeSummary,
			created_by: specVersions.createdBy,
			created_at: specVersions.createdAt,
		})
		.from(specVersions)
		.where(eq(specVersions.projectId, req.params.id))
		.orderBy(desc(specVersions.versionNumber))
	res.json(rows)
}))

// ---------------------------------------------------------------------
// POST /versions/:versionNumber/rollback
// "Quay lại bước trước" — chỉ đơn giản đọc lại version cũ, KHÔNG gọi AI.
// ---------------------------------------------------------------------
router.post(
	'/versions/:versionNumber/rollback',
	asyncHandler(async (req: any, res) => {
		const { id: projectId, versionNumber } = req.params
		const parsedVersionNumber = Number(versionNumber)
		if (!Number.isInteger(parsedVersionNumber) || parsedVersionNumber < 1) {
			return res.status(400).json({ error: 'Version không hợp lệ' })
		}
		const [old] = await db
			.select({ data: specVersions.data, step: specVersions.step })
			.from(specVersions)
			.where(
				and(
					eq(specVersions.projectId, projectId),
					eq(specVersions.versionNumber, parsedVersionNumber),
				),
			)
			.limit(1)
		if (!old)
			return res.status(404).json({ error: 'Version không tồn tại' })

		await db
			.update(projects)
			.set({ currentStep: old.step, updatedAt: new Date() })
			.where(eq(projects.id, projectId))

		res.json({ restored_step: old.step, data: old.data })
	}),
)

// ---------------------------------------------------------------------
// POST /judge  — chạy 5 Judge độc lập trên version mới nhất
// ---------------------------------------------------------------------
router.post('/judge', asyncHandler(async (req: any, res) => {
	const { id: projectId } = req.params
	const [latest] = await db
		.select({ id: specVersions.id, data: specVersions.data })
		.from(specVersions)
		.where(eq(specVersions.projectId, projectId))
		.orderBy(desc(specVersions.versionNumber))
		.limit(1)
	if (!latest) return res.status(400).json({ error: 'Chưa có spec để judge' })

	const judgeResults = await runAllJudges(latest.data)

	const completedReviewRows = judgeResults.flatMap((review) => {
		if (review.status !== 'completed') return []
		const data = review.result.data
		return [
			{
				specVersionId: latest.id,
				judgeName: review.judge_name,
				issue: data.issue,
				reasoning: data.reasoning,
				severity: data.severity,
				suggestion: data.suggestion,
				rawOutput: data,
			},
		]
	})
	if (completedReviewRows.length > 0) {
		await db.insert(judgeReviews).values(completedReviewRows)
	}

	res.json({ spec_version_id: latest.id, reviews: judgeResults })
}))
