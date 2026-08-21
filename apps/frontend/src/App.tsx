import { useEffect, useState } from 'react'
import { api } from './lib/api'
import type { ResearchSpec } from './lib/types'
import { WizardLayout, WizardStep } from './components/WizardLayout'

import { Dashboard } from './pages/Dashboard'
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

export default function App() {
	const [userId, setUserId] = useState<string | null>(
		localStorage.getItem('specresearch_user_id'),
	)
	const [projectId, setProjectId] = useState<string | null>(null)
	const [projectTitle, setProjectTitle] = useState(
		'Ý tưởng nghiên cứu chưa đặt tên',
	)
	const [spec, setSpec] = useState<ResearchSpec>({})
	const [screen, setScreen] = useState('idea')
	const [furthest, setFurthest] = useState(1)

	function isStepCompleted(stepId: string) {
		if (stepId === 'idea') return !!spec.problem_statement?.value
		if (stepId === 'related_gap') return !!spec.gap_candidates?.value
		if (stepId === 'contribution') return !!spec.compute_budget?.value
		return true
	}

	async function loadProject(id: string) {
		const { project, latest_spec } = await api.getProject(id)
		setProjectTitle(project.title)
		setSpec(latest_spec?.data ?? {})
		setProjectId(id)

		const stepMap: Record<string, string> = {
			idea_capture: 'idea',
			gap: 'related_gap',
			feasibility: 'contribution',
			judge: 'judge',
			final: 'final',
		}

		const targetScreen = stepMap[project.currentStep] || 'idea'
		setScreen(targetScreen)

		const targetIdx = SCREENS.findIndex((s) => s.id === targetScreen)
		setFurthest(Math.max(1, targetIdx + 1))
	}

	// NẾU CHƯA CÓ PROJECT NÀO ĐƯỢC CHỌN (Bao gồm cả trạng thái chưa đăng nhập)
	if (!projectId) {
		return (
			<Dashboard
				userId={userId}
				onLoginSuccess={(id) => {
					localStorage.setItem('specresearch_user_id', id)
					setUserId(id)
				}}
				onLogout={() => {
					localStorage.removeItem('specresearch_user_id')
					setUserId(null)
					setProjectId(null)
				}}
				onSelectProject={loadProject}
			/>
		)
	}

	// ĐÃ CHỌN PROJECT -> VÀO LUỒNG WIZARD
	const currentIndex = SCREENS.findIndex((s) => s.id === screen)
	const canGoNext = isStepCompleted(screen)

	return (
		<WizardLayout
			steps={SCREENS}
			currentStepId={screen}
			furthestReached={furthest}
			onNavigate={(id) => {
				const targetIdx = SCREENS.findIndex((s) => s.id === id)
				if (targetIdx < furthest) {
					setScreen(id)
				}
			}}
			projectTitle={projectTitle}
			onTitleChange={setProjectTitle}
			onBack={
				currentIndex > 0
					? () => setScreen(SCREENS[currentIndex - 1].id)
					: undefined
			}
			onNext={
				canGoNext && currentIndex < SCREENS.length - 1
					? () => {
							const nextIdx = currentIndex + 1
							setScreen(SCREENS[nextIdx].id)
							setFurthest((prev) => Math.max(prev, nextIdx + 1))
						}
					: undefined
			}
		>
			<div className="mb-4">
				<button
					onClick={() => setProjectId(null)}
					className="text-xs font-medium text-slate-500 hover:text-indigo-600 transition-colors"
				>
					← Quay lại danh sách dự án
				</button>
			</div>

			{screen === 'idea' && (
				<Step1_Idea
					projectId={projectId}
					spec={spec}
					onConfirmed={() => loadProject(projectId)}
				/>
			)}
			{screen === 'related_gap' && (
				<Step2_RelatedWorkGap
					projectId={projectId}
					spec={spec}
					onFieldConfirmed={() => loadProject(projectId)}
				/>
			)}
			{screen === 'contribution' && (
				<Step3_ContributionExperiment
					projectId={projectId}
					spec={spec}
					onFieldConfirmed={() => loadProject(projectId)}
				/>
			)}
			{screen === 'judge' && (
				<Step4_Judge
					projectId={projectId}
					spec={spec}
					onConfirmed={() => {
						loadProject(projectId)
						setScreen('final')
					}}
				/>
			)}
			{screen === 'final' && <Step5_Final spec={spec} />}
		</WizardLayout>
	)
}
