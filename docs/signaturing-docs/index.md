Signaturit for Developers.
Signaturit is a scalable and reliable digital signature solution. Our Customer Success team will help you in your integration efforts and to answer any questions that you may have.

1
Register
Register now on our Sandbox servers to start building your integration.

2
Authenticate
Go to your user panel to get the access token you will need to attach to every request.

3
Start signing
Create a signature request and start signing your documents with Signaturit.

The functionalities contained in this page (API for developers guide) are supported by Signaturit Solutions, S.L.U., ensuring their correct performance and operation. Any other functionality developed through the API that is not included in this guide is not officially supported by Signaturit and its use and implementation shall be the responsibility of the customer, assuming any risks that may be incurred by this for both internal and external users

Sandbox
In order to test the API thoroughly, we offer you sandbox servers. In these server, you can try all the methods for free.

You can register clicking here and then, pick up your access token from your dashboard and begin to try.

Every API call in sandbox is done to the URL: https://api.sandbox.signaturit.com/v3.

When you complete your integration in sandbox, you will need to register on our production servers in order to get your production access token.

Every API call in production is done to the URL: https://api.signaturit.com/v3.

0Auth2
Signaturit API uses OAuth2 in order to authenticate the requests to the servers, so you need to get the access token from the dashboard once registered.

The access token is a string like:

access_token = '<token desde el panel de Signaturit; no commitear valores reales>'
API Calls
Now you have an access token and you want to make some calls. There's only one thing left to do, you need to add this token to the header of your requests.

For instance, to use the token from the previous example in your headers:

Authorization: Bearer <access_token>
If you are using cURL to test the API you can set a custom header with the -H flag.

$ curl

-X GET

-H "Authorization: Bearer <access_token>"

https://api.sandbox.signaturit.com/v3/signatures.json

There is also an API calls collection to import in Postman created with the most usual API calls. Obtén el enlace con clave de acceso desde la documentación oficial de Signaturit o Postman; no incluyas `access_key` ni tokens en el repositorio.

Support
In case you need any help with your integration, please drop an email to support@signaturit.com. We will be pleased to help you with any problem.

Post message
Events sent in embedded integrations.

event
The fired event type.

ready
The document is loaded and ready to sign.
signed
The document is correctly signed.
declined
The signer decided not to sign the document.
completed
All documents in a signing process have been signed correctly.
close
The signer has clicked the Close button after signing the document.
documentId
The document identifier.
signatureId
The signature identifier.
Error Handling
When your api request returns a 40x error, we inform you about the error in the same response.

The way to deal with this response error message, is different in every language.

Example
cURL
$ curl

-X POST

-H "Authorization: Bearer YOUR_ACCESS_TOKEN"

https://api.sandbox.signaturit.com/v3/signatures.json


Moving to Production
We recommend you to create your Signaturit integration in our Sandbox environment.

Once completed, you may want to release your integration to the Production environment.

How to do that, depends in the way you interact with our API.

If your integrations executes HTTP requests to our server directly (with cURL for example), you will need to change the endpoint URL to https://api.signaturit.com and the Access Token for the one you will find in your Production Enterprise Account.


cURL
sandbox

$ curl

-X GET

-H "Authorization: Bearer YOUR_SANDBOX_ACCESS_TOKEN"

https://api.sandbox.signaturit.com/v3/signatures/count.json


production

$ curl

-X GET

-H "Authorization: Bearer YOUR_PRODUCTION_ACCESS_TOKEN"

https://api.signaturit.com/v3/signatures/count.json

Signature
A signature represents a request to one or more signers with one or more documents.

created_at
The creation date.
data
Custom information that you can include in the signature request. See the signature create call for more information.
documents
The document items that have been created for the signature request. A document item is created for every signer and uploaded file.

Inside every document item you can find the next information:

email
The signer's email.
events
A list of events related with the document.

Inside every event item you can find the next information:

created_at
The creation date.
type
The event type.

The available types are:

email_processed
The email has been processed
email_delivered
The email has been delivered
email_bounced
The server cannot deliver the message. Bounces often are caused by outdated or incorrectly entered email addresses.
email_deferred
The email cannot immediately be delivered, but it hasn’t been completely rejected. Sometimes called a soft bounce, it will be retried for 72 hours.
reminder_email_processed
The reminder email has been processed
reminder_email_delivered
The reminder email has been delivered
sms_processed
The SMS has been processed.
sms_delivered
The SMS has been delivered.
document_opened
The document has been opened.
document_signed
The document has been signed.
document_completed
The document has been completed and ready to be downloaded.
audit_trail_completed
The audit trail has been completed and ready to be downloaded.
document_declined
The document has been declined.
document_expired
The document has expired.
document_canceled
The document has been canceled.
photo_added
The signer has attached a photo in the process.
voice_added
The signer has attached an audio in the process.
file_added
The signer has attached a file in the process.
photo_id_added
The signer has attached a photo id in the process.
expiration_extended
The expiration of the document has been extended.
file
The file information.

Inside the file item you can find the next information:

name
The file name.
pages
The number of pages.
size
The file size.
id
The document identifier.
name
The signer's name.
status
The document status.

The available status are:

in_queue
The document is being processed.
ready
The document is ready to be signed.
signing
The document is being digitally signed.
completed
The document has been signed.
expired
The document has expired.
canceled
The document has been canceled.
declined
The document has been declined.
error
There was some error processing the request.
canceled
The document has been canceled.
id
The signature request identifier.
 Object
created_at: "2014-08-21T08:53:35+0000"
 data: Array [0] []
 documents: Array [1] [Object]
id: "974e6f6c-2910-11e4-b3d4-0aa7697eb409"
GET /v3/signatures/count.json
Description
Count signature requests.

Parameters
status
Filter signatures with documents with certain status. OPTIONAL

The available status are:

in_queue
The document is being processed.
ready
The document is ready to be signed.
signing
The document is being digitally signed.
completed
The document has been signed.
expired
The document has expired.
canceled
The document has been canceled.
declined
The document has been declined.
error
There was some error processing the request.
since
Signatures counted will be the ones who are sent at this date or later. The format of this value should be YYYY-MM-DD. OPTIONAL
until
Signatures counted will be the ones who are sent before this date. The format of this value should be YYYY-MM-DD. OPTIONAL
ids
Limit the result set to a list of signatures. The format is a comma separated list of signature ids. OPTIONAL
data
You can set your own data, to filter requests using your own params. If you have a custom data field named crm_id, then you must do the query using the key crm_id. OPTIONAL
Response
Total of signature requests in JSON format.

Example request
cURL
$ curl

-X GET

-H "Authorization: Bearer YOUR_ACCESS_TOKEN"

https://api.sandbox.signaturit.com/v3/signatures/count.json


GET /v3/signatures.json
Description
Get all signature requests.

Parameters
limit
Max number of signatures to retrieve. The signature limit is 100. OPTIONAL
offset
Results offset. Default value is 0. Note that the result window size (limit + offset) cannot exceed 10.000 OPTIONAL
status
Filter signatures with documents with certain status. OPTIONAL

The available status are:

in_queue
The document is being processed.
ready
The document is ready to be signed.
signing
The document is being digitally signed.
completed
The document has been signed.
expired
The document has expired.
canceled
The document has been canceled.
declined
The document has been declined.
error
There was some error processing the request.
since
Signatures returned will be the ones who are sent at this date or later. The format of this value should be YYYY-MM-DD. OPTIONAL
until
Signatures returned will be the ones who are sent before this date. The format of this value should be YYYY-MM-DD. OPTIONAL
ids
Limit the result set to a list of signatures. The format is a comma separated list of signature ids. OPTIONAL
data
Here you can set your own data, to filter requests using your own params. If you have a custom data field named crm_id, then you must do the query using the crm_id parameter. OPTIONAL
Response
A list of signature requests in JSON format.

Example request
cURL
$ curl

-X GET

-H "Authorization: Bearer YOUR_ACCESS_TOKEN"

https://api.sandbox.signaturit.com/v3/signatures.json


Example request filter signatures with custom crm_id key.
cURL
$ curl

-X GET

-H 'Authorization: Bearer YOUR_ACCESS_TOKEN'

https://api.sandbox.signaturit.com/v3/signatures.json?crm_id=2445


*Only if a signer declines the signature, the field decliner_email will appear in the given response.

GET /v3/signatures/{id}.json
Description
Get a given signature request.

Response
Single signature request in JSON format.

Example request
cURL
$ curl

-X GET

-H "Authorization: Bearer YOUR_ACCESS_TOKEN"

https://api.sandbox.signaturit.com/v3/signatures/6f6c974e-2910-11e4-b3d4-0aa7697eb409.json


*Only if a signer declines the signature, the field decliner_email will appear in the given response.

POST /v3/signatures.json
Description
Create a new signature request.

Parameters
body
Email body (html code is allowed) for email and sms type requests. OPTIONAL

