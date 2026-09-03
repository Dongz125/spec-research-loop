import { callAgent, modelFor } from '../AiClient'

const SYSTEM_PROMPT = `Bạn là Judge Resolution Agent trong SpecResearch Loop.

Nhiệm vụ: sửa trực tiếp spec hiện tại theo đúng phương án người dùng chọn.

Quy tắc:
- Chỉ trả về các field thật sự cần thay đổi và chỉ dùng tên field có trong schema.
- Nếu resolution_request.fix_all=true, xử lý tất cả judge_findings trong một bản sửa thống nhất.
- Nếu fix_all=false, chỉ xử lý selected_fix và judge_findings được cung cấp.
- Giá trị mỗi field phải giữ đúng cấu trúc trong current_spec; không bọc bằng value/status.
- Không tạo paper, DOI, URL hay source_id mới.
- Mọi evidence_source_ids phải lấy nguyên từ allowed_source_ids.
- Không xóa bằng chứng hợp lệ chỉ để làm Judge hài lòng.
- Không trả Markdown hoặc giải thích ngoài JSON.

Chỉ trả về đúng một JSON object theo cấu trúc:
{
  "change_summary": "Mô tả ngắn những gì đã sửa",
  "updated_fields": { "tên_field_hợp_lệ": "giá trị mới của field" }
}
updated_fields phải có ít nhất một field. Bỏ qua field không cần thay đổi.`

const stringArray = {
	type: 'array',
	minItems: 1,
	maxItems: 12,
	items: { type: 'string', maxLength: 700 },
}

function fieldSchemas(sourceIds: string[]) {
	const evidenceIds = {
		type: 'array',
		minItems: 1,
		maxItems: 5,
		items: { type: 'string', enum: sourceIds },
	}
	return {
		problem_statement: { type: 'string', minLength: 1, maxLength: 3000 },
		gap_candidates: {
			type: 'array', minItems: 1, maxItems: 5,
			items: {
				type: 'object', additionalProperties: false,
				required: ['id', 'text', 'evidence_source_ids'],
				properties: {
					id: { type: 'string', minLength: 1, maxLength: 80 },
					text: { type: 'string', minLength: 1, maxLength: 1200 },
					evidence_source_ids: evidenceIds,
				},
			},
		},
		selected_gap_direction: {
			type: 'object', additionalProperties: false,
			required: ['id', 'label'],
			properties: {
				id: { type: 'string', minLength: 1, maxLength: 80 },
				label: { type: 'string', minLength: 1, maxLength: 1200 },
			},
		},
		contributions: stringArray,
		claim_evidence_matrix: {
			type: 'array', minItems: 1, maxItems: 6,
			items: {
				type: 'object', additionalProperties: false,
				required: ['claim', 'baseline', 'metric', 'evidence', 'rejection_condition', 'evidence_source_ids'],
				properties: {
					claim: { type: 'string', minLength: 1, maxLength: 900 },
					baseline: { type: 'string', minLength: 1, maxLength: 700 },
					metric: { type: 'string', minLength: 1, maxLength: 500 },
					evidence: { type: 'string', minLength: 1, maxLength: 900 },
					rejection_condition: { type: 'string', minLength: 1, maxLength: 700 },
					evidence_source_ids: evidenceIds,
				},
			},
		},
		experimental_protocol: {
			type: 'array', minItems: 1, maxItems: 12,
			items: {
				type: 'object', additionalProperties: false,
				required: ['name', 'goal', 'config'],
				properties: {
					name: { type: 'string', minLength: 1, maxLength: 300 },
					goal: { type: 'string', minLength: 1, maxLength: 900 },
					config: { type: 'object', additionalProperties: true },
				},
			},
		},
		compute_budget: { type: 'object', minProperties: 1, additionalProperties: true },
		risks_and_limitations: stringArray,
		open_issues: stringArray,
	} as const
}

