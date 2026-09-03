import { callAgent, modelFor } from '../AiClient'

export const JUDGE_NAMES = [
	'gap_judge',
	'contribution_judge',
	'experiment_judge',
	'evidence_judge',
	'conference_readiness_judge',
] as const

export type JudgeName = (typeof JUDGE_NAMES)[number]

const JUDGE_FIELDS: Record<JudgeName, string[]> = {
	gap_judge: [
		'problem_statement',
		'related_work_matrix',
		'gap_candidates',
		'selected_gap_direction',
	],
	contribution_judge: [
		'gap_candidates',
		'selected_gap_direction',
		'contributions',
		'claim_evidence_matrix',
	],
	experiment_judge: [
		'contributions',
		'claim_evidence_matrix',
		'experimental_protocol',
		'compute_budget',
	],
	evidence_judge: [
		'related_work_matrix',
		'contributions',
		'claim_evidence_matrix',
	],
	conference_readiness_judge: [
		'problem_statement',
		'related_work_matrix',
		'gap_candidates',
		'selected_gap_direction',
		'contributions',
		'claim_evidence_matrix',
		'experimental_protocol',
		'compute_budget',
	],
}

const JUDGE_PROMPTS: Record<JudgeName, string> = {
	gap_judge: `Bạn là Research Gap Judge. Kiểm tra research_gap có thực sự
được related_work_matrix hỗ trợ hay không, hay chỉ dựa trên suy đoán chủ quan.`,
	contribution_judge: `Bạn là Contribution Judge. Kiểm tra contribution có
mới, rõ ràng, và có bị phóng đại so với những gì gap/thí nghiệm hỗ trợ không.`,
	experiment_judge: `Bạn là Experiment Judge. Kiểm tra experimental_protocol
có đủ chặt chẽ để chứng minh claim trong claim_evidence_matrix hay không
(baseline, metric, ablation, generalization).`,
	evidence_judge: `Bạn là Evidence Judge. Kiểm tra mỗi claim trong
claim_evidence_matrix có nguồn evidence_source_ids thực sự hỗ trợ nó không,
có bị gán nguồn sai hoặc không liên quan không. Chỉ coi citation là hợp lệ
khi ID tồn tại trong related_work_matrix và nội dung abstract/did_what thực sự
liên quan; DOI có thật không đồng nghĩa paper hỗ trợ claim.`,
	conference_readiness_judge: `Bạn là Conference Readiness Judge. Đánh giá
spec theo 5 tiêu chí: originality, significance, soundness, clarity,
reproducibility. Không phán đoán khả năng được accept, chỉ đánh giá mức
độ sẵn sàng.`,
}

const OUTPUT_SCHEMA_NOTE = `
Trả về JSON theo schema:
{
  "issue": "mô tả vấn đề phát hiện được (nếu có)",
  "reasoning": "lý do, dựa trên dữ liệu được cung cấp — không suy diễn ngoài input",
  "severity": "MINOR" | "MAJOR" | "CRITICAL" | null,
  "suggestion": "đề xuất khắc phục"
}
Nếu không phát hiện vấn đề, trả "issue": null, "severity": null.
Không trả summary, Markdown hoặc bất kỳ key nào ngoài 4 key trên. Mỗi trường phải
ngắn gọn; reasoning tối đa 800 ký tự và suggestion tối đa 500 ký tự.`

interface JudgeData {
	issue: string | null
	reasoning: string
	severity: 'MINOR' | 'MAJOR' | 'CRITICAL' | null
	suggestion: string
}

const JUDGE_JSON_SCHEMA: Record<string, unknown> = {
	type: 'object',
	additionalProperties: false,
	properties: {
		issue: { type: ['string', 'null'], maxLength: 500 },
		reasoning: { type: 'string', maxLength: 1000 },
		severity: { enum: ['MINOR', 'MAJOR', 'CRITICAL', null] },
		suggestion: { type: 'string', maxLength: 700 },
	},
	required: ['issue', 'reasoning', 'severity', 'suggestion'],
}

