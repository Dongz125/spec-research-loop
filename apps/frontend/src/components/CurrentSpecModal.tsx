import { Download, FileText, X } from 'lucide-react'
import type { ResearchSpec } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { downloadText, specToMarkdown } from '@/lib/specMarkdown'

interface Props {
	open: boolean
	onClose: () => void
	spec: ResearchSpec
	currentStepLabel: string
	currentStep: number
	totalSteps: number
	title?: string
	subtitle?: string
	downloadFilename?: string
}

export function CurrentSpecModal({
	open,
	onClose,
	spec,
	currentStepLabel,
	currentStep,
	totalSteps,
	title = 'Spec hiện tại',
	subtitle,
	downloadFilename = 'research-spec.md',
}: Props) {
	if (!open) return null
	const progress = Math.round((currentStep / totalSteps) * 100)
	const markdown = specToMarkdown(spec)

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm"
			onMouseDown={(event) => {
				if (event.target === event.currentTarget) onClose()
			}}
		>
			<div
				role="dialog"
				aria-modal="true"
				aria-labelledby="current-spec-title"
				className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
			>
				<div className="border-b border-slate-200 p-5">
					<div className="flex items-start justify-between gap-4">
						<div className="flex items-center gap-3">
							<div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700">
								<FileText className="h-5 w-5" />
							</div>
							<div>
								<h2 id="current-spec-title" className="font-semibold text-slate-900">
									{title}
								</h2>
								<p className="text-sm text-slate-500">
									{subtitle ?? `Bước ${currentStep}/${totalSteps} · ${currentStepLabel}`}
								</p>
							</div>
						</div>
						<button
							type="button"
							aria-label="Đóng"
							className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
							onClick={onClose}
						>
							<X className="h-5 w-5" />
						</button>
					</div>
					<div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
						<div className="h-full bg-indigo-600" style={{ width: `${progress}%` }} />
					</div>
				</div>

				<div className="flex-1 overflow-y-auto bg-slate-50 p-5">
					<pre className="whitespace-pre-wrap rounded-xl border border-slate-200 bg-white p-5 font-mono text-xs leading-relaxed text-slate-700">
						{markdown}
					</pre>
				</div>

				<div className="flex justify-end gap-2 border-t border-slate-200 p-4">
					<Button
						onClick={() =>
							downloadText(downloadFilename, markdown, 'text/markdown')
						}
					>
						<Download className="h-4 w-4" /> Tải Markdown
					</Button>
					<Button variant="outline" onClick={onClose}>Đóng</Button>
				</div>
			</div>
		</div>
	)
}
