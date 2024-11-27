import { MongoClient, ObjectId } from 'mongodb'
import dotenv from 'dotenv';

// Carga las variables de entorno desde el archivo .env
dotenv.config();

const options = { keepAlive: true };

const client = new MongoClient(process.env.MONGODB_URI,options)
const db = client.db('TOM')
const columns = db.collection('RandomizerColumns')

// Definición del servicio para obtener todas las columnas
async function getAllColumns(id) {
    return client.connect()
        .then(() => {
            return columns.find({user_id: new ObjectId(id) }).toArray()
        })
        .catch((err) => {
            throw new Error(`Error al obtener las columnas: ${err.message}`);
        });
}

async function createColumn(columnName, user_id) {
    const newColumn = {
        name: columnName,
        exercises: [], // Un array para almacenar los objetos en la columna
        user_id: new ObjectId(user_id)
    };

    return client.connect()
        .then(() => {
            return columns.insertOne(newColumn);
        })
        .then(() => {
            return newColumn;
        });
}


async function updateColumn(columnId, updatedData){
    
    return client.connect()
        .then(function(){
            return columns.updateOne(
                { _id: new ObjectId(columnId)},
                { $set: updatedData }
             )
        })
        .then((result) => {
            if (result.modifiedCount === 0) {
                throw new Error('La columna no fue encontrada o no se realizó ninguna modificación.');
            }
            return updatedData;
        })
        .catch((err) => {
            throw new Error(`Error al actualizar la columna: ${err.message}`);
        });
}


// Definición del servicio para eliminar una columna por su ID
async function deleteColumn(columnId) {
    const filter = { _id: new ObjectId(columnId) };

    return client.connect()
        .then(() => {
            return columns.deleteOne(filter);
        })
        .then((result) => {
            if (result.deletedCount === 0) {
                throw new Error('La columna no fue encontrada o no se eliminó.');
            }
            return { message: 'Columna eliminada exitosamente' };
        })
        .catch((err) => {
            throw new Error(`Error al eliminar la columna: ${err.message}`);
        });
}

async function addObjectToColumn(columnId, exercise) {
    const filter = { _id: new ObjectId(columnId) };
    const updateDocument = {
        $push: { exercises: exercise }
    };

    return client.connect()
        .then(() => {
            return columns.updateOne(filter, updateDocument);
        })
        .then((result) => {
            if (result.modifiedCount === 0) {
                throw new Error('La columna no fue encontrada o no se realizó ninguna modificación.');
            }
            return exercise;
        })
        .catch((err) => {
            throw new Error(`Error al agregar objeto a la columna: ${err.message}`);
        });
}

async function editExerciseInColumn(columnId, idExercise, updatedData) {
    const filter = {
        _id: new ObjectId(columnId),
        'exercises._id': new ObjectId(idExercise)
    };

    const exercise = {
        ...updatedData,
        _id: new ObjectId(idExercise)
    }

    const updateDocument = {
        $set: {"exercises.$": exercise}
    };

    return client.connect()
        .then(() => {
            return columns.updateOne(filter, updateDocument);
        })
        .then((result) => {
            if (result.modifiedCount === 0) {
                throw new Error('El objeto no fue encontrado o no se realizó ninguna modificación.');
            }
            return updatedData;
        })
        .catch((err) => {
            throw new Error(`Error al actualizar el objeto: ${err.message}`);
        });
}

async function deleteExerciseInColumnById(columnId, idExercise) {
    const filter = {
        _id: new ObjectId(columnId),
    };
    const updateDocument = {
        $pull: {
            exercises: { _id: new ObjectId(idExercise) }
        }
    };

    return client.connect()
        .then(() => {
            return columns.updateOne(filter, updateDocument);
        })
        .then((result) => {
            if (result.modifiedCount === 0) {
                throw new Error('El ejercicio no fue encontrado o no se realizó ninguna modificación.');
            }
            return { message: 'Ejercicio eliminado exitosamente' };
        })
        .catch((err) => {
            throw new Error(`Error al eliminar el ejercicio: ${err.message}`);
        });
}


export {
    getAllColumns,
    createColumn,
    updateColumn,
    deleteColumn,

    addObjectToColumn,
    editExerciseInColumn,
    deleteExerciseInColumnById
}
