'use strict'

const moment = require('moment-timezone')
const config = require('config')
const union = require('lodash.union')
const sortBy = require('lodash.sortby')
const fetch = require('node-fetch')
const network = require('./network.json')

const db = require('db-prices')
const mfb = require('meinfernbus').trips
const eurolines = require('eurolines-de')

const clone = (e) => JSON.parse(JSON.stringify(e))

const generateCalendar = () => {
    const calendar = []
    for(let day=2; day<=40; day++){
        const date = moment.tz(config.timezone).startOf('day').add(day, 'days').startOf('day')
        calendar.push(date)
    }
    return calendar
}

const pricesDB = (origin, destination) => {
    const calendar = generateCalendar()
    const promised = []
    for(let date of calendar){
        // promised.push(db(origin.ids.db, destination.ids.db, date.toDate()))
        promised.push(
            fetch(`https://db-prices.juliuste.de?from=${origin.ids.db}&to=${destination.ids.db}&date=${date.toISOString()}`, {
        		method: 'get'
        	})
        	.then((res) => res.json())
            .then((res) => {console.log(res); return res})
            .catch((res) => {console.error(1, res); return {}})
        )
    }
    return Promise.all(promised).then((results) => {
        results = union(...results)
        const sorted = sortBy(results.filter((r) => r.price && r.price.amount), (r) => r.price.amount)
        if(!sorted.length) return null
        const shopLink = `https://bahn.guru/calendar?from=${origin.ids.db}&to=${destination.ids.db}&submit=↳&class=2&bc=0&start=&end=&duration=&weeks=7`
        return {amount: sorted[0].price.amount, link: shopLink}
    })
}

const pricesMFB = (origin, destination) => {
    const calendar = generateCalendar()
    const promised = []
    for(let date of calendar){
        // promised.push(mfb(origin.ids.mfb, destination.ids.mfb, date.toDate()))
        promised.push(
            fetch(`https://meinfernbus.juliuste.de/trips?from=${origin.ids.mfb}&to=${destination.ids.mfb}&date=${date.toISOString()}`, {
                method: 'get'
            })
            .then((res) => res.json())
            .then((res) => {console.log(res); return res})
            .catch((res) => {console.error(1, res); return {}})
        )
    }
    return Promise.all(promised).then((results) => {
        results = union(...results)
        const sorted = sortBy(results.filter((r) => r.price && r.status==='available'), (r) => r.price)
        if(!sorted.length) return null
        const shopLink = `https://shop.flixbus.de/search?departureCity=${origin.ids.mfb}&arrivalCity=${destination.ids.mfb}&_locale=de&rideDate=${moment(sorted[0].departure).format("DD.MM.YYYY")}`
        return {amount: sorted[0].price, link: shopLink}
    })
}

const pricesEurolines = (origin, destination) => {
    const calendar = generateCalendar()
    const promised = []
    for(let date of calendar){
        promised.push(
            fetch(`https://eurolines-de.juliuste.de/journeys?origin=${origin.ids.eurolines}&destination=${destination.ids.eurolines}&date=${date.toISOString()}`, {method: 'get'})
            .then((res) => res.json())
            .then((res) => {console.log(res); return res})
            .catch((res) => {console.error(1, res); return {}})
        )
    }
    return Promise.all(promised).then((results) => {
        results = union(...results)
        const sorted = sortBy(results.filter((r) => r.price && +r.price.amount && +r.price.amount > 0), (r) => r.price.amount)
        if(!sorted.length) return null
        const shopLink = `https://www.eurolines.de/index.php?origin=${origin.ids.eurolines}&id=57&destination=${destination.ids.eurolines}&departure_date=${moment(sorted[0].departure).format("DD-MM-YYYY")}&no_passengers=1`
        return {amount: sorted[0].price.amount, link: shopLink}
    })
}

const prices = (origin) => {
    const results = []

    const destinations = network.filter((s) => s.code !== origin.code)

    for(let destination of destinations){
        const priceResults = []
        for(let operator of ['db', 'mfb', 'eurolines']){
            if(!destination.ids[operator]) priceResults.push(Promise.resolve(null))
            else{
                if(operator === 'db') priceResults.push(pricesDB(origin, destination))
                if(operator === 'mfb') priceResults.push(pricesMFB(origin, destination))
                if(operator === 'eurolines') priceResults.push(pricesEurolines(origin, destination))
            }
        }
        results.push(Promise.all(priceResults).then(([db, mfb]) => {
            const r = clone(destination)
            r.prices = {
                db, mfb, eurolines
            }
            return r
        }))
    }
    return Promise.all(results)
}

module.exports = prices