function outputSchema(currentSpec: Record<string, unknown>, sourceIds: string[], fixAll: boolean) {
	const schemas = fieldSchemas(sourceIds) as Record<string, unknown>
	const properties = Object.fromEntries(
		Object.keys(currentSpec)
			.filter((field) => field in schemas)
			.filter((field) => sourceIds.length > 0 || (field !== 'gap_candidates' && field !== 'claim_evidence_matrix'))
			.map((field) => [field, schemas[field]]),
	)
	return {
		type: 'object', additionalProperties: false,
		required: ['change_summary', 'updated_fields'],
		properties: {
			change_summary: { type: 'string', minLength: 1, maxLength: 500 },
			updated_fields: {
				type: 'object', minProperties: 1,
				maxProperties: fixAll ? Object.keys(properties).length : 3,
				additionalProperties: false,
				properties,
			},
		},
	} as Record<string, unknown>
}

function unwrapSpec(specSlice: unknown) {
	if (!specSlice || typeof specSlice !== 'object') return {}
	return Object.fromEntries(
		Object.entries(specSlice as Record<string, unknown>).map(([field, stored]) => [
			field,
			stored && typeof stored === 'object' && 'value' in stored
				? (stored as { value: unknown }).value
				: stored,
		]),
	)
}

const JUDGE_FIELDS: Record<string, string[]> = {
	gap_judge: ['problem_statement', 'gap_candidates', 'selected_gap_direction'],
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
	evidence_judge: ['gap_candidates', 'contributions', 'claim_evidence_matrix'],
	conference_readiness_judge: [
		'problem_statement',
		'gap_candidates',
		'selected_gap_direction',
		'contributions',
		'claim_evidence_matrix',
		'experimental_protocol',
		'compute_budget',
		'risks_and_limitations',
		'open_issues',
	],
}

function compactValue(value: unknown, depth = 0): unknown {
	if (typeof value === 'string') return value.slice(0, depth === 0 ? 1200 : 600)
	if (Array.isArray(value)) {
		return value.slice(0, 8).map((item) => compactValue(item, depth + 1))
	}
	if (!value || typeof value !== 'object' || depth >= 4) return value
	return Object.fromEntries(
		Object.entries(value as Record<string, unknown>)
			.slice(0, 20)
			.map(([key, item]) => [key, compactValue(item, depth + 1)]),
	)
}

function compactFinding(finding: any) {
	return {
		judge: String(finding?.judge ?? ''),
		issue: String(finding?.issue ?? '').slice(0, 500),
		reasoning: String(finding?.reasoning ?? '').slice(0, 700),
		suggestion: String(finding?.suggestion ?? '').slice(0, 500),
	}
}

const EXPERIMENT_PATCH_PROMPT = `Bạn sửa một vấn đề do Experiment Judge phát hiện.
Không in lại toàn bộ field. Chỉ trả JSON ngắn gọn:
{
  "change_summary": "Tóm tắt",
  "operations": [
    {
      "field": "experimental_protocol" | "claim_evidence_matrix" | "compute_budget",
      "action": "merge" | "replace" | "append",
      "index": 0,
      "value": {}
    }
  ]
}

Quy tắc:
- Với field dạng array: index là vị trí 0-based; append không cần index.
- merge chỉ chứa các thuộc tính cần đổi của một phần tử, không chép lại cả array.
- Với compute_budget: dùng merge, bỏ index và value chỉ chứa thuộc tính cần đổi.
- Không tạo source_id mới và không thay evidence_source_ids nếu không cần.
- Tối đa 6 operations. Không trả Markdown hay key khác.`

