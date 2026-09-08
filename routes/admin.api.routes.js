/**
 * Panel interno. Todo lo de aca exige isLogin + isSuperAdmin.
 *
 * isLogin va siempre primero porque es quien deja el usuario en req.user
 * leyendolo de la base; isSuperAdmin compara ese usuario contra la variable de
 * entorno SUPERADMIN_IDS.
 *
 * La unica excepcion es /api/admin/me, que responde si o no y por eso lleva
 * solo isLogin: el front la usa para saber si mostrar el acceso al panel.
 */
import express from 'express'
import * as adminController from '../controllers/admin.api.controllers.js'
import { isLogin } from '../middleware/auth.middleware.js'
import { isSuperAdmin } from '../lib/authorization.js'

const router = express.Router()

router.route('/api/admin/me')
  .get([isLogin], adminController.quienSoy)

router.route('/api/admin/metricas')
  .get([isLogin, isSuperAdmin], adminController.metricas)

router.route('/api/admin/entrenadores')
  .get([isLogin, isSuperAdmin], adminController.entrenadores)

export default router
