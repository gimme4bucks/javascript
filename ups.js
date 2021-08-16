const Config = require('../../../config')
const axios = require('axios');
const Boom = require('boom');

const moment = require('moment');
const AWS = require('aws-sdk');

import {
    serviceCodes
} from '../../shipper_info/ups_info'

import {
    Shipper
} from './genericShipper'

import {
    responseShipmentCreation
} from './templates/responseShipmentCreation';

import {
    green,
    blue
} from './../../colorScheme'

/**
 * @extends Shipper
 */
class UPS extends Shipper {
    constructor(args) {
        super('UPS')

        const {
            shipping_doc,
            pickup_doc
        } = args

        this.shipping_doc = shipping_doc
        this.pickup_doc = pickup_doc
    }
    /**
     * @typedef returnObject
     * @type {object}
     * @property {string} shippingProvider
     * @property {string} providerReference
     * @property {object} data
     * @property {string} labelUrl
     * @property {string} carrierName
     * @property {string} trackAndTraceCode
     * @property {string} trackAndTraceUrl
     * @property {string} status
     * @property {boolean} hasCallback
     * @property {boolean} hasPickupRequest
     * @property {string} processedBy
     * 
     * @returns {responseShipmentCreation} Object that contains info on the creation of the shipment
     */
    async createShipment() {
        console.log('ups/createShipment')
        const {
            order_id,
            from_warehouse_id,
            pack_customer_reference,
            from_business = '',
            from_given_name,
            from_family_name,
            from_chamber_of_commerce_number = '',
            from_phone_number,
            from_street,
            from_street2,
            from_zip_code,
            from_locality,
            from_country,
            from_province_code,
            from_house_number,
            to_given_name,
            to_family_name,
            to_zip_code,
            to_street,
            to_street2 = '',
            to_locality,
            to_country,
            to_business = '',
            to_phone_number,
            to_province_code,
            to_house_number,
            pack_drop_off,
            processed_by,
        } = this.shipping_doc

        const toPhone = this.checkPhone(to_phone_number, to_country)
        const fromPhone = this.checkPhone(from_phone_number, from_country)
        
        const accountInfo = await this.shippingModel.getAccountInfo(from_country)

        if(!accountInfo) throw Boom.badData(`Could not find the UPS account, cannot ship to country: ${from_country}`)
        
        const BartsParts = Config.get('/BartsParts')

        const payload = {
            ShipmentRequest: {
                Request: {
                    RequestOption: "validate",
                    TransactionReference: {
                        CustomerContext: ""
                    }
                },
                Shipment: {
                    Description: `${pack_customer_reference} / ${from_warehouse_id}`,
                    Shipper: {
                        Name: BartsParts.name.slice(0, 34), // Could give some weird results but the max length is 35
                        AttentionName: 'BART', // Could give some weird results but the max length is 35
                        CompanyDisplayableName: BartsParts.name.slice(0, 34), // Could give some weird results but the max length is 35
                        TaxIdentificationNumber: (BartsParts.vat_number[from_country]) ? BartsParts.vat_number[from_country] : BartsParts.vat_number.NL,
                        Phone: {
                            Number: BartsParts.phone.number,
                            Extension: BartsParts.phone.ext,
                        },
                        ShipperNumber: accountInfo.shipper_number,
                        FaxNumber: "",
                        Address: {
                            AddressLine: `${from_street} ${(from_street2) ? `${from_street2}` : ''}`.slice(0, 34),
                            City: from_locality.slice(0, 29),
                            PostalCode: from_zip_code.slice(0, 8),
                            CountryCode: from_country,
                            ...from_province_code && {
                                StateProvinceCode: from_province_code
                            } // optional
                        }
                    },
                    ShipFrom: {
                        Name: `${(from_business) ? `${from_business}` : ''} ${from_given_name} ${from_family_name}`.slice(0,34), // Could give some weird results but the max length is 35
                        AttentionName: "Mr/Ms",
                        TaxIdentificationNumber: from_chamber_of_commerce_number,
                        Phone: {
                            Number: (fromPhone.countryCallingCode && fromPhone.nationalNumber) ? `${fromPhone.countryCallingCode}${fromPhone.nationalNumber}` : `${BartsParts.phone.ext}${BartsParts.phone.number}`,
                            Extension: (fromPhone.ext) ? (fromPhone.ext).replace('+', "00") : '',
                        },
                        Address: {
                            AddressLine: `${from_street} ${(from_street2) ? `${from_street2} ` : ''}`.slice(0, 34), // Could give some weird results but the max length is 35   ${(from_house_number) ? `${from_house_number}` : ''} could be added to add the house_number
                            City: from_locality.slice(0, 29), // Could give some weird results but the max length is 30
                            PostalCode: from_zip_code.slice(0, 8), // Could give some weird results but the max length is 9
                            CountryCode: from_country,
                            ...from_province_code && {
                                StateProvinceCode: from_province_code
                            } // optional
                        }
                    },
                    ShipTo: {
                        Name: `${(to_business) ? `${to_business}` : ''} ${to_given_name} ${to_family_name}`.slice(0,34), // Could give some weird results but the max length is 35
                        AttentionName: "Mr/Mrs",
                        Phone: {
                            Number: (toPhone.countryCallingCode && toPhone.nationalNumber) ? `${toPhone.countryCallingCode}${toPhone.nationalNumber}` : `${BartsParts.phone.ext}${BartsParts.phone.number}`,
                            Extension: (toPhone.ext) ? (toPhone.ext).replace('+', "00") : '',
                        },
                        Address: {
                            AddressLine: `${to_street} ${to_house_number}`.slice(0, 34), // Could give some weird results but the max length is 35 
                            City: to_locality.slice(0, 29), // Could give some weird results but the max length is 30
                            PostalCode: to_zip_code.slice(0, 8), // Could give some weird results but the max length is 9
                            CountryCode: to_country,
                            ...to_province_code && {
                                StateProvinceCode: to_province_code
                            } // optional
                        }
                    },
                    PaymentInformation: {
                        ShipmentCharge: {
                            Type: "01",
                            BillShipper: {
                                AccountNumber: accountInfo.shipper_number
                            }
                        }
                    },
                    ReferenceNumber: {
                        Code: "ON", // Referers to 'Reference Number Codes' in Shipping Package RESTful 2020-12-07. "ON" means Dealer Order Number. 
                        Value: `${pack_customer_reference} / ${from_warehouse_id}`
                    },
                    Service: { // Could be made more dynamically in the future but for now these are the standard values. 
                        Code: serviceCodes['UPS Standard'],
                        Description: "Standard"
                    },
                    Package: { //Some standard values (see manual UPS Shipping Package RESTful p.79 per 2020-12-07)
                        Description: "Customer Supplied",
                        Packaging: {
                            Code: "02",
                            Description: "Customer Supplied"
                        },
                        PackageWeight: {
                            UnitOfMeasurement: { // Could best be hardcoded since we don't often ship to countries that use the imperial measurement system.
                                Code: "KGS",
                                Description: "Kilo"
                            }, // Since we don't have the weights of all our packages a standard value of 5kg is used. 
                            Weight: "5"
                        },
                    }
                },
                LabelSpecification: {
                    LabelImageFormat: {
                        Code: "PNG"
                    }
                }
            }
        }
        
        const headers = {
            headers: {
                'AccessLicenseNumber': process.env.SHIPPING_UPS_ACCESSLICENSENUMBER,
                'Password': process.env.SHIPPING_UPS_PASSWORD,
                'Username': process.env.SHIPPING_UPS_USERNAME,
                'transId': `${from_warehouse_id}-${moment().format('YYYYMMDDHHmmss')}`,
                'transactionSrc': process.env.SHIPPING_UPS_TRANSACTIONSRC
            }
        }

        const url = `${Config.get('/shipping/ups/liveUrl')}/shipments`

        const responseCreation = await axios.post(url, payload, headers)
            .catch(error => {
                console.log(`Error message from UPS: ${error.response.headers.apierrormsg}`)
                console.log(`Error code for lookup: ${error.response.headers.apierrorcode}`)
            })

        console.log("Status of response to request is: " + responseCreation.status)

        const data = responseCreation.data
        const shipmentId = data['ShipmentResponse']['ShipmentResults']['ShipmentIdentificationNumber']

        let trackAndTraceCode = data['ShipmentResponse']['ShipmentResults']['PackageResults']['TrackingNumber']
        let b64Label = data['ShipmentResponse']['ShipmentResults']['PackageResults']['ShippingLabel']['GraphicImage']


        // in the test env they only have a small set of tracking number for which pdf labels can be retrived: 1Z12345E8791315509
        if (process.env.NODE_ENV !== 'production') {

            trackAndTraceCode = '1Z12345E8791315509'
        }

        let labelUrl = `https://${process.env.AWS_S3_ORDER_DOCUMENTS}.s3.eu-central-1.amazonaws.com/${order_id}/shipping_label_ups_${shipmentId}.pdf`
        let s3_key = `${order_id}/shipping_label_ups_${shipmentId}.pdf`
        let s3_content_type = "application/pdf"

        console.log("trackandtrace " + trackAndTraceCode);
        console.log("Shipping ID: " + shipmentId);

        const label_recovery_url = `${Config.get('/shipping/ups/liveUrl')}/shipments/labels`
        const label_recovery_payload = {

            LabelRecoveryRequest: {
                LabelSpecification: {
                    LabelImageFormat: {
                        Code: "PDF"
                    }
                },
                TrackingNumber : trackAndTraceCode
            }
        }

        let label_recovery_has_errors = false

        const label_recovery_response = await axios.post(label_recovery_url, label_recovery_payload, headers)
            .catch(error => {
                console.log('Error from UPS when trying to request the label recovery')
                console.log(`Error message from UPS: ${error.response.headers.apierrormsg}`)
                console.log(`Error code for lookup: ${error.response.headers.apierrorcode}`)
                console.log('PNG Label from Shipment Response will be used instead')

                labelUrl = `https://${process.env.AWS_S3_ORDER_DOCUMENTS}.s3.eu-central-1.amazonaws.com/${order_id}/shipping_label_ups_${shipmentId}.png`
                s3_key = `${order_id}/shipping_label_ups_${shipmentId}.png`
                s3_content_type = "image/png"
                label_recovery_has_errors = true
            })

        if (!label_recovery_has_errors) {
            b64Label = label_recovery_response.data['LabelRecoveryResponse']['LabelResults']['LabelImage']['GraphicImage']
        }

        const label = new Buffer.from(JSON.stringify(b64Label), 'base64')

        const s3Params = {
            Bucket: process.env.AWS_S3_ORDER_DOCUMENTS,
            Key: s3_key,
            Body: label,
            ContentEncoding: 'base64',
            ContentType: s3_content_type,
            ACL: 'public-read'
        }

        const S3 = new AWS.S3({
            signatureVersion: 'v4',
            region: 'eu-central-1'
        })

        S3.putObject(s3Params).promise().catch(err => {
            console.log(err)
        })

        return new responseShipmentCreation({
            order_id: order_id,
            warehouse_id: from_warehouse_id,
            provider_id: shipmentId,
            shipping_company: 'UPS',
            shipping_provider: 'UPS',
            label_url: labelUrl,
            tracking_number: trackAndTraceCode,
            tracking_url: `https://www.ups.com/track?tracknum=${trackAndTraceCode}`,
            status: 'booked',
            request_pickup: (pack_drop_off) ? false : await this.getRequiredPickup(from_warehouse_id),
            processed_by: (processed_by) ? processed_by : 'BART',
            hasCallback: false,
        })
    }

