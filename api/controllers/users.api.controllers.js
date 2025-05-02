import jwt from 'jsonwebtoken'

import * as UsersService from '../../services/users.services.js'
import * as BlockService from '../../services/block.services.js'
import * as RoutineServices from '../../services/routine.services.js'
import * as TokenService from '../../services/token.services.js'

//----------------------------------------------------*

function login(req, res) {
    UsersService.login(req.body)
        .then(user => {
            const token = jwt.sign({ id: user._id, role: 'admin' }, 'toq_')
            TokenService.create({ token, user_id: user._id })

            res.status(200).json({ token, user })

        })
        .catch(err => {
            res.status(400).json({ message: err.message })
        })
}

function logout(req, res) {
    const token = req.headers['auth-token']

    TokenService.deleteByToken(token)

    res.json({ message: 'Logout exitoso' })

}

//----------------------------------------------------*


async function getUserById(req, res) {
    const id = req.params.userId;

    try {
        const user = await UsersService.findById(id);
        if (user) {
            res.status(200).json(user);
        } else {
            res.status(404).json({ message: "Usuario no encontrado." });
        }
    } catch (error) {
        res.status(500).json({ message: "Error al obtener el usuario.", error: error.message });
    }
}



function find(req, res) {
    const filter = {}

    const token = req.headers['auth-token']

    if (!token) {
        res.status(401).json({ message: 'No se envio un token' })
        return
    }

    try {
        const payload = jwt.verify(token, 'esto')
    } catch (err) {
        res.status(401).json({ message: 'Token invalido' })
        return
    }

    UsersService.find(filter)
        .then(users => {
            res.json(users)
        })
}


function getUsersByEntrenador(req, res) {
    const entrenador_id = req.params.idEntrenador;
  
    // ✅ Si el query string incluye `blocks=true`, devolvemos bloques
    if (req.query.blocks === 'true') {
      return BlockService.findByUserId(entrenador_id)
        .then(blocks => {
          res.status(200).json(blocks);
        })
        .catch(error => {
          res.status(500).json({ message: "Error al obtener los bloques.", error: error.message });
        });
    }
  
    // 👥 Si no hay query especial, devolvemos los usuarios
    UsersService.getUsersByEntrenadorId(entrenador_id)
      .then(users => {
        if (users) {
          res.status(200).json(users);
        } else {
          res.status(404).json({ message: "No es posible realizar esta acción." });
        }
      })
      .catch(error => {
        res.status(500).json({ message: "Error al obtener los usuarios." });
      });
  }


function create(req, res) {
    const entrenador_id = req.params.idEntrenador;
  
    // ⚠️ Detectar si el body es para crear un bloque
    if (req.body.type === 'block') {
      const blockData = req.body.data;
      return BlockService.createBlock(entrenador_id, blockData)
        .then(block => res.status(201).json(block))
        .catch(err => res.status(400).json({ message: err.message }));
    }
  
    // ⚠️ Detectar si el body es para clonar un bloque
    if (req.body.type === 'clone_block') {
      const blockId = req.body.blockId;
      return BlockService.cloneBlock(blockId, entrenador_id)
        .then(result => res.status(201).json(result))
        .catch(err => res.status(400).json({ message: err.message }));
    }
  
    // ✔️ Lógica original para crear usuario
    const logo = req.body.logo;
    const user = {
      name: req.body.name,
      email: req.body.email,
      password: req.body.password,
      role: "common"
    };
  
    UsersService.create(user, entrenador_id, logo)
      .then(user => {
        res.json(user);
      })
      .catch(err => {
        res.status(err.status || 500).json({ message: err.message });
      });
  }

function removeUser(req, res) {
    const id = req.params.userId

    UsersService.remove(id)
        .then(() => {
            res.json({ message: 'Usuario eliminado' })
        })
        .catch(err => {
            res.status(500).json({ message: err.message })
        })
}





async function addUserProperty(req, res) {
    const userId = req.params.userId;
    const category = req.body.category;

    try {
        const user = await UsersService.addUserProperty(userId, category);
        res.status(200).json({ message: `Propiedad '${category}' agregada correctamente al usuario`, user });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

async function getProfileByUserId(req, res) {
    const id = req.params.userId;

    try {
        const user = await UsersService.findProfileByID(id);
        if (user) {
            res.status(200).json(user);
        } else {
            res.status(404).json({ message: "Perfil no encontrado." });
        }
    } catch (error) {
        res.status(500).json({ message: "Error al obtener el perfil.", error: error.message });
    }
}


async function upsertUserDetails(req, res) {
    const userId = req.params.userId;
    const details = req.body;

    try {
        const { action, profile } = await UsersService.upsertUserDetails(userId, details);
        res.status(200).json({ 
            message: action === 'created' ? 'Perfil creado correctamente' : 'Perfil actualizado correctamente',
            action: action,
            userProfile: profile
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}



export {
    getUserById,
    getUsersByEntrenador,
    find,
    create,
    removeUser,
    login,
    logout,
    addUserProperty,
    getProfileByUserId,
    upsertUserDetails
}