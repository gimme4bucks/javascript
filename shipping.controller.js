

// External packages
const Boom = require('boom');
const moment = require('moment')
const _ = require('lodash');

// Internal packages
const BC = require('./bigcommerce.controller')
const ShippingValidator = require('../validators/ShippingValidator')

import {
    UPS,
    DHL,
    Wuunder,
    Packlink,
    MANUAL
} from './shipping/shipping.bundel'

import {
    supported_countries
} from '../shipper_info/general'

import {
    ShipmentDocument,
    PickupDocument,
    UpdateDocument
}from './shipping/templates/shipping.bundel'

import {
    UPSShippingModel,
    PacklinkShippingModel,
    DHLShippingModel,
    WuunderShippingModel,
    ManualShippingModel
} from '../models/mysql/shipping/shipping.bundel'

import {
    InvoiceController
} from './invoicing/invoice.controller'

import {
    DealerMailer
} from './mailing/mailer.controller'


class Shipping {
    /**
     *
     * @param {string} type - Shipment or Pickup
     * @param {object} args - depends based on the type. Shipment needs arguments that can be passed in a ShipmentDocument, a pickup needs arguments that can be passed in a PickupDocument.
     *
     * The logic here is that there are three kinds of usage for this class, Shipment, Pickup and Update. Based on these types a
     * document is created needed to make the required request. These documents are a double check on if the data needed is present and correct.
     */
    constructor(type, args) {
        this.type = type
        switch (type) {
        case "Shipment":
            this.shipping_doc = new ShipmentDocument(args)
            //if(!this.shipping_doc.selected_shipper && !this.shipping_doc.preferred_shipper) throw Boom.badData('No shipper selected, please select one or contact IT.')
            this.preferred_shipper = (this.shipping_doc.selected_shipper) ? this.shipping_doc.selected_shipper : this.shipping_doc.preferred_shipper
            this.shipper = this.getShipper({
                preferred_shipper: this.preferred_shipper,
                data: {
                    shipping_doc: this.shipping_doc
                }
            })
            this.shippingModel = this.getModel()
            break;
        case "Pickup":
            this.pickup_doc = new PickupDocument(args)
            this.shipper = this.getShipper({
                preferred_shipper: this.pickup_doc.shipper,
                data: {
                    pickup_doc: this.pickup_doc,
                }
            })
            this.shippingModel = this.getModel()
            break
        case "Update":
            this.update_doc = new UpdateDocument(args)
            this.shipper = this.getShipper({
                preferred_shipper: this.update_doc.shipper,
                data: {
                    update_doc: this.update_doc
                }
            })
            this.shippingModel = this.getModel()
            break
        default:
            throw Boom.badData('No type matching Shipment or Pickup found, please check again.', args)
        }

        this.data = {
            shipping_doc: this.shipping_doc,
            pickup_doc: this.pickup_doc,
            update_doc: this.update_doc
        }

        if (!this.shipping_doc && !this.pickup_doc && !this.update_doc) throw Boom.badData(`Could not process this request within the shipper`, this.data)

        // META
        this.order_id = args.order_id
        this.bc_id = args.bc_id
        this.bc_store_hash = args.bc_store_hash
        this.created_at = moment().format('YYYY-MM-DD HH:mm:ss')

    }
    /**
     *
     * @param {Object} args
     * @param {string} args.preferred_shipper
     * @param {Object} args.data - The data needed in the constructors of the shipper (ShippingDocument, PickupDocument etc.)
     *
     * Since there are (currently) two options this class will be used for there are two ways to select a shipper.
     * This way if it pertains a pickup only the given shipper needs to be created, nothing more. If it is a shipment
     * that needs to be created there is a bit more logic needed, like if there is a preferred_shipper? If not then a
     * shipper needs to be chosen based on some other logic, currently that is the 'priority' in the supported_countries object.
     * The first element that fulfills the requirements will be the 'preferred' shipper.
     */
    getShipper({
        preferred_shipper,
        data
    }) {
        const choose = (shipper) => {
            this.shipper_name = shipper
            switch (shipper.toUpperCase()) {
            case "UPS":
                return new UPS(data)
            case "DHL":
                return new DHL(data)
            case "WUUNDER":
                return new Wuunder(data)
            case "PACKLINK":
                return new Packlink(data)
            case "MANUAL":
                return new MANUAL(data)
            default:
                throw Boom.badData('(Preferred) Shipper is not supported', this.data)
            }
        }

        if (this.type == 'Pickup' || this.type == 'Update') {
            return choose(preferred_shipper)
        } else if (this.type == 'Shipment') {
            const from_country = this.shipping_doc.from_country
            if (preferred_shipper) {
                if(this.type == 'Shipment' && (preferred_shipper && supported_countries[preferred_shipper.toUpperCase()].supported_countries.from.includes(from_country))){
                    
                    return choose(preferred_shipper)
                } else if (this.shipping_doc.selected_shipper) {
                    throw Boom.badData('Selected shipper is not supported for these countries')
                } else {
                    const supported_shippers = Object.keys(supported_countries)

                    for (let shipper of supported_shippers) {
                        if (supported_countries[shipper.toUpperCase()].supported_countries.from.includes(from_country)) return choose(shipper)
                    }
                }
            } else {
                const supported_shippers = Object.keys(supported_countries)

                for (let shipper of supported_shippers) {
                    if (supported_countries[shipper.toUpperCase()].supported_countries.from.includes(from_country)) return choose(shipper)
                }
            }
        }
    }