    async postPickups(pickupRequests) {
        if (pickupRequests.length === 0) return
        console.log(blue, `Going to do pickup request...`)
        const pickups = pickupRequests.reduce((accumulator, request) => {
            const index = accumulator.findIndex(location => location.location_id === request.warehouse_id)
            if (index > -1) {
                accumulator[index].pickups = [...accumulator[index].pickups, request]
            } else {
                accumulator.push({
                    location_id: request.warehouse_id,
                    pickups: [request],
                })
            }
            return accumulator
        }, [])

        for(let pickup of pickups){
            console.log(green, `Found pickup request for location ${pickup.location_id}:  `)
            console.log(pickup)
        }
        
        return await Promise.all(pickups.map(async location => {
            return await this.doUPSPickupRequests({
                location_id: location.location_id,
                pickups: location.pickups,
            })
        }))
    }

    /**
     * 
     * @param {Object} args 
     * @param {int} args.location_id
     * @param {int} args.pickups
     * 
     * Pickups are requested per location. They are then devided further per shipping country in the PickupPieces. 
     */
    async doUPSPickupRequests(args) {
        const {
            location_id,
            pickups
        } = args
        console.log(`Performing ${pickups.length} UPS Pickup Request for warehouse ${location_id}`)

        const {
            companyname,
            firstname,
            lastname,
            address,
            address2,
            city,
            postalcode,
            country,
            email,
            phone
        } = await this.shippingModel.getWarehouseInfo(location_id).catch(err => {
            throw Boom.badData(`Could not create Pickup Request(s) for ${location_id}, could not retreive WarehouseInfo`, args)
        })

        const {
            nationalNumber,
            countryCallingCode,
            ext
        } = this.checkPhone(phone, country)

        const accountInfo = await this.shippingModel.getAccountInfo(country).catch(err => {
            throw Boom.badData(`Could not create Pickup Request(s) for ${location_id}, could not retreive AccountInfo`, args)
        })

        const BartsParts = Config.get('/BartsParts')
        
        const payload = {
            PickupCreationRequest: {
                RatePickupIndicator: "N", // indicates whether to rate the pickup, don't know what this means though!? But it's mandatory. 
                Shipper: {
                    Account: {
                        AccountNumber: accountInfo.shipper_number,
                        AccountCountryCode: accountInfo.country
                    }
                },
                PickupDateInfo: {
                    CloseTime: "1700", // Reasonable closing time, since we don't have these of every dealer we hardcode them. 
                    ReadyTime: "0900", // Reasonable opening time, since we don't have these of every dealer we hardcode them. 
                    PickupDate: this.getPickupMoment(country).format('YYYYMMDD') // Pickup moment is the next day, unless that is a weekendday. 
                },
                PickupAddress: {
                    CompanyName: companyname.toString().slice(0, 26), // could give some weird results but the max characters is 27
                    ContactName: `${firstname} ${lastname}`.slice(0, 21), // could give some weird results but the max characters is 22
                    AddressLine: `${address}${(address2) ? ` ${address2}`: ''}`.slice(0, 72), // could give some weird results but the max characters is 73
                    City: city,
                    // ...(country == 'IE') && {StateProvince: state_province.slice(0,49)}, ** optional, for certain countries like IE and HK // could give some weird results but the max characters is 50
                    // ...(country == 'UK' || country == 'MX' || country == 'PR') && {Urbanization: urbanization.slice(0,49)}, // Only used for MX, PR and UK (UK = 'Shire')
                    PostalCode: postalcode.slice(0, 7), // could give some weird results but the max characters is 8
                    CountryCode: country,
                    ResidentialIndicator: "N", // Don't have this info but guessing none of our dealers are residential. 
                    //PickupPoint: "Branch", // The specific spot top pickup the package, is not required. 
                    Phone: {
                        Number: (nationalNumber && countryCallingCode) ? `00${countryCallingCode}${nationalNumber}` : `${BartsParts.phone.ext}${BartsParts.phone.number}`,
                        Extension: (ext) ? ext.replace('+', '00') : ''
                    }
                },
                AlternateAddressIndicator: "Y", // Since BartsParts is listed as the main address we need an alternative address indicator. 
                PickupPiece: this.getPickups(pickups),
                OverweightIndicator: "N", // We don't expect them to be overweight (max value is 32 kg) so this is hardcoded for now. 
                PaymentMethod: "01", // standard value to charge pickups to account. See Pickup Package RESTful p.19 as 2020-12-07. 
                Notification: {
                    ConfirmationEmailAddress: email,
                    UndeliverableEmailAddress: 'shipping@bartsparts.com'
                }
            }
        }

        const headers = {
            headers: {
                AccessLicenseNumber: process.env.SHIPPING_UPS_ACCESSLICENSENUMBER,
                Password: process.env.SHIPPING_UPS_PASSWORD,
                Username: process.env.SHIPPING_UPS_USERNAME,
                transId: `${location_id}-${moment().format('YYYYMMDDHHmmss')}`, //Used as an identifier for the 'transaction'
                transactionSrc: process.env.SHIPPING_UPS_TRANSACTIONSRC //Used to indicate who made the call. 
            }
        }

        const url = `${Config.get('/shipping/ups/liveUrl')}/pickups`

        // console.log('headers', headers)
        // console.log('body', params2)
        // console.log('url', url)

        const pickupCreationResponse = await axios.post(url, payload, headers).catch(error => {
            console.log("Error in UPS post-request: " + error);
            console.log(error.response.data.response.errors[0]);
            throw Boom.badData("Error in Axios in UPS Post: " + error.response.data.response.errors[0].message)
        })

        for await (let pickup of pickups) {
            this.shippingModel.updatePickupBooleans(pickup.fulfillment_id).catch(err => {
                console.log(`Error in updating PickupBooleans:`)
                console.log(err)
                console.log(pickup)
            })
        }

        return pickupCreationResponse.data.PickupCreationResponse
    }

