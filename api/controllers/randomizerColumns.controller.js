import { ObjectId } from 'mongodb'
import * as ColumnService from '../../services/randomizerColumns.services.js'

// Controlador para obtener todas las columnas
function getAllColumns(req, res) {
    ColumnService.getAllColumns()
        .then((columns) => {
            res.status(200).json(columns);
        })
        .catch((err) => {
            res.status(500).json({ error: err.message });
        });
}


// Controlador para la creación de una columna
function createColumn(req, res) {
    const column = {
        name: req.body.name,
        video: req.body.video
    };

    ColumnService.createColumn(column)
        .then((newColumn) => {
            res.status(201).json(newColumn);
        })
        .catch((err) => {
            res.status(500).json({ error: err.message });
        });
}

// Controlador para editar una columna por su ID
function editColumn(req, res) {
    const columnId = req.params.idColumn;
    const updatedData = req.body.updatedData; // Datos actualizados de la columna

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
    const columnId = req.params.idColumn;

    ColumnService.deleteColumn(columnId)
        .then((result) => {
            res.status(200).json(result);
        })
        .catch((err) => {
            res.status(500).json({ error: err.message });
        });
}



export {
    getAllColumns,
    createColumn,
    editColumn,
    deleteColumn
}