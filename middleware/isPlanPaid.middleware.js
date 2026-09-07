async function isPlanPaid(req, res, next) {
    try {
        // `isLogin` ya dejo el documento completo en req.user; volver a pedirlo
        // a Mongo era un viaje de ida y vuelta extra en cada escritura.
        const adminUser = req.user;

        if (!adminUser) {
            return res.status(403).json({ message: 'Usuario no encontrado. Acceso denegado.' });
        }

        // Verificar si el plan esta activo/pagado
        if (adminUser.isPlanPaid) {
            return next(); // Si el plan esta pagado, permite continuar con la accion
        }

        // Si el plan no esta pagado, verifica si la accion es de lectura
        if (req.method === 'GET') {
            return next(); // Permitir lectura
        } else {
            return res.status(403).json({ message: 'Tu plan no esta activo. Solo puedes ver los datos.' });
        }
    } catch (error) {
        console.error('Error en el middleware isPlanPaid:', error);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
}

export default isPlanPaid;
