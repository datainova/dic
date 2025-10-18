import express from 'express'
import dotenv from 'dotenv'

dotenv.config()

const app = express()
app.use(express.json())

app.get('/health', (_, res) => res.json({ status: 'ok' }))

const PORT = process.env.PORT || 4000
if (require.main === module) {
	app.listen(PORT, () => console.log(`Backend listening on ${PORT}`))
}

export default app
