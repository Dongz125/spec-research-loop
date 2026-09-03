import { useEffect, useState } from 'react'
import {
	Gavel,
	AlertTriangle,
	CheckCircle2,
	Eye,
	FileText,
	Loader2,
	ListChecks,
	X,
} from 'lucide-react'
import { api } from '@/lib/api'
import type { JudgeEvaluationRun, JudgeReview, ResearchSpec } from '@/lib/types'
import {
	Card,
	CardHeader,
	CardTitle,
	CardContent,
	CardDescription,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'

const JUDGE_LABELS: Record<
	string,
	{ label: string; icon: string; criteria: string }
> = {
	gap_judge: {
		label: 'Research Gap Judge',
		icon: '🎯',
		criteria:
			'Kiểm tra research gap có được related-work hỗ trợ, không dựa trên suy đoán chủ quan.',
	},
	contribution_judge: {
		label: 'Contribution Judge',
		icon: '⭐',
		criteria:
			'Kiểm tra contribution có mới, rõ ràng và không phóng đại so với gap hoặc thí nghiệm.',
	},
	experiment_judge: {
		label: 'Experiment Judge',
		icon: '🧪',
		criteria:
			'Kiểm tra baseline, metric, ablation và khả năng khái quát có đủ để chứng minh claim.',
	},
	evidence_judge: {
		label: 'Evidence Judge',
		icon: '🔍',
		criteria:
			'Kiểm tra từng claim có nguồn bằng chứng phù hợp, không bị gán sai hoặc thiếu liên quan.',
	},
	conference_readiness_judge: {
		label: 'Conference Readiness Judge',
		icon: '🏆',
		criteria:
			'Đánh giá originality, significance, soundness, clarity và reproducibility của spec.',
	},
}

const JUDGE_NAMES = Object.keys(JUDGE_LABELS)

const SEVERITY_STYLES: Record<string, string> = {
	MINOR: 'border-amber-200 bg-amber-50 text-amber-700',
	MAJOR: 'border-orange-200 bg-orange-50 text-orange-700',
	CRITICAL: 'border-red-200 bg-red-50 text-red-700',
}

const SPEC_SECTIONS = [
	{
		title: 'Problem Statement',
		fields: [{ key: 'problem_statement', label: 'Problem statement' }],
	},
	{
		title: 'Research Gap',
		fields: [
			{ key: 'gap_candidates', label: 'Research gap candidates' },
			{ key: 'selected_gap_direction', label: 'Selected gap direction' },
		],
	},
	{
		title: 'Contributions',
		fields: [{ key: 'contributions', label: 'Contributions' }],
	},
	{
		title: 'Claim-Evidence Matrix',
		fields: [
			{ key: 'claim_evidence_matrix', label: 'Claim-evidence matrix' },
		],
	},
	{
		title: 'Experimental Protocol',
		fields: [
			{ key: 'experimental_protocol', label: 'Experimental protocol' },
		],
	},
	{
		title: 'Compute Budget',
		fields: [{ key: 'compute_budget', label: 'Compute budget' }],
	},
] as const

type SpecSection = (typeof SPEC_SECTIONS)[number]

function markdownValue(value: unknown) {
	if (typeof value === 'string') return value
	if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
		return value.map((item) => `- ${item}`).join('\n')
	}
	return `\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``
}

function sectionToMarkdown(spec: ResearchSpec, section: SpecSection) {
	let markdown = `# ${section.title}\n\n`

	for (const fieldDefinition of section.fields) {
		const field = spec[fieldDefinition.key]
		if (section.fields.length > 1) {
			markdown += `## ${fieldDefinition.label}\n\n`
		}
		if (field?.value === undefined || field.value === null || field.value === '') {
			markdown += '_Chưa có dữ liệu_\n\n'
			continue
		}
		markdown += `_Status: ${field.status}_\n\n`
		markdown += `${markdownValue(field.value)}\n\n`
	}

	return markdown
}

// Interface mới để nhận option từ backend
interface ResolutionOption {
	id: string
	label: string
	instruction: string
	judgeNames: string[]
}

function buildResolutionOptions(reviews: JudgeReview[]): ResolutionOption[] {
	const issueReviews = reviews.filter(
		(review) => review.status === 'completed' && review.result.data.issue,
	)
	if (issueReviews.length === 0) return []
	const individualOptions = issueReviews.map((review, index) => {
		if (review.status !== 'completed') throw new Error('Invalid review')
		const judgeLabel = JUDGE_LABELS[review.judge_name]?.label ?? review.judge_name
		return {
			id: String.fromCharCode(65 + index),
			label: `Sửa theo ${judgeLabel}: ${review.result.data.suggestion || review.result.data.issue}`,
			instruction: `Vấn đề: ${review.result.data.issue}. Lập luận: ${review.result.data.reasoning}. Yêu cầu sửa: ${review.result.data.suggestion}.`,
			judgeNames: [review.judge_name],
		}
	})
	return [
		{
			id: 'AUTO',
			label: 'Sửa tất cả vấn đề (đang phát triển)',
			instruction: 'Tự động sửa lần lượt vấn đề ưu tiên và chạy Judge lại sau mỗi vòng.',
			judgeNames: issueReviews.map((review) => review.judge_name),
		},
		...individualOptions,
	]
}

