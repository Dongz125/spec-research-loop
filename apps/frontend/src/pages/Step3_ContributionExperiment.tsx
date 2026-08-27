import { useState } from 'react'
import { Target, FlaskConical, Cpu, Loader2, Check } from 'lucide-react'
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
import { Textarea } from '@/components/ui/textarea'

interface Props {
	projectId: string
	spec: ResearchSpec
	onFieldConfirmed: () => void
}

export function Step3_ContributionExperiment({
	projectId,
	spec,
	onFieldConfirmed,
}: Props) {
	const [error, setError] = useState<string | null>(null)
	// --- Cột 1: Contribution & Claim ---
	const [contribText, setContribText] = useState('')
	const [contribPreview, setContribPreview] = useState<any>(
		spec.claim_evidence_matrix?.value
			? {
					contributions: spec.contributions?.value,
					claim_evidence_matrix: spec.claim_evidence_matrix?.value,
				}
			: null,
	)
	const [loadingContrib, setLoadingContrib] = useState(false)
	const [savingContrib, setSavingContrib] = useState(false)
	const [contribConfirmed, setContribConfirmed] = useState(
		spec.contributions?.status === 'CONFIRMED' &&
			spec.claim_evidence_matrix?.status === 'CONFIRMED',
	)

	async function handleGenContrib() {
		setLoadingContrib(true)
		setError(null)
		try {
			const res = await api.generate(
				projectId,
				'contribution',
				contribText ||
					'Tự động trích xuất contribution từ research gap.',
			)
			setContribPreview(res.preview)
			setContribConfirmed(false)
			setExpPreview(null)
			setExpConfirmed(false)
			setBudgetPreview(null)
			setBudgetConfirmed(false)
		} catch (e: any) {
			setError(e.message ?? 'Không tạo được contribution')
		} finally {
			setLoadingContrib(false)
		}
	}

	async function confirmContrib() {
		if (!contribPreview) return
		setSavingContrib(true)
		setError(null)
		try {
			await api.confirm(
				projectId,
				'contribution',
				{
					contributions: {
						value: contribPreview.contributions,
						status: 'CONFIRMED',
						source: 'user',
					},
					claim_evidence_matrix: {
						value: contribPreview.claim_evidence_matrix,
						status: 'CONFIRMED',
						source: 'user',
					},
				},
				'Xác nhận Contribution & Claim',
			)
			setContribConfirmed(true)
			onFieldConfirmed()
		} catch (e: any) {
			setError(e.message ?? 'Không chốt được contribution')
		} finally {
			setSavingContrib(false)
		}
	}

	// --- Cột 2: Experiment Design ---
	const [expText, setExpText] = useState('')
	const [expPreview, setExpPreview] = useState<any>(
		spec.experimental_protocol?.value
			? { experimental_protocol: spec.experimental_protocol?.value }
			: null,
	)
	const [loadingExp, setLoadingExp] = useState(false)
	const [savingExp, setSavingExp] = useState(false)
	const [expConfirmed, setExpConfirmed] = useState(
		spec.experimental_protocol?.status === 'CONFIRMED',
	)

	async function handleGenExp() {
		setLoadingExp(true)
		setError(null)
		try {
			const res = await api.generate(
				projectId,
				'experiment_design',
				expText || 'Thiết kế thí nghiệm chứng minh các claim vừa tạo.',
			)
			setExpPreview(res.preview)
			setExpConfirmed(false)
			setBudgetPreview(null)
			setBudgetConfirmed(false)
		} catch (e: any) {
			setError(e.message ?? 'Không tạo được kế hoạch thí nghiệm')
		} finally {
			setLoadingExp(false)
		}
	}

	async function confirmExp() {
		if (!expPreview) return
		setSavingExp(true)
		setError(null)
		try {
			await api.confirm(
				projectId,
				'experiment_design',
				{
					experimental_protocol: {
						value: expPreview.experimental_protocol,
						status: 'CONFIRMED',
						source: 'user',
					},
				},
				'Xác nhận Experimental Protocol',
			)
			setExpConfirmed(true)
			onFieldConfirmed()
		} catch (e: any) {
			setError(e.message ?? 'Không chốt được kế hoạch thí nghiệm')
		} finally {
			setSavingExp(false)
		}
	}

	// --- Cột 3: Feasibility (Compute Budget) ---
	const [budgetText, setBudgetText] = useState('')
	const [budgetPreview, setBudgetPreview] = useState<any>(
		spec.compute_budget?.value
			? { compute_budget: spec.compute_budget?.value }
			: null,
	)
	const [loadingBudget, setLoadingBudget] = useState(false)
	const [savingBudget, setSavingBudget] = useState(false)
	const [budgetConfirmed, setBudgetConfirmed] = useState(
		spec.compute_budget?.status === 'CONFIRMED',
	)

	async function handleGenBudget() {
		setLoadingBudget(true)
		setError(null)
		try {
			const res = await api.generate(
				projectId,
				'feasibility',
				budgetText ||
					'Ước lượng tài nguyên dựa trên kế hoạch thí nghiệm.',
			)
			setBudgetPreview(res.preview)
			setBudgetConfirmed(false)
		} catch (e: any) {
			setError(e.message ?? 'Không tạo được ước lượng tài nguyên')
		} finally {
			setLoadingBudget(false)
		}
	}

	async function confirmBudget() {
		if (!budgetPreview) return
		setSavingBudget(true)
		setError(null)
		try {
			await api.confirm(
				projectId,
				'feasibility',
				{
					compute_budget: {
						value: budgetPreview.compute_budget,
						status: 'CONFIRMED',
						source: 'user',
					},
				},
				'Xác nhận Compute Budget',
			)
			setBudgetConfirmed(true)
			onFieldConfirmed()
		} catch (e: any) {
			setError(e.message ?? 'Không chốt được tài nguyên')
		} finally {
			setSavingBudget(false)
		}
	}

	return (
		<div className="space-y-1">
			<h1 className="text-xl font-semibold text-slate-900">
				3. Xây dựng Contribution &amp; Kế hoạch thí nghiệm
			</h1>
			<p className="mb-5 text-sm text-slate-500">
				Biến research gap thành contribution, claim rõ ràng và thiết kế
				các thí nghiệm kiểm chứng có tính khả thi.
			</p>
			{error && (
				<p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-600">
					{error}
				</p>
			)}

			<div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
				{/* CỘT 1: CONTRIBUTION & CLAIM */}
				<Card className="flex flex-col">
					<CardHeader>
						<CardTitle className="text-sm flex items-center gap-1.5">
							<Target className="h-4 w-4 text-blue-600" />{' '}
							Contribution đề xuất
						</CardTitle>
						<CardDescription>
							Điểm mới và cách chứng minh
						</CardDescription>
					</CardHeader>
					<CardContent className="flex-1 flex flex-col gap-4">
						<div className="flex gap-2">
							<Textarea
								placeholder="Gợi ý (Vd: Tập trung thuật toán...)"
								rows={2}
								className="text-xs"
								value={contribText}
								onChange={(e) => setContribText(e.target.value)}
							/>
							<Button
								size="sm"
								onClick={handleGenContrib}
								disabled={loadingContrib}
								className="h-auto"
							>
								{loadingContrib ? (
									<Loader2 className="h-4 w-4 animate-spin" />
								) : (
									'Tạo'
								)}
							</Button>
						</div>

						{contribPreview && (
							<div className="space-y-3 flex-1">
								<ul className="text-xs space-y-1.5 bg-blue-50/50 p-3 rounded-md border border-blue-100">
									{(contribPreview.contributions || []).map(
										(c: string, i: number) => (
											<li key={i} className="flex gap-2">
												<span className="font-semibold text-blue-700">
													{i + 1}.
												</span>{' '}
												{c}
											</li>
										),
									)}
								</ul>
								<div className="space-y-2">
									<p className="text-xs font-semibold text-slate-600 uppercase">
										Claim - Evidence Matrix
									</p>
									{(
										contribPreview.claim_evidence_matrix ||
										[]
									).map((cem: any, i: number) => (
										<div
											key={i}
											className="text-xs bg-white border rounded-md p-2 shadow-sm space-y-1"
										>
											<p>
												<span className="font-semibold">
													Claim:
												</span>{' '}
												{cem.claim}
											</p>
											<p>
												<span className="font-semibold">
													Baseline:
												</span>{' '}
												{cem.baseline}
											</p>
											<p>
												<span className="font-semibold text-emerald-600">
													Evidence:
												</span>{' '}
												{cem.evidence}
											</p>
										</div>
									))}
								</div>
								<Button
									size="sm"
									variant="outline"
									className="w-full border-blue-200 hover:bg-blue-50 text-blue-700"
									onClick={confirmContrib}
									disabled={savingContrib || contribConfirmed}
								>
									{savingContrib ? (
										'Đang lưu...'
									) : contribConfirmed ? (
										<>
											<Check className="h-4 w-4 mr-1" /> Đã chốt Contribution
										</>
									) : (
										<>
											<Check className="h-4 w-4 mr-1" />{' '}
											Chốt Contribution
										</>
									)}
								</Button>
							</div>
						)}
					</CardContent>
				</Card>

				{/* CỘT 2: EXPERIMENT DESIGN */}
				<Card className="flex flex-col">
					<CardHeader>
						<CardTitle className="text-sm flex items-center gap-1.5">
							<FlaskConical className="h-4 w-4 text-emerald-600" />{' '}
							Kế hoạch thí nghiệm
						</CardTitle>
						<CardDescription>
							Các bước thực nghiệm cụ thể
						</CardDescription>
					</CardHeader>
					<CardContent className="flex-1 flex flex-col gap-4">
						<div className="flex gap-2">
							<Textarea
								placeholder="Gợi ý (Vd: Thêm ablation study...)"
								rows={2}
								className="text-xs"
								value={expText}
								onChange={(e) => setExpText(e.target.value)}
							/>
							<Button
								size="sm"
								onClick={handleGenExp}
								disabled={loadingExp || !contribConfirmed}
								className="h-auto"
							>
								{loadingExp ? (
									<Loader2 className="h-4 w-4 animate-spin" />
								) : (
									'Tạo'
								)}
							</Button>
						</div>

						{expPreview && (
							<div className="space-y-3 flex-1">
								{(expPreview.experimental_protocol || []).map(
									(exp: any, i: number) => (
										<div
											key={i}
											className="flex gap-3 text-xs bg-emerald-50/30 border border-emerald-100 rounded-md p-2"
										>
											<div className="shrink-0 font-bold text-emerald-700 bg-emerald-100 h-fit px-1.5 py-0.5 rounded">
												TN{i + 1}
											</div>
											<div>
												<p className="font-semibold text-slate-800">
													{exp.name}
												</p>
												<p className="text-slate-600">
													{exp.goal}
												</p>
											</div>
										</div>
									),
								)}
								<Button
									size="sm"
									variant="outline"
									className="w-full border-emerald-200 hover:bg-emerald-50 text-emerald-700"
									onClick={confirmExp}
									disabled={savingExp || expConfirmed}
								>
									{savingExp ? (
										'Đang lưu...'
									) : expConfirmed ? (
										<>
											<Check className="h-4 w-4 mr-1" /> Đã chốt Kế hoạch
										</>
									) : (
										<>
											<Check className="h-4 w-4 mr-1" />{' '}
											Chốt Kế hoạch
										</>
									)}
								</Button>
							</div>
						)}
					</CardContent>
				</Card>

				{/* CỘT 3: COMPUTE BUDGET */}
				<Card className="flex flex-col">
					<CardHeader>
						<CardTitle className="text-sm flex items-center gap-1.5">
							<Cpu className="h-4 w-4 text-purple-600" /> Kiểm tra
							tính khả thi
						</CardTitle>
						<CardDescription>
							Tài nguyên &amp; Thời gian ước lượng
						</CardDescription>
					</CardHeader>
					<CardContent className="flex-1 flex flex-col gap-4">
						<div className="flex gap-2">
							<Textarea
								placeholder="Gợi ý (Vd: Tôi chỉ có RTX 3090...)"
								rows={2}
								className="text-xs"
								value={budgetText}
								onChange={(e) => setBudgetText(e.target.value)}
							/>
							<Button
								size="sm"
								onClick={handleGenBudget}
								disabled={loadingBudget || !expConfirmed}
								className="h-auto"
							>
								{loadingBudget ? (
									<Loader2 className="h-4 w-4 animate-spin" />
								) : (
									'Tạo'
								)}
							</Button>
						</div>

						{budgetPreview && (
							<div className="space-y-3 flex-1">
								<div className="grid grid-cols-2 gap-2">
									<div className="border rounded-md p-2 text-center bg-slate-50">
										<p className="text-[10px] uppercase text-slate-500 font-semibold">
											Model
										</p>
										<p className="text-xs font-medium">
											{budgetPreview.compute_budget
												?.model || 'N/A'}
										</p>
									</div>
									<div className="border rounded-md p-2 text-center bg-slate-50">
										<p className="text-[10px] uppercase text-slate-500 font-semibold">
											VRAM
										</p>
										<p className="text-xs font-medium">
											{
												budgetPreview.compute_budget
													?.vram_estimate_gb
											}{' '}
											GB
										</p>
									</div>
									<div className="border rounded-md p-2 text-center bg-slate-50">
										<p className="text-[10px] uppercase text-slate-500 font-semibold">
											Thời gian
										</p>
										<p className="text-xs font-medium">
											{
												budgetPreview.compute_budget
													?.time_estimate_hours
											}{' '}
											giờ
										</p>
									</div>
									<div className="border rounded-md p-2 text-center bg-slate-50">
										<p className="text-[10px] uppercase text-slate-500 font-semibold">
											Chi phí
										</p>
										<p
											className="text-xs font-medium truncate"
											title={
												budgetPreview.compute_budget
													?.token_or_api_cost_estimate
											}
										>
											{
												budgetPreview.compute_budget
													?.token_or_api_cost_estimate
											}
										</p>
									</div>
								</div>
								<Button
									size="sm"
									variant="outline"
									className="w-full border-purple-200 hover:bg-purple-50 text-purple-700"
									onClick={confirmBudget}
									disabled={savingBudget || budgetConfirmed}
								>
									{savingBudget ? (
										'Đang lưu...'
									) : budgetConfirmed ? (
										<>
											<Check className="h-4 w-4 mr-1" /> Đã chốt Tài nguyên
										</>
									) : (
										<>
											<Check className="h-4 w-4 mr-1" />{' '}
											Chốt Tài nguyên
										</>
									)}
								</Button>
							</div>
						)}
					</CardContent>
				</Card>
			</div>
		</div>
	)
}