Note: For sms request types it will be truncated to 120 characters

Note: For sms the body should contain the tag {{url}} where we will include the document url

branding_id
Use a custom branding for the signature request. OPTIONAL
callback_url
Url to redirect the user when finish the signature process. OPTIONAL
data
Custom information in a key: value format that you can include in the signature request. OPTIONAL

When the key values correspond to a PDF form field, it will be filled and stamped automatically to the document.

When the key values correspond to a Signaturit template widget field, it will be filled by default to the signer in app and the signer will be allowed to modify the value.

All other key:value pairs will be stored in the signature and can be used later as search criteria on the "Get Signatures" endpoint described above. The maximum length allowed for these fields is 64 characters.

delivery_type
The signature request delivery type. OPTIONAL

The available delivery types are:

email
The signature request is sent by email. This is the default behavior when no type is specified.
sms
The signature request is sent by SMS. You must include the phone in the recipients parameter.
url
The signature request is not sent to the signer. Instead of this, the creation request will return a url parameter that you can open in the browser to complete the signature.
expire_time
Expiration time of the document (in days). OPTIONAL

It must be a positive number and can't be greater than 365 days.

events_url
URL that receive realtime information about this signature process. OPTIONAL

See the signatures event url section for more information.

files
List with pdf / doc files.
name
Name assigned to the signature.
recipients
List with signature recipients containing name, email and extra requirements for the signature process if needed.

The index of the array recipients does not indicate their order.

Every item can contain the next information:

email
The signer's email address.
name
The signer's name.
phone
The signer's phone. OPTIONAL

The phone number should contain the country code. For example, for spain (+34) the value for the phone 555667788 is:

phone=34555667788
This is a requirement for sms request types and when requiring a SMS validation with the require_sms_validation feature.

sign_with_digital_certificate_file
A boolean (1 or 0) which indicates if the sign must be signed with digital certificate. You must add a widget with type dcf in order to use this option

digital_certificate_name
Text which indicates the name of the digital certificate to be used.
* Certificates extension files must be .pfx or .p12.

require_file_attachment
It can be a number or a list:

Number:

A single number or a list with the number of required attached files you need for every document in this recipient. OPTIONAL

The index of the list references the document number, so first value will apply to first document.

Example to require 5 attached files in every document.

require_file_attachment=5
Example to require 2 attached files for the first document and 5 attached files for the second one.

require_file_attachment=[2, 5]
List:

A list of required attached files you need for every document in this recipient.

Every required attached file must be set using the following parameters.

type
Attached file type. Available types: idDocument, passport, drivingLicense, proofOfAddress, other.
description
Attached file description, ONLY REQUIRED for type "other"
require_photo
A single number or a list with the number of required photos you need for every document in this recipient. OPTIONAL

The index of the list references the document number, so first value will apply to first document.

Example to require 5 photos in every document.

require_photo=5
Example to require 2 photos for the first document and 5 photo files for the second one.

require_photo=[2, 5]
require_photo_id
A single number or a list with the number of required photo ids you need for every document in this recipient. OPTIONAL

The index of the list references the document number, so first value will apply to first document.

Example to require 5 photos ids in every document.

require_photo_id=5
Example to require 2 photos ids for the first document and 5 photo files for the second one.

require_photo_id=[2, 5]
widgets
If you want to assign widgets to signer, you can specify them too.

Every widget must be set using the following parameters:

page
Page where widget is required (range 1..N).
left
Widget position on page on the X axis (range 1..100).
top
Widget position on page on the Y axis (range 1..100).
height
Widget height in percentage relative to page size.
width
Widget width in percentage relative to page size.
type
Widget type. Types are: date, image, check, radio, select, text, signature and digital certificate. At least one signature widget must be set.
default
Default value for the widget.
editable
If the signer will be able to fill this widget or not. If not editable, the value will be stamped directly to the document.
word_anchor
Set this value to find a single word in the document and anchor the widget to that position. If the word is found multiple times, there will be a widget for each one. This parameter doesn't support spaces or special characters.
If set, editable can't be disable.
If set, page parameter will be ignored.
If set, height and width are mandatory
If set, top and left represent the distance to the top-left corner of the word (range 1..100).
options
Widget options. This is only required on radio and select widgets, and optional in check, text and date widgets, see examples. Here you can define your validation rules
required
Defines if a widget is necessary to be filled out or not by the signer. For example, setting the Checkbox widget as non-required (0) will allow the user to leave it blank. If setting the Checkbox widget as required (1), then the signer needs to check it in order to complete the document.
require_sms_validation
A boolean (0 or 1) to enable a password in the document that will be sent as an SMS to the recipient's phone. OPTIONAL

If you use this feature, you will need to set the phone parameter in the recipient item.

sms_code
A boolean with a true value to enable a code acceptance that will be sent as an SMS to the recipient's phone. OPTIONAL

If you use this feature, you will need to set the phone parameter in the recipient item.

type
A string that defines the recipient's type. OPTIONAL

Note: the default value is signer.

Possible values are:

signer
A regular signer that will receive the document and have to sign it.
validator
The validator will receive the document in the specified order and will be able to see the previous recipients signs and data inserted
method
A string that defines the recipient's delivery method. OPTIONAL

Possible values are:

email
Request will be sent via email
sms
Request will be sent via SMS
subject
The subject of the email received by the recipient. OPTIONAL

body
The body of the email/SMS received by the recipient. OPTIONAL

cc
List with email recipients containing name and email for people that will receive a copy of the signed document when the process is completed. OPTIONAL

Every item can contain the next information:

email
The recipient email address.
name
The recipient name.
reply_to
Additional email address that will be used as email Reply-To header OPTIONAL

reminders
A single value or an array with time values in days to wait until sending and automatic reminder. OPTIONAL

You can set it 0 to disable reminders.

signing_mode
The signing mode lets you control the order in which your recipients receive and sign your documents OPTIONAL

Note: the default value is sequential.

The available signing modes are:

sequential
Each recipient receives the request once the previous recipient has completed their action.
parallel
All recipients receive the request in parallel.
subject
Email subject for email type requests. OPTIONAL
templates
Templates to use in the signature request. You can use the id or hashtag. OPTIONAL
type
The type of the signature. OPTIONAL

Note: the default value is the advanced signature request.

The available types are:

simple
A simple signature request is created.
advanced
An advanced signature request is created. We capture the biometric information of the signer with the signature draw.
smart
The system creates different type of signature depending in the user device. A simple signature is created for desktop pcs and advanced signature is created for mobile and tablet devices.
More details about widgets
Radio widget
custom_id
Value to reference multiple radio widgets that belongs to the same group. Only one widget within the same group can be selected. OPTIONAL
options[index]
Position of the widget in the group. Used for reference the widget within the group. Two radio widgets with the same index on the same group will behave as the same widget.OPTIONAL
default
The default radio button selected for the group. The index value should be used for reference. All radio buttons widget of the same group should have the same default value. OPTIONAL
Check widget
options
You can set show_yes_no_option as options value in order to show Yes/No option with the widget. Only works with editable widgets. OPTIONAL
Response
New signature request in JSON format.

Example request
cURL
$ curl

-X POST

-H "Authorization: Bearer YOUR_ACCESS_TOKEN"

-F "recipients[0][name]=John"

-F "recipients[0][email]=john.doe@gmail.com"

-F "files[0]=@/path/to/the/pdf/document.pdf"

https://api.sandbox.signaturit.com/v3/signatures.json


Example request using a template with hashtag #NDA instead of file
cURL
$ curl

-X POST

-H "Authorization: Bearer YOUR_ACCESS_TOKEN"

-d "recipients[0][name]=John"

-d "recipients[0][email]=john.doe@gmail.com"

-d "templates[0]=#NDA"

https://api.sandbox.signaturit.com/v3/signatures.json


Example request using a template with hashtag #NDA instead of file with the fields filled
cURL
$ curl

-X POST

-H "Authorization: Bearer YOUR_ACCESS_TOKEN"

-d "recipients[0][name]=John"

-d "recipients[0][email]=john.doe@gmail.com"

-d "templates[0]=#NDA"

-d "data[widget_id]=DEFAULT_VALUE"

https://api.sandbox.signaturit.com/v3/signatures.json


Example request using a custom data
cURL
$ curl

-X POST

-H "Authorization: Bearer YOUR_ACCESS_TOKEN"

-d "recipients[0][name]=John"

-d "recipients[0][email]=john.doe@gmail.com"

-d "templates[0]=#NDA"

-d "data[crm_id]=2445"

https://api.sandbox.signaturit.com/v3/signatures.json


Example request using all widget options on a signer:
cURL
$ curl

-X POST

-H "Authorization: Bearer YOUR_ACCESS_TOKEN"

-F "recipients[0][name]=John"

-F "recipients[0][email]=john.doe@gmail.com"

-F "recipients[0][widgets][0][default]=This is a non-editable text"

