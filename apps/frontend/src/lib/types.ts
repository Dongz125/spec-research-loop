export type FieldStatus =
	| 'CONFIRMED'
	| 'PROPOSED'
	| 'MISSING'
	| 'AMBIGUOUS'
	| 'UNSUPPORTED'
	| 'CONFLICT'

export interface SpecField<T = unknown> {
	value: T
	status: FieldStatus
	source?: string
}

export type ResearchSpec = Record<string, SpecField>

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
	| 'final'

export interface SpecVersion {
	id: string
	version_number: number
	step: string
	data?: ResearchSpec
	changed_fields: string[]
	change_summary: string | null
	created_by: string
	created_at: string
}

interface JudgeResultData {
	issue: string | null
	reasoning: string
	severity: 'MINOR' | 'MAJOR' | 'CRITICAL' | null
	suggestion: string
}

export type JudgeReview =
	| {
			judge_name: string
			status: 'completed'
			result: { data: JudgeResultData }
	  }
	| {
			judge_name: string
			status: 'failed'
			error: string
	  }

export interface JudgeEvaluationRun {
	evaluation_run_id: string
	spec_version_id: string
	version_number: number
	version_step: string
	created_at: string
	reviews: JudgeReview[]
}
