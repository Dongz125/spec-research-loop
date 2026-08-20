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
	data: ResearchSpec
	changed_fields: string[]
	change_summary: string | null
	created_by: string
	created_at: string
}

export interface JudgeReview {
	judge_name: string
	result: {
		data: {
			issue: string | null
			reasoning: string
			severity: 'MINOR' | 'MAJOR' | 'CRITICAL' | null
			suggestion: string
		}
	}
}
