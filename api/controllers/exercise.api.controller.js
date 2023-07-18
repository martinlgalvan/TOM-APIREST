import { ObjectId } from 'mongodb'
import * as RoutineServices from '../../services/routine.services.js'
import * as ExerciseServices from '../../services/exercise.services.js'


async function findExercises(req, res){

    const dayID = req.params.idDay
    
    const galeriaServ = await ExerciseServices.findExercises(dayID)
    res.status(200).json(galeriaServ)
}




function editById(req, res){
    const dayId = req.params.idDay
    const exerciseId = req.params.idExercise

    const rutine = {}

    if(req.body.name){
        rutine.name = req.body.name
    } 

    if(req.body.sets){
        rutine.sets = req.body.sets
    } 

    if(req.body.reps){
        rutine.reps = req.body.reps
    } 

    if(req.body.video){
        rutine.video = req.body.video
    } 

    ExerciseServices.editExercise(dayId, exerciseId, rutine)
        .then(function(){
            return ExerciseServices.findExercises(dayId)
        })
        .then(function(rutine) {
            if(rutine){
                res.status(200).json({rutine})
            } else {
                res.status(404).json({ message: "Ejercicio no encontrado."})
            }
        })

}



async function createExercise(req, res){
    const dayId = req.params.idDay
    const rutine = {
        name: req.body.name,
        sets: req.body.sets,
        reps: req.body.reps,
        video: req.body.video
}
    const routine = await ExerciseServices.createExercise(dayId, rutine)
    res.status(201).json(routine)
}

async function deleteExercise(req, res){
    const day_id = req.params.idDay
    const exercise_id = req.params.idExercise

    const deleteEx = await ExerciseServices.deleteExercise(day_id, exercise_id)
    res.status(200).json(deleteEx)
}

export {
    editById,
    findExercises,
    createExercise,
    deleteExercise
}