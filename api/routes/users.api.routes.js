import express from 'express'
import * as usersController from '../controllers/users.api.controllers.js'
import * as ListExercises from '../controllers/listExercises.api.controllers.js'
import * as ColumnController from '../controllers/randomizerColumns.controller.js'
import * as CellController from '../controllers/randomizerCells.controller.js'

import {isLogin, isAdmin} from '../middleware/auth.middleware.js'
import {ValidateLogin, ValidateRegister} from '../middleware/validar.middleware.js'

const router = express.Router()


// Sesion
router.route('/api/users/login')
    .post([ValidateLogin], usersController.login)

router.route('/api/users/logout')
    .post(usersController.logout)


//Para encontrar usuarios según el id del entrenador, y crearlos
router.route('/api/users/:idEntrenador')
    .get([isLogin, isAdmin],usersController.getUsersByEntrenador)
    .post([isLogin, isAdmin],usersController.create)

//Para encontrar y/o eliminar un usuario
router.route('/api/user/:userId')
    .get([isLogin, isAdmin],usersController.getUserById)
    .delete([isLogin, isAdmin],usersController.removeUser)

//Base de datos de ejercicios
router.route('/api/exercises/:idEntrenador')
    .get([isLogin, isAdmin],ListExercises.findExercises)
    .post([isLogin, isAdmin],ListExercises.createExercise)

//Base de datos de ejercicios
router.route('/api/exercises/:exercise_id')
    .delete([isLogin, isAdmin],ListExercises.deleteExercise)
    .patch([isLogin, isAdmin],ListExercises.editExercise)

//Columns
    router.route('/api/columnas')
    .get([isLogin, isAdmin],ColumnController.getAllColumns)
    .post([isLogin, isAdmin],ColumnController.createColumn)
  
  router.route('/api/columnas/:idColumn')
    .patch([isLogin, isAdmin],ColumnController.editColumn)
    .delete([isLogin, isAdmin],ColumnController.deleteColumn)

// Cells

// Ruta para crear una celda asociada a un valor de una columna
router.post('/api/columnas/:columnValueId', CellController.createCell);


export default router