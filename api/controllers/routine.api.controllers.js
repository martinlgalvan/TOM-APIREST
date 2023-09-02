import { ObjectId } from 'mongodb'
import * as RoutineServices from '../../services/routine.services.js'
import * as ExerciseServices from '../../services/exercise.services.js'


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
                    let ultimoIndex = data.length - 1
                    let ultimoArr = data[ultimoIndex]

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


function editWeek(req, res){
    const weekID = req.params.week_id

    const newWeek = {}

    if(req.body.name){
        newWeek.name = req.body.name
    } 

    RoutineServices.editWeek(weekID, newWeek)
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

function editExerciseInCircuit(req, res){
    
    const week_id = req.params.week_id
    const day_id = req.params.day_id
    const exercise_id = req.params.exercise_id

    const exercise = {}

    if(req.body.type){
        exercise.type = req.body.type
    } 

    if(req.body.typeOfSets){
        exercise.typeOfSets = req.body.typeOfSets
    } 

    if(req.body.circuit){
        exercise.circuit = req.body.circuit
    } 

    if(req.body.notas){
        exercise.notas = req.body.notas
    } 

    if(req.body.numberExercise){
        exercise.numberExercise = req.body.numberExercise
    } 
    

    if(req.body.valueExercise){
        exercise.valueExercise = req.body.valueExercise
    } 

    RoutineServices.editExerciseInAmrap(week_id, day_id, exercise_id, exercise)
        .then(function(){
            return RoutineServices.findExercises(week_id, exercise_id)
        })
        .then(function(exercise) {
            if(exercise){
                res.status(200).json({exercise})
            } else {
                res.status(404).json({ message: "Ejercicio no encontrado."})
            }
        })

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
    const warmup_id = req.params.warmup_id

    const warmUp = {}

    if(req.body.name){
        warmUp.name = req.body.name
    } 

    if(req.body.sets){
        warmUp.sets = req.body.sets
    } 

    if(req.body.reps){
        warmUp.reps = req.body.reps
    } 

    if(req.body.peso){
        warmUp.peso = req.body.peso
    } 

    if(req.body.video){
        warmUp.video = req.body.video
    } 
    
    if(req.body.notas){
        warmUp.notas = req.body.notas
    } 

    if(req.body.numberWarmup){
        warmUp.numberWarmup = req.body.numberWarmup
    } 

    if(req.body.valueWarmup){
        warmUp.valueWarmup = req.body.valueWarmup
    } 

    RoutineServices.editWarmUp(week_id, day_id, warmup_id, warmUp)
        .then(function(){
            return RoutineServices.findWarmUp(week_id, warmup_id)
        })
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





export {
    findAll,
    createWeek,
    createClonLastWeek,
    findByWeekId,
    deleteWeek,
    editWeek,
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
    deletewarmUp
}