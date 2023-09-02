import { MongoClient, ObjectId } from 'mongodb'

const options = { keepAlive: true };

const client = new MongoClient('mongodb://m4rt1n:s0yM4RT1NG4LV4N@62.72.51.41:27017/',options)
const db = client.db('TOM')
const exercises = db.collection('ListExercises')

//a
async function getListExercises(id){


    return client.connect()
        .then(async function () {
            return exercises.find({ user_id: new ObjectId(id) }).toArray()
        })
}



async function createExercise(exercise,user_id){
    const Newexercise = {
        ...exercise,
        user_id: new ObjectId(user_id)
    }

    return client.connect()
        .then(function(){
            return exercises.insertOne(Newexercise)
        })
        .then(function (){
            return Newexercise
        })
}

async function editExercise(exercise_id, exercise){
    
    return client.connect()
        .then(function(){
            return exercises.updateOne(
                { _id: new ObjectId(exercise_id)},
                { $set: exercise }
             )
        })
}

async function deleteExercise(id){
    return client.connect()
        .then(function(){
            return exercises.deleteOne({ _id: new ObjectId(id) })
        })
}   

export {
    getListExercises,
    createExercise,
    editExercise,
    deleteExercise
}
