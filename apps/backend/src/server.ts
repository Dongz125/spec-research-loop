import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import { router as projectsRouter } from './routes/projects'
import { router as specsRouter } from './routes/specs'
import { router as authRouter } from './routes/auth'

const app = express()
app.use(cors({ origin: process.env.FRONTEND_URL ?? 'http://localhost:5173' }))
app.use(express.json({ limit: '2mb' }))
app.use('/auth', authRouter)
app.use('/projects', projectsRouter)
app.use('/projects/:id', specsRouter)

app.use((err: any, _req: any, res: any, _next: any) => {
	console.error(err)
	res.status(500).json({ error: err.message ?? 'Internal error' })
})

const PORT = process.env.PORT ?? 4000
app.listen(PORT, () => console.log(`SpecResearch Loop API on :${PORT}`))
