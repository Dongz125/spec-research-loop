// =====================================================================
// ResearchSpec: đây là "state" trung tâm — mỗi spec_version.data lưu
// đúng shape này. Mọi agent AI chỉ đọc/ghi các field cụ thể của object
// này, KHÔNG bao giờ nhận nguyên "lịch sử chat" làm input.
// =====================================================================

export type FieldStatus =
	| 'CONFIRMED'
	| 'PROPOSED'
	| 'MISSING'
	| 'AMBIGUOUS'
	| 'UNSUPPORTED'
	| 'CONFLICT'

export interface SpecField<T> {
	value: T
	status: FieldStatus
	source?: string // "user" | "ai:gap_proposer" | ...
}

export interface ResearchSpec {
	problem_statement: SpecField<string>
	search_keywords: SpecField<string[]>
	idea_interpretation: SpecField<{
		result: unknown
		answers: Record<string, string>
	}>
	research_questions: SpecField<string[]>
	gap_candidates: SpecField<
		{ id: string; text: string; evidence_source_ids: string[] }[]
	>
	selected_gap_direction: SpecField<{ id: string; label: string }>
	contributions: SpecField<string[]>
	claim_evidence_matrix: SpecField<
		{
			claim: string
			baseline: string
			metric: string
			evidence: string
			rejection_condition: string
			evidence_source_ids: string[]
		}[]
	>
	related_work_matrix: SpecField<
		{
			source_id: string
			title?: string
			authors?: string
			year?: number
			venue?: string
			url?: string
			doi?: string | null
			abstract?: string
			citation?: string
			did_what: string
			feedback_used: string
			gap_note: string
		}[]
	>
	experimental_protocol: SpecField<
		{ name: string; goal: string; config: Record<string, unknown> }[]
	>
	compute_budget: SpecField<{
		model: string
		hardware_target?: string
		prompt_count?: number
		candidates_per_prompt?: number
		optimization_rounds?: number
		development_set_size?: number
		validation_set_size?: number
		top_k?: number
		vram_estimate_gb: number
		time_estimate_hours: number | string
		token_estimate?: string
		api_cost_estimate?: string
		token_or_api_cost_estimate?: string
		is_feasible?: boolean
		warning?: string | null
		assumptions?: string[]
	}>
	risks_and_limitations: SpecField<string[]>
	open_issues: SpecField<string[]>
}

// Danh sách step — dùng để validate và để Context Builder biết cần field nào
export type StepId =
	| 'idea_capture'
	| 'decomposition'
	| 'related_work'
	| 'gap'
	| 'contribution'
	| 'experiment_design'
	| 'feasibility'
	| 'spec_draft'
	| 'judge'
	| 'judge_resolution'
	| 'final'

// Mỗi step chỉ cần MỘT TẬP CON field của ResearchSpec — đây chính là
// cơ chế chống tràn: Context Builder tra bảng này để biết lấy field nào,
// không bao giờ gửi toàn bộ spec nếu không cần.
export const STEP_FIELD_MAP: Record<StepId, (keyof ResearchSpec)[]> = {
	idea_capture: ['problem_statement', 'search_keywords', 'idea_interpretation'],
	decomposition: ['problem_statement', 'research_questions'],
	related_work: ['problem_statement', 'search_keywords', 'related_work_matrix'],
	gap: [
		'problem_statement',
		'related_work_matrix',
		'gap_candidates',
		'selected_gap_direction',
	],
	contribution: [
		'gap_candidates',
		'selected_gap_direction',
		'related_work_matrix',
	],
	experiment_design: ['claim_evidence_matrix', 'experimental_protocol'],
	feasibility: ['experimental_protocol', 'compute_budget'],
	spec_draft: [
		'problem_statement',
		'research_questions',
		'related_work_matrix',
		'gap_candidates',
		'contributions',
		'claim_evidence_matrix',
		'experimental_protocol',
		'compute_budget',
		'risks_and_limitations',
		'open_issues',
	],
	judge: [
		'problem_statement',
		'gap_candidates',
		'contributions',
		'claim_evidence_matrix',
		'experimental_protocol',
		'related_work_matrix',
	],
	judge_resolution: [
		'problem_statement',
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
	final: [
		'problem_statement',
		'research_questions',
		'related_work_matrix',
		'gap_candidates',
		'contributions',
		'claim_evidence_matrix',
		'experimental_protocol',
		'compute_budget',
		'risks_and_limitations',
		'open_issues',
	],
}

export interface AgentResult<T = unknown> {
	data: T
	model: string
	input_tokens: number
	output_tokens: number
	latency_ms: number
}
