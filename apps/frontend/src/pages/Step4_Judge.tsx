import { useState } from 'react'
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
import type { JudgeReview, ResearchSpec } from '@/lib/types'
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
}

export function Step4_Judge({
	projectId,
	spec,
	onConfirmed,
}: {
	projectId: string
	spec: ResearchSpec
	onConfirmed: () => void
}) {
	const [reviews, setReviews] = useState<JudgeReview[] | null>(null)

	// State mới cho luồng Resolution
	const [resolutionOptions, setResolutionOptions] = useState<
		ResolutionOption[]
	>([])
	const [resolving, setResolving] = useState(false)

	const [loading, setLoading] = useState(false)
	const [saving, setSaving] = useState(false)
	const [error, setError] = useState<string | null>(null)

	const [selectedOption, setSelectedOption] = useState<string>('')
	const [customOption, setCustomOption] = useState('')
	const [selectedSpecSection, setSelectedSpecSection] =
		useState<SpecSection | null>(null)

	async function handleRunJudges() {
		setLoading(true)
		setError(null)
		try {
			// Bước 1: Chạy Judge
			const res = await api.runJudge(projectId)
			setReviews(res.reviews)

			// Bước 2: Tự động gom lỗi và sinh options đề xuất sửa
			const issues = res.reviews
				.map((r) => r.result.data.issue)
				.filter(Boolean)
			if (issues.length > 0) {
				await generateResolutionOptions(
					`Dựa vào các lỗi sau, hãy đề xuất hướng sửa: ${issues.join(' | ')}`,
				)
			} else {
				// Nếu không có lỗi, cho chốt luôn
				setResolutionOptions([
					{ id: 'A', label: 'Spec đã ổn, giữ nguyên và chốt.' },
				])
			}
		} catch (e: any) {
			setError(e.message ?? 'Lỗi khi chạy đánh giá')
		} finally {
			setLoading(false)
		}
	}

	// Hàm gọi AI để sinh option (dùng khi chạy tự động hoặc khi user nhập "Other")
	async function generateResolutionOptions(instruction: string) {
		setResolving(true)
		try {
			const res = await api.generate(
				projectId,
				'judge_resolution',
				instruction,
			)
			setResolutionOptions((res.preview as any).resolution_options || [])
		} catch (e: any) {
			setError(e.message)
		} finally {
			setResolving(false)
		}
	}

	async function handleCustomOptionSubmit() {
		if (!customOption.trim()) return
		await generateResolutionOptions(
			`Bỏ qua các đề xuất trước. Đề xuất lại hướng sửa đổi chi tiết theo ý này: ${customOption}`,
		)
	}

	async function handleConfirm() {
		setSaving(true)
		try {
			const decisionLabel =
				selectedOption === 'Other'
					? customOption
					: resolutionOptions.find((o) => o.id === selectedOption)
							?.label

			await api.confirm(
				projectId,
				'judge_resolution',
				{},
				`Quyết định sau Judge: ${decisionLabel || 'Không rõ'}`,
			)
			onConfirmed()
		} catch (e: any) {
			setError(e.message)
		} finally {
			setSaving(false)
		}
	}

	const issues =
		reviews
			?.map((r) => ({ ...r.result.data, judge: r.judge_name }))
			.filter((d) => d.issue) || []

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
							Spec tạm thời
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
								disabled={loading}
							>
								{loading ? (
									<Loader2 className="h-4 w-4 animate-spin mr-1" />
								) : (
									'Chạy đánh giá'
								)}
							</Button>
						</CardHeader>
						<CardContent>
							{error && (
								<div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
									<AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
									<div>
										<p className="font-semibold">Không thể chạy đánh giá</p>
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
												Đã nhận kết quả từ {reviews.length} judge độc lập.
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
						{resolving && (
							<div className="flex items-center text-xs text-indigo-600 gap-2 mb-2">
								<Loader2 className="h-3.5 w-3.5 animate-spin" />{' '}
								Đang tổng hợp giải pháp...
							</div>
						)}

						{!resolving && resolutionOptions.length > 0 && (
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
										onClick={() =>
											setSelectedOption(opt.id)
										}
									>
										<span className="font-bold mr-2">
											{opt.id}.
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
											E.
										</span>{' '}
										Other (Tự nhập hướng sửa)
									</Button>

									{selectedOption === 'Other' && (
										<div className="flex gap-1">
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
											<Button
												size="sm"
												className="h-8 text-xs"
												onClick={
													handleCustomOptionSubmit
												}
												disabled={
													!customOption.trim() ||
													resolving
												}
											>
												Hỏi AI
											</Button>
										</div>
									)}
								</div>
							</div>
						)}

						{!resolving && resolutionOptions.length === 0 && (
							<p className="text-xs text-slate-400">
								Chạy đánh giá để AI đề xuất hướng sửa đổi.
							</p>
						)}

						<div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 space-y-2 mt-4">
							<p className="text-xs font-semibold text-emerald-800 flex items-center gap-1">
								<CheckCircle2 className="h-4 w-4" /> Spec cuối
								cùng
							</p>
							<Button
								className="w-full bg-emerald-600 hover:bg-emerald-700 text-white mt-2"
								size="sm"
								onClick={handleConfirm}
								disabled={
									saving ||
									!selectedOption ||
									(selectedOption === 'Other' &&
										!customOption)
								}
							>
								{saving
									? 'Đang lưu...'
									: 'Xác nhận & Xuất Spec cuối'}
							</Button>
						</div>
					</CardContent>
				</Card>
			</div>

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
								{sectionToMarkdown(spec, selectedSpecSection)}
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