-F "recipients[0][widgets][0][page]=1"

-F "recipients[0][widgets][0][left]=71.10583280773"

-F "recipients[0][widgets][0][top]=1.5"

-F "recipients[0][widgets][0][type]=text"

-F "recipients[0][widgets][0][height]=5"

-F "recipients[0][widgets][0][width]=30"

-F "recipients[0][widgets][0][editable]=0"

-F "recipients[0][widgets][1][default]=This is an editable text"

-F "recipients[0][widgets][1][page]=1"

-F "recipients[0][widgets][1][left]=31.10583280773"

-F "recipients[0][widgets][1][top]=1.5"

-F "recipients[0][widgets][1][type]=text"

-F "recipients[0][widgets][1][height]=5"

-F "recipients[0][widgets][1][width]=30"

-F "recipients[0][widgets][1][editable]=1"

-F "recipients[0][widgets][2][default]=0"

-F "recipients[0][widgets][2][page]=1"

-F "recipients[0][widgets][2][left]=31.10583280773"

-F "recipients[0][widgets][2][top]=10"

-F "recipients[0][widgets][2][type]=check"

-F "recipients[0][widgets][2][height]=5"

-F "recipients[0][widgets][2][width]=5"

-F "recipients[0][widgets][2][editable]=0"

-F "recipients[0][widgets][3][default]=1"

-F "recipients[0][widgets][3][page]=1"

-F "recipients[0][widgets][3][left]=41.10583280773"

-F "recipients[0][widgets][3][top]=10"

-F "recipients[0][widgets][3][type]=check"

-F "recipients[0][widgets][3][height]=5"

-F "recipients[0][widgets][3][width]=5"

-F "recipients[0][widgets][3][editable]=0"

-F "recipients[0][widgets][4][default]=1"

-F "recipients[0][widgets][4][page]=1"

-F "recipients[0][widgets][4][left]=71.10583280773"

-F "recipients[0][widgets][4][top]=10"

-F "recipients[0][widgets][4][type]=check"

-F "recipients[0][widgets][4][height]=5"

-F "recipients[0][widgets][4][width]=5"

-F "recipients[0][widgets][4][editable]=1"

-F "recipients[0][widgets][4][options]=show_yes_no_option"

-F "recipients[0][widgets][5][default]=0"

-F "recipients[0][widgets][5][page]=1"

-F "recipients[0][widgets][5][left]=31.10583280773"

-F "recipients[0][widgets][5][top]=20"

-F "recipients[0][widgets][5][type]=radio"

-F "recipients[0][widgets][5][height]=5"

-F "recipients[0][widgets][5][width]=5"

-F "recipients[0][widgets][5][editable]=1"

-F "recipients[0][widgets][5][custom_id]=radio_01"

-F "recipients[0][widgets][5][options][index]=0"

-F "recipients[0][widgets][6][default]=0"

-F "recipients[0][widgets][6][page]=1"

-F "recipients[0][widgets][6][left]=41.10583280773"

-F "recipients[0][widgets][6][top]=20"

-F "recipients[0][widgets][6][type]=radio"

-F "recipients[0][widgets][6][height]=5"

-F "recipients[0][widgets][6][width]=5"

-F "recipients[0][widgets][6][editable]=1"

-F "recipients[0][widgets][6][custom_id]=radio_01"

-F "recipients[0][widgets][6][options][index]=1"

-F "recipients[0][widgets][7][default]=0"

-F "recipients[0][widgets][7][page]=1"

-F "recipients[0][widgets][7][left]=31.10583280773"

-F "recipients[0][widgets][7][top]=25"

-F "recipients[0][widgets][7][type]=radio"

-F "recipients[0][widgets][7][height]=5"

-F "recipients[0][widgets][7][width]=5"

-F "recipients[0][widgets][7][editable]=1"

-F "recipients[0][widgets][7][custom_id]=radio_01"

-F "recipients[0][widgets][7][options][index]=2"

-F "recipients[0][widgets][8][default]=0"

-F "recipients[0][widgets][8][page]=1"

-F "recipients[0][widgets][8][left]=41.10583280773"

-F "recipients[0][widgets][8][top]=25"

-F "recipients[0][widgets][8][type]=radio"

-F "recipients[0][widgets][8][height]=5"

-F "recipients[0][widgets][8][width]=5"

-F "recipients[0][widgets][8][editable]=0"

-F "recipients[0][widgets][8][custom_id]=radio_02"

-F "recipients[0][widgets][8][options][index]=0"

-F "recipients[0][widgets][9][default]=0"

-F "recipients[0][widgets][9][page]=1"

-F "recipients[0][widgets][9][left]=51.10583280773"

-F "recipients[0][widgets][9][top]=25"

-F "recipients[0][widgets][9][type]=radio"

-F "recipients[0][widgets][9][height]=5"

-F "recipients[0][widgets][9][width]=5"

-F "recipients[0][widgets][9][editable]=0"

-F "recipients[0][widgets][9][custom_id]=radio_02"

-F "recipients[0][widgets][9][options][index]=1"

-F "recipients[0][widgets][10][default]=0"

-F "recipients[0][widgets][10][page]=1"

-F "recipients[0][widgets][10][left]=41.10583280773"

-F "recipients[0][widgets][10][top]=30"

-F "recipients[0][widgets][10][type]=select"

-F "recipients[0][widgets][10][height]=5"

-F "recipients[0][widgets][10][width]=50"

-F "recipients[0][widgets][10][editable]=1"

-F "recipients[0][widgets][10][options][select][0][value]=option A"

-F "recipients[0][widgets][10][options][select][0][default]=1"

-F "recipients[0][widgets][10][options][select][1][value]=option B"

-F "recipients[0][widgets][10][options][select][1][default]=0"

-F "recipients[0][widgets][11][default]=0"

-F "recipients[0][widgets][11][page]=1"

-F "recipients[0][widgets][11][left]=50"

-F "recipients[0][widgets][11][top]=90"

-F "recipients[0][widgets][11][type]=signature"

-F "recipients[0][widgets][11][height]=9.9784615384615"

-F "recipients[0][widgets][11][width]=25"

-F "recipients[0][widgets][12][default]=2017-07-27"

-F "recipients[0][widgets][12][page]=1"

-F "recipients[0][widgets][12][left]=35"

-F "recipients[0][widgets][12][top]=1.5"

-F "recipients[0][widgets][12][type]=date"

-F "recipients[0][widgets][12][height]=5"

-F "recipients[0][widgets][12][width]=30"

-F "recipients[0][widgets][13][page]=1"

-F "recipients[0][widgets][13][left]=20"

-F "recipients[0][widgets][13][top]=5"

-F "recipients[0][widgets][13][type]=text"

-F "recipients[0][widgets][13][height]=5"

-F "recipients[0][widgets][13][width]=30"

-F "recipients[0][widgets][13][editable]=1"

-F "recipients[0][widgets][13][options][validation_rule]=email"

-F "files[0]=nda.pdf"

https://api.sandbox.signaturit.com/v3/signatures.json


Example error response when using non-valid email.
cURL
$ curl

-X POST

-H "Authorization: Bearer YOUR_ACCESS_TOKEN"

-F "recipients[0][name]=John"

-F "recipients[0][email]=nonvalidemail"

-F "files[0]=@/path/to/the/pdf/document.pdf"

https://api.sandbox.signaturit.com/v3/signatures.json


Example error response when using non valid file.
cURL
$ curl

-X POST

-H "Authorization: Bearer YOUR_ACCESS_TOKEN"

-F "recipients[0][name]=John"

-F "recipients[0][email]=john.doe@gmail.com"

-F "files[0]=@/path/to/the/file/non_valid_file.zip"

https://api.sandbox.signaturit.com/v3/signatures.json


POST /v3/signatures/{signId}/reminder.json
Description
Send a reminder. A reminder email will be sent to the signer.

Response
Document in JSON format.

Example request
cURL
$ curl

-X POST

-H "Authorization: Bearer YOUR_ACCESS_TOKEN"

https://api.sandbox.signaturit.com/v3/signatures/6f6c974e-2910-11e4-b3d4-0aa7697eb409/reminder.json


PATCH /v3/signatures/{signId}/cancel.json
Description
Cancel a signature request. The signer will not be able to sign the document.

Parameters
reason
Reason of canceling the signature request. OPTIONAL

Note: PATCH request does not support multipart/form-data as Content-Type. Content-Type should be set to application/x-www-form-urlencoded or application/json.

Response
Canceled signature in JSON format.

Example request
cURL
$ curl

-X PATCH

-H "Authorization: Bearer YOUR_ACCESS_TOKEN"

https://api.sandbox.signaturit.com/v3/signatures/6f6c974e-2910-11e4-b3d4-0aa7697eb409/cancel.json


DELETE /v3/signatures/{signatureId}
Description
Delete a signature request. In progress requests cannot be deleted.

Example request
cURL
$ curl

