import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import WeekApiRoute from '../routes/week.api.routes.js'
import UsersApiRoute from '../routes/users.api.routes.js'
import AdminApiRoute from '../routes/admin.api.routes.js'
import NutritionApiRoute from '../routes/nutrition.api.routes.js'
import NutritionFoodsApiRoute from '../routes/nutrition.foods.api.routes.js'

const app = express()

app.use(express.urlencoded({ extended: true }))
// Los planes incluyen valores nutricionales detallados; solo esta ruta necesita
// un cuerpo mayor que el limite JSON estandar del resto de la API.
app.use('/api/nutrition', express.json({ limit: '1mb' }))
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

/* Vercel define VERCEL=1 en runtime. NODE_ENV no alcanza como unica senal:
   el .env local no lo define. */
const enProduccion = Boolean(process.env.VERCEL) || process.env.NODE_ENV === 'production'

const LOOPBACK = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/
const RED_PRIVADA = /^https?:\/\/(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(:\d+)?$/

/* En desarrollo el front puede estar en cualquier puerto -Vite toma otro si
   el 5173 esta ocupado-, en 127.0.0.1 en vez de localhost, o en la IP de la
   red local cuando se prueba desde el telefono. Todo eso es la misma maquina
   o la red de quien desarrolla. En produccion no se acepta ninguno. */
function esOrigenDeDesarrollo(origin) {
  if (enProduccion) return false
  return LOOPBACK.test(origin) || RED_PRIVADA.test(origin)
}

function isAllowedOrigin(origin) {
  if (!origin) return true
  const normalizedOrigin = origin.replace(/\/$/, '')
  if (explicitOrigins.has(normalizedOrigin)) return true
  if (esOrigenDeDesarrollo(normalizedOrigin)) return true
  return /^https:\/\/[^/]+\.vercel\.app$/.test(normalizedOrigin)
}

app.use(cors({
  origin(origin, cb) {
    if (isAllowedOrigin(origin)) return cb(null, true)

    /* Un origen no habilitado es un problema del cliente, no una falla del
       servidor. Sin status esto salia como 500 y quedaba registrado como
       "Error no controlado", que parecia una caida. */
    const error = new Error(`Origen no habilitado por CORS: ${origin}`)
    error.status = 403
    return cb(error)
  },
  credentials: true
}))

app.use(express.static('public'))
app.use('/', UsersApiRoute)
app.use('/', WeekApiRoute)
app.use('/', AdminApiRoute)
app.use('/', NutritionApiRoute)
app.use('/', NutritionFoodsApiRoute)

/* Ultimo middleware: cualquier error que se escape de un controlador se
   responde con su status en vez de propagarse y tumbar el proceso.
   Va despues de las rutas a proposito. */
app.use(function (error, req, res, next) {
  if (res.headersSent) return next(error)

  /* Los errores del parser de JSON ya vienen con su propio status (400 cuando
     el cuerpo no es un objeto o esta mal formado). Aplastarlos a 500 haria
     pasar un error del cliente por uno del servidor. */
  const status = Number(error?.status || error?.statusCode) || 500
  const esDelCliente = status >= 400 && status < 500

  if (!esDelCliente) {
    console.error('Error no controlado en', req.method, req.originalUrl, '-', error?.message)
  }

  res.status(status).json({
    message: esDelCliente ? (error?.message || 'Peticion invalida.') : 'Error interno del servidor.'
  })
})

export default app
