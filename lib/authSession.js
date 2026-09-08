import jwt from 'jsonwebtoken'

import * as RefreshTokenService from '../services/refreshTokens.services.js'

/* Por debajo de este largo, un secreto se puede romper por fuerza bruta a
   partir de un solo token capturado. */
const LARGO_MINIMO_SECRETO = 32
let yaAvisoSecretoCorto = false

/**
 * El secreto con el que se firman y validan los tokens.
 *
 * Antes, si la variable faltaba, caia a un valor escrito en el codigo. Como
 * este repositorio es publico, eso significaba que una variable mal cargada en
 * Vercel dejaba la autenticacion abierta de par en par: cualquiera podia firmar
 * un token valido para cualquier usuario, y nada en el sistema lo delataba.
 *
 * Ahora, si falta la variable, la aplicacion se niega a operar. Es preferible
 * que no funcione a que funcione sin proteccion.
 */
function getJwtSecret() {
  const secreto = (process.env.JWT_SECRET || '').trim()

  if (!secreto) {
    throw new Error(
      'Falta JWT_SECRET: sin un secreto propio no se pueden firmar ni validar ' +
      'las sesiones. Cargala en las variables de entorno.'
    )
  }

  /* Un secreto corto no impide arrancar -eso cortaria produccion de golpe-,
     pero queda registrado para que alguien lo cambie. */
  if (secreto.length < LARGO_MINIMO_SECRETO && !yaAvisoSecretoCorto) {
    yaAvisoSecretoCorto = true
    console.warn(
      `[AUTH] JWT_SECRET tiene ${secreto.length} caracteres y se recomiendan al menos ` +
      `${LARGO_MINIMO_SECRETO}. Un secreto corto se puede romper por fuerza bruta.`
    )
  }

  return secreto
}

function getRefreshSecret() {
  return process.env.JWT_REFRESH_SECRET || getJwtSecret()
}

function getAccessExpires() {
  return process.env.ACCESS_EXPIRES || '1h'
}

function getRefreshExpires() {
  return process.env.REFRESH_EXPIRES || '365d'
}

function getAccessRestoreExpires() {
  return process.env.ACCESS_RESTORE_EXPIRES || getRefreshExpires()
}

function getRefreshSameSite() {
  const configured = String(process.env.REFRESH_COOKIE_SAMESITE || '').trim().toLowerCase()
  if (configured === 'strict' || configured === 'none') return configured
  return 'lax'
}

function isProd() {
  return process.env.NODE_ENV === 'production'
}

function refreshCookieOptions() {
  return {
    httpOnly: true,
    secure: isProd(),
    sameSite: getRefreshSameSite(),
    path: '/api'
  }
}

function signAccessToken(user) {
  return jwt.sign(
    { id: user._id.toString(), role: user.role },
    getJwtSecret(),
    { expiresIn: getAccessExpires() }
  )
}

function signRefreshToken(user) {
  return jwt.sign(
    { id: user._id.toString(), purpose: 'refresh' },
    getRefreshSecret(),
    { expiresIn: getRefreshExpires() }
  )
}

function addDurationToDate(expiresInStr) {
  return new Date(Date.now() + durationToMs(expiresInStr))
}

function durationToMs(expiresInStr) {
  const m = String(expiresInStr).match(/^(\d+)\s*([dhm])$/i)
  const n = m ? Number(m[1]) : 365
  const unit = m ? m[2].toLowerCase() : 'd'
  return (
    unit === 'd' ? n * 24 * 60 * 60 * 1000 :
    unit === 'h' ? n * 60 * 60 * 1000 :
                   n * 60 * 1000
  )
}

function setRefreshCookie(res, token, expiresAt) {
  res.cookie('refresh_token', token, {
    ...refreshCookieOptions(),
    expires: expiresAt
  })
}

async function issueRefreshSession(res, user) {
  const refreshToken = signRefreshToken(user)
  const refreshExp = addDurationToDate(getRefreshExpires())

  await RefreshTokenService.save({
    userId: user._id.toString(),
    token: refreshToken,
    expiresAt: refreshExp
  })

  setRefreshCookie(res, refreshToken, refreshExp)

  return { refreshToken, refreshExp }
}

async function issueSession(res, user) {
  const accessToken = signAccessToken(user)
  const { refreshToken, refreshExp } = await issueRefreshSession(res, user)

  return { accessToken, refreshToken, refreshExp }
}

function clearRefreshCookie(res) {
  res.clearCookie('refresh_token', refreshCookieOptions())
}

function sanitizeUser(userDoc) {
  if (!userDoc) return userDoc

  const user = { ...userDoc }
  delete user.password

  if (user.payment_info?.security) {
    user.payment_info = { ...user.payment_info }
    user.payment_info.security = { ...user.payment_info.security }
    delete user.payment_info.security.password
  }

  return user
}

export {
  addDurationToDate,
  clearRefreshCookie,
  durationToMs,
  getJwtSecret,
  getAccessRestoreExpires,
  getRefreshSecret,
  issueRefreshSession,
  issueSession,
  isProd,
  refreshCookieOptions,
  sanitizeUser,
  signAccessToken,
  signRefreshToken
}