-X DELETE

-H "Authorization: Bearer YOUR_ACCESS_TOKEN"

https://api.sandbox.signaturit.com/v3/signatures/6f6c974e-2910-11e4-b3d4-0aa7697eb409

GET /v3/signatures/{id}/documents/{id}/download/signed
Description
Download the signed PDF file.

Response
The PDF file binary content.

Example request
cURL
$ curl

-X GET

-H "Authorization: Bearer YOUR_ACCESS_TOKEN"

https://api.sandbox.signaturit.com/v3/signatures/6f6c974e-2910-11e4-b3d4-0aa7697eb409/documents/29109781-f42d-11e4-b3d4-0aa7697eb409/download/signed

GET /v3/documents/{id}/download/uploaded
Description
Download the uploaded PDF file.

Response
The PDF file binary content.

Example request
cURL
$ curl

-X GET

-H "Authorization: Bearer YOUR_ACCESS_TOKEN"

https://api.sandbox.signaturit.com/v3/documents/29109781-f42d-11e4-b3d4-0aa7697eb409/download/uploaded

GET /v3/signatures/{id}/documents/{id}/download/sent
Description
Download the configured/sent PDF file.

Response
The PDF file binary content.

Example request
cURL
$ curl

-X GET

-H "Authorization: Bearer YOUR_ACCESS_TOKEN"

https://api.sandbox.signaturit.com/v3/signatures/6f6c974e-2910-11e4-b3d4-0aa7697eb409/documents/29109781-f42d-11e4-b3d4-0aa7697eb409/download/sent

POST /v3/signatures/{id}/documents/{id}/signer
Description
Changes the email of the signer. It creates a new document and replaces the wrong one. Only requests with an error in email delivery can be changed.

Parameters
email
Signer's email
name
Signer's name. If none provided, previous name will be used. OPTIONAL
Response
The ID of the new document.

Example request
cURL
$ curl

-X POST

-H "Authorization: Bearer YOUR_ACCESS_TOKEN"

https://api.sandbox.signaturit.com/v3/signatures/6f6c974e-2910-11e4-b3d4-0aa7697eb409/documents/29109781-f42d-11e4-b3d4-0aa7697eb409/signer


POST /v3/signatures/{id}/generate/audit_trail
Description
Generates the binary content of the audit trail PDF.

Response
Empty response.

Example request
cURL
$ curl

-X GET

-H "Authorization: Bearer YOUR_ACCESS_TOKEN"

https://api.sandbox.signaturit.com/v3/signatures/6f6c974e-2910-11e4-b3d4-0aa7697eb409/generate/audit_trail

POST /v3/signatures/{id}/name
Description
Changes the name of the signature.

Parameters
name
Signature new name
Response
The ID of the signature.

Example request
cURL
$ curl

-X POST

-H "Authorization: Bearer YOUR_ACCESS_TOKEN"

https://api.sandbox.signaturit.com/v3/signatures/6f6c974e-2910-11e4-b3d4-0aa7697eb409/name


GET /v3/signatures/{id}/documents/{id}/download/audit_trail
Description
Download the binary content of the audit trail PDF.

Response
PDF file.

Example request
cURL
$ curl

-X GET

-H "Authorization: Bearer YOUR_ACCESS_TOKEN"

https://api.sandbox.signaturit.com/v3/signatures/6f6c974e-2910-11e4-b3d4-0aa7697eb409/documents/29109781-f42d-11e4-b3d4-0aa7697eb409/download/audit_trail

GET /v3/signatures/{signatureId}/documents/{documentId}/sms_status.json
Description
Get a given signature request SMS status.

Response
Single certified SMS request status and phone number in JSON format.

Example request
cURL
$ curl

-X GET

-H "Authorization: Bearer YOUR_ACCESS_TOKEN"

https://api.sandbox.signaturit.com/v3/signatures/6f6c974e-2910-11e4-b3d4-0aa7697eb409/documents/29109781-f42d-11e4-b3d4-0aa7697eb409/sms_status.json


GET /v3/signatures/{id}/documents/{id}/download/attachments
Description
Download a zip with all files separated in folders.

Response
ZIP file.

Example request
cURL
$ curl

-X GET

-H "Authorization: Bearer YOUR_ACCESS_TOKEN"

https://api.sandbox.signaturit.com/v3/signatures/6f6c974e-2910-11e4-b3d4-0aa7697eb409/documents/29109781-f42d-11e4-b3d4-0aa7697eb409/download/attachments

Events URL
The events URL allows you to configure a URL where we will send information in realtime about the signature process.

Example received request.
 Object
created_at: "2015-02-25T13:38:33+0000"
 document: Object {email:"john@signaturit.com", events:Array[3], file:Object, id:"29109781-f42d-11e4-b3d4-0aa7697eb409", name:"John"…}
type: "reminder_email_processed"
The list of events that you will receive is:

email_processed
The email has been processed
email_delivered
The email has been delivered
email_bounced
The server cannot deliver the message. Bounces often are caused by outdated or incorrectly entered email addresses.
email_deferred
The email cannot immediately be delivered, but it hasn’t been completely rejected. Sometimes called a soft bounce, it will be retried for 72 hours.
reminder_email_processed
The reminder email has been processed
reminder_email_delivered
The reminder email has been delivered
sms_processed
The SMS has been processed.
sms_delivered
The SMS has been delivered.
document_opened
The document has been opened.
document_signed
The document has been signed.
document_completed
The document has been completed and ready to be downloaded.
audit_trail_completed
The audit trail has been completed and ready to be downloaded.
document_declined
The document has been declined.
document_expired
The document has expired.
document_canceled
The document has been canceled.
photo_added
The signer has attached a photo in the process.
voice_added
The signer has attached an audio in the process.
file_added
The signer has attached a file in the process.
photo_id_added
The signer has attached a photo id in the process.
expiration_extended
The expiration of the document has been extended.

The media type of the events we send to your endpoints is set to application/x-www-form-urlencoded by default.

You can receive the events on other formats such as json.

To do so, add the media type extension you want to get to the end of the URL where you want to receive these events: for example https://httpbin.org/post.json we will post the information in json format.

Widget validation rules
Some widgets accept built-in validation rules, in order to validate the entered data. For setting a validation rule, you must add the validation_rule option of the widget in signature creation request.

Here you can find a list of currently implemented validation rules:

email
Value must be a valid email. Only works with text widgets
phone
Value must be a valid phone number with prefix. Only works with text widgets
zip
Value must be a valid Spanish zip code. Only works with text widgets
dni
Value must be a valid Spanish document number (can be DNI or NIE). Only works with text widgets
age
Entered date should be older than 18 years. Only works with date widgets
iban
Value must be a valid Spanish iban. Only works with text widgets
Certified files
GET /v3/files/{id}.json
Description
This endpoint is used to get certificated files.

Parameters
id
Id of the file to be retrieved.
Response
The file with JSON format.

Example request
cURL
$ curl

-X GET

-H "Authorization: Bearer YOUR_ACCESS_TOKEN"

https://api.sandbox.signaturit.com/v3/files/3ccd2306-8b51-473e-adcf-b955b0f3a2d5.json


POST /v3/files.json
Description
This endpoint is used to upload files and certificate them.

Less than 15MB
Greater than 15MB
Parameters
file
File to be uploaded.
Response
The file with JSON format.

Example request
cURL
$ curl

-X POST

-F 'file=@"/certifiedFile.pdf"'

-H "Authorization: Bearer YOUR_ACCESS_TOKEN"

https://api.sandbox.signaturit.com/v3/files.json


Event hooks
The event hooks are the information sent about the signature process.

id
The event hook identifier.
status_code
The request status code.
url
The url given (refer to event_url).
method
The method of the request.
event_type
The event hook type. Defined in this list.
created_at
The event hook creation date.
 Object
id: "LeWz6YYBdHtiVHKnGjII"
status_code: 200
url: "http://www.webprovided.com"
method: "POST"
event_type: "email_processed"
created_at: "2023-03-28T07:21:39+0000"
GET /v3/event-hooks
Description
List event hooks from the requester.

Parameters
limit
Max number of event hooks to retrieve. The limit is 100. OPTIONAL
page
Page to be shown. Default value is 1. OPTIONAL
date
Stringified array. Example: '{"from": "2023-03-01","to": "2023-03-28"}'. OPTIONAL
status
Status of the event hook. It must be an array. OPTIONAL
method
The method which is being used through the request. It must be an array.
Examples are: POST, GET OPTIONAL
search
String to search. OPTIONAL
Response
A collection of event hooks in JSON format.

Example request
cURL
$ curl

-X GET

-H "Authorization: Bearer YOUR_ACCESS_TOKEN"

https://api.sandbox.signaturit.com/v3/event-hooks?method[]=POST&limit=2&page=4&search=email_&status[]=200
                                


