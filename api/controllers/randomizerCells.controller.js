import { ObjectId } from 'mongodb'
import * as CellService from '../../services/randomizerCells.services.js'

// Controlador para la creación de una celda asociada a un valor de una columna
function createCell(req, res) {
    const columnValueId = req.params.columnValueId;
    const value = req.body.valor;

    CellService.createCell(columnValueId, value)
        .then((newCell) => {
            res.status(201).json(newCell);
        })
        .catch((err) => {
            res.status(500).json({ error: err.message });
        });
}


export {
    createCell
}