import { ObjectId } from 'mongodb'
import dotenv from 'dotenv';
dotenv.config();
import jwt from 'jsonwebtoken';
import QRCode from 'qrcode';
import * as UsersService from '../../services/users.services.js';
import * as RoutineServices from '../../services/routine.services.js'
import * as PARservices from '../../services/PAR.services.js'


function findAll(req, res){

    const filter = {}

    if(req.query.rutina){
        filter.rutina = req.query.rutina
    }

    RoutineServices.getRoutine(filter)
        .then(function(week){
            res.status(200).json(week)
        })
}




function findByWeekId(req, res){
    const week_id = req.params.week_id

    RoutineServices.getRoutineById(week_id)
        .then(function(day){
            if(day){
                res.status(200).json(day)
            } else{
                res.status(404).json({message: "Día no encontrado."})
            }
        })
       
}


function findRoutineByUserId(req, res){
    const id = req.params.userId

    RoutineServices.getRoutineByUserId(id)
        .then(function(day){
            if(day){
                res.status(200).json(day)
            } else{
                res.status(404).json({message: "Rutina no encontrada."})
            }
        })
       
}

function createWeek(req, res){

    //Armo lo que quiero guardar
    
    const user_id = req.params.userId
    const firstDay = "Día 1"

    const week = {
        name: req.body.name,
        routine: [
            {name: firstDay,
            exercises: [],
            _id: new ObjectId()}
        ]
    }
    //Guardo el alumno

    RoutineServices.createWeek(week,user_id)
        .then(function(week){
            res.status(201).json(week)
        })
}

function createClonLastWeek(req, res){

    //Armo lo que quiero guardar
    
    const user_id = req.params.userId
    const fecha = req.body.fecha
    const week = {
        name: req.body.name,
        routine: [{}]
        // imitar el proceso antes de meterlo 
    }

    if(req.body.routine){
        week.routine = req.body.routine
    } 


    //Guardo el alumno
    RoutineServices.getRoutineByUserId(user_id) 
                .then((data) =>{
                    //let ultimoIndex = data.length - 1
                    let ultimoArr = data[0]
                    ultimoArr._id = new ObjectId()
                    if(fecha == "isDate"){
                        ultimoArr.name = `Semana del ${new Date().toLocaleDateString()}` ;
                    } else{
                        ultimoArr.name = `Semana ${data.length + 1}`
                    }
                 
            
                    for (let i = 0; i < ultimoArr.routine.length; i++) {

                        ultimoArr.routine[i]._id = new ObjectId()
                        
                        if(ultimoArr.routine[i].exercises != undefined){
                            for (let j = 0; j < ultimoArr.routine[i].exercises.length; j++) {

                                ultimoArr.routine[i].exercises[j].exercise_id = new ObjectId()
                                
                            }}

                        if(ultimoArr.routine[i].warmup != undefined){
                            for (let j = 0; j < ultimoArr.routine[i].warmup.length; j++) {
    
                                ultimoArr.routine[i].warmup[j].warmup_id = new ObjectId()
                                
                            }}
                    }

                    console.log(ultimoArr)
                    RoutineServices.createWeek(ultimoArr,user_id)
                        .then((data) => {
                            res.status(201).json(data)
                        })
            })
}


async function editWeek(req, res) {
    const weekID = req.params.week_id;
    const payload = req.body;
  
    try {
      // ✅ CASO 1: Actualización tradicional (array = rutina semanal)
      if (Array.isArray(payload)) {
        await RoutineServices.editWeek(weekID, payload);
        const updated = await RoutineServices.getRoutineById(weekID);
        if (!updated) return res.status(404).json({ message: "Week not found." });
        return res.status(200).json({ weekData: updated });
      }
  
      // ✅ CASO 2: Actualizar bloque de UNA semana
      if (payload.week_id && payload.block) {
        await RoutineServices.updateBlockOfWeek(payload.week_id, payload.block);
        return res.status(200).json({ message: 'Bloque actualizado' });
      }
  
      // ✅ CASO 3: Actualizar bloques de VARIAS semanas
      if (Array.isArray(payload.blocks)) {
        const updates = await Promise.all(
          payload.blocks.map(entry => {
            if (!entry.week_id || !entry.block) return null;
            return RoutineServices.updateBlockOfWeek(entry.week_id, entry.block);
          })
        );
        return res.status(200).json({ message: 'Bloques múltiples actualizados', modified: updates.length });
      }
  
      // ❌ Payload inválido
      return res.status(400).json({ message: "Formato de actualización no válido." });
  
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Error al actualizar semana(s).", error: error.message });
    }
  }

