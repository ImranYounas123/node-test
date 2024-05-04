import path from 'path'
import lumie from 'lumie'
import dotenv from 'dotenv'
import express from 'express'
import bodyParser from 'body-parser'
// eslint-disable-next-line import/no-extraneous-dependencies
import rateLimit from 'express-rate-limit'

import * as Sentry from '@sentry/node'
import * as Tracing from '@sentry/tracing'

import exceptionHander from './middlewares/exception-handler'
import { createClient } from './config/redis'
;(async function () {
    /**
     * load environment variables from .env
     */
    dotenv.config()

    /**
     * initiate the express server instance
     */
    const app = express()

    /**
     * initiate the sentry instance
     */
    Sentry.init({
        dsn: process.env.SENTRY_DSN,
        environment: process.env.NODE_ENV,
        integrations: [
            // enable HTTP calls tracing
            new Sentry.Integrations.Http({ tracing: true }),
            // enable Express.js middleware tracing
            new Tracing.Integrations.Express({ app }),
        ],

        // Set tracesSampleRate to 1.0 to capture 100%
        // of transactions for performance monitoring.
        // We recommend adjusting this value in production
        tracesSampleRate: 0,
    })

    /**
     * The request handler must be the
     * first middleware on the app
     */
    app.use(Sentry.Handlers.requestHandler())

    /**
     * TracingHandler creates a trace
     * for every incoming request
     */
    app.use(Sentry.Handlers.tracingHandler())

    /**
     * enable cors for express app
     */
    const cors = require('cors')({
        origin: true,
    })
    app.use(cors)

    const apiLimiter = rateLimit({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 100, // limit each IP to 100 requests per windowMs
        message:
            'Too many requests from this IP, please try again after 15 minutes',
    })
    app.use('/api/', apiLimiter)

    /*
     * To access files placed in storage using url
     * */
    app.use('/storage', express.static('storage'))
    /**
     * parse the form data from body using body parser
     */
    app.use(
        bodyParser.urlencoded({
            extended: true,
        })
    )

    /**
     * parse the json from body using body parser
     */
    app.use(
        bodyParser.json({
            limit: '100mb',
        })
    )

    /**
     * Bind routes with express app
     */
    lumie.load(app, {
        preURL: 'api',
        verbose: true,
        ignore: ['*.spec', '*.action', '*.md'],
        controllers_path: path.join(__dirname, 'controllers'),
    })

    /**
     * connect to the redis wait for the connection then proceed
     */
    await createClient()

    /**
     * The error handler must be before
     * any other error middleware and
     * after all controllers
     */
    app.use(Sentry.Handlers.errorHandler())

    /**
     * Default exception handing
     */
    app.use(exceptionHander)

    /**
     * get express port from .env
     * or declare with default value
     */
    const port = process.env.PORT || 3000

    /**
     * listen to the exposed port
     */
    const server = app.listen(port, () => {
        // eslint-disable-next-line
        console.log('App server started on port ' + port)
    })

    const io = require('socket.io')(server, {
        pingTimeout: 60000,
        cors: {
            origin: 'http://localhost:3000',
            // credentials: true,
        },
    })

    io.on('connection', (socket) => {
        // eslint-disable-next-line no-console
        console.log('Connected to socket.io')
        socket.on('setup', (userData) => {
            socket.join(userData._id)
            socket.emit('connected')
        })

        socket.on('join chat', (room) => {
            socket.join(room)
            // eslint-disable-next-line no-console
            console.log('User Joined Room: ' + room)
        })
        socket.on('typing', (room) => socket.in(room).emit('typing'))
        socket.on('stop typing', (room) => socket.in(room).emit('stop typing'))

        socket.on('new message', (newMessageRecieved) => {
            const chat = newMessageRecieved.chat

            // eslint-disable-next-line no-console
            if (!chat.users) return console.log('chat.users not defined')

            chat.users.forEach((user) => {
                if (user._id == newMessageRecieved.sender._id) return

                socket.in(user._id).emit('message recieved', newMessageRecieved)
            })
        })

        socket.off('setup', (userData) => {
            // eslint-disable-next-line no-console
            console.log('USER DISCONNECTED')
            socket.leave(userData._id)
        })
    })
})()
