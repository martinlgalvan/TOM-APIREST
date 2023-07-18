import { loginScheme, registerScheme} from '../schemes/user.schemes.js'

function ValidateLogin(req, res, next){
    loginScheme.validate(req.body)
        .then((loginData) => {
            req.body = loginData
            next()
        })
        .catch(err => {
            res.status(400).json({message: err.message})
        })
}

function ValidateRegister(req, res, next){
    registerScheme.validate(req.body)
        .then((registerData) => {
            req.body = registerData
            next()
        })
        .catch(err => {
            res.status(400).json({message: err.message})
        })
}

export {
    ValidateLogin,
    ValidateRegister
}