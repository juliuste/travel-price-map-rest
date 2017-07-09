'use strict'

const config = require('config')
const prices = require('./lib')

const err400 = (msg) => {
	const e = new Error(msg)
	e.statusCode = 400
	return e
}

module.exports = (req, res, next) => {
	if ('string' !== typeof req.query.origin)
		return next(err400('missing origin parameter.'))
	if (config.origins.indexOf(req.query.origin)<0)
		return next(err400('invalid origin parameter.'))

	prices(req.query.origin)
	.then((data) => {
		res.json(data)
	}, next)
	.catch(next)
}
