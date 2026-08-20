export interface ScreenDef {
	id: string
	index: string // vd "01"
	label: string
}

interface Props {
	screens: ScreenDef[]
	current: string
	furthestReached: number
	onSelect: (id: string) => void
}

export function StepNav({
	screens,
	current,
	furthestReached,
	onSelect,
}: Props) {
	return (
		<nav className="step-nav">
			{screens.map((s, i) => (
				<button
					key={s.id}
					className={`step-tab ${s.id === current ? 'active' : ''} ${
						i < furthestReached ? 'done' : ''
					}`}
					onClick={() => onSelect(s.id)}
				>
					<span className="step-index">[{s.index}]</span>
					<span className="step-label">{s.label}</span>
				</button>
			))}
		</nav>
	)
}
