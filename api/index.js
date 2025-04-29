import express from 'express';
import cors from 'cors';
import WeekApiRoute from './routes/week.api.routes.js';
import UsersApiRoute from './routes/users.api.routes.js';

const app = express();
app.use(cors());
app.options('*', (req, res) => { res.sendStatus(200); });
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use('/', UsersApiRoute);
app.use('/', WeekApiRoute);


export default app;