interface AppliedFix {
	summary: string
	fields: string[]
}

interface FixProgress {
	current: number
	total: number
	label: string
}

export function Step4_Judge({
	projectId,
	spec,
	latestSpecVersionId,
	onConfirmed,
	onSpecUpdated,
}: {
	projectId: string
	spec: ResearchSpec
	latestSpecVersionId: string
	onConfirmed: () => void
	onSpecUpdated: () => void | Promise<void>
}) {
	const [reviews, setReviews] = useState<JudgeReview[] | null>(null)
	const [evaluationRuns, setEvaluationRuns] = useState<JudgeEvaluationRun[]>([])
	const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
	const [loadingHistory, setLoadingHistory] = useState(false)
	const [evaluationSpec, setEvaluationSpec] = useState(spec)
	const [needsReevaluation, setNeedsReevaluation] = useState(false)

	// State mới cho luồng Resolution
	const [resolutionOptions, setResolutionOptions] = useState<
		ResolutionOption[]
	>([])
	const [pendingFixOption, setPendingFixOption] =
		useState<ResolutionOption | null>(null)
	const [applying, setApplying] = useState(false)
	const [fixProgress, setFixProgress] = useState<FixProgress | null>(null)
	const [appliedFix, setAppliedFix] = useState<AppliedFix | null>(null)

	const [loading, setLoading] = useState(false)
	const [saving, setSaving] = useState(false)
	const [error, setError] = useState<string | null>(null)

	const [selectedOption, setSelectedOption] = useState<string>('')
	const [customOption, setCustomOption] = useState('')
	const [selectedSpecSection, setSelectedSpecSection] =
		useState<SpecSection | null>(null)

	function displayEvaluationRun(run: JudgeEvaluationRun) {
		setSelectedRunId(run.evaluation_run_id)
		setReviews(run.reviews)
		setAppliedFix(null)
		setSelectedOption('')
		const failedCount = run.reviews.filter(
			(review) => review.status === 'failed',
		).length
		if (failedCount > 0) {
			setError(`${failedCount}/5 Judge không hoàn tất trong lượt đánh giá này.`)
		} else {
			setError(null)
		}
		setResolutionOptions(
			run.spec_version_id === latestSpecVersionId && failedCount === 0
				? buildResolutionOptions(run.reviews)
				: [],
		)
		if (run.spec_version_id === latestSpecVersionId) {
			setEvaluationSpec(spec)
		} else {
			void api.getVersion(projectId, run.version_number)
				.then((version) => {
					if (version.data) setEvaluationSpec(version.data)
				})
				.catch((error) =>
					setError(error.message ?? 'Không tải được Spec của lượt đánh giá.'),
				)
		}
	}

	useEffect(() => {
		setLoadingHistory(true)
		api.getJudgeHistory(projectId)
			.then(({ runs }) => {
				setEvaluationRuns(runs)
				setNeedsReevaluation(
					!runs.some((run) => run.spec_version_id === latestSpecVersionId),
				)
				if (runs[0]) displayEvaluationRun(runs[0])
			})
			.catch((error) =>
				setError(error.message ?? 'Không tải được lịch sử đánh giá.'),
			)
			.finally(() => setLoadingHistory(false))
	}, [projectId, latestSpecVersionId])

	async function handleRunJudges() {
		setLoading(true)
		setError(null)
		setReviews(null)
		setEvaluationSpec(spec)
		setSelectedRunId(null)
		setResolutionOptions([])
		setSelectedOption('')
		setPendingFixOption(null)
		setAppliedFix(null)
		try {
			// Bước 1: Chạy Judge
			const res = await api.runJudge(projectId)
			setReviews(res.reviews)
			const newRun: JudgeEvaluationRun = {
				evaluation_run_id: res.evaluation_run_id,
				spec_version_id: res.spec_version_id,
				version_number: res.version_number,
				version_step: 'judge',
				created_at: new Date().toISOString(),
				reviews: res.reviews,
			}
			setEvaluationRuns((previous) => [
				newRun,
				...previous.filter(
					(run) => run.evaluation_run_id !== newRun.evaluation_run_id,
				),
			])
			setSelectedRunId(newRun.evaluation_run_id)
			setNeedsReevaluation(false)

			// Bước 2: Tự động gom lỗi và sinh options đề xuất sửa
			const failedCount = res.reviews.filter(
				(review) => review.status === 'failed',
			).length
			const issues = res.reviews
				.filter((review) => review.status === 'completed')
				.map((review) => review.result.data.issue)
				.filter(Boolean)
			if (failedCount > 0) {
				setError(
					`${failedCount}/5 judge không hoàn tất vì output AI không hợp lệ. Kết quả của các judge còn lại vẫn được giữ; hãy chạy lại trước khi chốt spec.`,
				)
			}
			if (issues.length > 0 && failedCount === 0) {
				setResolutionOptions(buildResolutionOptions(res.reviews))
			}
		} catch (e: any) {
			setError(e.message ?? 'Lỗi khi chạy đánh giá')
		} finally {
			setLoading(false)
		}
	}

	async function handleApplyFix(option: ResolutionOption) {
		const selectedInstruction =
			option.id === 'Other'
				? customOption.trim()
				: option.instruction
		const selectedRun = evaluationRuns.find(
			(run) => run.evaluation_run_id === selectedRunId,
		)
		if (
			!selectedInstruction ||
			failedReviews.length > 0 ||
			selectedRun?.spec_version_id !== latestSpecVersionId
		) return

		setApplying(true)
		setFixProgress(null)
		setError(null)
		let appliedCount = 0
		const appliedFields = new Set<string>()
		const appliedSummaries: string[] = []
		try {
			const toFindings = (sourceReviews: JudgeReview[], judgeNames?: string[]) =>
				sourceReviews
					.filter(
						(review) =>
							review.status === 'completed' &&
							review.result.data.issue &&
							(!judgeNames || judgeNames.includes(review.judge_name)),
					)
					.map((review) => {
						if (review.status !== 'completed') throw new Error('Invalid review')
						return {
							judge: review.judge_name,
							issue: review.result.data.issue,
							reasoning: review.result.data.reasoning,
							suggestion: review.result.data.suggestion,
							severity: review.result.data.severity,
						}
					})

			async function applyOne(
				instruction: string,
				findings: ReturnType<typeof toFindings>,
				label: string,
				round: number,
				total: number,
			) {
				setFixProgress({ current: round, total, label: `Đang sửa ${label}` })
				const generated = await api.generate(
					projectId,
					'judge_resolution',
					JSON.stringify({
						selected_fix: instruction,
						fix_all: false,
						judge_findings: findings,
					}),
				)
				const preview = generated.preview as {
					change_summary?: string
					updated_fields?: Record<string, unknown>
				}
				const updatedFields = preview.updated_fields ?? {}
				const fieldNames = Object.keys(updatedFields)
				if (fieldNames.length === 0) {
					throw new Error(`AI chưa tạo được thay đổi cho ${label}.`)
				}
				const confirmedFields = Object.fromEntries(
					Object.entries(updatedFields).map(([field, value]) => [
						field,
						{
							value,
							status: 'CONFIRMED',
							source: 'user+ai:judge_resolution',
						},
					]),
				)
				const summary = preview.change_summary || `Áp dụng đề xuất từ ${label}`
				await api.confirm(
					projectId,
					'judge',
					confirmedFields,
					`Sửa vòng ${round}/${total} – ${label}: ${summary}`,
				)
				appliedCount += 1
				fieldNames.forEach((field) => appliedFields.add(field))
				appliedSummaries.push(summary)
				return summary
			}

			if (option.id === 'AUTO') {
				const severityRank: Record<string, number> = {
					CRITICAL: 3,
					MAJOR: 2,
					MINOR: 1,
				}
				let latestReviews = reviews ?? []
				let resolved = false
				for (let round = 1; round <= 5; round += 1) {
					const findings = toFindings(latestReviews).sort(
						(a, b) =>
							(severityRank[b.severity ?? ''] ?? 0) -
							(severityRank[a.severity ?? ''] ?? 0),
					)
					if (findings.length === 0) {
						resolved = true
						break
					}
					const finding = findings[0]
					const label = JUDGE_LABELS[finding.judge]?.label ?? finding.judge
					await applyOne(
						`Vấn đề: ${finding.issue}. Lập luận: ${finding.reasoning}. Yêu cầu sửa: ${finding.suggestion}.`,
						[finding],
						label,
						round,
						5,
					)
					setFixProgress({ current: round, total: 5, label: 'Đang chạy lại 5 Judge' })
					const judged = await api.runJudge(projectId)
					latestReviews = judged.reviews
					setReviews(latestReviews)
					const failedCount = latestReviews.filter(
						(review) => review.status === 'failed',
					).length
					if (failedCount > 0) {
						throw new Error(`${failedCount}/5 Judge không hoàn tất sau vòng ${round}.`)
					}
					if (toFindings(latestReviews).length === 0) {
						resolved = true
						break
					}
				}

				if (resolved) {
			setAppliedFix({
						summary: `Đã tự động sửa ${appliedCount} vòng và kết quả đánh giá mới không còn vấn đề.`,
						fields: Array.from(appliedFields),
			})
			setNeedsReevaluation(true)
					setResolutionOptions([])
				} else {
					setAppliedFix(null)
					setResolutionOptions(buildResolutionOptions(latestReviews))
					setError(
						'Đã đạt giới hạn 5 vòng nhưng Judge vẫn còn phát hiện vấn đề. Các phiên bản đã được lưu; bạn có thể chọn sửa thủ công hoặc chạy tự động thêm một lượt.',
					)
				}
			} else {
				const judgeFindings = toFindings(
					reviews ?? [],
					option.id === 'Other' ? [] : option.judgeNames,
				)
				await applyOne(
					selectedInstruction,
					judgeFindings,
					option.id === 'Other' ? 'hướng sửa tự nhập' : option.label.split(':')[0],
					1,
					1,
				)
				setAppliedFix({ summary: appliedSummaries[0], fields: Array.from(appliedFields) })
				setNeedsReevaluation(true)
				setResolutionOptions([])
			}
			setSelectedOption('')
			setCustomOption('')
			try {
				await onSpecUpdated()
			} catch {
				setError(
					'Spec đã được sửa đổi và lưu, nhưng chưa thể tải lại dữ liệu mới. Bạn có thể tải lại trang trước khi đánh giá lại.',
				)
			}
		} catch (e: any) {
			if (appliedCount > 0) {
				setAppliedFix({
					summary: `Đã lưu ${appliedCount} lần sửa trước khi dừng. Hãy chạy đánh giá lại để tiếp tục với spec mới nhất.`,
					fields: Array.from(appliedFields),
				})
				setNeedsReevaluation(true)
				setResolutionOptions([])
			}
			setError(
				`${e.message ?? 'Không áp dụng được sửa đổi vào spec'}${appliedCount > 0 ? ` (${appliedCount} lần sửa trước đó đã được lưu vào lịch sử.)` : ''}`,
			)
			if (appliedCount > 0) {
				await Promise.resolve(onSpecUpdated()).catch(() => undefined)
			}
		} finally {
			setFixProgress(null)
			setApplying(false)
		}
	}

	function requestApplyFix(option?: ResolutionOption) {
		const selected =
			option ??
			(selectedOption === 'Other' && customOption.trim()
				? {
						id: 'Other',
						label: `Sửa theo hướng tự nhập: ${customOption.trim()}`,
						instruction: customOption.trim(),
						judgeNames: [],
					}
				: resolutionOptions.find((item) => item.id === selectedOption))
		if (!selected) return
		setSelectedOption(selected.id)
		setPendingFixOption(selected)
	}

	async function handleFinalize() {
		setSaving(true)
		setError(null)
		try {
			await api.confirm(
				projectId,
				'judge_resolution',
				{},
				appliedFix
					? `Người dùng chấp nhận bản sửa mà không đánh giá lại: ${appliedFix.summary}`
					: issues.length > 0
						? 'Người dùng đã xem kết quả của tất cả Judge và chọn không áp dụng sửa đổi.'
						: 'Tất cả Judge đã hoàn tất và không phát hiện vấn đề.',
			)
			onConfirmed()
		} catch (e: any) {
			setError(e.message)
		} finally {
			setSaving(false)
		}
	}

	const completedReviews =
		reviews?.filter((review) => review.status === 'completed') ?? []
	const failedReviews =
		reviews?.filter((review) => review.status === 'failed') ?? []
	const issues = completedReviews
		.map((review) => ({ ...review.result.data, judge: review.judge_name }))
		.filter((data) => data.issue)
	const selectedEvaluationRun = evaluationRuns.find(
		(run) => run.evaluation_run_id === selectedRunId,
	)
	const viewingHistoricalRun = Boolean(
		selectedEvaluationRun &&
		selectedEvaluationRun.spec_version_id !== latestSpecVersionId,
	)

	return (
		<div className="space-y-1">
			<h1 className="text-xl font-semibold text-slate-900">
				4. Judge độc lập &amp; Xác nhận bản cuối
			</h1>
			<p className="mb-5 text-sm text-slate-500">
				Spec tạm thời được phản biện bởi nhiều judge độc lập trước khi
				người dùng quyết định sửa hay chốt bản cuối.
			</p>

			<div className="grid grid-cols-1 gap-5 lg:grid-cols-[240px_1fr_280px]">
				{/* CỘT 1: SPEC TẠM THỜI (Giữ nguyên) */}
				<Card className="h-fit">
					{/* ... Nội dung cột 1 giữ nguyên như cũ ... */}
					<CardHeader className="pb-3">
						<CardTitle className="text-sm flex items-center gap-2">
							<ListChecks className="h-4 w-4 text-slate-500" />{' '}
							Spec {selectedEvaluationRun ? `v${selectedEvaluationRun.version_number}` : 'tạm thời'}
						</CardTitle>
					</CardHeader>
					<CardContent className="space-y-1.5">
						{SPEC_SECTIONS.map((section, i) => (
							<button
								type="button"
								key={section.title}
								onClick={() => setSelectedSpecSection(section)}
								className="group flex w-full items-center justify-between rounded-md border border-transparent p-2 text-left hover:border-slate-100 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
							>
								<div className="flex items-center gap-2 text-xs font-medium text-slate-700">
									<span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-[10px] text-slate-500">
										{i + 1}
									</span>
									{section.title}
								</div>
								<Eye className="h-3.5 w-3.5 text-slate-300 opacity-0 group-hover:opacity-100" />
							</button>
						))}
					</CardContent>
				</Card>

				{/* CỘT 2: PANEL JUDGE & TỔNG HỢP (Giữ nguyên) */}
				<div className="space-y-5">
					{/* ... Nội dung cột 2 giữ nguyên như bạn đã cung cấp trước đó ... */}
					<Card>
						<CardHeader className="pb-3 flex flex-row items-center justify-between">
							<div>
								<CardTitle className="text-sm flex items-center gap-2">
									<Gavel className="h-4 w-4 text-indigo-600" />{' '}
									Panel Judge độc lập
								</CardTitle>
							</div>
							<Button
								size="sm"
								onClick={handleRunJudges}
								disabled={loading || applying || saving || loadingHistory}
							>
								{loading ? (
									<Loader2 className="h-4 w-4 animate-spin mr-1" />
								) : (
									viewingHistoricalRun ? 'Đánh giá bản mới nhất' : 'Chạy đánh giá'
								)}
							</Button>
						</CardHeader>
						<CardContent>
							<div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
								<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
									<div>
										<p className="text-xs font-semibold text-slate-700">Lịch sử đánh giá theo phiên bản</p>
										<p className="text-[11px] text-slate-500">Mỗi lựa chọn là một lượt Judge trên một snapshot Spec.</p>
									</div>
									<select
										className="h-9 min-w-0 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700 sm:w-[360px]"
										value={selectedRunId ?? ''}
										disabled={loadingHistory || evaluationRuns.length === 0 || loading || applying}
										onChange={(event) => {
											const run = evaluationRuns.find(
												(item) => item.evaluation_run_id === event.target.value,
											)
											if (run) displayEvaluationRun(run)
										}}
									>
										{evaluationRuns.length === 0 && (
											<option value="">Chưa có lượt đánh giá</option>
										)}
										{evaluationRuns.map((run, index) => {
											const issueCount = run.reviews.filter(
												(review) => review.status === 'completed' && review.result.data.issue,
											).length
											return (
												<option key={run.evaluation_run_id} value={run.evaluation_run_id}>
													v{run.version_number}{index === 0 ? ' · mới nhất' : ''} · {issueCount} vấn đề · {new Date(run.created_at).toLocaleString('vi-VN')}
												</option>
											)
										})}
									</select>
								</div>
								{viewingHistoricalRun && (
									<p className="mt-2 text-[11px] font-medium text-amber-700">
										Bạn đang xem kết quả của Spec v{selectedEvaluationRun?.version_number}. Đây là lịch sử chỉ đọc; chỉ phiên bản mới nhất mới được áp dụng sửa đổi.
									</p>
								)}
							</div>
							{error && (
								<div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
									<AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
									<div>
										<p className="font-semibold">
											{reviews ? 'Đánh giá hoàn tất một phần' : 'Không thể chạy đánh giá'}
										</p>
										<p className="mt-0.5">{error}</p>
									</div>
								</div>
							)}

							{!reviews && (
								<div className="space-y-3">
									<div className="flex items-center justify-between gap-3">
										<div>
											<p className="text-sm font-semibold text-slate-800">
												Các judge sẽ đánh giá
											</p>
											<p className="mt-0.5 text-xs text-slate-500">
												5 judge hoạt động độc lập và chạy song song trên cùng một spec.
											</p>
										</div>
										<Badge variant="outline">5 judge</Badge>
									</div>

									<div className="grid gap-2 sm:grid-cols-2">
										{JUDGE_NAMES.map((judgeName, index) => {
											const judge = JUDGE_LABELS[judgeName]
											return (
												<div
													key={judgeName}
													className="rounded-lg border border-slate-200 bg-slate-50 p-3"
												>
													<div className="flex items-center gap-2">
														<span className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-sm shadow-sm">
															{loading ? (
																<Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-600" />
															) : (
																judge.icon
															)}
														</span>
														<div>
															<p className="text-xs font-semibold text-slate-800">
																{index + 1}. {judge.label}
															</p>
															{loading && (
																<p className="text-[11px] text-indigo-600">Đang đánh giá...</p>
															)}
														</div>
													</div>
													<p className="mt-2 text-xs leading-relaxed text-slate-600">
														{judge.criteria}
													</p>
												</div>
											)
										})}
									</div>
								</div>
							)}

							{reviews && (
								<div className="space-y-4">
									<div className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 p-3">
										<div>
											<p className="text-sm font-semibold text-slate-800">
												Kết quả phản biện
											</p>
											<p className="text-xs text-slate-500">
												Hoàn tất {completedReviews.length}/5 judge độc lập
												{failedReviews.length > 0
													? `; ${failedReviews.length} judge cần chạy lại.`
													: '.'}
											</p>
										</div>
										<Badge variant={issues.length > 0 ? 'destructive' : 'outline'}>
											{issues.length > 0
												? `${issues.length} vấn đề`
												: 'Không có vấn đề'}
										</Badge>
									</div>

									{reviews.map((review, index) => {
										const judge = JUDGE_LABELS[review.judge_name] ?? {
											label: review.judge_name,
											icon: '⚖️',
													criteria: '',
												}
										if (review.status === 'failed') {
											return (
												<section
													key={review.judge_name}
													className="overflow-hidden rounded-xl border border-red-200 bg-white"
												>
													<div className="flex items-start justify-between gap-3 border-b border-red-100 bg-red-50 p-3">
														<div className="flex items-start gap-2.5">
															<span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white shadow-sm">
																{judge.icon}
															</span>
															<div>
																<h3 className="text-sm font-semibold text-slate-900">
																	{index + 1}. {judge.label}
																</h3>
																<p className="mt-0.5 text-xs text-slate-500">
																	{judge.criteria}
																</p>
															</div>
														</div>
														<Badge variant="destructive">Thất bại</Badge>
													</div>
													<div className="p-4 text-xs leading-relaxed text-red-700">
														<p className="font-semibold">Không nhận được phán xét</p>
														<p className="mt-1">{review.error}</p>
														<p className="mt-2 text-slate-500">
															Kết quả này không được tính là đạt và không ảnh hưởng đến các judge khác.
														</p>
													</div>
												</section>
											)
										}
										const result = review.result.data
										const hasIssue = Boolean(result.issue)

										return (
											<section
												key={review.judge_name}
												className="overflow-hidden rounded-xl border border-slate-200 bg-white"
											>
												<div className="flex items-start justify-between gap-3 border-b border-slate-100 bg-slate-50 p-3">
													<div className="flex items-start gap-2.5">
														<span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white shadow-sm">
															{judge.icon}
														</span>
														<div>
															<h3 className="text-sm font-semibold text-slate-900">
																{index + 1}. {judge.label}
															</h3>
															<p className="mt-0.5 text-xs leading-relaxed text-slate-500">
																{judge.criteria}
															</p>
														</div>
													</div>
													{hasIssue && result.severity ? (
														<Badge
															variant="outline"
															className={SEVERITY_STYLES[result.severity]}
														>
															{result.severity}
														</Badge>
													) : (
														<Badge className="border-emerald-200 bg-emerald-50 text-emerald-700" variant="outline">
															Đạt
														</Badge>
													)}
												</div>

												<div className="space-y-3 p-4 text-xs leading-relaxed">
													<div>
														<p className="font-semibold text-slate-700">
															{hasIssue ? 'Vấn đề phát hiện' : 'Kết luận'}
														</p>
														<p className={hasIssue ? 'mt-1 text-red-700' : 'mt-1 text-emerald-700'}>
															{result.issue || 'Không phát hiện vấn đề trong phạm vi đánh giá.'}
														</p>
													</div>
													<div>
														<p className="font-semibold text-slate-700">Lập luận</p>
														<p className="mt-1 text-slate-600">
															{result.reasoning || 'Judge không cung cấp thêm lập luận.'}
														</p>
													</div>
													{result.suggestion && (
														<div className="rounded-lg border border-indigo-100 bg-indigo-50 p-3">
															<p className="font-semibold text-indigo-800">Đề xuất khắc phục</p>
															<p className="mt-1 text-indigo-700">{result.suggestion}</p>
														</div>
													)}
												</div>
											</section>
										)
									})}
								</div>
							)}
						</CardContent>
					</Card>
				</div>

				{/* CỘT 3: LỰA CHỌN CỦA USER (Đã map động) */}
				<Card className="h-fit flex flex-col">
					<CardHeader className="pb-3">
						<CardTitle className="text-sm">
							Lựa chọn của người dùng
						</CardTitle>
					</CardHeader>
					<CardContent className="space-y-4">
						{viewingHistoricalRun && (
							<div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
								Kết quả lịch sử chỉ để đối chiếu. Hãy chọn lượt đánh giá của phiên bản mới nhất để sửa hoặc chốt Spec.
							</div>
						)}
						{applying && (
							<div className="space-y-1 text-xs text-indigo-600 mb-2">
								<div className="flex items-center gap-2">
									<Loader2 className="h-3.5 w-3.5 animate-spin" />{' '}
									{fixProgress
										? `Đang sửa ${fixProgress.current}/${fixProgress.total}: ${fixProgress.label}`
										: 'Đang chuẩn bị sửa spec...'}
								</div>
								{fixProgress && (
									<div className="h-1.5 overflow-hidden rounded-full bg-indigo-100">
										<div
											className="h-full bg-indigo-500 transition-all"
											style={{ width: `${(fixProgress.current / fixProgress.total) * 100}%` }}
										/>
									</div>
								)}
							</div>
						)}

						{!applying && !appliedFix && resolutionOptions.length > 0 && (
							<div className="space-y-2">
								{resolutionOptions.map((opt) => (
									<Button
										key={opt.id}
										variant={
											selectedOption === opt.id
												? 'default'
												: 'outline'
										}
									className="w-full justify-start text-xs h-auto py-2 whitespace-normal text-left"
									onClick={() => requestApplyFix(opt)}
									disabled={opt.id === 'AUTO' || applying}
								>
									<span className="font-bold mr-2">
										{opt.id === 'AUTO' ? '—' : `${opt.id}.`}
										</span>{' '}
										{opt.label}
									</Button>
								))}

								<div className="pt-1">
									<Button
										variant={
											selectedOption === 'Other'
												? 'default'
												: 'outline'
										}
										className="w-full justify-start text-xs h-auto py-2 mb-1"
										onClick={() =>
											setSelectedOption('Other')
										}
									>
										<span className="font-bold mr-2">
											{String.fromCharCode(65 + resolutionOptions.filter((option) => option.id !== 'AUTO').length)}.
										</span>{' '}
										Other (Tự nhập hướng sửa)
									</Button>

									{selectedOption === 'Other' && (
										<div>
											<Input
												className="text-xs h-8"
												placeholder="VD: Không đổi claim, chỉ thêm..."
												value={customOption}
												onChange={(e) =>
													setCustomOption(
														e.target.value,
													)
												}
											/>
										</div>
									)}
								</div>

								{selectedOption === 'Other' && (
									<Button
										className="w-full"
										onClick={() => requestApplyFix()}
										disabled={!customOption.trim() || applying}
									>
										Xem và xác nhận hướng sửa
									</Button>
								)}
								<Button
									variant="outline"
									className="w-full"
									onClick={handleFinalize}
									disabled={applying || saving}
								>
									{saving ? 'Đang lưu...' : 'Không sửa, xuất Spec cuối'}
								</Button>
							</div>
						)}

						{!reviews && !applying && !needsReevaluation && (
							<p className="text-xs text-slate-400">
								Chạy đánh giá để AI đề xuất hướng sửa đổi.
							</p>
						)}

						{needsReevaluation && !applying && !loading && !appliedFix && (
							<div className="space-y-3 rounded-lg border border-indigo-200 bg-indigo-50 p-3">
								<p className="flex items-center gap-1 text-xs font-semibold text-indigo-800">
									<CheckCircle2 className="h-4 w-4" /> Spec đã được sửa đổi
								</p>
								<p className="text-xs leading-relaxed text-indigo-700">
									Phiên bản Spec mới nhất chưa được Judge đánh giá. Hãy chạy lại đánh giá để kiểm tra kết quả sau khi sửa.
								</p>
								<Button
									className="w-full"
									size="sm"
									onClick={() => void handleRunJudges()}
									disabled={saving}
								>
									Chạy lại đánh giá
								</Button>
								<Button
									variant="outline"
									className="w-full"
									size="sm"
									onClick={handleFinalize}
									disabled={saving}
								>
									{saving ? 'Đang lưu...' : 'Không đánh giá lại, xuất Spec cuối'}
								</Button>
							</div>
						)}

						{appliedFix && (
							<div className="space-y-3 rounded-lg border border-indigo-200 bg-indigo-50 p-3">
								<p className="flex items-center gap-1 text-xs font-semibold text-indigo-800">
									<CheckCircle2 className="h-4 w-4" /> Spec đã được sửa đổi
								</p>
								<p className="text-xs leading-relaxed text-indigo-700">
									{appliedFix.summary}
								</p>
								<p className="text-[11px] text-indigo-600">
									Field đã sửa: {appliedFix.fields.join(', ')}
								</p>
								<p className="text-xs font-medium text-slate-700">
									Bạn có thể chạy đánh giá lại trên phiên bản mới nếu muốn.
								</p>
								<Button
									className="w-full"
									size="sm"
									onClick={() => void handleRunJudges()}
									disabled={loading || saving}
								>
									{loading ? (
										<Loader2 className="h-4 w-4 animate-spin" />
									) : null}
									Chạy lại đánh giá
								</Button>
								<Button
									variant="outline"
									className="w-full"
									size="sm"
									onClick={handleFinalize}
									disabled={loading || saving}
								>
									{saving ? 'Đang lưu...' : 'Không, xuất Spec cuối'}
								</Button>
							</div>
						)}

						{!appliedFix &&
							reviews &&
							failedReviews.length === 0 &&
							issues.length === 0 && (
								<div className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
									<p className="flex items-center gap-1 text-xs font-semibold text-emerald-800">
										<CheckCircle2 className="h-4 w-4" /> Không có vấn đề cần sửa
									</p>
									<Button
										className="mt-2 w-full bg-emerald-600 text-white hover:bg-emerald-700"
										size="sm"
										onClick={handleFinalize}
										disabled={saving}
									>
										{saving ? 'Đang lưu...' : 'Xác nhận & Xuất Spec cuối'}
									</Button>
								</div>
							)}
					</CardContent>
				</Card>
			</div>

			{pendingFixOption && (
				<div
					className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm"
					onMouseDown={(event) => {
						if (event.target === event.currentTarget) setPendingFixOption(null)
					}}
				>
					<div
						role="dialog"
						aria-modal="true"
						aria-labelledby="judge-fix-confirm-title"
						className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl"
					>
						<div className="flex items-start gap-3">
							<div className="rounded-full bg-indigo-100 p-2 text-indigo-700">
								<Gavel className="h-5 w-5" />
							</div>
							<div className="min-w-0">
								<h2
									id="judge-fix-confirm-title"
									className="font-semibold text-slate-900"
								>
									Xác nhận sửa Spec
								</h2>
								<p className="mt-1 text-sm text-slate-600">
									AI sẽ sửa Spec theo lựa chọn sau:
								</p>
								<p className="mt-3 max-h-48 overflow-y-auto rounded-lg border border-indigo-100 bg-indigo-50 p-3 text-sm leading-relaxed text-indigo-900">
									{pendingFixOption.label}
								</p>
								<p className="mt-2 text-xs text-slate-500">
									{pendingFixOption.id === 'AUTO'
										? 'Hệ thống sẽ ưu tiên vấn đề nghiêm trọng nhất, lưu một phiên bản, chạy lại đủ 5 Judge và lặp tối đa 5 vòng. Quy trình có thể mất vài phút.'
										: 'Sau khi sửa xong, hệ thống sẽ lưu phiên bản Spec mới và cho phép bạn chạy đánh giá lại.'}
								</p>
							</div>
						</div>
						<div className="mt-5 flex justify-end gap-2">
							<Button
								variant="outline"
								onClick={() => setPendingFixOption(null)}
							>
								Hủy
							</Button>
							<Button
								onClick={() => {
									const option = pendingFixOption
									setPendingFixOption(null)
									void handleApplyFix(option)
								}}
							>
								{pendingFixOption.id === 'AUTO' ? 'Bắt đầu tự động' : 'Xác nhận sửa'}
							</Button>
						</div>
					</div>
				</div>
			)}

			{selectedSpecSection && (
				<div
					className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm"
					onMouseDown={(event) => {
						if (event.target === event.currentTarget) setSelectedSpecSection(null)
					}}
				>
					<div
						role="dialog"
						aria-modal="true"
						aria-labelledby="judge-spec-section-title"
						className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
					>
						<div className="flex items-center justify-between gap-4 border-b border-slate-200 p-5">
							<div className="flex items-center gap-3">
								<div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700">
									<FileText className="h-5 w-5" />
								</div>
								<div>
									<h2
										id="judge-spec-section-title"
										className="font-semibold text-slate-900"
									>
										{selectedSpecSection.title}
									</h2>
									<p className="text-sm text-slate-500">
										Nội dung Markdown trong spec tạm thời
									</p>
								</div>
							</div>
							<button
								type="button"
								aria-label="Đóng"
								onClick={() => setSelectedSpecSection(null)}
								className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
							>
								<X className="h-5 w-5" />
							</button>
						</div>

						<div className="flex-1 overflow-y-auto bg-slate-50 p-5">
							<pre className="whitespace-pre-wrap rounded-xl border border-slate-200 bg-white p-5 font-mono text-xs leading-relaxed text-slate-700">
								{sectionToMarkdown(evaluationSpec, selectedSpecSection)}
							</pre>
						</div>

						<div className="flex justify-end border-t border-slate-200 p-4">
							<Button variant="outline" onClick={() => setSelectedSpecSection(null)}>
								Đóng
							</Button>
						</div>
					</div>
				</div>
			)}
		</div>
	)
}
