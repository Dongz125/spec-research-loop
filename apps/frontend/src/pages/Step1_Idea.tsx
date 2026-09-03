import { useState } from 'react'
import {
	Sparkles,
	CheckCircle2,
	AlertTriangle,
	HelpCircle,
	Loader2,
} from 'lucide-react'
import { api } from '@/lib/api'
import type { ResearchSpec } from '@/lib/types'
import {
	Card,
	CardHeader,
	CardTitle,
	CardDescription,
	CardContent,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'

// Gợi ý nhanh — bấm vào để chèn thêm từ khoá vào ô nhập ý tưởng
const SUGGESTED_TAGS = [
	'Nghiên cứu AI',
	'Prompt Optimization',
	'Hallucination',
	'Paper Extraction',
	'Evaluation',
	'RAG',
]

interface ConfirmationOption {
	id: 'A' | 'B' | 'C' | 'D'
	label: string
}

interface ConfirmationQuestion {
	id: string
	question: string
	options: ConfirmationOption[]
}

interface InterpreterResult {
	understanding_summary: string
	main_issues: string[]
	detected_keywords: string[]
	research_questions: string[]
	confirmation_questions: ConfirmationQuestion[]
}

interface Props {
	projectId: string
	spec: ResearchSpec
	onConfirmed: () => void
}

export function Step1_Idea({ projectId, spec, onConfirmed }: Props) {
	const savedInterpretation = spec.idea_interpretation?.value as
		| {
				result: InterpreterResult
				answers: Record<string, 'A' | 'B' | 'C' | 'D'>
		  }
		| undefined
	const [idea, setIdea] = useState(
		(spec.problem_statement?.value as string) ?? '',
	)
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [result, setResult] = useState<InterpreterResult | null>(
		savedInterpretation?.result ?? null,
	)
	const [answers, setAnswers] = useState<
		Record<string, 'A' | 'B' | 'C' | 'D'>
	>(savedInterpretation?.answers ?? {})
	const [saving, setSaving] = useState(false)
	const [confirmed, setConfirmed] = useState(
		spec.idea_interpretation?.status === 'CONFIRMED',
	)

	function addTag(tag: string) {
		setIdea((prev) => (prev.trim().length ? `${prev.trim()} ${tag}` : tag))
		setConfirmed(false)
	}

	async function handleAnalyze() {
		if (!idea.trim()) return
		setLoading(true)
		setError(null)
		try {
			const res = await api.generate(projectId, 'idea_capture', idea)
			setResult(res.preview as InterpreterResult)
			setAnswers({})
			setConfirmed(false)
		} catch (e: any) {
			setError(e.message ?? 'Không phân tích được ý tưởng')
		} finally {
			setLoading(false)
		}
	}

	async function handleConfirmAll() {
		if (!result) return
		setSaving(true)
		setError(null)
		try {
			const answerNotes = result.confirmation_questions
				.map((q) => {
					const chosen = answers[q.id]
					const label = q.options.find((o) => o.id === chosen)?.label
					return chosen ? `${q.question} → ${label}` : null
				})
				.filter(Boolean)
				.join('; ')

			await api.confirm(
				projectId,
				'idea_capture',
				{
					problem_statement: {
						value: idea,
						status: 'CONFIRMED',
						source: 'user',
					},
					search_keywords: {
						value: result.detected_keywords ?? [],
						status: 'CONFIRMED',
						source: 'ai:interpreter',
					},
					research_questions: {
						value: result.research_questions ?? [],
						status: 'CONFIRMED',
						source: 'user+ai:interpreter',
					},
					idea_interpretation: {
						value: { result, answers },
						status: 'CONFIRMED',
						source: 'user+ai:interpreter',
					},
				},
				answerNotes || 'Xác nhận ý tưởng ban đầu',
			)
			setConfirmed(true)
			onConfirmed()
		} catch (e: any) {
			setError(e.message ?? 'Không lưu được xác nhận')
		} finally {
			setSaving(false)
		}
	}

	const allAnswered =
		!!result && result.confirmation_questions.every((q) => !!answers[q.id])

	return (
		<div className="space-y-1">
			<h1 className="text-xl font-semibold text-slate-900">
				1. Nhập ý tưởng &amp; làm rõ ban đầu
			</h1>
			<p className="mb-5 text-sm text-slate-500">
				Mô tả ý tưởng nghiên cứu còn mơ hồ của bạn. Hệ thống sẽ diễn
				giải lại và đặt câu hỏi để xác nhận trước khi đi tiếp.
			</p>

			<div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
				{/* ---------- Cột 1: nhập ý tưởng ---------- */}
				<Card>
					<CardHeader>
						<CardTitle>Ý tưởng ban đầu</CardTitle>
						<CardDescription>
							Viết tự do, càng cụ thể càng tốt.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<Textarea
							rows={9}
							placeholder='Vd: "Tôi muốn xây dựng phương pháp tự động tối ưu prompt nhiều vòng để giảm hallucination khi LLM trích xuất thông tin từ paper."'
							value={idea}
							onChange={(e) => {
								setIdea(e.target.value)
								if (e.target.value !== idea) setConfirmed(false)
							}}
						/>

						<div className="mt-3 flex flex-wrap gap-1.5">
							{SUGGESTED_TAGS.map((tag) => (
								<Badge
									key={tag}
									variant="secondary"
									className="cursor-pointer hover:bg-indigo-100"
									onClick={() => addTag(tag)}
								>
									{tag}
								</Badge>
							))}
						</div>

						<Button
							className="mt-4 w-full"
							onClick={handleAnalyze}
							disabled={loading || !idea.trim()}
						>
							{loading ? (
								<>
									<Loader2 className="h-4 w-4 animate-spin" />{' '}
									Đang phân tích...
								</>
							) : (
								<>
									<Sparkles className="h-4 w-4" /> Phân tích ý
									tưởng
								</>
							)}
						</Button>

						{error && (
							<p className="mt-2 text-xs font-medium text-red-600">
								{error}
							</p>
						)}
					</CardContent>
				</Card>

				{/* ---------- Cột 2: cách hệ thống hiểu ---------- */}
				<Card>
					<CardHeader>
						<CardTitle>Cách hệ thống đang hiểu</CardTitle>
						<CardDescription>
							Kiểm tra lại trước khi trả lời câu hỏi bên phải.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-3">
						{!result && (
							<p className="text-sm text-slate-400">
								Kết quả phân tích sẽ hiện ở đây sau khi bạn bấm
								"Phân tích ý tưởng".
							</p>
						)}

						{result && (
							<>
								<Alert variant="success">
									<AlertTitle>
										<CheckCircle2 className="h-4 w-4" /> Tóm
										tắt hiểu ý
									</AlertTitle>
									<AlertDescription>
										{result.understanding_summary}
									</AlertDescription>
								</Alert>

								<Alert variant="warning">
									<AlertTitle>
										<AlertTriangle className="h-4 w-4" />{' '}
										Vấn đề chính
									</AlertTitle>
									<AlertDescription>
										<ul className="list-disc space-y-1 pl-4">
											{result.main_issues.map(
												(issue, i) => (
													<li key={i}>{issue}</li>
												),
											)}
										</ul>
									</AlertDescription>
								</Alert>

								{result.detected_keywords?.length > 0 && (
									<div className="flex flex-wrap gap-1.5 pt-1">
										{result.detected_keywords.map((k) => (
											<Badge key={k} variant="outline">
												{k}
											</Badge>
										))}
									</div>
								)}

								{result.research_questions?.length > 0 && (
									<div className="rounded-lg border border-indigo-100 bg-indigo-50/50 p-3">
										<p className="mb-1.5 text-xs font-semibold text-indigo-700">
											Câu hỏi nghiên cứu đề xuất
										</p>
										<ul className="list-disc space-y-1 pl-4 text-xs text-slate-700">
											{result.research_questions.map((question, index) => (
												<li key={`${index}-${question}`}>{question}</li>
											))}
										</ul>
									</div>
								)}
							</>
						)}
					</CardContent>
				</Card>

				{/* ---------- Cột 3: câu hỏi xác nhận ---------- */}
				<div className="space-y-4">
					<div className="flex items-center gap-1.5 px-1">
						<HelpCircle className="h-4 w-4 text-indigo-600" />
						<h2 className="text-sm font-semibold text-slate-700">
							Câu hỏi cần xác nhận
						</h2>
					</div>

					{!result && (
						<Card>
							<CardContent className="pt-5 text-sm text-slate-400">
								Câu hỏi được AI sinh ra sau khi phân tích ý
								tưởng của bạn.
							</CardContent>
						</Card>
					)}

					{result?.confirmation_questions.map((q, i) => (
						<Card key={q.id}>
							<CardHeader className="pb-2">
								<CardTitle className="text-sm font-medium leading-snug">
									{i + 1}. {q.question}
								</CardTitle>
							</CardHeader>
							<CardContent>
								<div className="grid grid-cols-2 gap-2">
									{q.options.map((opt) => {
										const selected =
											answers[q.id] === opt.id
										return (
											<Button
												key={opt.id}
												variant={
													selected
														? 'default'
														: 'outline'
												}
												size="sm"
												className="h-auto justify-start whitespace-normal py-2 text-left text-xs"
											onClick={() => {
												setAnswers((prev) => ({
													...prev,
													[q.id]: opt.id,
												}))
												if (!selected) setConfirmed(false)
											}}
											>
												<span className="font-mono">
													{opt.id}.
												</span>{' '}
												{opt.label}
											</Button>
										)
									})}
								</div>
							</CardContent>
						</Card>
					))}

					{result && (
						<Button
							className={
								confirmed
									? 'w-full bg-slate-200 text-slate-500 hover:bg-slate-200 disabled:opacity-100'
									: 'w-full'
							}
							onClick={handleConfirmAll}
							disabled={!allAnswered || saving || confirmed}
						>
							{saving ? (
								'Đang lưu...'
							) : confirmed ? (
								<>
									<CheckCircle2 className="h-4 w-4" /> Đã xác
									nhận &amp; lưu ý tưởng
								</>
							) : (
								'Xác nhận & lưu ý tưởng'
							)}
						</Button>
					)}
				</div>
			</div>
		</div>
	)
}
