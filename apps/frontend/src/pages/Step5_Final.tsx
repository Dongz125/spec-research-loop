import { useEffect, useState } from 'react'
import { CheckCircle2, Download, Eye, FileText, History, Loader2, Sparkles } from 'lucide-react'
import type { ResearchSpec, SpecVersion } from '@/lib/types'
import { api } from '@/lib/api'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CurrentSpecModal } from '@/components/CurrentSpecModal'
import {
	SPEC_SECTIONS,
	downloadText,
	specToMarkdown,
} from '@/lib/specMarkdown'

export function Step5_Final({
	projectId,
	spec,
}: {
	projectId: string
	spec: ResearchSpec
}) {
	const [versions, setVersions] = useState<SpecVersion[]>([])
	const [selectedVersion, setSelectedVersion] = useState<number | null>(null)
	const [selectedSpec, setSelectedSpec] = useState(spec)
	const [loadingVersion, setLoadingVersion] = useState(false)
	const [versionError, setVersionError] = useState<string | null>(null)
	const [viewerOpen, setViewerOpen] = useState(false)

	useEffect(() => {
		setSelectedSpec(spec)
		setVersionError(null)
		api.getVersions(projectId)
			.then((items) => {
				setVersions(items)
				setSelectedVersion(items[0]?.version_number ?? null)
			})
			.catch((error) => setVersionError(error.message ?? 'Không tải được lịch sử chỉnh sửa.'))
	}, [projectId, spec])

	async function selectVersion(versionNumber: number) {
		setVersionError(null)
		if (versionNumber === versions[0]?.version_number) {
			setSelectedVersion(versionNumber)
			setSelectedSpec(spec)
			return
		}
		setLoadingVersion(true)
		try {
			const version = await api.getVersion(projectId, versionNumber)
			if (!version.data) throw new Error('Phiên bản không có dữ liệu spec.')
			setSelectedVersion(versionNumber)
			setSelectedSpec(version.data)
		} catch (error: any) {
			setVersionError(error.message ?? 'Không tải được phiên bản đã chọn.')
		} finally {
			setLoadingVersion(false)
		}
	}

	const selectedMetadata = versions.find(
		(version) => version.version_number === selectedVersion,
	)
	const exportSuffix = selectedVersion ? `-v${selectedVersion}` : ''

	return (
		<div className="space-y-1">
			<h1 className="text-xl font-semibold text-slate-900">
				5. Bản đặc tả nghiên cứu cuối
			</h1>
			<p className="mb-5 text-sm text-slate-500">
				Bản spec đã sẵn sàng. Bạn có thể xuất ra file để đính kèm vào
				Proposal hoặc nộp báo cáo.
			</p>

			<Card className="mb-5">
				<CardContent className="p-4">
					<div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
						<div className="flex items-start gap-3">
							<History className="mt-0.5 h-5 w-5 text-indigo-600" />
							<div>
								<p className="text-sm font-semibold text-slate-900">Phiên bản dùng để xuất</p>
								<p className="text-xs text-slate-500">
									Mỗi lần Judge sửa thành công được lưu thành một phiên bản riêng.
								</p>
							</div>
						</div>
						<div className="flex min-w-0 items-center gap-2 md:w-[420px]">
							<select
								className="h-10 min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700"
								value={selectedVersion ?? ''}
								onChange={(event) => void selectVersion(Number(event.target.value))}
								disabled={loadingVersion || versions.length === 0}
							>
								{versions.map((version, index) => (
									<option key={version.id} value={version.version_number}>
										v{version.version_number}{index === 0 ? ' — mới nhất' : ''} · {(version.change_summary || version.step).slice(0, 100)}
									</option>
								))}
							</select>
							{loadingVersion && <Loader2 className="h-4 w-4 animate-spin text-indigo-600" />}
						</div>
					</div>
					{selectedMetadata && (
						<p className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
							v{selectedMetadata.version_number} · {selectedMetadata.step} · {new Date(selectedMetadata.created_at).toLocaleString('vi-VN')}
							{selectedMetadata.changed_fields.length > 0
								? ` · Đã đổi: ${selectedMetadata.changed_fields.join(', ')}`
								: ''}
						</p>
					)}
					{versionError && <p className="mt-2 text-xs text-red-600">{versionError}</p>}
				</CardContent>
			</Card>

			<div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px]">
				{/* CỘT TRÁI: DANH SÁCH MỤC */}
				<Card>
					<CardContent className="p-6">
						<div className="space-y-1 text-sm font-medium text-slate-700">
							{SPEC_SECTIONS.map(([key, label], i) => {
								const hasData = !!selectedSpec[key]?.value
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
								{String(selectedSpec.problem_statement?.value || 'Phiên bản này chưa có Problem Statement.')}
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
								<FileText className="h-4 w-4" /> Xem và xuất phiên bản
							</CardTitle>
						</CardHeader>
						<CardContent className="space-y-2">
							<Button
								className="w-full"
								variant="outline"
								onClick={() => setViewerOpen(true)}
								disabled={loadingVersion}
							>
								<Eye className="h-4 w-4 mr-2" /> Xem toàn bộ nội dung
							</Button>
							<div className="grid grid-cols-2 gap-2">
								<Button
									variant="outline"
									className="text-xs h-9"
									onClick={() =>
									downloadText(
										`research-spec${exportSuffix}.md`,
										specToMarkdown(selectedSpec),
											'text/markdown',
										)
									}
									disabled={loadingVersion}
								>
									<FileText className="h-3.5 w-3.5 mr-1" />{' '}
									Xuất Markdown
								</Button>
								<Button
									variant="outline"
									className="text-xs h-9"
									onClick={() =>
									downloadText(
										`research-spec${exportSuffix}.json`,
											JSON.stringify(selectedSpec, null, 2),
											'application/json',
										)
									}
									disabled={loadingVersion}
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

			<CurrentSpecModal
				open={viewerOpen}
				onClose={() => setViewerOpen(false)}
				spec={selectedSpec}
				currentStepLabel="Spec cuối"
				currentStep={5}
				totalSteps={5}
				title={`Nội dung Spec v${selectedVersion ?? 'mới nhất'}`}
				subtitle={selectedMetadata?.change_summary || 'Snapshot đã chọn'}
				downloadFilename={`research-spec${exportSuffix}.md`}
			/>
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