GET /v3/event-hooks/{eventHookId}/retry
Description
Fires again the event hook. It can only be done by the event hook requester or the account administrator otherwise it will return a HTTP not authorized response code.

Response
An empty response.

Example request
cURL
$ curl

-X POST

-H "Authorization: Bearer YOUR_ACCESS_TOKEN"

https://api.sandbox.signaturit.com/v3/event-hooks/6-V7J4cBdHtiVHKnd1DU/retry
                                


Template
A template is a prepared document that can be sent repeatedly.

id
The template identifier.
name
The template name.
created_at
The template creation date.
 Object
created_at: "2014-04-05T20:09:48+0000"
id: "3d1bf4f8-bcfe-11e3-8d1e-0a063b2144ed"
name: "#nda"
GET /v3/templates.json
Description
List templates from the requester.

Parameters
limit
Max number of templates to retrieve. The template limit is 100. OPTIONAL
offset
Results offset. Default value is 0. OPTIONAL
Response
A collection of templates in JSON format.

Example request
cURL
$ curl

-X GET

-H "Authorization: Bearer YOUR_ACCESS_TOKEN"

https://api.sandbox.signaturit.com/v3/templates.json


GET /v4/templates
Description
List templates from the requester.

Parameters
limit
Max number of templates to retrieve. The template limit is 10. OPTIONAL
page
Results offset. Default value is 1. OPTIONAL
Response
A collection of templates in JSON format.

Example request
cURL
$ curl

-X GET

-H "Authorization: Bearer YOUR_ACCESS_TOKEN"

https://api.sandbox.signaturit.com/v4/templates


Certified email
A email represents a request to one or more signers with one or more documents.

created_at
The email creation date.
certificates
The certificate items that have been created with the email request. A certificate item is created for recipient.

Inside every certificate item you can find the next information:

email
The recipient's email.
events
A list of events related with the certificate.

Inside every event item you can find the next information:

created_at
The creation date.
type
The event type.

The available types are:

email_processed
Email has been processed.
email_delivered
The document is ready to be signed.
documents_opened
The document overview has been opened.
document_opened
The document has been opened.
document_downloaded
The document has been downloaded.
certification_completed
The certification process finished
attachments
The list of attached files.

Inside every file item you can find the next information:

name
The file name.
size
The file size.
id
The certificate creation date.
name
The recipient's name.
status
The email status.

The available status are:

in_queue
The email is being processed.
sent
The email has been sent.
error
There was some error processing the email.
id
The certified email identifier.
 Object
created_at: "2014-08-21T08:53:35+0000"
 certificates: Array [1] [Object]
id: "974e6f6c-2910-11e4-b3d4-0aa7697eb409"
GET /v3/emails/count.json
Description
Count certified emails.

Parameters
status
Filter emails with certain status. OPTIONAL

The available status are:

in_queue
The email is being processed.
sent
The email has been sent.
error
There was some error processing the email.
since
Emails returned will be the ones who are sent at this date or later. The format of this value should be YYYY-MM-DD. OPTIONAL
Response
Total of certified emails in JSON format.

Example request
cURL
$ curl

-X GET

-H "Authorization: Bearer YOUR_ACCESS_TOKEN"

https://api.sandbox.signaturit.com/v3/emails/count.json


GET /v3/emails.json
Description
Get all certified emails.

Parameters
limit
Max number of emails to retrieve. The email limit is 100. OPTIONAL
offset
Results offset. Default value is 0. OPTIONAL
status
Filter emails with certain status. OPTIONAL

The available status are:

in_queue
The email is being processed.
sent
The email has been sent.
error
There was some error processing the request.
since
emails returned will be the ones who are sent at this date or later. The format of this value should be YYYY-MM-DD. OPTIONAL
data
Here you can set your own data, to filter requests using your own params. If you have a custom data field named crm_id, then you must do the query using the crm_id parameter. OPTIONAL
Response
A list of email requests in JSON format.

Example request
cURL
$ curl

-X GET

-H "Authorization: Bearer YOUR_ACCESS_TOKEN"

https://api.sandbox.signaturit.com/v3/emails.json


GET /v3/emails/{id}.json
Description
Get a given certified email request.

Response
Single certified email request in JSON format.

Example request
cURL
$ curl

-X GET

-H "Authorization: Bearer YOUR_ACCESS_TOKEN"

https://api.sandbox.signaturit.com/v3/emails/6f6c974e-2910-11e4-b3d4-0aa7697eb409.json


POST /v3/emails.json
Description
Create a new email request.

Parameters
body
Email body (html code is allowed). OPTIONAL

branding_id
Use a custom branding for the email request. OPTIONAL
events_url
URL that receive realtime information about this email process. OPTIONAL

See the emails event url section for more information.

data
Custom information in a key: value format that you can include in the email request. OPTIONAL

These key:value pairs will be stored in the email and can be used later as search criteria on the "Get certified emails" endpoint described above.

attachments
List of attached files.
recipients
List with email recipients containing name, email and extra requirements for the email process if needed.

Every item can contain the next information:

email
The recipient email address.
name
The recipient name.
Also, you can use the next format to specify to, cc and bcc:

to
Email recipients.

email
The recipient email address.
name
The recipient name.
cc
Email cc. Format is the same as recipients.

email
The cc email address.
name
The cc name.
bcc
Email bcc. Format is the same as recipients.

email
The bcc email address.
name
The bcc name.
type
List with email recipients containing name, email and extra requirements for the email process if needed.

The available types are:

delivery
Send the email as it is certifying the delivery process.
open_document
Send a modified version of the email with a button that redirects the user to our platform to open the PDF attachments.

With this method, you can track when the user opens the attached files.

Note: This method only supports PDF documents to be attached.

open_every_document
This type works like the open_document type but allows to track the opening of every PDF file in emails with multiple attachments.
subject
Email subject for email type requests. OPTIONAL
Response
New certified email in JSON format.

Example request
cURL
$ curl

-X POST

-H "Authorization: Bearer YOUR_ACCESS_TOKEN"

-F "recipients[0][name]=John"

-F "recipients[0][email]=john.doe@gmail.com"

-F "attachments[0]=@/path/to/the/pdf/document.pdf"

https://api.sandbox.signaturit.com/v3/emails.json


GET /v3/emails/{id}/certificates/{id}/download/audit_trail
Description
Download the binary content of the audit trail PDF.

Response
PDF file.

Example request
cURL
$ curl

-X GET

-H "Authorization: Bearer YOUR_ACCESS_TOKEN"

https://api.sandbox.signaturit.com/v3/emails/6f6c974e-2910-11e4-b3d4-0aa7697eb409/certificates/29109781-f42d-11e4-b3d4-0aa7697eb409/download/audit_trail

Events URL
The events URL allows you to configure a URL where we will send information in realtime about the email process.

Example received request.
 Object
created_at: "2015-02-25T13:38:33+0000"
 certificate: Object {created_at:"2014-08-21T08:53:35+0000", email:"john.doe@gmail.com", events:Array[1], name:"John", status:"sent"…}
type: "email_processed"
The list of events that you will receive is:

email_processed
The email has been processed.
email_delivered
The email has been delivered.
email_bounced
The server cannot deliver the message. Bounces often are caused by outdated or incorrectly entered email addresses.
email_deferred
The email cannot immediately be delivered, but it hasn’t been completely rejected. Sometimes called a soft bounce, it will be retried for 72 hours.
documents_opened
The document overview has been opened.
document_opened
The document has been opened.
document_downloaded
The document has been downloaded.
certification_completed
The certification process finished
Certified SMS
A SMS represents a request to one or more signers with one or more documents.

created_at
The SMS creation date.
certificates
The certificate items that have been created with the SMS request. A certificate item is created for recipient.

Inside every certificate item you can find the next information:

phone
The recipient's phone.
events
A list of events related with the certificate.

Inside every event item you can find the next information:

created_at
The creation date.
type
The event type.

The available types are:

sms_processed
SMS has been processed.
sms_delivered
The SMS has been delivered to recipient's phone.
documents_opened
The document overview has been opened.
document_opened
The document has been opened.
document_downloaded
The document has been downloaded.
certification_completed
The certification process finished
status
The SMS status.

The available status are:

in_queue
The SMS is being processed.
sent
The SMS has been sent.
error
There was some error processing the SMS.
id
The certified SMS identifier.
 Object
created_at: "2014-08-21T08:53:35+0000"
 certificates: Array [1] [Object]
id: "974e6f6c-2910-11e4-b3d4-0aa7697eb409"
GET /v3/sms/count.json
Description
Count certified SMS.

Parameters
status
Filter SMS with certain status. OPTIONAL

The available status are:

in_queue
The SMS is being processed.
sent
The SMS has been sent.
error
There was some error processing the SMS.
since
SMS returned will be the ones who are sent at this date or later. The format of this value should be YYYY-MM-DD. OPTIONAL
Response
Total of certified SMS in JSON format.

Example request
cURL
$ curl

-X GET

