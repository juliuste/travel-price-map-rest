'use strict'

const readJSON = require('load-json-file')
const writeJSON = require('write-json-file')
const find = require('lodash.find')
const config = require('config')

const network = require('./network.json')
const prices = require('./updatePrices')

const updateCache = () => {
    for(let o of config.origins){
        const origin = find(network, (s) => s.code === o)
        prices(origin)
        .then((data) => writeJSON(`cached/${origin.code}.json`, {requestTime: +new Date(), data}))
        .catch((e) => {throw new Error(e)}) // TODO
    }
}

const main = (originCode) => {
    const origin = find(network, (s) => s.code === originCode)
    return readJSON(`cached/${origin.code}.json`)
    .then((cached) => cached.data)
    .catch((e) => {throw new Error(e)})
}

updateCache()
setInterval(updateCache, config.cacheTime * 60 * 60 * 1000)

module.exports = main
