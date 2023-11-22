import express from 'express'
import * as ColumnController from '../controllers/randomizerColumns.controller.js'

import {isLogin, isAdmin, userEditor} from '../middleware/auth.middleware.js'

const router = express.Router()

// Ruta para crear una columna

router.route('/api/columnas')
  .get(ColumnController.getAllColumns)
  .post(ColumnController.createColumn)

router.route('/api/columnas/:idColumn')
  .patch(ColumnController.editColumn)
  .delete(ColumnController.deleteColumn)


export default router