-H "Authorization: Bearer YOUR_ACCESS_TOKEN"

https://api.sandbox.signaturit.com/v3/sms/count.json


GET /v3/sms.json
Description
Get all certified SMS.

Parameters
limit
Max number of SMS to retrieve. The SMS limit is 100. OPTIONAL
offset
Results offset. Default value is 0. OPTIONAL
status
Filter SMS with certain status. OPTIONAL

The available status are:

in_queue
The SMS is being processed.
sent
The SMS has been sent.
error
There was some error processing the request.
since
SMS returned will be the ones who are sent at this date or later. The format of this value should be YYYY-MM-DD. OPTIONAL
Response
A list of SMS requests in JSON format.

Example request
cURL
$ curl

-X GET

-H "Authorization: Bearer YOUR_ACCESS_TOKEN"

https://api.sandbox.signaturit.com/v3/sms.json


GET /v3/sms/{id}.json
Description
Get a given certified SMS request.

Response
Single certified SMS request in JSON format.

Example request
cURL
$ curl

-X GET

-H "Authorization: Bearer YOUR_ACCESS_TOKEN"

https://api.sandbox.signaturit.com/v3/sms/6f6c974e-2910-11e4-b3d4-0aa7697eb409.json


GET /v3/sms/{certifiedSmsId}/certificates/{certificateId}/sms_status.json
Description
Get a given certified SMS request status.

Response
Single certified SMS request status and phone number in JSON format.

Example request
cURL
$ curl

-X GET

-H "Authorization: Bearer YOUR_ACCESS_TOKEN"

https://api.sandbox.signaturit.com/v3/sms/6f6c974e-2910-11e4-b3d4-0aa7697eb409/certificates/29109781-f42d-11e4-b3d4-0aa7697eb409/sms_status.json


POST /v3/sms.json
Description
Create a new SMS request.

Parameters
body
SMS body. The number of characters cannot be more than 120.

branding_id
Use a custom branding for the SMS request. OPTIONAL
events_url
URL that receive realtime information about this SMS process. OPTIONAL

See the sms event url section for more information.

attachments
List of attached files. Only works with open_document and open_every_document type.
recipients
List with SMS recipients containing name and phone number.

Every item can contain the next information:

phone
The recipient phone number. Must start with country prefix.
name
The recipient name.
type
The available types are:

delivery
Send the SMS as it is certifying the delivery process.
open_document
Send a modified version of the SMS with an url that redirects the user to our platform to open the PDF attachments.

With this method, you can track when the user opens the attached files.

Note: This method only supports PDF documents to be attached.

open_every_document
This type works like the open_document type but allows to track the opening of every PDF file in emails with multiple attachments.
Response
New certified SMS in JSON format.

Example request
cURL
$ curl

-X POST

-H "Authorization: Bearer YOUR_ACCESS_TOKEN"

-F "recipients[0][name]=John"

-F "recipients[0][phone]=34123445566"

-F "attachments[0]=@/path/to/the/pdf/document.pdf"

-F "type=open_document"

https://api.sandbox.signaturit.com/v3/sms.json


GET /v3/sms/{id}/certificates/{id}/download/audit_trail
Description
Download the binary content of the audit trail PDF.

Response
PDF file.

Example request
cURL
$ curl

-X GET

-H "Authorization: Bearer YOUR_ACCESS_TOKEN"

https://api.sandbox.signaturit.com/v3/sms/6f6c974e-2910-11e4-b3d4-0aa7697eb409/certificates/29109781-f42d-11e4-b3d4-0aa7697eb409/download/audit_trail

Events URL
The events URL allows you to configure a URL where we will send information in realtime about the SMS process.

Example received request.
 Object
created_at: "2015-02-25T13:38:33+0000"
 certificate: Object {created_at:"2014-08-21T08:53:35+0000", phone:"34123445566", events:Array[1], name:"John", status:"sent"…}
type: "sms_processed"
The list of events that you will receive is:

sms_processed
The sms has been processed.
sms_delivered
The sms has been delivered.
documents_opened
The document overview has been opened.
document_opened
The document has been opened.
document_downloaded
The document has been downloaded.
certification_completed
The certification process finished
Branding
A branding represents the full customization of signaturit's app.

application_texts
List with all the customizable texts for application widgets.

The available texts are:

send_button
Send button text.
terms_and_conditions
Text that follow our terms text (html code is allowed).
created_at
The branding creation date.
id
The branding identifier.
layout_color
Primary element color.
logo
The logo sent in emails.
signature_color
The color that will be used in the signature draw (only black and blue colors are allowed). OPTIONAL
templates
The template content for the emails sent to the user. See Custom templates section for more information.

text_color
Primary text color.
 Object
 application_texts: Object {send_button:"Sign", terms_and_conditions:"I will accept all this terms for testing purposes."}
created_at: "2014-08-26T10:04:00+0000"
id: "3eed17f5-2d08-11e4-b3d4-0aa7697eb409"
layout_color: "#FAAC58"
 templates: Array [0] []
text_color: "#B43104"
GET /v3/brandings.json
Description
Get all brandings from your account.

Parameters
limit
Max number of brandings to retrieve. The branding limit is 10. OPTIONAL
offset
Results offset. Default value is 0. Note that the result window size (limit + offset) cannot exceed 1.000 OPTIONAL
since
Brandings returned will be the ones who are created at this date or later. The format of this value should be YYYY-MM-DD. OPTIONAL
until
Brandings returned will be the ones who are created before this date. The format of this value should be YYYY-MM-DD. OPTIONAL
Response
Branding list in JSON format.

Example request
cURL
$ curl

-X GET

-H "Authorization: Bearer YOUR_ACCESS_TOKEN"

https://api.sandbox.signaturit.com/v3/brandings.json


GET /v3/brandings/{id}.json
Description
Get a branding.

Response
A branding in JSON format.

Example request
cURL
$ curl

-X GET

-H "Authorization: Bearer YOUR_ACCESS_TOKEN"

https://api.sandbox.signaturit.com/v3/brandings/0b1db805-2cf7-11e4-b3d4-0aa7697eb409.json


POST /v3/brandings.json
Description
Create a single branding.

Parameters
application_texts
List with all the customizable texts for application widgets. OPTIONAL

The available texts are:

send_button
Send button text.
open_sign_button
Customizable text for Signature e-mail sign button.
open_email_button
Customizable text for Certified e-mail sign button.
terms_and_conditions
Text that follow our terms text (html code is allowed).
layout_color
Primary element color. OPTIONAL
logo
The logo sent in emails (base64 encoded). OPTIONAL
signature_color
The color that will be used in the signature draw (only black and blue colors are allowed). OPTIONAL
templates
The template content for the emails sent to the user. See Custom templates section for more information.

sms-templates
The template content for the SMS sent to the user. See Custom templates section for more information.

text_color
Primary text color.
show_csv
Hide or show the CSV image and text that is stamped in the signed file. OPTIONAL
show_biometric_hash
Hide or show the Biometric Hash in the signed document and audit trail. OPTIONAL
show_welcome_page
Hide or show the welcome page that appears before showing the document. OPTIONAL
header_color
Sign app Custom header color. OPTIONAL
footer_color
Sign app Custom footer color. OPTIONAL
name
To name the created branding. The maximum length allowed for this field is 24 characters. OPTIONAL
csv_position
Defines where the csv stamp will appear (only right or left values are allowed). OPTIONAL
Response
The new branding in JSON format.

Example request
cURL
$ curl

-X POST

-H "Authorization: Bearer YOUR_ACCESS_TOKEN"

-d "layout_color=#FAAC58"

-d "text_color=#B43104"

-d "application_texts[send_button]=Sign"

-d "show_welcome_page=1"

https://api.sandbox.signaturit.com/v3/brandings.json


PATCH /v3/brandings/{id}.json
Description
Update a single branding.

Parameters
Same parameters as CREATE BRANDING method.

Response
The updated branding in JSON format.

Example request
cURL
$ curl

-X PATCH

-H "Authorization: Bearer YOUR_ACCESS_TOKEN"

-d "application_texts[send_button]=Sign again!"

https://api.sandbox.signaturit.com/v3/brandings/3eed17f5-2d08-11e4-b3d4-0aa7697eb409.json


Create custom templates
You can customize the templates for emails and SMS that are sent to the user. Every template should be linked to a branding, so every request using this branding will use that template instead of Signaturit one.

Templates
signatures_request
This template is the one the user receives when you send him a document to sign.

Note: In this template, sign_button magic word is required.

signatures_receipt
This template is the one the user receives with a copy of signed document.
request_expired
This template is the one the user receives when a document expires.
pending_sign
This template is the one the user receives as a reminder of a document pending to sign.

Note: In this template, sign_button magic word is required.

document_canceled
This template is the one the user receives when requester cancels the signature.

emails_request
This template is the one the user receives when you send him a document through certified emails.

Note: In this template, email_button magic word is required.

