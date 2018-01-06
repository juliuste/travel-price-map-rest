'use strict'

const readJSON = require('load-json-file')
const writeJSON = require('write-json-file')
const find = require('lodash.find')
const config = require('config')

const network = require('./network.json')
const prices = require('./updatePrices')

// update cached data
const updateCache = async () => {
    for(let o of config.origins){
        const origin = find(network, (s) => s.id === o)
        const fetched = await (
            prices(origin)
            .then((data) => writeJSON(`cached/${origin.id}.json`, {requestTime: +new Date(), data}))
            .catch((e) => {throw new Error(e)}) // TODO
        )
    }
    console.log('done')
}

// access cached data
const main = (originId) => {
    const origin = find(network, (s) => s.id === originId)
    return readJSON(`cached/${origin.id}.json`)
    .then((cached) => cached.data)
    .catch((e) => {throw new Error(e)})
}

updateCache()
setInterval(updateCache, config.cacheTime * 60 * 60 * 1000)

module.exports = main