function isJudgeData(value: unknown): value is JudgeData {
	if (!value || typeof value !== 'object') return false
	const data = value as Record<string, unknown>
	const textFields = [data.issue, data.reasoning, data.suggestion].filter(
		(item): item is string => typeof item === 'string',
	)
	const containsRawDataFragment = textFields.some((text) =>
		/\[\s*\d+\s*,\s*['"]|\}\s*,\s*\{|['"](?:gap_candidates|claim_evidence_matrix)['"]\s*,/i.test(
			text,
		),
	)
	return (
		!containsRawDataFragment &&
		(data.issue === null || typeof data.issue === 'string') &&
		typeof data.reasoning === 'string' &&
		(data.severity === null ||
			data.severity === 'MINOR' ||
			data.severity === 'MAJOR' ||
			data.severity === 'CRITICAL') &&
		typeof data.suggestion === 'string'
	)
}

function scopeSpecForJudge(judgeName: JudgeName, specSlice: unknown) {
	if (!specSlice || typeof specSlice !== 'object') return specSlice
	const spec = specSlice as Record<string, unknown>
	return Object.fromEntries(
		JUDGE_FIELDS[judgeName]
			.filter((field) => field in spec)
			.map((field) => {
				const storedField = spec[field]
				const value =
					storedField &&
					typeof storedField === 'object' &&
					'value' in storedField
						? (storedField as { value: unknown }).value
						: storedField
				if (field !== 'related_work_matrix' || !Array.isArray(value)) {
					return [field, value]
				}
				return [
					field,
					value.slice(0, 8).map((source: any) => ({
						source_id: source.source_id,
						title: source.title,
						did_what: source.did_what,
						gap_note: source.gap_note,
						abstract:
							typeof source.abstract === 'string'
								? source.abstract.slice(0, 800)
								: '',
					})),
				]
			}),
	)
}

/**
 * Mỗi judge được gọi ĐỘC LẬP — cùng nhận specSlice như nhau nhưng
 * KHÔNG thấy output của judge khác. Orchestrator gọi hàm này song song
 * (Promise.all) cho cả 5 judge rồi mới tổng hợp.
 */
export async function runJudge(judgeName: JudgeName, specSlice: unknown) {
	let lastError: unknown
	for (let attempt = 0; attempt < 2; attempt += 1) {
		try {
			const result = await callAgent<JudgeData>({
				model: modelFor('reasoning'),
				systemPrompt:
					JUDGE_PROMPTS[judgeName] +
					OUTPUT_SCHEMA_NOTE +
					(attempt > 0
						? '\nLần trả lời trước không hợp lệ. Chỉ xuất đúng một JSON object ngắn gọn.'
						: ''),
				userPayload: { spec_slice: specSlice },
				maxTokens: 1200,
				jsonSchema: JUDGE_JSON_SCHEMA,
			})
			if (!isJudgeData(result.data)) {
				throw new Error('Judge trả về JSON không đúng schema yêu cầu.')
			}
			return result
		} catch (error) {
			lastError = error
		}
	}
	throw lastError
}

export async function runAllJudges(specSlice: unknown) {
	const serializedSnapshot = JSON.stringify(specSlice)
	const settled = await Promise.allSettled(
		JUDGE_NAMES.map((name) => {
			const isolatedSnapshot = JSON.parse(serializedSnapshot) as unknown
			return runJudge(name, scopeSpecForJudge(name, isolatedSnapshot))
		}),
	)

	return settled.map((entry, index) => {
		const judgeName = JUDGE_NAMES[index]
		if (entry.status === 'fulfilled') {
			return {
				judge_name: judgeName,
				status: 'completed' as const,
				result: entry.value,
			}
		}
		return {
			judge_name: judgeName,
			status: 'failed' as const,
			error:
				entry.reason instanceof Error
					? entry.reason.message
					: 'Judge không trả về kết quả hợp lệ.',
		}
	})
}
