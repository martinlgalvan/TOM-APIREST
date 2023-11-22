import { MongoClient, ObjectId } from 'mongodb'

const options = { keepAlive: true };

const client = new MongoClient('mongodb://m4rt1n:s0yM4RT1NG4LV4N@62.72.51.41:27017/',options)
const db = client.db('TOM')
const columns = db.collection('RandomizerColumns')

// Definición del servicio para obtener todas las columnas
async function getAllColumns() {
    return client.connect()
        .then(() => {
            return columns.find({}).toArray();
        })
        .catch((err) => {
            throw new Error(`Error al obtener las columnas: ${err.message}`);
        });
}

// Definición del servicio para crear una columna
async function createColumn(column) {
    const newColumn = {
        name: column.name,
        video: column.video
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
            return { message: 'Columna actualizada exitosamente' };
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


export {
    getAllColumns,
    createColumn,
    updateColumn,
    deleteColumn
}
