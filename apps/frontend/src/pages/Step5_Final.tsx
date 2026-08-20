import { CheckCircle2, Download, FileText, Sparkles } from 'lucide-react'
import type { ResearchSpec } from '@/lib/types'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

const SECTION_LABELS: [keyof ResearchSpec, string][] = [
	['problem_statement', 'Problem statement'],
	['research_questions', 'Research questions'],
	['related_work_matrix', 'Related-work matrix'],
	['gap_candidates', 'Research gap'],
	['contributions', 'Contributions'],
	['claim_evidence_matrix', 'Claim–evidence matrix'],
	['experimental_protocol', 'Experimental protocol'],
	['compute_budget', 'Compute budget'],
	['risks_and_limitations', 'Risks & limitations'],
	['open_issues', 'Decision log'],
]

function toMarkdown(spec: ResearchSpec) {
	let md = '# Research Specification\n\n'
	for (const [key, label] of SECTION_LABELS) {
		const field = spec[key]
		md += `## ${label}\n\n`
		md += field?.value
			? '```json\n' + JSON.stringify(field.value, null, 2) + '\n```\n\n'
			: '_Chưa có dữ liệu_\n\n'
	}
	return md
}

function download(filename: string, content: string, mime: string) {
	const blob = new Blob([content], { type: mime })
	const url = URL.createObjectURL(blob)
	const a = document.createElement('a')
	a.href = url
	a.download = filename
	a.click()
	URL.revokeObjectURL(url)
}

export function Step5_Final({ spec }: { spec: ResearchSpec }) {
	return (
		<div className="space-y-1">
			<h1 className="text-xl font-semibold text-slate-900">
				5. Bản đặc tả nghiên cứu cuối
			</h1>
			<p className="mb-5 text-sm text-slate-500">
				Bản spec đã sẵn sàng. Bạn có thể xuất ra file để đính kèm vào
				Proposal hoặc nộp báo cáo.
			</p>

			<div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px]">
				{/* CỘT TRÁI: DANH SÁCH MỤC */}
				<Card>
					<CardContent className="p-6">
						<div className="space-y-1 text-sm font-medium text-slate-700">
							{SECTION_LABELS.map(([key, label], i) => {
								const hasData = !!spec[key]?.value
								return (
									<div
										key={key}
										className="flex items-center gap-3 py-2.5 border-b last:border-0 border-slate-100"
									>
										<CheckCircle2
											className={`h-5 w-5 ${hasData ? 'text-emerald-500' : 'text-slate-300'}`}
										/>
										<span className="w-6 text-slate-400">
											{i + 1}.
										</span>
										<span
											className={
												hasData
													? 'text-slate-800'
													: 'text-slate-400'
											}
										>
											{label}
										</span>
									</div>
								)
							})}
						</div>

						<div className="mt-6 bg-emerald-50 border border-emerald-100 rounded-lg p-4 flex items-start gap-3 text-emerald-800">
							<TargetIcon className="h-5 w-5 shrink-0 text-emerald-600 mt-0.5" />
							<p className="text-sm font-medium">
								Đề tài tập trung vào tối ưu prompt bằng feedback
								claim-level để giảm unsupported claim khi trích
								xuất thông tin từ paper khoa học.
							</p>
						</div>
					</CardContent>
				</Card>

				{/* CỘT PHẢI: TÓM TẮT & ACTIONS */}
				<div className="space-y-5">
					<Card>
						<CardHeader className="pb-3">
							<CardTitle className="text-sm flex items-center gap-2">
								<Sparkles className="h-4 w-4 text-amber-500" />{' '}
								LLM tóm tắt cách làm
							</CardTitle>
						</CardHeader>
						<CardContent>
							<ul className="space-y-3 text-xs text-slate-600">
								<li className="flex gap-2.5">
									<span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-amber-100 text-[9px] font-bold text-amber-700">
										1
									</span>{' '}
									Chọn contribution chính.
								</li>
								<li className="flex gap-2.5">
									<span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-amber-100 text-[9px] font-bold text-amber-700">
										2
									</span>{' '}
									Đối sánh với prior work để tìm khoảng trống
									nghiên cứu.
								</li>
								<li className="flex gap-2.5">
									<span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-amber-100 text-[9px] font-bold text-amber-700">
										3
									</span>{' '}
									Thiết kế thí nghiệm và chọn baseline phù
									hợp.
								</li>
								<li className="flex gap-2.5">
									<span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-amber-100 text-[9px] font-bold text-amber-700">
										4
									</span>{' '}
									Xác nhận với Judge và người dùng trước khi
									chốt spec.
								</li>
							</ul>
						</CardContent>
					</Card>

					<Card>
						<CardHeader className="pb-3">
							<CardTitle className="text-sm text-emerald-700 flex items-center gap-2">
								<CheckCircle2 className="h-4 w-4" /> Xác nhận
								cuối cùng
							</CardTitle>
						</CardHeader>
						<CardContent className="space-y-2">
							<Button
								className="w-full bg-blue-600 hover:bg-blue-700 text-white"
								disabled
							>
								<CheckCircle2 className="h-4 w-4 mr-2" /> Xác
								nhận spec
							</Button>
							<div className="grid grid-cols-2 gap-2">
								<Button
									variant="outline"
									className="text-xs h-9"
									onClick={() =>
										download(
											'research-spec.md',
											toMarkdown(spec),
											'text/markdown',
										)
									}
								>
									<FileText className="h-3.5 w-3.5 mr-1" />{' '}
									Xuất Markdown
								</Button>
								<Button
									variant="outline"
									className="text-xs h-9"
									onClick={() =>
										download(
											'research-spec.json',
											JSON.stringify(spec, null, 2),
											'application/json',
										)
									}
								>
									<Download className="h-3.5 w-3.5 mr-1" />{' '}
									Xuất JSON
								</Button>
							</div>
						</CardContent>
					</Card>
				</div>
			</div>

			<div className="mt-8 text-center text-sm font-medium text-emerald-600 bg-emerald-50/50 py-3 rounded-full border border-emerald-100">
				<span className="mr-2">🎉</span> Spec đã sẵn sàng cho bước triển
				khai hoặc viết proposal.
			</div>
		</div>
	)
}

// Icon helper
function TargetIcon(props: any) {
	return (
		<svg
			{...props}
			xmlns="http://www.w3.org/2000/svg"
			width="24"
			height="24"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			<circle cx="12" cy="12" r="10" />
			<circle cx="12" cy="12" r="6" />
			<circle cx="12" cy="12" r="2" />
		</svg>
	)
}