validation_request
This template is the one the user receives when you send him a document to validate (as a validator).

Note: In this template, validate_button magic word is required.

signed_document
This template is the one the requester receives once a signature request is finished.

document_declined
This template is the one the requester receives when signer declines a signature request.

request_expired_requester
This template is the one the requester receives when a signature expires.

SMS templates
sms_verify
This template is the one the user receives when an SMS code is sent as a password to open a document.

Note: In this template, code magic word is required.

sms_validate
This template is the one the user receives when an SMS code is sent to validate the signing of a document.

Note: In this template, code magic word is required.


The submitted file must be a HTML template. You can write some magic words on the content, to use custom information from our side. The following words can be used.

Magic words
{{sender_email}}
Tag replace by the sender email.
{{sign_button}}
Tag replaced by the signaturit button.

Note: This tag only can be used in signatures_request and pending_sign templates.

{{validate_button}}
Tag replaced by the validate document button.

Note: This tag only can be used in validation_request template.

{{signer_name}}
This tag is replaced by the signer name.
{{signer_email}}
This tag is replaced by the signer email.
{{filename}}
This tag is replaced by the file name (or names).
{{logo}}
This tag is replaced by the current logo.
{{remaining_time}}
Show the expiry date for a document.

Note: This tag can only be used in pending_sign template.

Note: Do not use this magic word, if you plan that your requests will not expire.

{{email_button}}
Tag replaced by the signaturit button.

Note: This tag only can be used in emails_request template.

{{email_body}}
Tag replaced by the body parameter text.

Note: This tag only can be used in signatures_request template.

{{code}}
Tag replaced by the sms code.

Note: This tag only can be used in sms_verify and sms_validate templates.

{{reason}}
Tag replaced by reason why a signature is declined by signer

Note: This tag only can be used in document_declined template.

{{dashboard_button}}
Tag replaced by button to see the signature detail on dashboard

Note: This tag only can be used in document_declined template.

{{signers}}
Tag replaced by the signer (or signers) name and email in format NAME - EMAIL

Note: This tag only can be used in signed_document template.


Finally, if you want to set a subject for your templates, you must add it on your html file, using html tag title. Email subject will be the text set between this tags.

Example request creating a branding with a template
cURL
$ curl

-X POST

-H "Authorization: Bearer YOUR_ACCESS_TOKEN"

-d "templates[signatures_request]=<html><body><div>Sign the document</div><div>{{sign_button}}</div></body></html>"

https://api.sandbox.signaturit.com/v3/brandings.json


Photo ID validation
POST /v3/photoid/validate.json
Description
Validates an ID document providing image captures from the document front and back sides.

Parameters
front
Front capture of the ID as a file
back
Back capture of the ID as a file (not all ID documents need it)
document_type
Type of the document. Defaults to ID.

Available document types are:

ID
ID Card
DL
Driver license
RP
Residence permit
PA
Passport
document_country
Country code of the document in ISO 3166-1 alpha-3 format. Defaults to ESP
Response
Captured data from the document and validations in JSON format.

Example request
$ curl

-X POST

-H "Authorization: Bearer YOUR_ACCESS_TOKEN"

-F "front=@/path/to/the/front.jpg"

-F "back=@/path/to/the/back.jpg"

-F "document_type=PA"

-F "document_country=FRA"

https://api.sandbox.signaturit.com/v3/photoid/validate.json


Credits
A credit refers to the units consumed when utilizing the digital signature services provided by Signaturit. Each credit corresponds to a transaction or signature request.

GET /v3/account/credits.json
Description
Get the number of remaining credits in your account.

Response
Credit data in JSON format.

Example request
$ curl

-X GET

-H "Authorization: Bearer YOUR_ACCESS_TOKEN"

https://api.sandbox.signaturit.com/v3/account/credits.json


Subscription
You can subscribe to Signaturit events using subscriptions. When you create a subscription, if the process event matches the one you are subscribed, event info will be sent to the url submitted.

Subscription is formed basically by the desired events an a url to send the information.

id
Subscription identifier.
events
An array with the events you want to subscribe.
url
Url used to send event information.

When you are subscribed to a event, you will get the following information when the event triggers.

 Object
created_at: "2015-02-25T13:38:33+0000"
 document: Object {email:"john@signaturit.com", events:Array[3], file:Object, id:"29109781-f42d-11e4-b3d4-0aa7697eb409", name:"John"…}
type: "reminder_email_processed"

The media type of the events we send to your endpoints is set to application/x-www-form-urlencoded by default.

You can receive the events on other formats such as json.

To do so, add the media type extension you want to get to the end of the URL where you want to receive these events: for example https://httpbin.org/post.json we will post the information in json format.

If you want to add an extra security layer, you can filter by IP, as we send all events from 34.241.96.22, both in Sandbox and in Production.

GET /v3/subscriptions.json
Description
Get all subscriptions.

Parameters
limit
Max number of subscriptions to retrieve. The subscription limit is 100. OPTIONAL
offset
Results offset. Default value is 0. OPTIONAL
event
Show subscriptions attached to that event. OPTIONAL
Response
Subscription list in JSON format.

Example request
cURL
$ curl

-X GET

-H "Authorization: Bearer YOUR_ACCESS_TOKEN"

https://api.sandbox.signaturit.com/v3/subscriptions.json


GET /v3/subscriptions/{id}.json
Description
Get a subscription.

Response
Subscription in JSON format.

Example request
cURL
$ curl

-X GET

-H "Authorization: Bearer YOUR_ACCESS_TOKEN"

https://api.sandbox.signaturit.com/v3/subscriptions/b2c7de2f-862c-11e6-88d5-06875124f8dd.json


POST /v3/subscriptions.json
Description
Create a new subscription.

Parameters
url
Url where the event information will be sent.
events
Array with the event you want to subscribe. You can select one or more events. If you want to subscribe to all events, you can use the code "*".
Signature events

email_processed
The email has been processed
email_delivered
The email has been delivered
email_bounced
The server cannot deliver the message. Bounces often are caused by outdated or incorrectly entered email addresses.
email_deferred
The email cannot immediately be delivered, but it hasn’t been completely rejected. Sometimes called a soft bounce, it will be retried for 72 hours.
reminder_email_processed
The reminder email has been processed
reminder_email_delivered
The reminder email has been delivered
sms_processed
The SMS has been processed.
sms_delivered
The SMS has been delivered.
document_opened
The document has been opened.
document_signed
The document has been signed.
document_completed
The document has been completed and ready to be downloaded.
audit_trail_completed
The audit trail has been completed and ready to be downloaded.
document_declined
The document has been declined.
document_expired
The document has expired.
document_canceled
The document has been canceled.
photo_added
The signer has attached a photo in the process.
voice_added
The signer has attached an audio in the process.
file_added
The signer has attached a file in the process.
photo_id_added
The signer has attached a photo id in the process.
expiration_extended
The expiration of the document has been extended.
Email events

email_processed
The email has been processed.
email_delivered
The email has been delivered.
documents_opened
The document overview has been opened.
document_opened
The document has been opened.
document_downloaded
The document has been downloaded.
certification_completed
The certification process finished
SMS events

sms_processed
The email has been processed.
sms_delivered
The email has been delivered.
documents_opened
The document overview has been opened.
document_opened
The document has been opened.
document_downloaded
The document has been downloaded.
certification_completed
The certification process finished
Response
Subscription in JSON format.

Example of subscribing to all events
cURL
$ curl

-X POST

-H "Authorization: Bearer YOUR_ACCESS_TOKEN"

-d "url=https://httpbin.org/post"

-d "events[0]=*"

https://api.sandbox.signaturit.com/v3/subscriptions.json


Example of subscribing to events of email delivery process
cURL
$ curl

-X POST

-H "Authorization: Bearer YOUR_ACCESS_TOKEN"

-d "url=https://httpbin.org/post"

-d "events[0]=email_processed"

-d "events[1]=email_delivered"

https://api.sandbox.signaturit.com/v3/subscriptions.json


PATCH /v3/subscriptions/{id}.json
Description
Updates a subscription.

Parameters
Same parameters as POST method.

Example request
cURL
$ curl

-X PATCH

-H "Authorization: Bearer YOUR_ACCESS_TOKEN"

-d "url=new_url.json"

https://api.sandbox.signaturit.com/v3/subscriptions/b2c7de2f-862c-11e6-88d5-06875124f8dd.json


DELETE /v3/subscriptions/{id}.json
Description
Deletes a subscription.

Example request
cURL
$ curl

-X DELETE

-H "Authorization: Bearer YOUR_ACCESS_TOKEN"

https://api.sandbox.signaturit.com/v3/subscriptions/b2c7de2f-862c-11e6-88d5-06875124f8dd.json


Team
Team is formed by one or more seats. Every seat can be linked only to one user, you can request a user to join your team and if he accepts, it'll become part of your team.