const EVIDENCE_PATCH_PROMPT = `Bạn sửa một vấn đề do Evidence Judge phát hiện.
Không in lại toàn bộ field. Chỉ trả JSON ngắn gọn:
{
  "change_summary": "Tóm tắt",
  "operations": [
    {
      "field": "claim_evidence_matrix" | "gap_candidates",
      "action": "merge" | "replace",
      "index": 0,
      "value": {}
    }
  ]
}

Quy tắc:
- index là vị trí phần tử 0-based trong array hiện tại.
- Ưu tiên merge và value chỉ chứa thuộc tính thực sự cần sửa.
- evidence_source_ids chỉ được dùng ID có trong allowed_source_ids và nội dung
  evidence_sources phải thực sự hỗ trợ claim/gap tương ứng.
- Không tạo paper, DOI, URL hoặc source ID mới.
- Tối đa 6 operations. Không trả Markdown hay key khác.`

const CONFERENCE_PATCH_PROMPT = `Bạn sửa một vấn đề do Conference Readiness Judge phát hiện.
Không in lại toàn bộ spec hoặc toàn bộ field dài. Chỉ trả JSON ngắn gọn:
{
  "change_summary": "Tóm tắt",
  "operations": [
    {
      "field": "tên field hợp lệ",
      "action": "merge" | "replace" | "append",
      "index": 0,
      "value": "phần giá trị cần sửa"
    }
  ]
}

Field hợp lệ: problem_statement, gap_candidates, selected_gap_direction,
contributions, claim_evidence_matrix, experimental_protocol, compute_budget,
risks_and_limitations, open_issues.

Quy tắc:
- Chỉ sửa đúng tiêu chí bị Judge chỉ ra; tối đa 3 field khác nhau và 6 operations.
- Với array: index là vị trí 0-based; merge/replace sửa một phần tử, append thêm một phần tử.
- Với object: dùng merge và chỉ gửi thuộc tính cần đổi.
- Với problem_statement: dùng replace và chỉ gửi chuỗi mới.
- Không tạo nguồn mới. evidence_source_ids chỉ dùng ID trong allowed_source_ids.
- Không trả Markdown hoặc key khác.`

