import { useState } from 'react'
import {
	Gavel,
	AlertTriangle,
	CheckCircle2,
	Eye,
	Loader2,
	ListChecks,
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

const JUDGE_LABELS: Record<string, { label: string; icon: string }> = {
	gap_judge: { label: 'Gap Judge', icon: '🎯' },
	contribution_judge: { label: 'Contribution', icon: '⭐' },
	experiment_judge: { label: 'Experiment', icon: '🧪' },
	evidence_judge: { label: 'Evidence', icon: '🔍' },
	conference_readiness_judge: { label: 'Readiness', icon: '🏆' },
}

const SPEC_SECTIONS = [
	'Problem Statement',
	'Research Gap',
	'Contributions',
	'Claim-Evidence Matrix',
	'Experimental Protocol',
	'Compute Budget',
]

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
						{SPEC_SECTIONS.map((sec, i) => (
							<div
								key={i}
								className="flex items-center justify-between p-2 hover:bg-slate-50 rounded-md group cursor-pointer border border-transparent hover:border-slate-100"
							>
								<div className="flex items-center gap-2 text-xs font-medium text-slate-700">
									<span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-[10px] text-slate-500">
										{i + 1}
									</span>
									{sec}
								</div>
								<Eye className="h-3.5 w-3.5 text-slate-300 opacity-0 group-hover:opacity-100" />
							</div>
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
							{/* Render danh sách judge và issue y như bản trước */}
							{error && (
								<p className="text-xs text-red-500 mb-4">
									{error}
								</p>
							)}
							{!reviews && !loading && (
								<div className="text-center py-6 text-sm text-slate-400">
									Bấm "Chạy đánh giá" để xem phản biện.
								</div>
							)}
							{/* (Bỏ qua đoạn map judge icons và issue list để tránh code quá dài, bạn copy nguyên từ bản trước vào đây) */}
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
		</div>
	)
}
