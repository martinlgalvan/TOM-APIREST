import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import WeekApiRoute from './api/routes/week.api.routes.js'
import UsersApiRoute from './api/routes/users.api.routes.js'

const app = express()

app.use(express.urlencoded({ extended: true }))
app.use(express.json())
app.use(cookieParser())

const defaultOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'https://planificaciontom.com',
  'https://www.planificaciontom.com'
]

const envOrigins = (process.env.FRONTEND_ORIGINS || '')
  .split(',')
  .map((value) => value.trim().replace(/\/$/, ''))
  .filter(Boolean)

const explicitOrigins = new Set([...defaultOrigins, ...envOrigins])

function isAllowedOrigin(origin) {
  if (!origin) return true
  const normalizedOrigin = origin.replace(/\/$/, '')
  if (explicitOrigins.has(normalizedOrigin)) return true
  return /^https:\/\/[^/]+\.vercel\.app$/.test(normalizedOrigin)
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

app.listen(2022, function () {
  console.log('server started')
})
