'use strict'

const moment = require('moment-timezone')
const config = require('config')
const union = require('lodash.union')
const sortBy = require('lodash.sortby')
const timeout = require('p-timeout')
const retry = require('p-retry')

const network = require('./network.json')

const db = require('db-prices')
const mfb = require('meinfernbus').journeys
const eurolines = require('eurolines-de').journeys


const apis = {db, mfb, eurolines}

const clone = (e) => JSON.parse(JSON.stringify(e))

const generateCalendar = () => {
    const calendar = []
    for(let day=config.period.start; day<=config.period.end; day++){
        const date = moment.tz(config.timezone).startOf('day').add(day, 'days').startOf('day')
        calendar.push(date)
    }
    return calendar
}

const shopLink = (origin, destination, journey) => ({
    db: `https://bahn.guru/calendar?from=${origin.db}&to=${destination.db}&submit=↳&class=2&bc=0&start=&end=&duration=&weeks=7`,
    mfb: `https://shop.flixbus.de/search?departureCity=${origin.mfb}&arrivalCity=${destination.mfb}&_locale=de&rideDate=${moment(journey.legs[0].departure).format("DD.MM.YYYY")}`,
    eurolines: `https://www.eurolines.de/index.php?origin=${origin.eurolines}&id=57&destination=${destination.eurolines}&departure_date=${moment(journey.legs[0].departure).format("DD-MM-YYYY")}&no_passengers=1`
})

const operatorPrices = (operator) => (origin, destination) => {
    // todo: queue
    const calendar = generateCalendar()
    const promised = []
    for(let date of calendar){
        promised.push(
            timeout(
                retry(
                    () => apis[operator](origin[operator], destination[operator], date.toDate()),
                    {retries: 5}
                ),
                10*1000
            )
            .then((res) => {console.log(operator, origin.name, destination.name, date.format('DD.MM.YYYY')); return res})
            .catch((res) => {console.error(1, res); return {}})
        )
    }
    return Promise.all(promised).then((results) => {
        results = union(...results).filter(r => r.price && r.price.amount)
        if(operator === 'mfb') results = results.filter(r => r.status==='available')
        const sorted = sortBy(results, r => r.price.amount)
        if(!sorted.length) return null
        const link = shopLink(origin, destination, sorted[0])[operator]
        return {amount: sorted[0].price.amount, link}
    })
}

const prices = async (origin) => {
    const results = []

    const destinations = network.filter((s) => s.id !== origin.id)

    for(let destination of destinations){
        const priceResults = {}
        for(let operator of ['db', 'mfb', 'eurolines']){
            if(!destination[operator]) priceResults[operator] = null
            else priceResults[operator] = await operatorPrices(operator)(origin, destination)
        }
        const d = clone(destination)
        d.prices = priceResults
        results.push(d)
    }

    return results
}

module.exports = prices
