import { useEffect, useState } from 'react'
import { api } from './lib/api'
import type { ResearchSpec } from './lib/types'
import { WizardLayout, WizardStep } from './components/WizardLayout'

// Import các trang mới được refactor
import { Step1_Idea } from './pages/Step1_Idea'
import { Step2_RelatedWorkGap } from './pages/Step2_RelatedWorkGap'
import { Step3_ContributionExperiment } from './pages/Step3_ContributionExperiment'
import { Step4_Judge } from './pages/Step4_Judge'
import { Step5_Final } from './pages/Step5_Final'

const SCREENS: WizardStep[] = [
	{ id: 'idea', label: 'Ý tưởng & làm rõ' },
	{ id: 'related_gap', label: 'Liên quan & gap' },
	{ id: 'contribution', label: 'Contribution & thí nghiệm' },
	{ id: 'judge', label: 'Judge độc lập' },
	{ id: 'final', label: 'Spec cuối' },
]

const PROJECT_ID_KEY = 'specresearch_project_id'

export default function App() {
	const [projectId, setProjectId] = useState<string | null>(null)
	const [projectTitle, setProjectTitle] = useState(
		'Ý tưởng nghiên cứu chưa đặt tên',
	)
	const [spec, setSpec] = useState<ResearchSpec>({})
	const [screen, setScreen] = useState('idea')
	const [furthest, setFurthest] = useState(1)
	const [ready, setReady] = useState(false)
	const [initError, setInitError] = useState<string | null>(null)

	useEffect(() => {
		;(async () => {
			try {
				let id = localStorage.getItem(PROJECT_ID_KEY)
				if (!id) {
					const created = await api.createProject(
						'Ý tưởng nghiên cứu mới',
					)
					id = created.id
					localStorage.setItem(PROJECT_ID_KEY, id)
				}
				setProjectId(id)
				await refreshProject(id)
				setReady(true)
			} catch (e: any) {
				setInitError(
					e.message ??
						'Không kết nối được backend. Kiểm tra: backend đã chạy (npm run dev trong /backend) chưa, DATABASE_URL đúng chưa, và VITE_API_URL trong frontend/.env có trỏ đúng cổng backend không.',
				)
			}
		})()
	}, [])

	async function refreshProject(id: string) {
		const { project, latest_spec } = await api.getProject(id)
		setProjectTitle(project.title)
		setSpec(latest_spec?.data ?? {})
	}

	function goTo(id: string) {
		setScreen(id)
		const idx = SCREENS.findIndex((s) => s.id === id)
		setFurthest((f) => Math.max(f, idx + 1))
	}

	if (initError) {
		return (
			<div className="mx-auto max-w-xl px-6 py-16">
				<div className="rounded-xl border border-red-200 bg-red-50 p-5 shadow-sm">
					<h2 className="text-base font-semibold text-red-800">
						Không khởi tạo được project
					</h2>
					<p className="mt-2 text-sm text-red-700">{initError}</p>
				</div>
			</div>
		)
	}

	if (!ready || !projectId) {
		return (
			<div className="flex min-h-screen items-center justify-center text-sm text-slate-500">
				Đang khởi tạo project…
			</div>
		)
	}

	const currentIndex = SCREENS.findIndex((s) => s.id === screen)

	return (
		<WizardLayout
			steps={SCREENS}
			currentStepId={screen}
			furthestReached={furthest}
			onNavigate={goTo}
			projectTitle={projectTitle}
			onTitleChange={setProjectTitle}
			onBack={
				currentIndex > 0
					? () => goTo(SCREENS[currentIndex - 1].id)
					: undefined
			}
			onNext={
				currentIndex < SCREENS.length - 1
					? () => goTo(SCREENS[currentIndex + 1].id)
					: undefined
			}
		>
			{screen === 'idea' && (
				<Step1_Idea
					projectId={projectId}
					spec={spec}
					onConfirmed={() => refreshProject(projectId)}
				/>
			)}
			{screen === 'related_gap' && (
				<Step2_RelatedWorkGap
					projectId={projectId}
					spec={spec}
					onFieldConfirmed={() => refreshProject(projectId)}
				/>
			)}
			{screen === 'contribution' && (
				<Step3_ContributionExperiment
					projectId={projectId}
					spec={spec}
					onFieldConfirmed={() => refreshProject(projectId)}
				/>
			)}
			{screen === 'judge' && (
				<Step4_Judge
					projectId={projectId}
					spec={spec}
					onConfirmed={() => {
						refreshProject(projectId)
						goTo('final')
					}}
				/>
			)}
			{screen === 'final' && <Step5_Final spec={spec} />}
		</WizardLayout>
	)
}
