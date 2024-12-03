import * as userService from '../../services/users.services.js';

const plans = {
  Gratuito: { maxUsers: 5},
  Basico: { maxUsers: 20},
  Essential: { maxUsers: 30},
  Profesional: { maxUsers: 55},
  Elite: { maxUsers: 95},
  Empresarial: { maxUsers: 140},
  Personalizado: { maxUsers: 500}, // Sin límite
};

async function checkPlanLimit(req, res, next) {
  try {
    const adminId = req.user._id; // Obtenemos el admin desde el `isLogin` middleware
    const adminUser = await userService.findById(adminId);

    if (!adminUser || adminUser.role !== 'admin') {
      return res.status(403).json({ message: 'Acceso denegado. Solo los administradores pueden crear usuarios.' });
    }

    const adminPlan = adminUser.plan || 'Gratuito'; // Plan asignado al admin, default Gratuito
    const planDetails = plans[adminPlan];

    if (!planDetails) {
      return res.status(400).json({ message: 'El plan asignado al usuario no es válido.' });
    }

    const createdUsersCount = await userService.getUsersByEntrenadorId(adminId);

    if (createdUsersCount.length >= planDetails.maxUsers) {
      return res.status(403).json({
        message: `Has alcanzado el límite de usuarios para el plan ${adminPlan}. Máximo permitido: ${planDetails.maxUsers}.`,
      });
    }

    next(); // Si no se supera el límite, continúa con la creación
  } catch (error) {
    console.error('Error en el middleware de límite de planes:', error);
    res.status(500).json({ message: 'Error interno del servidor.' });
  }
}

export default checkPlanLimit;