async function runPatchResolution(
	fullSpec: Record<string, unknown>,
	payload: Record<string, unknown>,
	systemPrompt: string,
	allowedFieldNames: string[],
	maxTokens: number,
) {
	const allowedFields = new Set(allowedFieldNames)
	const allowedSourceIds = new Set(
		(Array.isArray(payload.allowed_source_ids) ? payload.allowed_source_ids : [])
			.filter((id): id is string => typeof id === 'string'),
	)
	const citationFields = new Set(['claim_evidence_matrix', 'gap_candidates'])
	const sanitizeCitationValue = (
		field: string,
		value: unknown,
		fallback?: unknown,
	) => {
		if (!citationFields.has(field) || !value || typeof value !== 'object') {
			return value
		}
		const candidate = { ...(value as Record<string, unknown>) }
		const validIds = (Array.isArray(candidate.evidence_source_ids)
			? candidate.evidence_source_ids
			: []
		).filter(
			(id): id is string => typeof id === 'string' && allowedSourceIds.has(id),
		)
		if (validIds.length > 0) {
			candidate.evidence_source_ids = Array.from(new Set(validIds))
			return candidate
		}
		const fallbackIds =
			fallback && typeof fallback === 'object' &&
			Array.isArray((fallback as Record<string, unknown>).evidence_source_ids)
				? ((fallback as Record<string, unknown>).evidence_source_ids as unknown[])
						.filter(
							(id): id is string =>
								typeof id === 'string' && allowedSourceIds.has(id),
						)
				: []
		if (fallbackIds.length === 0) return null
		candidate.evidence_source_ids = Array.from(new Set(fallbackIds))
		return candidate
	}
	let lastResult: Awaited<ReturnType<typeof callAgent>> | null = null
	for (let attempt = 0; attempt < 2; attempt += 1) {
		lastResult = await callAgent({
			model: modelFor('reasoning'),
			systemPrompt:
				systemPrompt +
				(attempt > 0
					? '\nLần trước không có operation hợp lệ. Chỉ trả các operation ngắn gọn theo đúng cấu trúc.'
					: ''),
			userPayload: payload,
			maxTokens,
		})
		const data = lastResult.data as {
			change_summary?: string
			operations?: Array<Record<string, any>>
		}
		const working = structuredClone(fullSpec)
		const changedFields = new Set<string>()
		for (const operation of (Array.isArray(data.operations)
			? data.operations
			: []
		).slice(0, 6)) {
			const field = operation.field
			if (!allowedFields.has(field) || operation.value === undefined) continue
			if (!changedFields.has(field) && changedFields.size >= 3) continue
			const current = working[field]
			if (!Array.isArray(current)) {
				if (
					operation.action === 'merge' &&
					current &&
					typeof current === 'object' &&
					operation.value &&
					typeof operation.value === 'object'
				) {
					working[field] = { ...current, ...operation.value }
					changedFields.add(field)
				} else if (operation.action === 'replace') {
					working[field] = operation.value
					changedFields.add(field)
				}
				continue
			}
			if (operation.action === 'append') {
				const appendValue = sanitizeCitationValue(field, operation.value)
				if (appendValue === null) continue
				current.push(appendValue)
				changedFields.add(field)
				continue
			}
			const index = Number(operation.index)
			if (!Number.isInteger(index) || index < 0 || index >= current.length) continue
			const operationValue = sanitizeCitationValue(
				field,
				operation.value,
				current[index],
			)
			if (operationValue === null) continue
			if (operation.action === 'replace') {
				current[index] = operationValue
				changedFields.add(field)
			} else if (
				operation.action === 'merge' &&
				current[index] &&
				typeof current[index] === 'object' &&
				operationValue &&
				typeof operationValue === 'object'
			) {
				current[index] = { ...current[index], ...operationValue }
				changedFields.add(field)
			}
		}
		if (changedFields.size > 0) {
			return {
				...lastResult,
				data: {
					change_summary:
						data.change_summary || 'Áp dụng bản vá từ Experiment Judge',
					updated_fields: Object.fromEntries(
						Array.from(changedFields).map((field) => [field, working[field]]),
					),
				},
			}
		}
	}
	throw new Error('AI không tạo được thao tác sửa ngắn gọn và hợp lệ. Hãy thử lại.')
}