function editWeekName(req, res){
    console.log(req.body)
    const weekID = req.params.week_id

    const newWeek = {}

    if(req.body.name){
        newWeek.name = req.body.name
    } 

    RoutineServices.editWeekName(weekID, newWeek)
        .then(function(){
            return RoutineServices.getRoutineById(weekID)
        })
        .then(function(weekID) {
            if(weekID){
                res.status(200).json({weekID})
            } else {
                res.status(404).json({ message: "Ejercicio no encontrado."})
            }
        })

}


function deleteWeek(req, res) {
    const week_id = req.params.week_id

    RoutineServices.deleteWeek(week_id)
        .then(() => {
            res.json({ message: 'Semana eliminada' })
        })
        .catch(err => {
            res.status(500).json({ message: err.message })
        })
}


function createDay(req, res){

    //Armo lo que quiero guardar
    
    const week_id = req.params.week_id

    const day = {
        name: req.body.name,
        exercises: [],
        _id: new ObjectId()
    }

    //Guardo el alumno

    RoutineServices.createDay(day,week_id)
        .then(function(day){
            res.status(201).json(day)
        })
}

function editDay(req, res){
    const weekID = req.params.week_id
    const dayID = req.params.day_id

    const newName = req.body.name



    RoutineServices.editDay(weekID, dayID, newName)
        .then(function(){
            return RoutineServices.getRoutineById(weekID)
        })
        .then(function(dayID) {
            if(dayID){
                res.status(200).json({dayID})
            } else {
                res.status(404).json({ message: "Ejercicio no encontrado."})
            }
        })

}

function deleteDay(req, res) {
    const week_id = req.params.week_id
    const day_id = req.params.day_id

    RoutineServices.deleteDay(week_id,day_id)
        .then(() => {
            res.json({ message: 'Día eliminado' })
        })
        .catch(err => {
            res.status(500).json({ message: err.message })
        })
}

async function findExercises(req, res){

    const week_id = req.params.week_id
    const day_id = req.params.day_id

    const exercise = await RoutineServices.findExercises(week_id,day_id)
    res.status(200).json(exercise)
}



async function createCircuit(req, res){
    const week_id = req.params.week_id
    const day_id = req.params.day_id

    RoutineServices.getRoutineById(week_id)
        .then(data => {
                let days = data[0].routine
                let indexDay = days.findIndex(dia => dia._id == day_id)
                let ultimoIndex = days[indexDay].exercises.length + 1
                
                let circuit = {}

                if(req.body){
        
                    circuit = req.body
                    circuit.numberExercise = ultimoIndex
                    circuit.valueExercise = ultimoIndex
                } 

                RoutineServices.createExercise(week_id,day_id, circuit)
                    .then(data => {
                        res.status(201).json(data)
                    })
                
        })

}




function editById(req, res){
    
    const week_id = req.params.week_id
    const day_id = req.params.day_id

    let exercise = {}
    
    if(req.body){
        exercise = req.body
    }

    RoutineServices.editExercise(week_id, day_id, exercise)
        .then(function(exercise) {
            if(exercise){
                res.status(200).json({exercise})
            } else {
                res.status(404).json({ message: "Ejercicio no encontrado."})
            }
        })

}

function editExerciseInCircuit(req, res) {
    const week_id = req.params.week_id;
    const day_id = req.params.day_id;
    const exercise_id = req.params.exercise_id;

    const exercise = {};

    if (req.body.type) {
        exercise.type = req.body.type;
    }

    if (req.body.typeOfSets) {
        exercise.typeOfSets = req.body.typeOfSets;
    }

    if (req.body.circuit) {
        exercise.circuit = req.body.circuit;
    }

    if (req.body.notas) {
        exercise.notas = req.body.notas;
    }

    if (req.body.numberExercise) {
        exercise.numberExercise = req.body.numberExercise;
    }

    if (req.body.valueExercise) {
        exercise.valueExercise = req.body.valueExercise;
    }

    RoutineServices.editExerciseInAmrap(week_id, day_id, exercise_id, exercise)
        .then(function(exercise) {
            if (exercise) {
                res.status(200).json({ exercise });
            } else {
                res.status(404).json({ message: "Ejercicio no encontrado." });
            }
        })
        .catch(function(error) {
            res.status(500).json({ message: error.message });
        });
}



