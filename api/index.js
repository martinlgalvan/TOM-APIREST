import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import WeekApiRoute from './routes/week.api.routes.js'
import UsersApiRoute from './routes/users.api.routes.js'

const app = express()

app.use(express.urlencoded({ extended: true }))
app.use(express.json())
app.use(cookieParser())

const explicitOrigins = (process.env.FRONTEND_ORIGINS || 'http://localhost:5173,http://localhost:3000,https://planificaciontom.com')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean)

function isAllowedOrigin(origin) {
  if (!origin) return true
  if (explicitOrigins.includes(origin)) return true
  return /^https:\/\/[^/]+\.vercel\.app$/.test(origin)
}

app.use(cors({
  origin(origin, cb) {
    if (isAllowedOrigin(origin)) return cb(null, true)
    return cb(new Error('Not allowed by CORS'))
  },
  credentials: true
}))

app.use(express.static('public'))
app.use('/', UsersApiRoute)
app.use('/', WeekApiRoute)

export default app
