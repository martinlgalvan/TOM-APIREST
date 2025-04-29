import express from 'express'
import * as RoutineController from '../controllers/routine.api.controllers.js'

import {isLogin, isAdmin, userEditor} from '../middleware/auth.middleware.js'

const router = express.Router()


//  Ejercicio
router.route('/api/week/:week_id/day/:day_id/exercise')
    .put([isLogin], RoutineController.editById)


router.route('/api/week/:week_id/day/:day_id')
    .get([isLogin, isAdmin],RoutineController.findExercises)



export default router