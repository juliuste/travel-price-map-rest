'use strict'

const config = require('config')
const fs = require('fs')
const express = require('express')
const http = require('http')
const corser = require('corser')
const compression = require('compression')
const path = require('path')

const prices = require('./prices')

const api = express()
const server = http.createServer(api)

const allowed = corser.simpleRequestHeaders.concat(['User-Agent'])
api.use(corser.create({requestHeaders: allowed})) // CORS
api.use(compression())

api.get('/', prices)

api.use((err, req, res, next) => {
	if (res.headersSent) return next()
	res.status(err.statusCode || 500).json({error: true, msg: err.message})
	next()
})

server.listen(config.port, (e) => {
	if (e) return console.error(e)
	console.log(`Listening on ${config.port}.`)
})
