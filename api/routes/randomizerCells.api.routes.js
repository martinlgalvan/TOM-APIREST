import express from 'express'
import * as CellController from '../controllers/randomizerCells.controller.js'

import {isLogin, isAdmin, userEditor} from '../middleware/auth.middleware.js'

const router = express.Router()

// Ruta para crear una celda asociada a un valor de una columna
router.post('/api/columnas/:columnValueId', CellController.createCell);

export default router