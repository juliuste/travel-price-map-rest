'use strict'

const moment = require('moment-timezone')
const config = require('config')
const union = require('lodash.union')
const sortBy = require('lodash.sortby')
const timeout = require('p-timeout')
const retry = require('p-retry')
const got = require('got')

const network = require('./network.json')

const db = require('db-prices')
const mfb = require('meinfernbus').journeys
const eurolines = require('eurolines-de').journeys

const apis = {
    db,
    mfb: (origin, destination, date) => mfb(
        {type: 'region', id: origin},
        {type: 'region', id: destination},
        date
    ),
    eurolines
}

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
    // db: `https://bahn.guru/calendar?from=${origin.db}&to=${destination.db}&submit=↳&class=2&bc=0&start=&end=&duration=&weeks=7`,
    db: `https://ps.bahn.de/preissuche/preissuche/psc_start.post?country=DEU&lang=de&dbkanal_007=L01_S01_D001_KIN0001_qf-sparpreis-svb-kl2_lz03&ps=1&psc-anfragedata-json={"startSucheSofort":true,"startBhfName":${origin.name},"startBhfId":"00${origin.db}","zielBhfName":"${destination.name}","zielBhfId":"00${destination.db}","schnelleVerbindungen":true,"klasse":2,"tripType":"single","datumHin":"${moment(journey.legs[0].departure).format("DD.MM.YY")}","travellers":[{"typ":"E","bc":0}]}`,
    mfb: `https://shop.flixbus.de/search?departureCity=${origin.mfb}&arrivalCity=${destination.mfb}&_locale=de&rideDate=${moment(journey.legs[0].departure).format("DD.MM.YYYY")}`,
    eurolines: `https://www.eurolines.de/index.php?origin=${origin.eurolines}&id=57&destination=${destination.eurolines}&departure_date=${moment(journey.legs[0].departure).format("DD-MM-YYYY")}&no_passengers=1`
})

const ouibusPrices = async (origin, destination) => {
    const calendar = generateCalendar()
    const start = calendar[0]
    const end = calendar[calendar.length-1]
    const request = await got.get(`https://www.ouibus.com/_price_calendar?origin=${origin.ouibus}&destination=${destination.ouibus}&begin=${start.format('YYYY-MM-DD')}&end=${end.format('YYYY-MM-DD')}&direction=outbound`, {json: true}).catch((res) => {console.error(1, res); return {}})
    console.log('ouibus', origin.name, destination.name)

    let priceList = []
    for(let date of Object.keys(request.body)){
        if(request.body[date] && request.body[date].amount)
            priceList.push({
                date,
                amount: +request.body[date].amount.split('€')[1]
            })
    }

    priceList = priceList.filter(x => x && x.amount)
    if(!priceList.length) return null
    const cheapest = sortBy(priceList, x => x.amount)[0]
    const shopLink = `https://www.ouibus.com/booking?origin=${origin.ouibus}&destination=${destination.ouibus}&outboundDate=${cheapest.date}&inboundDate=&passengers%5B0%5D%5Btype%5D=A`
    return {amount: cheapest.amount, link: shopLink}
}

const operatorPrices = (operator) => (origin, destination) => {
    if(operator === 'ouibus') return ouibusPrices(origin, destination)
    // todo: queue
    const calendar = generateCalendar()
    const promised = []
    for(let date of calendar){
        promised.push(
            retry(
                () => timeout(
                    apis[operator](origin[operator], destination[operator], date.toDate()),
                    10*1000
                ),
                {retries: 5}
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
        for(let operator of ['db', 'mfb', 'eurolines', 'ouibus']){
            if(!origin[operator] || !destination[operator]) priceResults[operator] = null
            else priceResults[operator] = await operatorPrices(operator)(origin, destination)
        }
        const d = clone(destination)
        d.prices = priceResults
        results.push(d)
    }

    return results
}

module.exports = prices
