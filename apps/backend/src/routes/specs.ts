import { Router } from 'express'
import { query, pool } from '../db'
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

export const router = Router()

// ---------------------------------------------------------------------
// POST /projects/:id/steps/:step/generate
// Gọi AI để (re)generate gợi ý cho 1 bước, dựa trên prompt tự do của user.
// Đây KHÔNG ghi version mới ngay — chỉ trả preview để user xác nhận.
// ---------------------------------------------------------------------
router.post('/projects/:id/steps/:step/generate', async (req, res) => {
	const { id: projectId } = req.params
	const step = req.params.step as StepId
	const { instruction } = req.body as { instruction: string }

	const context = await buildContext(projectId, step, instruction ?? '')

	let result
	switch (step) {
		case 'idea_capture':
			result = await runInterpreter(instruction, instruction)
			break
		case 'related_work':
			result = await runRelatedWorkResearcher(context)
			break
		case 'gap':
			result = await runGapProposer(context)
			break
		case 'contribution':
			result = await runContributionProposer(context)
			break
		case 'experiment_design':
			result = await runExperimentDesigner(context)
			break
		case 'feasibility':
			result = await runFeasibilityEstimator(context)
			break
		case 'judge_resolution':
			result = await runJudgeResolutionProposer(context)
			break
		default:
			return res
				.status(400)
				.json({ error: `Chưa cấu hình agent cho step ${step}` })
	}

	// Ghi log để audit/debug — KHÔNG dùng lại bảng này làm context sau này
	await query(
		`INSERT INTO ai_call_logs
      (project_id, agent_name, step, model, input_context, output, input_tokens, output_tokens, latency_ms)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
		[
			projectId,
			step,
			step,
			result.model,
			JSON.stringify(context),
			JSON.stringify(result.data),
			result.input_tokens,
			result.output_tokens,
			result.latency_ms,
		],
	)

	res.json({
		preview: result.data,
		based_on_version: context.current_version,
	})
})

// ---------------------------------------------------------------------
// POST /projects/:id/steps/:step/confirm
// User xác nhận (hoặc chỉnh sửa tay) preview -> ghi thành spec_version MỚI.
// Đây là điểm mấu chốt: mỗi lần confirm tạo 1 dòng mới trong spec_versions,
// không ghi đè — cho phép "Lịch sử phiên bản" và quay lại bất kỳ lúc nào.
// ---------------------------------------------------------------------
router.post('/projects/:id/steps/:step/confirm', async (req, res) => {
	const { id: projectId } = req.params
	const step = req.params.step as StepId
	const { updatedFields, changeSummary } = req.body as {
		updatedFields: Record<string, unknown>
		changeSummary: string
	}

	const client = await pool.connect()
	try {
		await client.query('BEGIN')

		const { rows: latestRows } = await client.query(
			`SELECT data, version_number FROM spec_versions
       WHERE project_id = $1 ORDER BY version_number DESC LIMIT 1
       FOR UPDATE`,
			[projectId],
		)
		const prev = latestRows[0]
		const prevData = prev?.data ?? {}
		const nextVersion = (prev?.version_number ?? 0) + 1

		const mergedData = { ...prevData, ...updatedFields }

		const { rows: inserted } = await client.query(
			`INSERT INTO spec_versions
        (project_id, version_number, parent_version_id, step, data,
         changed_fields, change_summary, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING id, version_number`,
			[
				projectId,
				nextVersion,
				prev ? null : null, // set parent_version_id = prev.id nếu bạn lưu id ở trên
				step,
				JSON.stringify(mergedData),
				Object.keys(updatedFields),
				changeSummary ?? null,
				'user',
			],
		)

		await client.query(
			`UPDATE projects SET current_step = $1, updated_at = now() WHERE id = $2`,
			[step, projectId],
		)

		await client.query('COMMIT')
		res.json({ version: inserted[0] })
	} catch (err) {
		await client.query('ROLLBACK')
		throw err
	} finally {
		client.release()
	}
})

// ---------------------------------------------------------------------
// GET /projects/:id/versions  — lịch sử phiên bản, cho UI "Lịch sử phiên bản"
// ---------------------------------------------------------------------
router.get('/projects/:id/versions', async (req, res) => {
	const rows = await query(
		`SELECT id, version_number, step, changed_fields, change_summary,
            created_by, created_at
     FROM spec_versions WHERE project_id = $1
     ORDER BY version_number DESC`,
		[req.params.id],
	)
	res.json(rows)
})

// ---------------------------------------------------------------------
// POST /projects/:id/versions/:versionNumber/rollback
// "Quay lại bước trước" — chỉ đơn giản đọc lại version cũ, KHÔNG gọi AI.
// ---------------------------------------------------------------------
router.post(
	'/projects/:id/versions/:versionNumber/rollback',
	async (req, res) => {
		const { id: projectId, versionNumber } = req.params
		const [old] = await query<{ data: unknown; step: string }>(
			`SELECT data, step FROM spec_versions WHERE project_id=$1 AND version_number=$2`,
			[projectId, versionNumber],
		)
		if (!old)
			return res.status(404).json({ error: 'Version không tồn tại' })

		await query(
			`UPDATE projects SET current_step=$1, updated_at=now() WHERE id=$2`,
			[old.step, projectId],
		)

		res.json({ restored_step: old.step, data: old.data })
	},
)

// ---------------------------------------------------------------------
// POST /projects/:id/judge  — chạy 5 Judge độc lập trên version mới nhất
// ---------------------------------------------------------------------
router.post('/projects/:id/judge', async (req, res) => {
	const { id: projectId } = req.params
	const [latest] = await query<{ id: string; data: unknown }>(
		`SELECT id, data FROM spec_versions WHERE project_id=$1
     ORDER BY version_number DESC LIMIT 1`,
		[projectId],
	)
	if (!latest) return res.status(400).json({ error: 'Chưa có spec để judge' })

	const judgeResults = await runAllJudges(latest.data)

	for (const { judge_name, result } of judgeResults) {
		const d = result.data as any
		await query(
			`INSERT INTO judge_reviews
        (spec_version_id, judge_name, issue, reasoning, severity, suggestion, raw_output)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
			[
				latest.id,
				judge_name,
				d.issue,
				d.reasoning,
				d.severity,
				d.suggestion,
				JSON.stringify(d),
			],
		)
	}

	res.json({ spec_version_id: latest.id, reviews: judgeResults })
})
