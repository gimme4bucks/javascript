const Config = require('../../../config')
const moment = require('moment')

import parsePhoneNumber from 'libphonenumber-js'
import holidayChecker from 'date-holidays'

import {
    UPSShippingModel,
    DHLShippingModel,
    WuunderShippingModel,
    PacklinkShippingModel,
    GenericShippingModel
} from '../../models/mysql/shipping/shipping.bundel'

class Shipper {
    constructor(shipper) {
        this.shippingModel = this.getShipperModel(shipper)
    }

    /**
     * 
     * @param {string} shipper - The shipper like 'UPS', 'DHL', 'Wuunder' etc. 
     */
    getShipperModel(shipper) {
        switch (shipper.toUpperCase()) {
        case 'UPS':
            return new UPSShippingModel()
        case 'DHL':
            return new DHLShippingModel()
        case 'WUUNDER':
            return new WuunderShippingModel()
        case 'PACKLINK':
            return new PacklinkShippingModel()
        default:
            return new GenericShippingModel()
        }
    }

    /**
     * 
     * @param {string} country - ISO 2 letter country code
     * @returns {Date} - returns a Date that can be formatted to the needs of the shipper. 
     * 
     * Pickups are best scheduled outside weekends and holidays. To check if this is true some logic has been added. 
     */
    getPickupMoment(country) {
        const hd = new holidayChecker()
        hd.init(country)

        const today = moment()
        do {
            let weekday = today.format('dddd')
            if (weekday === 'Friday') today.add(3, 'day')
            else if (weekday === 'Saturday') today.add(2, 'day')
            else today.add(1, 'day')
        }
        while (this.isHoliday(today, hd))
        return today
    }

    /**
     * 
     * @param {Date} date 
     * @param {holidayChecker} hd 
     * 
     * Currently three types are considered holidays, public (like in the Netherlands 25-12 && 26-12 ), 
     * bank (major instutions and companies close on these days) and optional (the majority of people take a day off). 
     * Changing the types in the holidayType array means you can change on which type of holidays you would still like
     * the pickups to take place. You could even do this per country as this might vary. 
     */
    isHoliday(date, hd) {
        const holiday = hd.isHoliday(date.format('YYYY-MM-DD HH:mm:ss'))
        const holidayTypes = ['public', 'bank', 'optional'] // date-holidays has 4 types of holidays, the missing one is 'observance'. 
        if (holiday) {
            if (holidayTypes.includes(holiday.type)) return true
            else return false
        } else return false
    }

    /**
     * 
     * @param {string} phone_number 
     * @param {string} country - ISO 2 Letter code
     * 
     * To make sure we supply UPS with a valid phonenumber of the location the phone number gets validated (once more). 
     * As a fallback we supply BartsParts's phonenumer if that of the location is invalid. 
     */
    checkPhone(phone_number, country) {
        if(typeof phone_number === 'string'){
            const phonenumber = parsePhoneNumber(phone_number, country)
            if (phonenumber) {
                if (phonenumber.isValid()) return phonenumber
                else return {
                    nationalNumber: Config.get('/BartsParts/phone/number'),
                    countryCallingCode: Config.get('/BartsParts/phone/countryCallingCode'),
                    ext: Config.get('/BartsParts/phone/ext')
                }
            } else return {
                nationalNumber: Config.get('/BartsParts/phone/number'),
                countryCallingCode: Config.get('/BartsParts/phone/countryCallingCode'),
                ext: Config.get('/BartsParts/phone/ext')
            }
        }
        else return {
            nationalNumber: Config.get('/BartsParts/phone/number'),
            countryCallingCode: Config.get('/BartsParts/phone/countryCallingCode'),
            ext: Config.get('/BartsParts/phone/ext')
        }
    }

    getRequiredPickup(location_id){
        return this.shippingModel.getRequiredPickupDealer(location_id)
    }
}

export {
    Shipper
}
