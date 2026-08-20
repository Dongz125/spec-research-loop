import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import type { SpecVersion } from '../lib/types'

export function VersionHistory({
	projectId,
	onRestored,
}: {
	projectId: string
	onRestored: () => void
}) {
	const [versions, setVersions] = useState<SpecVersion[]>([])
	const [open, setOpen] = useState(false)

	useEffect(() => {
		if (open)
			api.getVersions(projectId)
				.then(setVersions)
				.catch(() => {})
	}, [open, projectId])

	return (
		<div className="toolbar">
			<button className="btn ghost" onClick={() => setOpen((v) => !v)}>
				{open ? 'Đóng lịch sử phiên bản' : 'Lịch sử phiên bản'}
			</button>
			{open && (
				<div
					className="card"
					style={{
						position: 'absolute',
						marginTop: 36,
						zIndex: 10,
						minWidth: 340,
					}}
				>
					<div className="version-list">
						{versions.length === 0 && (
							<p className="hint-text">Chưa có phiên bản nào.</p>
						)}
						{versions.map((v) => (
							<div className="version-row" key={v.id}>
								<span>
									<span className="v-num">
										v{v.version_number}
									</span>{' '}
									· {v.step} ·{' '}
									{v.changed_fields.join(', ') || 'khởi tạo'}
								</span>
								<button
									className="btn"
									onClick={async () => {
										await api.rollback(
											projectId,
											v.version_number,
										)
										onRestored()
										setOpen(false)
									}}
								>
									Quay lại
								</button>
							</div>
						))}
					</div>
				</div>
			)}
		</div>
	)
}
