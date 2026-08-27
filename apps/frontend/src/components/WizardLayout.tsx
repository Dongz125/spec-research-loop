import { ReactNode, useState } from 'react'
import { Sparkles, User, ChevronLeft, ChevronRight, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { AccountModal } from '@/components/AccountModal'
import type { AuthUser } from '@/lib/api'

export interface WizardStep {
	id: string
	label: string
}

interface WizardLayoutProps {
	steps: WizardStep[]
	currentStepId: string
	/** số bước đã đi tới, tính từ 1 — quyết định step nào bấm được trên nav */
	furthestReached: number
	onNavigate: (id: string) => void
	projectTitle: string
	onTitleChange: (title: string) => void
	user: AuthUser | null
	onUserUpdated: (user: AuthUser) => void
	onHome: () => void
	onLogout: () => void
	onBack?: () => void
	onNext?: () => void
	children: ReactNode
}

export function WizardLayout({
	steps,
	currentStepId,
	furthestReached,
	onNavigate,
	projectTitle,
	onTitleChange,
	user,
	onUserUpdated,
	onHome,
	onLogout,
	onBack,
	onNext,
	children,
}: WizardLayoutProps) {
	const [accountOpen, setAccountOpen] = useState(false)
	const currentIndex = Math.max(
		0,
		steps.findIndex((s) => s.id === currentStepId),
	)
	const progressPct = ((currentIndex + 1) / steps.length) * 100

	return (
		<div className="flex min-h-screen flex-col bg-slate-50">
			{/* ---------- Header ---------- */}
			<header className="sticky top-0 z-20 border-b border-slate-200 bg-white/80 backdrop-blur">
				<div className="flex w-full items-center justify-between gap-4 px-6 py-3">
					{/* Logo */}
					<button
						type="button"
						onClick={onHome}
						className="flex shrink-0 items-center gap-2.5 rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
					>
						<div className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm">
							<Sparkles className="h-4 w-4" />
						</div>
						<span className="hidden text-base font-semibold text-slate-900 sm:inline">
							SpecResearch Loop
						</span>
					</button>

					{/* Navigation */}
					<nav className="flex flex-1 items-center justify-center gap-1 overflow-x-auto">
						{steps.map((s, i) => {
							const isActive = s.id === currentStepId
							const isDone = i < furthestReached - 1
							const isReachable = i < furthestReached
							return (
								<button
									key={s.id}
									disabled={!isReachable}
									onClick={() => onNavigate(s.id)}
									className={cn(
										'flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
										isActive
											? 'bg-indigo-50 text-indigo-700'
											: isReachable
												? 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
												: 'cursor-not-allowed text-slate-300',
									)}
								>
									{isDone && (
										<Check className="h-3.5 w-3.5 text-emerald-500" />
									)}
									{s.label}
								</button>
							)
						})}
					</nav>

					{/* Avatar */}
					<div className="flex shrink-0 items-center gap-3">
						<input
							value={projectTitle}
							onChange={(e) => onTitleChange(e.target.value)}
							className="hidden w-44 rounded-md bg-transparent text-right text-sm text-slate-500 focus:text-slate-900 focus:outline-none lg:block"
						/>
						<button
							type="button"
							aria-label="Mở tài khoản"
							onClick={() => setAccountOpen(true)}
							className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 transition-colors hover:bg-indigo-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
						>
							<User className="h-4 w-4" />
						</button>
					</div>
				</div>
			</header>

			<AccountModal
				open={accountOpen}
				user={user}
				onClose={() => setAccountOpen(false)}
				onUpdated={onUserUpdated}
				onLogout={onLogout}
			/>

			{/* ---------- Content ---------- */}
			<main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">
				{children}
			</main>

			{/* ---------- Footer / progress ---------- */}
			<footer className="sticky bottom-0 z-20 border-t border-slate-200 bg-white/90 backdrop-blur">
				<div className="mx-auto max-w-6xl px-6 py-3">
					<div className="mb-2 flex items-center justify-between text-xs font-medium text-slate-500">
						<span>
							Bước {currentIndex + 1}/{steps.length} ·{' '}
							{steps[currentIndex]?.label}
						</span>
						<span>{Math.round(progressPct)}%</span>
					</div>

					<div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
						<div
							className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-blue-500 transition-all duration-300"
							style={{ width: `${progressPct}%` }}
						/>
					</div>

					<div className="mt-3 flex justify-between">
						<Button
							variant="outline"
							size="sm"
							onClick={onBack}
							disabled={!onBack}
						>
							<ChevronLeft className="h-4 w-4" /> Bước trước
						</Button>
						<Button size="sm" onClick={onNext} disabled={!onNext}>
							Bước tiếp theo <ChevronRight className="h-4 w-4" />
						</Button>
					</div>
				</div>
			</footer>
		</div>
	)
}
