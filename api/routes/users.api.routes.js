import express from 'express'
import * as usersController from '../controllers/users.api.controllers.js'
import * as ColumnController from '../controllers/routine.api.controllers.js'


import {isLogin, isAdmin} from '../middleware/auth.middleware.js'
import {ValidateLogin, ValidateRegister} from '../middleware/validar.middleware.js'
import checkPlanLimit from '../middleware/checkPlanLimit.middleware.js'
import isPlanPaid from '../middleware/isPlanPaid.middleware.js'
import { skipForBlocks } from '../middleware/skipForBlocks.js';

const router = express.Router()


// Sesion
router.route('/api/users/login')
    .post([ValidateLogin], usersController.login)

router.route('/api/users/logout')
    .post(usersController.logout)


//Para encontrar usuarios según el id del entrenador, y crearlos
router.route('/api/users/:idEntrenador')
    .get(usersController.getUsersByEntrenador)
    .post(
        [isLogin, skipForBlocks(isAdmin, checkPlanLimit, isPlanPaid, ValidateRegister)],
        usersController.create
      );

router.route('/api/block/:blockId')
  .get([isLogin, isAdmin], ColumnController.getBlockById)
  .patch([isLogin, isAdmin], ColumnController.editBlock)
  .delete([isLogin, isAdmin], ColumnController.deleteBlock)


//Para encontrar y/o eliminar un usuario
router.route('/api/user/:userId')
    .get([isLogin],usersController.getUserById)
    .delete([isLogin, isAdmin, isPlanPaid],usersController.removeUser)
    .patch([isLogin, isAdmin, isPlanPaid],usersController.addUserProperty)

// Ruta para generar un QR para un usuario específico
router.get('/api/generate-qr/:userId', ColumnController.generateUserQR);

// Ruta para iniciar sesión usando el QR
router.post('/api/qr-login', ColumnController.loginWithQR);


export default router