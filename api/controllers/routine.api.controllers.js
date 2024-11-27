import { ObjectId } from 'mongodb'
import dotenv from 'dotenv';
dotenv.config();
import jwt from 'jsonwebtoken';
import QRCode from 'qrcode';
import * as UsersService from '../../services/users.services.js';
import * as RoutineServices from '../../services/routine.services.js'
import * as ColumnService from '../../services/randomizerColumns.services.js'
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
                    ultimoArr.name = `Semana ${data.length + 1}`
            
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


function editWeek(req, res) {
    const weekID = req.params.week_id;

    // Verificar si el cuerpo de la solicitud contiene un array
    if (!Array.isArray(req.body)) {
        return res.status(400).json({ message: "Expected an array of objects." });
    }

    const newRoutine = req.body; // Recibe directamente el array de objetos

    RoutineServices.editWeek(weekID, newRoutine)
        .then(function () {
            return RoutineServices.getRoutineById(weekID);
        })
        .then(function (weekData) {
            if (weekData) {
                res.status(200).json({ weekData });
            } else {
                res.status(404).json({ message: "Week not found." });
            }
        })
        .catch(function (error) {
            res.status(500).json({ message: "Error updating the week.", error });
        });
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



async function createExercise(req, res){
    const week_id = req.params.week_id
    const day_id = req.params.day_id

    // CORREGIR ESTO PARA AUMENTAR VELOCIDAD EN LAS CONSULTAS
    RoutineServices.getRoutineById(week_id)
        .then(data => {
                let days = data[0].routine
                let indexDay = days.findIndex(dia => dia._id == day_id)
                let ultimoIndex = days[indexDay].exercises.length + 1
                
                const exercise = {
                    type: 'exercise',
                    name: req.body.name,
                    sets: req.body.sets,
                    reps: req.body.reps,
                    rest: req.body.rest,
                    peso: req.body.peso,
                    video: req.body.video,
                    notas: req.body.notas,
                    numberExercise: ultimoIndex,
                    valueExercise: ultimoIndex
                }
                
                RoutineServices.createExercise(week_id,day_id, exercise)
                    .then(data => {
                        res.status(201).json(data)
                    })
                
        })

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


//******************* COLUMNS */

// Controlador para obtener todas las columnas
function getAllColumns(req, res) {

    const user_id = req.params.user_id;

    ColumnService.getAllColumns(user_id)
        .then((columns) => {
            res.status(200).json(columns);
        })
        .catch((err) => {
            res.status(500).json({ error: err.message });
        });
}


// Controlador para la creación de una columna
function createColumn(req, res) {

    const user_id = req.params.user_id;
    const columnName = req.body.name;

    ColumnService.createColumn(columnName,user_id)
        .then((newColumn) => {
            res.status(201).json(newColumn);
        })
        .catch((err) => {
            res.status(500).json({ error: err.message });
        });
}

// Controlador para editar una columna por su ID
function editColumn(req, res) {
    const columnId = req.params.columnId;
    const updatedData = {}

    if(req.body.name){
        updatedData.name = req.body.name
    } 



    ColumnService.updateColumn(columnId, updatedData)
        .then((result) => {
            res.status(200).json(result);
        })
        .catch((err) => {
            res.status(500).json({ error: err.message });
        });
}

// Controlador para eliminar una columna por su ID
function deleteColumn(req, res) {
    const columnId = req.params.columnId;

    ColumnService.deleteColumn(columnId)
        .then((result) => {
            res.status(200).json(result);
        })
        .catch((err) => {
            res.status(500).json({ error: err.message });
        });
}

// Controlador para agregar objetos  a la  columna

function addExerciseToColumn(req, res) {
    const columnId = req.params.columnId;
    const exercise = {
        name: req.body.name,
        video: req.body.video,
        _id: new ObjectId()
}
    ColumnService.addObjectToColumn(columnId, exercise)
        .then((result) => {
            res.status(200).json(result);
        })
        .catch((err) => {
            res.status(500).json({ error: err.message });
        });
}

// Controlador para editar los ejercicios dentro de la  columna

function editExerciseInColumn(req, res) {
    const columnId = req.params.columnId;
    const idExercise = req.params.idExercise;
    const exercise = {}

    if(req.body.name){
        exercise.name = req.body.name
    } 

    if(req.body.video){
        exercise.video = req.body.video
    } 

    console.log(columnId,idExercise,exercise)

    ColumnService.editExerciseInColumn(columnId, idExercise, exercise)
        .then((result) => {
            res.status(200).json(result);
        })
        .catch((err) => {
            res.status(500).json({ error: err.message });
        });

}

function deleteExerciseInColumnById(req, res) {
    const columnId = req.params.columnId;
    const idExercise = req.params.idExercise;

    ColumnService.deleteExerciseInColumnById(columnId, idExercise)
        .then((result) => {
            res.status(200).json(result);
        })
        .catch((err) => {
            res.status(500).json({ error: err.message });
        });
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
                        routine: [{}]
                        // imitar el proceso antes de meterlo 
                    }

                    
            if(req.body.routine){
                week.routine = req.body.routine
            } 


            
            RoutineServices.createWeek(week,user_id)
                .then((data) => {
                    res.status(201).json(data)
                })
            })






} // AñADOR ESTP


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
    createExercise,
    createCircuit,
    editExerciseInCircuit,
    editById,
    deleteExercise,

    findWarmup,
    createWarmUp,
    editWarmUp,
    deletewarmUp,

    getAllColumns,
    createColumn,
    editColumn,
    deleteColumn,

    addExerciseToColumn,
    editExerciseInColumn,
    deleteExerciseInColumnById,

    getPAR,
    updatePAR,
    deletePAR,
    createPARweek,
    createPARweekInRoutine,

    generateUserQR,
    loginWithQR

}