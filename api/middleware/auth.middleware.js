import jwt from "jsonwebtoken"
import * as userService from '../../services/users.services.js'
import * as tokenService from '../../services/token.services.js'

function isLogin(req, res, next) {
    const token = req.headers['auth-token']

    if (!token) {
        return res.status(401).json({ message: 'No se envio un token' })
    }

    try {
        const payload = jwt.verify(token, 'toq_')

        tokenService.findByToken(token)
            .then(tokenFound => {
                if (!tokenFound) {
                    return res.status(401).json({ message: 'Token invalido' })
                }

                userService.findById(payload.id)
                    .then(user => {
                        req.user = user
                        next()
                    })
            })
    } catch (err) {
        return res.status(401).json({ message: 'Token invalido' })
    }
}

function isAdmin(req, res, next) {
    if (req.user.role !== 'admin') {
        return res.status(401).json({ message: 'Permiso denegado' })
    }
    next()
}

export {
    isLogin,
    isAdmin
}