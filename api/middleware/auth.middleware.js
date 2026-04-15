import jwt from 'jsonwebtoken'
import * as userService from '../../services/users.services.js'
import * as RefreshTokenService from '../../services/refreshTokens.services.js'

// Helpers
function getJwtSecret() {
  return process.env.JWT_SECRET || 'toq_'
}
function getRefreshSecret() {
  return process.env.JWT_REFRESH_SECRET || getJwtSecret()
}
function isProd() {
  return process.env.NODE_ENV === 'production'
}
function refreshCookieOptions() {
  return {
    httpOnly: true,
    secure: isProd(),                         // true en prod (https)
    sameSite: isProd() ? 'none' : 'lax',      // cross-site en prod
    path: '/api'                               // cubre /api/auth/refresh y /api/users/refresh si existiera
  }
}
function signRefreshToken(user) {
  return jwt.sign(
    { id: user._id.toString(), purpose: 'refresh' },
    getRefreshSecret(),
    { expiresIn: process.env.REFRESH_EXPIRES || '365d' }
  )
}
function addDurationToDate(expiresInStr) {
  const m = String(expiresInStr).match(/^(\d+)\s*([dhm])$/i)
  const n = m ? Number(m[1]) : 365
  const unit = m ? m[2].toLowerCase() : 'd'
  const ms =
    unit === 'd' ? n * 24 * 60 * 60 * 1000 :
    unit === 'h' ? n * 60 * 60 * 1000 :
                   n * 60 * 1000
  return new Date(Date.now() + ms)
}

function extractToken(req) {
  const direct = req.headers['auth-token']
  if (direct) return direct

  const auth = req.headers.authorization || req.headers.Authorization
  if (auth && typeof auth === 'string') {
    const [type, value] = auth.split(' ')
    if (type?.toLowerCase() === 'bearer' && value) return value
  }
  return null
}

async function ensureRefreshCookie(req, res, user) {
  // Si ya viene cookie, no hacemos nada
  if (req.cookies?.refresh_token) return

  // Emitimos refresh nuevo (upgrade silencioso)
  const refreshToken = signRefreshToken(user)
  const refreshExp = addDurationToDate(process.env.REFRESH_EXPIRES || '365d')

  await RefreshTokenService.save({
    userId: user._id.toString(),
    token: refreshToken,
    expiresAt: refreshExp
  })

  res.cookie('refresh_token', refreshToken, {
    ...refreshCookieOptions(),
    expires: refreshExp
  })
}

function isLogin(req, res, next) {
  const token = extractToken(req)

  if (!token) {
    return res.status(401).json({
      code: 'AUTH_MISSING_TOKEN',
      message: 'Por favor vuelva a iniciar sesion.'
    })
  }

  let payload
  try {
    payload = jwt.verify(token, getJwtSecret())
  } catch (err) {
    if (err?.name === 'TokenExpiredError') {
      return res.status(401).json({
        code: 'ACCESS_EXPIRED',
        message: 'Por favor vuelva a iniciar sesion.'
      })
    }
    return res.status(401).json({
      code: 'ACCESS_INVALID',
      message: 'Por favor vuelva a iniciar sesion.'
    })
  }

  userService.findById(payload.id)
    .then(async (user) => {
      if (!user) {
        return res.status(401).json({
          code: 'AUTH_USER_NOT_FOUND',
          message: 'Por favor vuelva a iniciar sesion.'
        })
      }

      req.user = user

      // ✅ Upgrade silencioso: si no tiene refresh cookie, se la creamos
      try {
        await ensureRefreshCookie(req, res, user)
      } catch (e) {
        // No cortamos la request si falla el upgrade, solo loguear en server
        console.error('[AUTH] ensureRefreshCookie failed:', e?.message)
      }

      next()
    })
    .catch(() => {
      res.status(500).json({
        code: 'AUTH_INTERNAL',
        message: 'Error interno'
      })
    })
}

function isAdmin(req, res, next) {
  if (req.user?.role === 'admin') return next()
  res.status(403).json({ code: 'FORBIDDEN', message: 'No tenes permiso para acceder' })
}

export { isLogin, isAdmin }
