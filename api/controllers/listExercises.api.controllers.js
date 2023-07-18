import * as ListExercisesService from '../../services/listExercises.services.js'


function findExercises(req, res){
    const id = req.params.idEntrenador
    ListExercisesService.getListExercises(id)
        .then(function(exercises){
            res.status(200).json(exercises)
        })
}

function createExercise(req, res){

    const id = req.params.idEntrenador
    //Armo lo que quiero guardar

    const exercise = {
        name: req.body.name,
        video: req.body.video
    }

    //Guardo el alumno

    ListExercisesService.createExercise(exercise, id)
        .then(function(exercise){
            res.status(201).json(exercise)
        })
}

function editExercise(req, res){
    const exercise_id = req.params.exercise_id

    const exerciseEdited = {}

    if(req.body.name){
        exerciseEdited.name = req.body.name
    } 

    if(req.body.video){
        exerciseEdited.video = req.body.video
    } 

    ListExercisesService.editExercise(exercise_id, exerciseEdited)
        .then(function(exercise_id) {
            if(exercise_id){
                res.status(200).json({exercise_id})
            } else {
                res.status(404).json({ message: "Ejercicio no encontrado."})
            }
        })

}


function deleteExercise(req, res) {
    const id = req.params.exercise_id

    ListExercisesService.deleteExercise(id)
        .then(() => {
            res.json({ message: 'ejercicio eliminada' })
        })
        .catch(err => {
            res.status(500).json({ message: err.message })
        })
}

export {
    findExercises,
    createExercise,
    editExercise,
    deleteExercise
}