    /**
     * 
     * @param {Object[]} pickups  
     * 
     * Getting the pickups requires an array with all the pickup requests we would like to make. 
     * The pickup request contains the service code, quantity of packages, destination country code and what kind of package. 
     * In order to make the information as consise as possible the amount of pickups per loction per country is calculated
     * and filtered with the code below. this.filterCountries(...) is a function that filters the pickups per country so every
     * object in the PickupPiece array contains the pickups per DestinationCountryCode. 
     */
    getPickups(pickups) {
        return this.filterCountries(pickups).map(pickup => {
            return {
                "ServiceCode": serviceCodes['UPS Standard'], // at the moment we hardcode this to UPS Standard, maybe in the future we want to make this dynamic. 
                "Quantity": pickup.pickups.toString(), // needs to be a string. 
                "DestinationCountryCode": pickup.country,
                "ContainerCode": "01" // Pickup Package RESTful docs p.18. "01" means package, other values are "02" (UPS Letter) and "03" (Pallet)
            }
        })
    }

    /**
     * 
     * @param {Object[]} pickups 
     */
    filterCountries(pickups) {
        return pickups.reduce((accumulator, pickup) => {
            const countryIndex = accumulator.findIndex(country => country.country === pickup.shipping_country)
            if (countryIndex > -1) accumulator[countryIndex].pickups += 1
            else accumulator.push({
                country: pickup.shipping_country,
                pickups: 1
            })
            return accumulator
        }, [])
    }

    // createAddressLine(street, street2, houseNumber){
    //     if(typeof Number(houseNumber) === 'number'){
    //         const replacer
    //     }
    // }
}

export {
    UPS
}
