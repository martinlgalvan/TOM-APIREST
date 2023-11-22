import { MongoClient, ObjectId } from 'mongodb'

const options = { keepAlive: true };

const client = new MongoClient('mongodb://m4rt1n:s0yM4RT1NG4LV4N@62.72.51.41:27017/',options)
const db = client.db('TOM')
const columns = db.collection('RandomizerCells')

// Definición del servicio para crear una celda asociada a un valor de una columna
async function createCell(columnValueId, value) {
    const newCell = {
        column_value_id: new ObjectId(columnValueId),
        valor: value
    };

    return client.connect()
        .then(() => {
            return cells.insertOne(newCell);
        })
        .then(() => {
            return newCell;
        });
}

export {
    createCell

}


