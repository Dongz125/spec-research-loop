import { useState } from 'react'
import {
	Search,
	Loader2,
	Lightbulb,
	X,
	ShieldAlert,
	Sparkles,
	Check,
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
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import {
	Table,
	TableHeader,
	TableBody,
	TableRow,
	TableHead,
	TableCell,
} from '@/components/ui/table'

const SOURCE_FILTERS = [
	{ id: 'peer_reviewed', label: 'Paper peer-reviewed' },
	{ id: 'proceedings', label: 'Proceedings chính thức' },
	{ id: 'author_material', label: 'Tài liệu tác giả' },
	{ id: 'survey', label: 'Survey có nguồn rõ ràng' },
]

interface RelatedWorkRow {
	id: string
	title: string
	year?: number
	did_what: string
	gap_note: string
	verified: boolean
}

interface RelatedWorkResult {
	related_work_matrix: RelatedWorkRow[]
	search_keywords_used: string[]
}

interface GapCandidate {
	id: string
	text: string
	evidence_source_ids: string[]
}

interface GapOption {
	id: string
	label: string
	explanation?: string
}

interface GapResult {
	gap_candidates: GapCandidate[]
	options_for_user?: GapOption[] // Thêm mảng này vào để nhận từ AI
	insufficient_evidence: boolean
}

interface Props {
	projectId: string
	spec: ResearchSpec
	onFieldConfirmed: () => void
}

export function Step2_RelatedWorkGap({
	projectId,
	spec,
	onFieldConfirmed,
}: Props) {
	// ---------- Cột trái: tìm kiếm ----------
	const [keyword, setKeyword] = useState('')
	const [keywords, setKeywords] = useState<string[]>(
		(spec.search_keywords?.value as string[] | undefined) ?? [],
	)
	const [keywordSuggesting, setKeywordSuggesting] = useState(false)
	const [activeFilters, setActiveFilters] = useState<string[]>(
		SOURCE_FILTERS.map((f) => f.id),
	)

	function addKeyword() {
		if (keyword.trim() && !keywords.includes(keyword.trim())) {
			setKeywords((prev) => [...prev, keyword.trim()])
		}
		setKeyword('')
	}

	async function suggestKeywords() {
		const idea = spec.problem_statement?.value as string | undefined
		if (!idea?.trim()) {
			setRwError('Chưa có ý tưởng đã xác nhận để AI đề xuất từ khóa.')
			return
		}

		setKeywordSuggesting(true)
		setRwError(null)
		try {
			const res = await api.generate(projectId, 'idea_capture', idea)
			const detected = (res.preview as { detected_keywords?: string[] })
				.detected_keywords
			const normalized = Array.from(
				new Set(
					(detected ?? [])
						.map((item) => item.trim())
						.filter(Boolean),
				),
			)
			if (normalized.length === 0) {
				setRwError('AI chưa đề xuất được từ khóa. Vui lòng thử lại.')
				return
			}
			setKeywords(normalized)
		} catch (e: any) {
			setRwError(e.message ?? 'Không đề xuất được từ khóa')
		} finally {
			setKeywordSuggesting(false)
		}
	}

	function toggleFilter(id: string) {
		setActiveFilters((prev) =>
			prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id],
		)
	}

	// ---------- Cột giữa: bảng related work ----------
	const [rwLoading, setRwLoading] = useState(false)
	const [rwError, setRwError] = useState<string | null>(null)
	const [rwResult, setRwResult] = useState<RelatedWorkResult | null>(
		(spec.related_work_matrix?.value as RelatedWorkRow[] | undefined)
			? {
					related_work_matrix: spec.related_work_matrix!
						.value as RelatedWorkRow[],
					search_keywords_used: [],
				}
			: null,
	)
	const [rwSaving, setRwSaving] = useState(false)
	const [rwConfirmed, setRwConfirmed] = useState(
		spec.related_work_matrix?.status === 'CONFIRMED',
	)

	async function handleSearchRelatedWork() {
		if (keywords.length === 0) {
			setRwError('Cần ít nhất một từ khóa trước khi tìm related-work.')
			return
		}
		setRwLoading(true)
		setRwError(null)
		try {
			const activeLabels = SOURCE_FILTERS.filter((f) =>
				activeFilters.includes(f.id),
			).map((f) => f.label)
			const instruction = `Từ khoá: ${keywords.join(', ') || '(không có)'}. Ưu tiên loại nguồn: ${
				activeLabels.join(', ') || 'không giới hạn'
			}.`
			const res = await api.generate(
				projectId,
				'related_work',
				instruction,
			)
			setRwResult(res.preview as RelatedWorkResult)
			setRwConfirmed(false)
			setGapResult(null)
		} catch (e: any) {
			setRwError(e.message ?? 'Không tìm được công trình liên quan')
		} finally {
			setRwLoading(false)
		}
	}

	function removeRow(id: string) {
		setRwConfirmed(false)
		setGapResult(null)
		setRwResult((prev) =>
			prev
				? {
						...prev,
						related_work_matrix: prev.related_work_matrix.filter(
							(r) => r.id !== id,
						),
					}
				: prev,
		)
	}

	async function confirmRelatedWork() {
		if (!rwResult) return
		setRwSaving(true)
		setRwError(null)
		try {
			await api.confirm(
				projectId,
				'related_work',
				{
					search_keywords: {
						value: keywords,
						status: 'CONFIRMED',
						source: 'user',
					},
					related_work_matrix: {
						value: rwResult.related_work_matrix,
						status: 'CONFIRMED',
						source: 'user',
					},
				},
				`Xác nhận bảng related-work (${rwResult.related_work_matrix.length} nguồn)`,
			)
			setRwConfirmed(true)
			await proposeGap(
				'Dựa trên bảng related-work vừa xác nhận, hãy đề xuất các research gap phù hợp và các hướng để người dùng lựa chọn.',
				true,
			)
			onFieldConfirmed()
		} catch (e: any) {
			setRwError(e.message ?? 'Không lưu được bảng related-work')
		} finally {
			setRwSaving(false)
		}
	}

	// ---------- Cột phải: research gap ----------
	const [gapLoading, setGapLoading] = useState(false)
	const [gapError, setGapError] = useState<string | null>(null)
	const [gapResult, setGapResult] = useState<GapResult | null>(
		(spec.gap_candidates?.value as GapCandidate[] | undefined)
			? {
					gap_candidates: spec.gap_candidates!
						.value as GapCandidate[],
					insufficient_evidence: false,
				}
			: null,
	)
	const [gapSaving, setGapSaving] = useState(false)
	const [customDirection, setCustomDirection] = useState('')
	const [selectedGapOption, setSelectedGapOption] = useState<GapOption | null>(
		(spec.selected_gap_direction?.value as GapOption | undefined) ?? null,
	)

	async function proposeGap(
		instruction: string,
		confirmedNow = false,
	): Promise<GapResult | null> {
		if (!rwConfirmed && !confirmedNow) {
			setGapError('Hãy xác nhận bảng related-work trước khi đề xuất gap.')
			return null
		}
		if (!rwResult || rwResult.related_work_matrix.length === 0) {
			setGapError('Cần có bảng related-work trước khi đề xuất gap.')
			return null
		}
		setGapLoading(true)
		setGapError(null)
		try {
			const res = await api.generate(projectId, 'gap', instruction)
			const generated = res.preview as GapResult
			setGapResult(generated)
			return generated
		} catch (e: any) {
			setGapError(e.message ?? 'Không đề xuất được research gap')
			return null
		} finally {
			setGapLoading(false)
		}
	}

	async function saveGapSelection(
		option: GapOption,
		result: GapResult | null = gapResult,
	) {
		if (!result || gapSaving) return
		setGapSaving(true)
		setGapError(null)
		try {
			await api.confirm(
				projectId,
				'gap',
				{
					gap_candidates: {
						value: result.gap_candidates,
						status: 'CONFIRMED',
						source: 'user',
					},
					selected_gap_direction: {
						value: { id: option.id, label: option.label },
						status: 'CONFIRMED',
						source: 'user',
					},
				},
				`Chọn hướng research gap: ${option.label}`,
			)
			setSelectedGapOption(option)
			onFieldConfirmed()
		} catch (e: any) {
			setGapError(e.message ?? 'Không lưu được research gap')
		} finally {
			setGapSaving(false)
		}
	}

	async function submitCustomDirection() {
		const direction = customDirection.trim()
		if (!direction) return
		const generated = await proposeGap(
			`Bỏ qua các lựa chọn trên, tạo gap theo hướng sau: ${direction}`,
		)
		if (generated) {
			await saveGapSelection({ id: 'custom', label: direction }, generated)
		}
	}

	return (
		<div className="space-y-1">
			<h1 className="text-xl font-semibold text-slate-900">
				2. Nghiên cứu liên quan &amp; tìm research gap
			</h1>
			<p className="mb-5 text-sm text-slate-500">
				Đối sánh với công trình liên quan trước, sau đó đề xuất khoảng
				trống nghiên cứu — luôn gắn với nguồn cụ thể, không suy đoán chủ
				quan.
			</p>

			<div className="grid grid-cols-1 gap-5 lg:grid-cols-[280px_1fr_320px]">
				{/* ---------- Cột trái: search + filter nguồn ---------- */}
				<Card className="h-fit">
					<CardHeader>
						<CardTitle className="text-sm">
							Từ khoá &amp; kế hoạch tìm kiếm
						</CardTitle>
						<CardDescription>
							AI đề xuất từ ý tưởng đã xác nhận ở bước 1. Bạn có thể chỉnh sửa.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="flex gap-1.5">
							<Input
								placeholder="Nhập từ khoá..."
								value={keyword}
								onChange={(e) => setKeyword(e.target.value)}
								onKeyDown={(e) =>
									e.key === 'Enter' && addKeyword()
								}
							/>
							<Button
								size="icon"
								variant="outline"
								onClick={addKeyword}
							>
								<Search className="h-4 w-4" />
							</Button>
						</div>

						<div className="flex flex-wrap gap-1.5">
							{keywords.map((k) => (
								<Badge
									key={k}
									variant="secondary"
									className="gap-1 cursor-pointer hover:bg-indigo-100"
									onClick={() => setKeyword(k)}
									title="Bấm để đưa từ khóa vào ô nhập"
								>
									{k}
									<X
										className="h-3 w-3 cursor-pointer"
										onClick={(event) => {
											event.stopPropagation()
											setKeywords((prev) =>
												prev.filter((x) => x !== k),
											)
										}}
									/>
								</Badge>
							))}
						</div>
						{keywords.length === 0 && (
							<p className="text-xs font-medium text-amber-600">
								Chưa có từ khóa. Hãy thêm ít nhất một từ khóa để tìm kiếm.
							</p>
						)}
						<Button
							variant="outline"
							size="sm"
							className="w-full"
							onClick={suggestKeywords}
							disabled={keywordSuggesting || !spec.problem_statement?.value}
						>
							{keywordSuggesting ? (
								<Loader2 className="h-4 w-4 animate-spin" />
							) : (
								<Sparkles className="h-4 w-4" />
							)}
							{keywordSuggesting ? 'Đang gợi ý...' : 'AI gợi ý từ ý tưởng'}
						</Button>

						<div>
							<p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
								Nguồn ưu tiên
							</p>
							<div className="space-y-2">
								{SOURCE_FILTERS.map((f) => (
									<div
										key={f.id}
										className="flex items-center gap-2"
									>
										<Checkbox
											checked={activeFilters.includes(
												f.id,
											)}
											onCheckedChange={() =>
												toggleFilter(f.id)
											}
										/>
										<span className="text-sm text-slate-600">
											{f.label}
										</span>
									</div>
								))}
							</div>
						</div>
					</CardContent>
				</Card>

				{/* ---------- Cột giữa: bảng related-work ---------- */}
				<Card>
					<CardHeader className="flex-row items-center justify-between space-y-0">
						<div>
							<CardTitle className="text-sm">
								Bảng đối sánh related-work
							</CardTitle>
							<CardDescription>
								{rwResult
									? `${rwResult.related_work_matrix.length} nguồn`
									: 'Chưa có dữ liệu'}
							</CardDescription>
						</div>
						<Button
							size="sm"
							onClick={handleSearchRelatedWork}
							disabled={rwLoading || keywords.length === 0}
						>
							{rwLoading ? (
								<>
									<Loader2 className="h-4 w-4 animate-spin" />{' '}
									Đang đề xuất...
								</>
							) : (
								<>
									<Search className="h-4 w-4" /> AI đề xuất
								</>
							)}
						</Button>
					</CardHeader>
					<CardContent>
						{!rwResult?.related_work_matrix.length && keywords.length > 0 && (
							<p className="py-6 text-center text-sm text-slate-400">
								Bấm "AI đề xuất" để tạo danh sách công trình liên
								quan.
							</p>
						)}
						{!rwResult?.related_work_matrix.length && keywords.length === 0 && (
							<p className="py-6 text-center text-sm text-slate-400">
								Thêm từ khóa ở cột bên trái để bật đề xuất related-work.
							</p>
						)}

						{!!rwResult?.related_work_matrix.length && (
							<>
								<Alert variant="warning" className="mb-3">
									<AlertTitle>
										<ShieldAlert className="h-4 w-4" /> Cần
										xác minh thủ công
									</AlertTitle>
									<AlertDescription>
										AI không truy cập internet — hãy kiểm
										tra lại từng nguồn trước khi dùng làm
										bằng chứng chính thức.
									</AlertDescription>
								</Alert>

								<Table>
									<TableHeader>
										<TableRow>
											<TableHead>Nghiên cứu</TableHead>
											<TableHead>Đã làm gì?</TableHead>
											<TableHead>Điểm thiếu</TableHead>
											<TableHead className="w-8" />
										</TableRow>
									</TableHeader>
									<TableBody>
										{rwResult.related_work_matrix.map(
											(row) => (
												<TableRow key={row.id}>
													<TableCell className="font-medium text-slate-800">
														{row.title}
														{row.year && (
															<span className="ml-1 text-xs text-slate-400">
																({row.year})
															</span>
														)}
													</TableCell>
													<TableCell className="text-slate-600">
														{row.did_what}
													</TableCell>
													<TableCell className="text-slate-600">
														{row.gap_note}
													</TableCell>
													<TableCell>
														<button
															className="text-slate-300 hover:text-red-500"
															onClick={() =>
																removeRow(
																	row.id,
																)
															}
														>
															<X className="h-3.5 w-3.5" />
														</button>
													</TableCell>
												</TableRow>
											),
										)}
									</TableBody>
								</Table>

								<Button
									className="mt-4 w-full"
									onClick={confirmRelatedWork}
									disabled={rwSaving || rwConfirmed}
								>
									{rwSaving
										? 'Đang lưu...'
										: rwConfirmed
											? 'Đã xác nhận bảng related-work'
											: 'Xác nhận bảng related-work'}
								</Button>
							</>
						)}

						{rwError && (
							<p className="mt-2 text-xs font-medium text-red-600">
								{rwError}
							</p>
						)}
					</CardContent>
				</Card>

				{/* ---------- Cột phải: research gap ---------- */}
				<Card className="h-fit">
					<CardHeader>
						<CardTitle className="text-sm">
							<Lightbulb className="mr-1 inline h-4 w-4 text-amber-500" />
							Research gap đề xuất
						</CardTitle>
					</CardHeader>
					<CardContent className="space-y-3">
						{!rwConfirmed && (
							<Alert variant="warning">
								<AlertTitle>Research gap đang bị khóa</AlertTitle>
								<AlertDescription>
									Hãy xác nhận bảng related-work hiện tại trước khi nhập hoặc gửi hướng nghiên cứu.
								</AlertDescription>
							</Alert>
						)}

						<fieldset
							disabled={!rwConfirmed}
							className={`space-y-3 ${!rwConfirmed ? 'opacity-50' : ''}`}
						>
						{!gapResult && rwConfirmed && (
							<p className="text-sm text-slate-400">
								Nhập một hướng nghiên cứu để AI đề xuất gap từ bảng related-work đã xác nhận.
							</p>
						)}

						{gapResult?.insufficient_evidence && (
							<Alert variant="destructive">
								<AlertDescription>
									Chưa đủ related-work để đề xuất gap đáng tin
									cậy — hãy tìm thêm nguồn.
								</AlertDescription>
							</Alert>
						)}

						{!!gapResult?.gap_candidates.length && (
							<ul className="space-y-2 text-sm text-slate-700">
								{gapResult.gap_candidates.map((g) => (
									<li
										key={g.id}
										className="rounded-lg bg-indigo-50 p-2.5"
									>
										{g.text}
									</li>
								))}
							</ul>
						)}

						{selectedGapOption && (
							<Alert variant="success">
								<AlertTitle>
									<Check className="h-4 w-4" /> Đã chọn hướng
								</AlertTitle>
								<AlertDescription>{selectedGapOption.label}</AlertDescription>
							</Alert>
						)}

						<div>
							<p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
								Bạn muốn tập trung vào hướng nào?
							</p>
							<div className="grid grid-cols-1 gap-1.5">
								{gapResult?.options_for_user?.map((opt) => (
									<Button
										key={opt.id}
										variant={
											selectedGapOption?.id === opt.id
												? 'default'
												: 'outline'
										}
										size="sm"
										className="h-auto justify-start whitespace-normal py-2 text-left text-xs"
										disabled={gapLoading || gapSaving}
										onClick={() => saveGapSelection(opt)}
									>
										{selectedGapOption?.id === opt.id && (
											<Check className="h-3.5 w-3.5" />
										)}
										<span className="font-mono">
											{opt.id}.
										</span>{' '}
										{opt.label}
									</Button>
								))}
							</div>

							<div className="mt-2 flex gap-1.5">
								<Input
									placeholder="E. Hướng khác..."
									disabled={!rwConfirmed}
									value={customDirection}
									onChange={(e) =>
										setCustomDirection(e.target.value)
									}
								/>
								<Button
									size="sm"
									variant="outline"
									disabled={
										!rwConfirmed ||
										!customDirection.trim() ||
										gapLoading ||
										gapSaving
									}
									onClick={submitCustomDirection}
								>
									{gapLoading ? (
										<Loader2 className="h-4 w-4 animate-spin" />
									) : (
										'Gửi'
									)}
								</Button>
							</div>
						</div>

						{gapError && (
							<p className="text-xs font-medium text-red-600">
								{gapError}
							</p>
						)}

						</fieldset>
					</CardContent>
				</Card>
			</div>
		</div>
	)
}
