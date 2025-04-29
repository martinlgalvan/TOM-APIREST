import express from 'express'
import * as RoutineController from '../controllers/routine.api.controllers.js'

import * as usersController from '../controllers/users.api.controllers.js'
import {isLogin, isAdmin} from '../middleware/auth.middleware.js'

const router = express.Router()

// Semana
router.route('/api/week/:week_id')
    .get([isLogin], RoutineController.findByWeekId)
    .patch([isLogin, isAdmin], RoutineController.editWeek)
    .delete([isLogin, isAdmin],RoutineController.deleteWeek)





export default router