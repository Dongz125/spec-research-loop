import {
	pgTable,
	uuid,
	text,
	timestamp,
	integer,
	jsonb,
	numeric,
	check,
	unique,
	index,
	AnyPgColumn,
	customType,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

// ---------------------------------------------------------------------
// Utility cho pgvector extension
// ---------------------------------------------------------------------
const vector1536 = customType<{ data: number[]; driverData: string }>({
	dataType() {
		return 'vector(1536)'
	},
	toDriver(value: number[]) {
		return JSON.stringify(value)
	},
	fromDriver(value: unknown) {
		if (typeof value === 'string') {
			return JSON.parse(value) as number[]
		}
		return value as number[]
	},
})

// ---------------------------------------------------------------------
// 1. users / projects
// ---------------------------------------------------------------------
export const users = pgTable('users', {
	id: uuid('id').primaryKey().defaultRandom(),
	email: text('email').unique().notNull(),
	name: text('name'),
	passwordHash: text('password_hash'),
	createdAt: timestamp('created_at', { withTimezone: true })
		.defaultNow()
		.notNull(),
})

export const projects = pgTable(
	'projects',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		title: text('title').notNull(),
		status: text('status').default('in_progress').notNull(),
		currentStep: text('current_step').default('idea_capture').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(t) => [
		// Callback trả về Array để tránh warning deprecation
		check(
			'projects_status_check',
			sql`${t.status} IN ('in_progress','judged','finalized')`,
		),
	],
)

// ---------------------------------------------------------------------
// 2. spec_versions: NGUỒN SỰ THẬT DUY NHẤT
// ---------------------------------------------------------------------
export const specVersions = pgTable(
	'spec_versions',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		projectId: uuid('project_id')
			.notNull()
			.references(() => projects.id, { onDelete: 'cascade' }),
		versionNumber: integer('version_number').notNull(),
		// Dùng function trả về AnyPgColumn để xử lý self-reference, tránh lỗi TS Error
		parentVersionId: uuid('parent_version_id').references(
			(): AnyPgColumn => specVersions.id,
		),
		step: text('step').notNull(),
		data: jsonb('data').notNull(),
		changedFields: text('changed_fields').array().default([]).notNull(),
		changeSummary: text('change_summary'),
		createdBy: text('created_by').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(t) => [
		unique('spec_versions_project_version_unique').on(
			t.projectId,
			t.versionNumber,
		),
		index('idx_spec_versions_project').on(
			t.projectId,
			sql`${t.versionNumber} DESC`,
		),
	],
)

// ---------------------------------------------------------------------
// 3. decisions: log các lựa chọn của user
// ---------------------------------------------------------------------
export const decisions = pgTable(
	'decisions',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		projectId: uuid('project_id')
			.notNull()
			.references(() => projects.id, { onDelete: 'cascade' }),
		specVersionId: uuid('spec_version_id').references(
			() => specVersions.id,
		),
		step: text('step').notNull(),
		question: text('question').notNull(),
		options: jsonb('options').notNull(),
		selectedOptionId: text('selected_option_id'),
		userNote: text('user_note'),
		createdAt: timestamp('created_at', { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(t) => [index('idx_decisions_project').on(t.projectId, t.createdAt)],
)

// ---------------------------------------------------------------------
// 4. sources & related_work_entries
// ---------------------------------------------------------------------
export const sources = pgTable(
	'sources',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		projectId: uuid('project_id')
			.notNull()
			.references(() => projects.id, { onDelete: 'cascade' }),
		title: text('title').notNull(),
		authors: text('authors'),
		year: integer('year'),
		venue: text('venue'),
		url: text('url'),
		summary: text('summary'),
		reliabilityScore: numeric('reliability_score', {
			precision: 3,
			scale: 2,
		}),
		embedding: vector1536('embedding'), // Sử dụng customType đã định nghĩa
		createdAt: timestamp('created_at', { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(t) => [
		check(
			'reliability_score_check',
			sql`${t.reliabilityScore} >= 0 AND ${t.reliabilityScore} <= 1`,
		),
		index('idx_sources_project').on(t.projectId),
	],
)

export const relatedWorkEntries = pgTable('related_work_entries', {
	id: uuid('id').primaryKey().defaultRandom(),
	projectId: uuid('project_id')
		.notNull()
		.references(() => projects.id, { onDelete: 'cascade' }),
	sourceId: uuid('source_id').references(() => sources.id, {
		onDelete: 'set null',
	}),
	didWhat: text('did_what'),
	feedbackUsed: text('feedback_used'),
	gapNote: text('gap_note'),
	createdAt: timestamp('created_at', { withTimezone: true })
		.defaultNow()
		.notNull(),
})

// ---------------------------------------------------------------------
// 5. experiments: kế hoạch thí nghiệm
// ---------------------------------------------------------------------
export const experiments = pgTable('experiments', {
	id: uuid('id').primaryKey().defaultRandom(),
	projectId: uuid('project_id')
		.notNull()
		.references(() => projects.id, { onDelete: 'cascade' }),
	specVersionId: uuid('spec_version_id').references(() => specVersions.id),
	name: text('name').notNull(),
	goal: text('goal'),
	config: jsonb('config')
		.default(sql`'{}'::jsonb`)
		.notNull(),
	orderIndex: integer('order_index').default(0).notNull(),
	createdAt: timestamp('created_at', { withTimezone: true })
		.defaultNow()
		.notNull(),
})

// ---------------------------------------------------------------------
// 6. judge_reviews: đánh giá từ Judge
// ---------------------------------------------------------------------
export const judgeReviews = pgTable(
	'judge_reviews',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		evaluationRunId: uuid('evaluation_run_id'),
		specVersionId: uuid('spec_version_id')
			.notNull()
			.references(() => specVersions.id, { onDelete: 'cascade' }),
		judgeName: text('judge_name').notNull(),
		issue: text('issue'),
		reasoning: text('reasoning'),
		severity: text('severity'),
		suggestion: text('suggestion'),
		rawOutput: jsonb('raw_output'),
		createdAt: timestamp('created_at', { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(t) => [
		check(
			'judge_name_check',
			sql`${t.judgeName} IN ('gap_judge','contribution_judge','experiment_judge','evidence_judge','conference_readiness_judge')`,
		),
		check(
			'severity_check',
			sql`${t.severity} IN ('MINOR','MAJOR','CRITICAL')`,
		),
		index('idx_judge_reviews_version').on(t.specVersionId),
		index('idx_judge_reviews_run').on(t.evaluationRunId),
	],
)

// ---------------------------------------------------------------------
// 7. ai_call_logs: CHỈ để audit/debug
// ---------------------------------------------------------------------
export const aiCallLogs = pgTable(
	'ai_call_logs',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		projectId: uuid('project_id')
			.notNull()
			.references(() => projects.id, { onDelete: 'cascade' }),
		agentName: text('agent_name').notNull(),
		step: text('step').notNull(),
		model: text('model').notNull(),
		inputContext: jsonb('input_context').notNull(),
		output: jsonb('output'),
		inputTokens: integer('input_tokens'),
		outputTokens: integer('output_tokens'),
		latencyMs: integer('latency_ms'),
		createdAt: timestamp('created_at', { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(t) => [
		index('idx_ai_call_logs_project').on(
			t.projectId,
			sql`${t.createdAt} DESC`,
		),
	],
)