async function deleteExercise(req, res){
    const week_id = req.params.week_id
    const day_id = req.params.day_id
    const exercise_id = req.params.exercise_id

    const deleteEx = await RoutineServices.deleteExercise(week_id, day_id, exercise_id)
    res.status(200).json(deleteEx)
}






// BLOQUE DE MOVILIDAD/ENTRADA EN CALOR


async function findWarmup(req, res){

    const week_id = req.params.week_id
    const warmup_id = req.params.warmup_id

    const exercise = await RoutineServices.findWarmUp(week_id,warmup_id)
    res.status(200).json(exercise)
}


async function createWarmUp(req, res){
    const week_id = req.params.week_id
    const day_id = req.params.day_id

    const warmUp = {
        name: req.body.name,
        sets: req.body.sets,
        reps: req.body.reps,
        video: req.body.video,
        peso: req.body.peso,
        notas: req.body.notas,
        numberWarmup: req.body.numberWarmup,
        valueWarmup: req.body.warmup
}
    const routine = await RoutineServices.createWarmUp(week_id,day_id, warmUp)
    res.status(201).json(routine)
}

function editWarmUp(req, res){
    
    const week_id = req.params.week_id
    const day_id = req.params.day_id


    let warmUp = {}
    
    if(req.body){
        warmUp = req.body
    }

    RoutineServices.editWarmUp(week_id, day_id, warmUp)
        .then(function(warmUp) {
            if(warmUp){
                res.status(200).json({warmUp})
            } else {
                res.status(404).json({ message: "Warm up no encontrado."})
            }
        })

}

async function deletewarmUp(req, res){
    const week_id = req.params.week_id
    const day_id = req.params.day_id
    const warmup_id = req.params.warmup_id

    const deleteEx = await RoutineServices.deleteWarmup(week_id, day_id, warmup_id)
    res.status(200).json(deleteEx)
}





function getPAR(req, res){
    const user_id = req.params.user_id

    PARservices.getPAR(user_id)
        .then(function(user){
            if(user){
                res.status(200).json(user)
            } else{
                res.status(404).json({message: "Día no encontrado."})
            }
        })
       
}

function updatePAR(req, res) {
    const id_par = req.params.id_par;
    const updatedPAR = req.body; // Se espera que el cuerpo contenga los datos a actualizar

    PARservices.updatePAR(id_par, updatedPAR)
        .then((result) => {
            res.status(200).json(result);
        })
        .catch((err) => {
            res.status(500).json({ error: err.message });
        });
}

function deletePAR(req, res) {
    const id_par = req.params.id_par;

    PARservices.deletePAR(id_par)
        .then((result) => {
            res.status(200).json(result);
        })
        .catch((err) => {
            res.status(500).json({ error: err.message });
        });
}


function createPARweek(req, res){

    //Armo lo que quiero guardar
    
    const user_id = req.params.user_id

    const week = {
        name: req.body.name,
        routine: [{}]
        // imitar el proceso antes de meterlo 
    }

    if(req.body.routine){
        week.routine = req.body.routine
    } 

    
    PARservices.createPAR(week,user_id)
        .then((data) => {
            res.status(201).json(data)
        })

}


function createPARweekInRoutine(req, res){

    const user_id = req.params.user_id

    //Armo lo que quiero guardar
    RoutineServices.getRoutineByUserId(user_id) 
        .then((data) =>{
            const nameParWeek = `Semana ${data.length + 1}`
            const week = {
                name: nameParWeek,
                routine: [{}],
                block: req.body.block
                // imitar el proceso antes de meterlo 
            }
            console.log(req.body.block)

            if(req.body.routine){
                week.routine = req.body.routine
            } 
            RoutineServices.createWeek(week,user_id)
                .then((data) => {
                    res.status(201).json(data)
                })
            })

} 


