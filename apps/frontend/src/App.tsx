import { useEffect, useState } from 'react'
import { api, type AuthUser } from './lib/api'
import type { ResearchSpec } from './lib/types'
import { WizardLayout, WizardStep } from './components/WizardLayout'
import { CurrentSpecModal } from './components/CurrentSpecModal'
import { Button } from './components/ui/button'
import { Eye } from 'lucide-react'

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

const STEP_TO_SCREEN: Record<string, string> = {
	idea_capture: 'idea',
	decomposition: 'idea',
	related_work: 'related_gap',
	gap: 'related_gap',
	contribution: 'contribution',
	experiment_design: 'contribution',
	feasibility: 'contribution',
	judge: 'judge',
	judge_resolution: 'final',
	final: 'final',
}

type HistoryMode = 'push' | 'replace' | 'none'

function readProjectRoute() {
	const match = window.location.pathname.match(
		/^\/projects\/([^/]+)\/(idea|related_gap|contribution|judge|final)\/?$/,
	)
	if (!match) return null
	return { projectId: decodeURIComponent(match[1]), screen: match[2] }
}

function projectPath(projectId: string, screen: string) {
	return `/projects/${encodeURIComponent(projectId)}/${screen}`
}

function reachedScreens(spec: ResearchSpec, currentStep: string) {
	let reached = 1
	if (spec.problem_statement?.value) reached = 2
	if (spec.gap_candidates?.value) reached = 3
	if (
		spec.contributions?.status === 'CONFIRMED' &&
		spec.claim_evidence_matrix?.status === 'CONFIRMED' &&
		spec.experimental_protocol?.status === 'CONFIRMED' &&
		spec.compute_budget?.status === 'CONFIRMED'
	) {
		reached = 4
	}
	if (currentStep === 'judge_resolution' || currentStep === 'final') reached = 5
	return reached
}

