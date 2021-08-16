
The previous version way of creating a shipping label and fulfilling an order was done with a lot of hardcoded pieces, if there was a small change like a change in the account 
number of a shipper a couple of hours work were needed to change everything. 

I tried to make it more extendable and easier to adapt to possible changes in the future. It was known for example that if we wanted to go forward with UPS for every country we wanted to ship from we would need a new account. So I made it in a way that would make it possible for the backoffice to fill in the account number (our client --> DB) so no updates to any application was needed. 

I learned a couple of things about OO-patterns, here I tried the obfuscation design pattern, because I wanted it to be easy to implement and read in the places we would use the code. 

## shipping.controller.js
The main idea of the shipping controller is that based on the input the correct shipper is chosen. With the createShipment() the shipment will be created and the order will be fulfilled in the webshop (BigCommerce Webshop)

## genericShipper.js
This part contains some functions all shipper classes use

## ups.js
This part contains some code and logic for the intergration with the UPS API. It can for example create labels for shipments of the UPS. Other stuff we would want to do with the UPS, scheduling pickups for example will also be/is put here.