function createWeekForMany(req, res) {
    // Se espera que en el body envíen:
    // { name: <nombre del PAR>, routine: <rutina opcional>, user_ids: [ 'id1', 'id2', ... ] }
    const userIds = req.body.user_ids; 
    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ message: "Debe enviar un arreglo de user_ids." });
    }
    
    const week = {
      name: req.body.name,
      routine: req.body.routine || [{}]  // Asignamos un arreglo default si no hay rutina
    };
  
    RoutineServices.createWeekForMany(week, userIds)
      .then((data) => {
        res.status(201).json(data);
      })
      .catch((err) => {
        res.status(500).json({ error: err.message });
      });
  }


  function createPARforMultipleUsersController(req, res) {
    // Se espera que en el cuerpo de la solicitud se incluya:
    // - Los datos de la rutina, p.ej., name, routine, etc.
    // - Un arreglo llamado "user_ids" con los IDs (como string) de los usuarios a los que se asignará
    
    const user_ids = req.body.user_ids;
    // Extraemos el resto de la información de la rutina.
    // Puedes validar que user_ids es un arreglo y que tiene al menos un elemento.
    if (!Array.isArray(user_ids) || user_ids.length === 0) {
      return res.status(400).json({ message: "Debes enviar al menos un user_id en el arreglo 'user_ids'" });
    }
  
    // Con la información del PAR enviada en el body, construimos el objeto (week)
    const week = {
      name: req.body.name,
      routine: req.body.routine || [{}]
      // Puedes agregar otros campos que necesites incluir en el PAR.
    };
  
    RoutineServices.createPARforMultipleUsers(week, user_ids)
      .then((data) => {
        res.status(201).json(data);
      })
      .catch((err) => {
        res.status(500).json({ error: err.message });
      });
  }

  async function createProgressionForMultipleUsersController(req, res) {
    const { template, user_ids } = req.body;
    if (!Array.isArray(user_ids) || user_ids.length === 0) {
      return res.status(400).json({ message: 'Debes enviar un arreglo de user_ids.' });
    }
    
    try {
      const newWeeks = await RoutineServices.createProgressionForMultipleUsers(template, user_ids);
      res.status(201).json(newWeeks);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  
  async function createProgressionFromPARController(req, res) {
    const parId = req.params.par_id;

  
    try {
      const newPAR = await PARservices.createProgressionFromPAR(parId);
      res.status(201).json(newPAR);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }


async function generateUserQR(req, res) {
    const { userId } = req.params; // ID del usuario al que se generará el QR

    try {
        // Verifica si el usuario existe
        const user = await UsersService.findById(userId);
        if (!user) {
            return res.status(404).json({ message: "Usuario no encontrado." });
        }

        // Genera un token único para el usuario
        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET); // Expira en 10 minutos

        // Crea la URL del QR
        const qrData = `https://planificaciontom.com/qr-login?token=${token}`;

        // Genera la imagen del QR
        const qrImage = await QRCode.toDataURL(qrData);

        res.status(200).json({ qrImage, token });
    } catch (error) {
        res.status(500).json({ message: "Error al generar el QR.", error: error.message });
    }
}

// Inicia sesión usando un token del QR
async function loginWithQR(req, res) {
    const { token } = req.body;

    try {
        // Valida el token del QR
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const userId = decoded.id;

        // Busca al usuario correspondiente
        const user = await UsersService.findById(userId);
        if (!user) {
            return res.status(404).json({ message: "Usuario no encontrado." });
        }

        // Genera un nuevo token de sesión
        const sessionToken = jwt.sign({ id: user._id, role: user.role }, process.env.SESSION_SECRET);

        res.status(200).json({ jwt: sessionToken, user });
    } catch (error) {
        res.status(400).json({ message: "Token inválido o expirado.", error: error.message });
    }
}


export {
    findAll,
    createWeek,
    createClonLastWeek,
    findByWeekId,
    deleteWeek,
    editWeek,
    editWeekName,
    findRoutineByUserId,

    createDay,
    deleteDay,
    editDay,

    findExercises,
    createCircuit,
    editExerciseInCircuit,
    editById,
    deleteExercise,

    findWarmup,
    createWarmUp,
    editWarmUp,
    deletewarmUp,

    getPAR,
    updatePAR,
    deletePAR,
    createPARweek,
    createPARweekInRoutine,
    createWeekForMany,
    createPARforMultipleUsersController,
    createProgressionForMultipleUsersController,
    createProgressionFromPARController,

    generateUserQR,
    loginWithQR

}