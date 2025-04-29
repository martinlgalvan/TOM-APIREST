import express from 'express'
import cors from 'cors'
import WeekApiRoute from './api/routes/week.api.routes.js'
import UsersApiRoute from './api/routes/users.api.routes.js'


const app = express()
app.use(express.urlencoded({ extended: true}))
app.use(express.json())
app.use(cors())

app.use(express.static('public'))
app.use('/', UsersApiRoute)
app.use('/', WeekApiRoute)

app.listen(2022, function () {
    console.log('server started')
})