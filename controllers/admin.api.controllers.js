import * as AdminService from '../services/admin.services.js'
import { isSuperAdminUser } from '../lib/authorization.js'

/**
 * Le dice al front si quien pregunta puede ver el panel.
 *
 * Existe para que el navegador no tenga que adivinarlo. La decision es del
 * servidor: el front solo dibuja o no dibuja el acceso, y aunque alguien lo
 * fuerce a dibujarlo, cada endpoint del panel vuelve a exigir el permiso.
 *
 * Va sin isSuperAdmin a proposito -solo isLogin-: tiene que poder responder
 * "no" en vez de 404, porque lo llama cualquier usuario logueado.
 */
async function quienSoy(req, res) {
  res.json({ superadmin: isSuperAdminUser(req.user) })
}

async function metricas(req, res) {
  try {
    const [negocio, uso, datos] = await Promise.all([
      AdminService.metricasDeNegocio(),
      AdminService.metricasDeUso(),
      AdminService.metricasDeDatos()
    ])

    res.json({ negocio, uso, datos, generado: new Date().toISOString() })
  } catch (error) {
    console.error('[ADMIN] metricas:', error?.message)
    res.status(500).json({ code: 'ADMIN_METRICS', message: 'No se pudieron calcular las metricas.' })
  }
}

async function entrenadores(req, res) {
  try {
    res.json(await AdminService.listarEntrenadores())
  } catch (error) {
    console.error('[ADMIN] entrenadores:', error?.message)
    res.status(500).json({ code: 'ADMIN_COACHES', message: 'No se pudo obtener la lista de entrenadores.' })
  }
}

export { quienSoy, metricas, entrenadores }