export async function runJudgeResolutionProposer(context: any) {
	let resolutionRequest: Record<string, any> = {}
	try {
		resolutionRequest = JSON.parse(context?.user_instruction || '{}')
	} catch {
		resolutionRequest = { selected_fix: String(context?.user_instruction || '') }
	}
	const fullSpec = unwrapSpec(context?.spec_slice)
	const relatedRows = fullSpec.related_work_matrix
	const sourceIds = Array.from(new Set<string>(
		(Array.isArray(relatedRows) ? relatedRows : [])
			.map((row: any) => row?.source_id)
			.filter((id: unknown): id is string => typeof id === 'string'),
	))
	const fixAll = resolutionRequest.fix_all === true
	const findings = (Array.isArray(resolutionRequest.judge_findings)
		? resolutionRequest.judge_findings
		: []
	).map(compactFinding)
	const targetedFields = new Set(
		findings.flatMap((finding: any) => JUDGE_FIELDS[finding.judge] ?? []),
	)
	if (targetedFields.size === 0) {
		for (const field of Object.values(JUDGE_FIELDS).flat()) targetedFields.add(field)
	}
	const currentSpec = Object.fromEntries(
		Object.entries(fullSpec)
			.filter(([field]) => field !== 'related_work_matrix' && targetedFields.has(field))
			.map(([field, value]) => [field, compactValue(value)]),
	)
	const evidenceSources = (Array.isArray(relatedRows) ? relatedRows : [])
		.slice(0, 8)
		.map((row: any) => ({
			source_id: row?.source_id,
			title: String(row?.title ?? '').slice(0, 240),
			did_what: String(row?.did_what ?? '').slice(0, 400),
			gap_note: String(row?.gap_note ?? '').slice(0, 400),
		}))
	if (
		!fixAll &&
		findings.length === 1 &&
		findings[0]?.judge === 'experiment_judge'
	) {
		return runPatchResolution(
			fullSpec,
			{
				current_spec: currentSpec,
				allowed_source_ids: sourceIds,
				judge_finding: findings[0],
				selected_fix: String(resolutionRequest.selected_fix ?? '').slice(0, 700),
			},
			EXPERIMENT_PATCH_PROMPT,
			['experimental_protocol', 'claim_evidence_matrix', 'compute_budget'],
			1200,
		)
	}
	if (
		!fixAll &&
		findings.length === 1 &&
		findings[0]?.judge === 'evidence_judge'
	) {
		return runPatchResolution(
			fullSpec,
			{
				current_spec: currentSpec,
				evidence_sources: evidenceSources,
				allowed_source_ids: sourceIds,
				judge_finding: findings[0],
				selected_fix: String(resolutionRequest.selected_fix ?? '').slice(0, 700),
			},
			EVIDENCE_PATCH_PROMPT,
			['claim_evidence_matrix', 'gap_candidates'],
			1000,
		)
	}
	if (
		!fixAll &&
		findings.length === 1 &&
		findings[0]?.judge === 'conference_readiness_judge'
	) {
		return runPatchResolution(
			fullSpec,
			{
				current_spec: currentSpec,
				evidence_sources: evidenceSources,
				allowed_source_ids: sourceIds,
				judge_finding: findings[0],
				selected_fix: String(resolutionRequest.selected_fix ?? '').slice(0, 700),
			},
			CONFERENCE_PATCH_PROMPT,
			[
				'problem_statement',
				'gap_candidates',
				'selected_gap_direction',
				'contributions',
				'claim_evidence_matrix',
				'experimental_protocol',
				'compute_budget',
				'risks_and_limitations',
				'open_issues',
			],
			1200,
		)
	}
	const schema = outputSchema(currentSpec, sourceIds, fixAll)
	const allowedFields = new Set(
		Object.keys(
			((schema.properties as any).updated_fields.properties ?? {}) as Record<string, unknown>,
		),
	)
	let lastResult: Awaited<ReturnType<typeof callAgent>> | null = null
	for (let attempt = 0; attempt < 2; attempt += 1) {
		lastResult = await callAgent({
			model: modelFor('reasoning'),
			systemPrompt:
				SYSTEM_PROMPT +
				(attempt > 0
					? '\nLần trước updated_fields không có field hợp lệ. Hãy trả ít nhất một field đúng tên trong schema.'
					: ''),
			userPayload: {
				current_spec: currentSpec,
				evidence_sources: evidenceSources,
				allowed_field_names: Array.from(allowedFields),
				maximum_changed_fields: fixAll ? allowedFields.size : 3,
				allowed_source_ids: sourceIds,
				resolution_request: {
					selected_fix: String(resolutionRequest.selected_fix ?? '').slice(0, 700),
					fix_all: fixAll,
					judge_findings: findings,
				},
			},
			maxTokens: fixAll ? 2600 : 1600,
		})
		const data = lastResult.data as { updated_fields?: Record<string, unknown> }
		const normalizedFields = Object.fromEntries(
			Object.entries(data?.updated_fields ?? {}).flatMap(([field, rawValue]) => {
				if (!allowedFields.has(field)) return []
				const value =
					rawValue &&
					typeof rawValue === 'object' &&
					'value' in rawValue &&
					('status' in rawValue || Object.keys(rawValue).length === 1)
						? (rawValue as { value: unknown }).value
						: rawValue
				return [[field, value]]
			}),
		)
		const validFieldCount = Object.keys(normalizedFields).length
		if (validFieldCount > 0 && (fixAll || validFieldCount <= 3)) {
			return {
				...lastResult,
				data: { ...data, updated_fields: normalizedFields },
			}
		}
	}
	return lastResult!
}
