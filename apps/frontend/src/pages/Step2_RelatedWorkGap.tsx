import { useState } from 'react'
import { Search, Loader2, Lightbulb, X, ShieldAlert } from 'lucide-react'
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
	const [keywords, setKeywords] = useState<string[]>([
		'prompt optimization',
		'hallucination',
	])
	const [activeFilters, setActiveFilters] = useState<string[]>(
		SOURCE_FILTERS.map((f) => f.id),
	)

	function addKeyword() {
		if (keyword.trim() && !keywords.includes(keyword.trim())) {
			setKeywords((prev) => [...prev, keyword.trim()])
		}
		setKeyword('')
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

	async function handleSearchRelatedWork() {
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
		} catch (e: any) {
			setRwError(e.message ?? 'Không tìm được công trình liên quan')
		} finally {
			setRwLoading(false)
		}
	}

	function removeRow(id: string) {
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
					related_work_matrix: {
						value: rwResult.related_work_matrix,
						status: 'CONFIRMED',
						source: 'user',
					},
				},
				`Xác nhận bảng related-work (${rwResult.related_work_matrix.length} nguồn)`,
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

	async function proposeGap(instruction: string) {
		if (!rwResult || rwResult.related_work_matrix.length === 0) {
			setGapError('Cần có bảng related-work trước khi đề xuất gap.')
			return
		}
		setGapLoading(true)
		setGapError(null)
		try {
			const res = await api.generate(projectId, 'gap', instruction)
			setGapResult(res.preview as GapResult)
		} catch (e: any) {
			setGapError(e.message ?? 'Không đề xuất được research gap')
		} finally {
			setGapLoading(false)
		}
	}

	async function confirmGap() {
		if (!gapResult) return
		setGapSaving(true)
		setGapError(null)
		try {
			await api.confirm(
				projectId,
				'gap',
				{
					gap_candidates: {
						value: gapResult.gap_candidates,
						status: 'CONFIRMED',
						source: 'user',
					},
				},
				'Xác nhận research gap',
			)
			onFieldConfirmed()
		} catch (e: any) {
			setGapError(e.message ?? 'Không lưu được research gap')
		} finally {
			setGapSaving(false)
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
									className="gap-1"
								>
									{k}
									<X
										className="h-3 w-3 cursor-pointer"
										onClick={() =>
											setKeywords((prev) =>
												prev.filter((x) => x !== k),
											)
										}
									/>
								</Badge>
							))}
						</div>

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
							disabled={rwLoading}
						>
							{rwLoading ? (
								<>
									<Loader2 className="h-4 w-4 animate-spin" />{' '}
									Đang tìm...
								</>
							) : (
								<>
									<Search className="h-4 w-4" /> Tìm kiếm
								</>
							)}
						</Button>
					</CardHeader>
					<CardContent>
						{!rwResult?.related_work_matrix.length && (
							<p className="py-6 text-center text-sm text-slate-400">
								Bấm "Tìm kiếm" để AI đề xuất các công trình liên
								quan.
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
									disabled={rwSaving}
								>
									{rwSaving
										? 'Đang lưu...'
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
						{!gapResult && (
							<p className="text-sm text-slate-400">
								Sau khi có bảng related-work, bấm 1 hướng bên
								dưới để AI đề xuất gap.
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

						<div>
							<p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
								Bạn muốn tập trung vào hướng nào?
							</p>
							<div className="grid grid-cols-1 gap-1.5">
								{gapResult?.options_for_user?.map((opt) => (
									<Button
										key={opt.id}
										variant="outline"
										size="sm"
										className="h-auto justify-start whitespace-normal py-2 text-left text-xs"
										disabled={gapLoading}
										onClick={() =>
											proposeGap(
												`Chọn hướng ${opt.id}: ${opt.label}`,
											)
										}
									>
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
									value={customDirection}
									onChange={(e) =>
										setCustomDirection(e.target.value)
									}
								/>
								<Button
									size="sm"
									variant="outline"
									disabled={
										!customDirection.trim() || gapLoading
									}
									onClick={() =>
										proposeGap(
											`Bỏ qua các lựa chọn trên, tạo gap theo hướng sau: ${customDirection}`,
										)
									}
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

						{!!gapResult?.gap_candidates.length && (
							<Button
								className="w-full"
								onClick={confirmGap}
								disabled={gapSaving}
							>
								{gapSaving ? 'Đang lưu...' : 'Xác nhận gap'}
							</Button>
						)}
					</CardContent>
				</Card>
			</div>
		</div>
	)
}