email
Email from user linked to the seat.
name
Name from user linked to the seat.
position
Position from user linked to the seat.
role
Seat role.
status
Current status of the seat, can be:
active
Seat is linked to a user.
pending
If a team request has been sent to the user and user has not joined yet to the team.
inactive
Seat is empty.
 Array [2]
 0: Object {created_at:"2016-09-30T15:02:02+0000", email:"john.doe@signaturit.com", name:"John Doe", id:"d8125099-871e-11e6-88d5-06875124f8dd", position:"CEO"…}
 1: Object {created_at:"2016-10-06T10:03:13+0000", id:"17f0dc63-8bac-11e6-88d5-06875124f8dd", role:"member"}
You can also create groups in your team. Every group can have managers and members. Every user designed as manager, will view all requests made by the group members.

managers
Users that can manage group members.
members
Group members.
name
Group name.
GET /v3/team/users.json
Description
Get team users.

Response
Seats in JSON format.

Example request
cURL
$ curl

-X GET

-H "Authorization: Bearer YOUR_ACCESS_TOKEN"

https://api.sandbox.signaturit.com/v3/team/users.json


GET /v3/team/seats.json
Description
Get team seats.

Response
Seats in JSON format.

Example request
cURL
$ curl

-X GET

-H "Authorization: Bearer YOUR_ACCESS_TOKEN"

https://api.sandbox.signaturit.com/v3/team/seats.json


GET /v3/team/user/id.json
Description
Get a user from the team.

Response
Seat in JSON format.

Example request
cURL
$ curl

-X GET

-H "Authorization: Bearer YOUR_ACCESS_TOKEN"

https://api.sandbox.signaturit.com/v3/team/users/d8125099-871e-11e6-88d5-06875124f8dd.json


POST /v3/team/users.json
Description
Request a user to join the team. User will get an email with the link to register in your team.

Parameters
email
Email of the user that'll be joining the team.
role
User role. You can choose between admin or member.
Response
Seat in JSON format.

Example request
cURL
$ curl

-X POST

-H "Authorization: Bearer YOUR_ACCESS_TOKEN"

-d "email=bob.soap@signaturit.com"

-d "role=admin"

https://api.sandbox.signaturit.com/v3/team/users.json


PATCH /v3/team/users/id.json
Description
Update user role.

Response
User in JSON format.

Example request
cURL
$ curl

-X PATCH

-H "Authorization: Bearer YOUR_ACCESS_TOKEN"

-d "role=member"

https://api.sandbox.signaturit.com/v3/team/users/d8125099-871e-11e6-88d5-06875124f8ed.json


DELETE /v3/team/users/id.json
Description
Remove user from account and made the seat inactive again.

Response
Seat in JSON format.

Example request
cURL
$ curl

-X DELETE

-H "Authorization: Bearer YOUR_ACCESS_TOKEN"

https://api.sandbox.signaturit.com/v3/team/users/d8125099-871e-11e6-88d5-06875124f8dd.json


DELETE /v3/team/seats/id.json
Description
Remove seat from account.

Response
Seat in JSON format.

Example request
cURL
$ curl

-X DELETE

-H "Authorization: Bearer YOUR_ACCESS_TOKEN"

https://api.sandbox.signaturit.com/v3/team/users/d8125099-871e-11e6-88d5-06875124f8dd.json


GET /v3/team/groups.json
Description
Get team groups.

Response
Groups in JSON format.

Example request
cURL
$ curl

-X GET

-H "Authorization: Bearer YOUR_ACCESS_TOKEN"

https://api.sandbox.signaturit.com/v3/team/groups.json


GET /v3/team/groups/id.json
Description
Get single group.

Response
Group in JSON format.

Example request
cURL
$ curl

-X GET

-H "Authorization: Bearer YOUR_ACCESS_TOKEN"

https://api.sandbox.signaturit.com/v3/team/groups/id.json


POST /v3/team/groups.json
Description
Create a new group.

Response
Group in JSON format.

Example request
cURL
$ curl

-X POST

-H "Authorization: Bearer YOUR_ACCESS_TOKEN"

-d "name=Founders"

https://api.sandbox.signaturit.com/v3/team/groups.json


PATCH /v3/team/groups/id.json
Description
Update a group.

Response
Group in JSON format.

Example request
cURL
$ curl

-X PATCH

-H "Authorization: Bearer YOUR_ACCESS_TOKEN"

-d "name=Members"

https://api.sandbox.signaturit.com/v3/team/groups/d8125099-871e-11e6-88d5-06875124f8dd.json


DELETE /v3/team/groups/id.json
Description
Delete a group.

Example request
cURL
$ curl

-X DELETE

-H "Authorization: Bearer YOUR_ACCESS_TOKEN"

https://api.sandbox.signaturit.com/v3/team/groups/d8125099-871e-11e6-88d5-06875124f8dd.json


POST /v3/team/groups/id/managers/id.json
Description
Add a new seat to a group, with manager role.

Response
Group in JSON format.

Example request
cURL
$ curl

-X POST

-H "Authorization: Bearer YOUR_ACCESS_TOKEN"

https://api.sandbox.signaturit.com/v3/team/groups/d8125099-871e-11e6-88d5-06875124f8dd/managers/d8125099-871e-11e6-88d5-06875124f8dd.json


DELETE /v3/team/groups/id/managers/id.json
Description
Remove a manager from group.

Response
Group in JSON format.

Example request
cURL
$ curl

-X DELETE

-H "Authorization: Bearer YOUR_ACCESS_TOKEN"

https://api.sandbox.signaturit.com/v3/team/groups/d8125099-871e-11e6-88d5-06875124f8dd/managers/d8125099-871e-11e6-88d5-06875124f8dd.json


POST /v3/team/groups/id/members/id.json
Description
Add a new seat to a group, with member role.

Response
Group in JSON format.

Example request
cURL
$ curl

-X POST

-H "Authorization: Bearer YOUR_ACCESS_TOKEN"

https://api.sandbox.signaturit.com/v3/team/groups/d8125099-871e-11e6-88d5-06875124f8dd/members/d8125099-871e-11e6-88d5-06875124f8dd.json


DELETE /v3/team/groups/id/members/id.json
Description
Remove a member from group.

Response
Group in JSON format.

Example request
cURL
$ curl

-X DELETE

-H "Authorization: Bearer YOUR_ACCESS_TOKEN"

https://api.sandbox.signaturit.com/v3/team/groups/d8125099-871e-11e6-88d5-06875124f8dd/members/d8125099-871e-11e6-88d5-06875124f8dd.json


Contacts
You can create your own contacts, to use it when sending requests through signaturit. A contact is formed by an email and a name.

email
Contact email.
name
Contact name.
 Object
created_at: "2016-09-30T15:02:02+0000"
email: "john.doe@signaturit.com"
name: "John Doe"
id: "e8125099-871e-11e6-88d5-06875124f8dd"
GET /v3/contacts.json
Description
Get your contacts.

Parameters
limit
Maximum number of contacts to return. Default is 100. OPTIONAL
offset
Results offset. Default value is 0. OPTIONAL
email
Contacts email to filter request with your own data. OPTIONAL
name
Contacts name to filter request with your own data. OPTIONAL
Response
Contacts in JSON format.

Example request
cURL
$ curl

-X GET

-H "Authorization: Bearer YOUR_ACCESS_TOKEN"

https://api.sandbox.signaturit.com/v3/contacts.json


GET /v3/contacts/id.json
Description
Get a single contact.

Response
Contact in JSON format.

Example request
cURL
$ curl

-X GET

-H "Authorization: Bearer YOUR_ACCESS_TOKEN"

https://api.sandbox.signaturit.com/v3/contacts/e8125099-871e-11e6-88d5-06875124f8dd.json


POST /v3/contacts.json
Description
Create a new contact.

Response
Contact in JSON format.

Parameters
email
Email of the new contact.
name
Name of the new contact.
Example request
cURL
$ curl

-X POST

-H "Authorization: Bearer YOUR_ACCESS_TOKEN"

-d "email=john.doe@signaturit.com"

-d "name=John Doe"

https://api.sandbox.signaturit.com/v3/contacts.json


PATCH /v3/contacts/id.json
Description
Update a current contact.

Response
Contact in JSON format.

Parameters
email
Email of the new contact.
name
Name of the new contact.
Example request
cURL
$ curl

-X PATCH

-H "Authorization: Bearer YOUR_ACCESS_TOKEN"

-d "email=john.smith@signaturit.com"

https://api.sandbox.signaturit.com/v3/contacts/e6125099-871e-11e6-88d5-06875124f8dd.json


DELETE /v3/contacts/id.json
Description
Delete a current contact.

Example request
cURL
$ curl

-X DELETE

-H "Authorization: Bearer YOUR_ACCESS_TOKEN"

https://api.sandbox.signaturit.com/v3/contacts/e6125099-871e-11e6-88d5-06875124f8dd.json