    /*
     * The model for this class is based on the chosen shipper. This model will be used in one of the three main functions
     * to retreive the information needed to perform those funcitons.
     */

    getModel() {
        switch (this.shipper_name.toUpperCase()) {
        case "UPS":
            return new UPSShippingModel()
        case "DHL":
            return new DHLShippingModel()
        case "WUUNDER":
            return new WuunderShippingModel()
        case "PACKLINK":
            return new PacklinkShippingModel()
        case 'MANUAL':
            return new ManualShippingModel()
        default:
            throw Boom.badData('(Preferred) ShippingModel is not supported', this.data)
        }
    }

    /*
     * The function used to create a shipment, this function will create a shipment for the 'chosen' shipper
     * returned from the 'getShipper(...)' function. The shipper will use the given shipping_doc to create the shipment inside
     * the 'createShipment(...) function of the selected shipper.
     */

    async createShipment() {

        // we should allow in bartsparts to create multiple shipments that may lead into the case of some products quantity to exceed the available quantity, because BC doesnt allow to create shipments that
        // violates this validation so we should notify the user that he needs to go to BC and remove the shipment
        
        await ShippingValidator.canCreateBCShipment(this.bc_id, this.bc_store_hash, this.order_id, this.shipping_doc.fulfillmentlines)

        // Shipment needs to be created first since the returned information is needed for the insert in the DB
        const shipment = await this.shipper.createShipment().catch(err => {
            console.log(err)
            throw Boom.notImplemented(`Could not create shipment ${JSON.stringify(err)}`, this.shipping_doc)
        })

        // The fulfillment_id is needed for the insert of the fulfilled_lines insert, so this needs to go first.
        this.fulfillment_id = await this.shippingModel.addToFulfillment(shipment).catch(err => {
            console.log(err)
            throw Boom.notImplemented(`Could not add fulfillment to DB`, this.shipping_doc)
        })

        const fulfilled_lines = await this.shippingModel.addToFulfilledLines(this.shipping_doc.fulfillmentlines, this.fulfillment_id).catch(err => {
            throw Boom.notImplemented(`Could not add lines to fulfillment ${JSON.stringify(err)}`, this.shipping_doc)
        })

        if (shipment.hasCallback || shipment.shipping_provider == 'MANUAL')
            return shipment // if the shipment has a callback function the functions in the 'else' part should be executed when the callback is succesfull. 
        else { // if the shipment doesn't have a callback function the following code should be executed.

            await BC.fulfill(this.order_id, this.fulfillment_id).catch(err => {
                console.log(err)
                throw Boom.notImplemented(`Could not fullfill shipment to BigCommerce`, this.shipping_doc)
            })

            const canCreateNewInvoiceAndSendEmailWithPackingslip = await ShippingValidator.canCreateNewInvoiceAndSendEmailWithPackingslip(this.order_id, this.shipping_doc.fulfillmentlines)

            if (canCreateNewInvoiceAndSendEmailWithPackingslip) {

                const mailer = new DealerMailer({
                    type: 'LABEL',
                    location_id: shipment.warehouse_id,
                    bartOrderId: this.order_id,
                    fulfillmentId: this.fulfillment_id,
                })

                mailer.send().catch(err => {
                    console.log(err)
                    throw Boom.notImplemented(`Could not send dealer label mail`, this.shipping_doc)
                })

                const invoicer = new InvoiceController('FULFILL', {
                    bartOrderId: this.order_id,
                    bartFulfillmentId: this.fulfillment_id,
                    bcOrderId: this.bc_id,
                    storeHash: this.bc_store_hash
                })

                invoicer.convertConcept2Paid().catch(err => {
                    console.log(err)
                    throw Boom.notImplemented(`Could not send invoice`, this.shipping_doc)
                })
            } else {

                const mailer = new DealerMailer({
                    type: 'LABEL_WITH_NO_PACKINGSLIPPER',
                    location_id: shipment.warehouse_id,
                    bartOrderId: this.order_id,
                    fulfillmentId: this.fulfillment_id,
                })
                mailer.send().catch(err => {
                    console.log(err)
                    throw Boom.notImplemented(`Could not send dealer label mail`, this.shipping_doc)
                })
            }

            return shipment
        }
    }
    /**
     * No parameters needed, the shipping model will retreive the info needed to perform this function.
     */
    async requestPickups() {
        const pickupRequests = await this.shippingModel.checkPickupRequests()
        return this.shipper.postPickups(pickupRequests)
    }

    /**
     * No parameters needed, the shipping model will retreive the info needed to perform this function.
     */
    async updateShipment() {
        const trackAndTraces = await this.shippingModel.getTrackAndTrace()
        return this.shipper.updateTrackAndTrace(trackAndTraces)
    }

    async packlinkLabels(reference){
        return this.shipper.packlinkLabels(reference)
    }

}

export{
    Shipping
}