export default function App() {
	const [userId, setUserId] = useState<string | null>(
		localStorage.getItem('specresearch_token')
			? localStorage.getItem('specresearch_user_id')
			: null,
	)
	const [projectId, setProjectId] = useState<string | null>(null)
	const [currentUser, setCurrentUser] = useState<AuthUser | null>(null)
	const [projectTitle, setProjectTitle] = useState(
		'Ý tưởng nghiên cứu chưa đặt tên',
	)
	const [spec, setSpec] = useState<ResearchSpec>({})
	const [specRevision, setSpecRevision] = useState('empty')
	const [screen, setScreen] = useState('idea')
	const [furthest, setFurthest] = useState(1)
	const [specModalOpen, setSpecModalOpen] = useState(false)

	function writeProjectRoute(id: string, targetScreen: string, mode: HistoryMode) {
		if (mode === 'none') return
		const method = mode === 'replace' ? 'replaceState' : 'pushState'
		window.history[method]({}, '', projectPath(id, targetScreen))
	}

	function navigateToScreen(targetScreen: string, mode: HistoryMode = 'push') {
		if (!projectId) return
		setScreen(targetScreen)
		writeProjectRoute(projectId, targetScreen, mode)
	}

	async function loadProject(
		id: string,
		requestedScreen?: string,
		historyMode: HistoryMode = 'push',
	) {
		const { project, latest_spec } = await api.getProject(id)
		const nextSpec = (latest_spec?.data ?? {}) as ResearchSpec
		const nextFurthest = reachedScreens(nextSpec, project.currentStep)
		const fallback = STEP_TO_SCREEN[project.currentStep] || 'idea'
		const requestedIndex = SCREENS.findIndex((item) => item.id === requestedScreen)
		const fallbackIndex = SCREENS.findIndex((item) => item.id === fallback)
		const targetScreen =
			requestedIndex >= 0 && requestedIndex < nextFurthest
				? requestedScreen!
				: fallbackIndex >= 0 && fallbackIndex < nextFurthest
					? fallback
					: SCREENS[nextFurthest - 1].id

		setProjectTitle(project.title)
		setSpec(nextSpec)
		setSpecRevision(latest_spec?.id ?? 'empty')
		setProjectId(id)
		setScreen(targetScreen)
		setFurthest(nextFurthest)
		if (
			historyMode === 'none' &&
			requestedScreen &&
			requestedScreen !== targetScreen
		) {
			writeProjectRoute(id, targetScreen, 'replace')
		} else {
			writeProjectRoute(id, targetScreen, historyMode)
		}
	}

	function showDashboard(mode: HistoryMode = 'push') {
		setProjectId(null)
		setSpec({})
		setSpecRevision('empty')
		if (mode !== 'none') {
			window.history[mode === 'replace' ? 'replaceState' : 'pushState'](
				{},
				'',
				'/',
			)
		}
	}

	function logout() {
		localStorage.removeItem('specresearch_user_id')
		localStorage.removeItem('specresearch_token')
		setUserId(null)
		setCurrentUser(null)
		showDashboard('replace')
	}

	useEffect(() => {
		if (localStorage.getItem('specresearch_token')) {
			void api.getMe().then(setCurrentUser)
		}
		const openCurrentUrl = () => {
			const route = readProjectRoute()
			if (route && localStorage.getItem('specresearch_token')) {
				void loadProject(route.projectId, route.screen, 'none')
			} else {
				showDashboard('none')
			}
		}

		openCurrentUrl()
		window.addEventListener('popstate', openCurrentUrl)
		return () => window.removeEventListener('popstate', openCurrentUrl)
	}, [])

	function isStepCompleted(stepId: string) {
		if (stepId === 'idea') return !!spec.problem_statement?.value
		if (stepId === 'related_gap') return !!spec.gap_candidates?.value
		if (stepId === 'contribution') {
			return (
				spec.contributions?.status === 'CONFIRMED' &&
				spec.claim_evidence_matrix?.status === 'CONFIRMED' &&
				spec.experimental_protocol?.status === 'CONFIRMED' &&
				spec.compute_budget?.status === 'CONFIRMED'
			)
		}
		return true
	}

	if (!projectId) {
		return (
			<Dashboard
				userId={userId}
				user={currentUser}
				onLoginSuccess={(user, token) => {
					localStorage.setItem('specresearch_user_id', user.id)
					localStorage.setItem('specresearch_token', token)
					setUserId(user.id)
					setCurrentUser(user)
					const route = readProjectRoute()
					if (route) void loadProject(route.projectId, route.screen, 'none')
				}}
				onLogout={logout}
				onUserUpdated={setCurrentUser}
				onSelectProject={(id) => void loadProject(id)}
			/>
		)
	}

	const currentIndex = SCREENS.findIndex((item) => item.id === screen)
	const canGoNext = isStepCompleted(screen)

	return (
		<WizardLayout
			steps={SCREENS}
			currentStepId={screen}
			furthestReached={furthest}
			onNavigate={(id) => {
				const targetIndex = SCREENS.findIndex((item) => item.id === id)
				if (targetIndex < furthest) navigateToScreen(id)
			}}
			projectTitle={projectTitle}
			onTitleChange={setProjectTitle}
			user={currentUser}
			onUserUpdated={setCurrentUser}
			onHome={() => showDashboard()}
			onLogout={logout}
			onBack={
				currentIndex > 0
					? () => navigateToScreen(SCREENS[currentIndex - 1].id)
					: undefined
			}
			onNext={
				canGoNext && currentIndex < SCREENS.length - 1
					? () => {
							const nextIndex = currentIndex + 1
							setFurthest((previous) => Math.max(previous, nextIndex + 1))
							navigateToScreen(SCREENS[nextIndex].id)
						}
					: undefined
			}
		>
			<div className="mb-4 flex items-center justify-between gap-3">
				<button
					onClick={() => showDashboard()}
					className="text-xs font-medium text-slate-500 hover:text-indigo-600 transition-colors"
				>
					← Quay lại danh sách dự án
				</button>
				<Button
					variant="outline"
					size="sm"
					onClick={() => setSpecModalOpen(true)}
				>
					<Eye className="h-4 w-4" /> Xem spec hiện tại
				</Button>
			</div>

			{screen === 'idea' && (
				<Step1_Idea
					projectId={projectId}
					spec={spec}
					onConfirmed={() => loadProject(projectId, 'idea', 'replace')}
				/>
			)}
			{screen === 'related_gap' && (
				<Step2_RelatedWorkGap
					projectId={projectId}
					spec={spec}
					onFieldConfirmed={() =>
						loadProject(projectId, 'related_gap', 'replace')
					}
				/>
			)}
			{screen === 'contribution' && (
				<Step3_ContributionExperiment
					key={`${projectId}:${specRevision}:contribution`}
					projectId={projectId}
					spec={spec}
					onFieldConfirmed={() =>
						loadProject(projectId, 'contribution', 'replace')
					}
				/>
			)}
			{screen === 'judge' && (
				<Step4_Judge
					projectId={projectId}
					spec={spec}
					onConfirmed={() => loadProject(projectId, 'final', 'replace')}
				/>
			)}
			{screen === 'final' && <Step5_Final spec={spec} />}

			<CurrentSpecModal
				open={specModalOpen}
				onClose={() => setSpecModalOpen(false)}
				spec={spec}
				currentStepLabel={SCREENS[currentIndex]?.label ?? screen}
				currentStep={currentIndex + 1}
				totalSteps={SCREENS.length}
			/>
		</WizardLayout>
	)
}
