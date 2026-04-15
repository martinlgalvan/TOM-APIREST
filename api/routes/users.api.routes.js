import express from 'express'
import * as usersController from '../controllers/users.api.controllers.js'
import * as ColumnController from '../controllers/routine.api.controllers.js'

import { isLogin, isAdmin } from '../middleware/auth.middleware.js'
import { ValidateLogin, ValidateRegister } from '../middleware/validar.middleware.js'
import checkPlanLimit from '../middleware/checkPlanLimit.middleware.js'
import isPlanPaid from '../middleware/isPlanPaid.middleware.js'
import { skipForBlocks } from '../middleware/skipForBlocks.js'

const router = express.Router()

// =========================
// Helpers de autorizacion
// =========================
function selfOrAdmin(paramName = 'userId') {
  return (req, res, next) => {
    const me = req.user?._id?.toString?.() || String(req.user?._id || '')
    const target = String(req.params?.[paramName] || '')
    if (!me) return res.status(401).json({ message: 'No autenticado' })

    // Admin pasa
    if (req.user?.role === 'admin') return next()

    // Usuario "self"
    if (me === target) return next()

    return res.status(403).json({ message: 'No tenes permiso para acceder' })
  }
}

// =========================
// Sesion
// =========================
router.route('/api/users/login')
  .post([ValidateLogin], usersController.login)

// ✅ NUEVO: refresh (publico) - se valida con refreshToken en body/cookie
router.route('/api/auth/refresh')
  .post(usersController.refresh)

// Logout: podes hacerlo publico si revocas por refreshToken,
// o protegido si queres logout "por access token".
router.route('/api/users/logout')
  .post(usersController.logout)

// =========================
// Usuarios (coach/admin)
// =========================
router.route('/api/users/:idEntrenador')
  // 🔒 recomendado: info privada del coach
  .get([isLogin, isAdmin], usersController.getUsersByEntrenador)
  .post(
    [
      // ✅ FIX: isAdmin necesita req.user => primero isLogin
      isLogin,
      skipForBlocks(isAdmin, checkPlanLimit, isPlanPaid, ValidateRegister)
    ],
    usersController.create
  )

// =========================
// Blocks
// =========================
router.route('/api/block/:blockId')
  .get([isLogin, isAdmin], ColumnController.getBlockById)
  .patch([isLogin, isAdmin], ColumnController.editBlock)
  .delete([isLogin, isAdmin], ColumnController.deleteBlock)

// =========================
// Usuario por ID
// =========================
router.route('/api/user/:userId')
  // ✅ si queres que un usuario vea SU perfil, y admin vea cualquiera:
  .get([isLogin, selfOrAdmin('userId')], usersController.getUserById)
  .delete([isLogin, isAdmin, isPlanPaid], usersController.removeUser)
  .patch([isLogin, isAdmin, isPlanPaid], usersController.addUserProperty)

// =========================
// Openers (calendario deportivo)
// =========================
router.route('/api/coach/:coachId/openers/templates')
  .get([isLogin, isAdmin], usersController.getOpenersTemplatesByCoach)
  .put([isLogin, isAdmin], usersController.saveOpenersTemplatesByCoach)

router.route('/api/user/:userId/openers/plans')
  .get([isLogin, selfOrAdmin('userId')], usersController.getOpenersPlansByUser)
  .put([isLogin, isAdmin], usersController.saveOpenersPlansByUser)

// =========================
// QR
// =========================
router.get('/api/generate-qr/:userId',
  [isLogin, isAdmin],
  ColumnController.generateUserQR
)

// QR login tiene que ser publico (viene sin sesion)
router.post('/api/qr-login', ColumnController.loginWithQR)

// =========================
// Announcements
// =========================
router.route('/api/announcements')
  .post([isLogin, isAdmin], usersController.createAnnouncement)

router.route('/api/announcements/user/:userId')
  // ✅ IMPORTANTE: self o admin
  .get([isLogin, selfOrAdmin('userId')], usersController.getUnreadAnnouncements)

router.route('/api/announcements/user/:userId/history')
  // ✅ IMPORTANTE: self o admin
  .get([isLogin, selfOrAdmin('userId')], usersController.getAnnouncementsHistory)

router.route('/api/announcements/:announcementId/read/:userId')
  // ✅ IMPORTANTE: self o admin (marcar leido de otro userId es raro)
  .post([isLogin, selfOrAdmin('userId')], usersController.markAnnouncementRead)

router.route('/api/announcements/:announcementId/views')
  .get([isLogin, isAdmin], usersController.getAnnouncementViews)

router.route('/api/announcements/:creatorId/views-count')
  .get([isLogin, isAdmin], usersController.getAnnouncementViewCountsByCreator)

router.get('/api/announcements/creator/:creatorId',
  [isLogin, isAdmin],
  usersController.getAnnouncementsByCreator
)

router.get('/api/announcements/:announcementId/viewers',
  [isLogin, isAdmin],
  usersController.getAnnouncementViewsWithNames
)

router.patch('/api/announcements/:announcementId',
  [isLogin, isAdmin],
  usersController.editAnnouncement
)

router.delete('/api/announcements/:announcementId',
  [isLogin, isAdmin],
  usersController.deleteAnnouncement
)

// =========================
// Payment info
// =========================
router.patch('/api/user/:userId/payment-info',
  [isLogin, isAdmin],
  usersController.updatePaymentInfo
)

// =========================
// Finance
// =========================
// Si esto es sensible, NO lo dejes publico.
// Si queres: self o admin por ownerId.
router.get('/api/finance/:ownerId/ledger',
  [isLogin, selfOrAdmin('ownerId')],
  usersController.getLedgerGrouped
)

router.get('/api/finance/:ownerId/items',
  [isLogin, selfOrAdmin('ownerId')],
  usersController.listItems
)

router.get('/api/finance/:ownerId/summary',
  [isLogin, selfOrAdmin('ownerId')],
  usersController.getSummary
)

router.post('/api/finance/:ownerId/expense',
  [isLogin, selfOrAdmin('ownerId')],
  usersController.createExpense
)

router.post('/api/finance/:ownerId/cashflow',
  [isLogin, selfOrAdmin('ownerId')],
  usersController.createCashflow
)

router.post('/api/finance/:ownerId/extrasale',
  [isLogin, selfOrAdmin('ownerId')],
  usersController.createExtraSale
)

router.put('/api/finance/:ownerId/:itemId',
  [isLogin, selfOrAdmin('ownerId')],
  usersController.updateItem
)

router.delete('/api/finance/:ownerId/:itemId',
  [isLogin, selfOrAdmin('ownerId')],
  usersController.deleteItem
)

export default router
