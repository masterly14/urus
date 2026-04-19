Sending a Flow
You can quickly build Whatsapp Flow in the playground and send it as as a template message, for example as part of a marketing campaign. Or you can create a WhatsApp Flow and send it either as a normal message.

Go here to read more about message types, limits, and timing.

To send the Flow as a template, first you need to create a template. Here is an example request:

curl -i -X POST \
https://graph.facebook.com/v16.0/<waba-id>/message_templates \
-H 'Authorization: Bearer TOKEN' \
-H 'Content-Type: application/json' \
-d'
{
  "name": "example_template_name",
  "language": "en_US",
  "category": "MARKETING",
  "components": [
    {
      "type": "body",
      "text": "This is a flows as template demo"
    },
    {
      "type": "BUTTONS",
      "buttons": [
        {
          "type": "FLOW",
          "text": "Sign up",
          "flow_action": "navigate",
          "navigate_screen": "WELCOME_SCREEN"
          "flow_json" : "{    \"version\": \"3.1\",    \"screens\": [        {            \"id\": \"WELCOME_SCREEN\",            \"layout\": {                \"type\": \"SingleColumnLayout\",                \"children\": [                    {                        \"type\": \"TextHeading\",                        \"text\": \"Hello World\"                    },                    {                        \"type\": \"TextBody\",                        \"text\": \"Let\'s start building things!\"                    },                    {                        \"type\": \"Footer\",                        \"label\": \"Complete\",                        \"on-click-action\": {                            \"name\": \"complete\",                            \"payload\": {}                        }                    }                ]            },            \"title\": \"Welcome\",            \"terminal\": true,            \"success\": true,            \"data\": {}        }    ]}"
        }
      ]
    }
  ]
}'
Property	Type	Description
buttons.flow_json

String

The Flow JSON encoded as string. Specifies the layout of the flow to be attached to the Template. The Flow JSON can be quickly generated in the Flow playground. For full reference see Flow JSON documentation

Cannot be used if the flow_id attribute is provided. Only one of the parameters is allowed.

buttons.flow_id

String

id of a flow

Cannot be used if the flow_json attribute is provided. Only one of the parameters is allowed.

buttons.navigate_screen

String

Flow JSON screen name. Required if flow_action is navigate

buttons.flow_action

Enum

navigate or data_exchange. Default value is navigate

See here for more details.

Sample Response
{
  "id": "<template-id>",
  "status": "PENDING",
  "category": "MARKETING"
}
Ensure that your template passes all required reviews so that status is APPROVED instead of PENDING.

Now you can send a template message with a flow using the following request:

curl -X  POST \
 'https://graph.facebook.com/v16.0/FROM_PHONE_NUMBER_ID/messages' \
 -H 'Authorization: Bearer ACCESS_TOKEN' \
 -H 'Content-Type: application/json' \
 -d '{
  "messaging_product": "whatsapp",
  "recipient_type": "individual",
  "to": "PHONE_NUMBER",
  "type": "template",
  "template": {
    "name": "TEMPLATE_NAME",
    "language": {
      "code": "LANGUAGE_AND_LOCALE_CODE"
    },
    "components": [
      {
        "type": "button",
        "sub_type": "flow",
        "index": "0",
        "parameters": [
          {
            "type": "action",
            "action": {
              "flow_token": "FLOW_TOKEN",   //optional, default is "unused"
              "flow_action_data": {
                 ...
              }   // optional, json object with the data payload for the first screen
            }
          }
        ]
      }
    ]
  }
}'
Sample Response
{
  "messaging_product": "whatsapp",
  "contacts": [
    {
      "input": "<phone-number>",
      "wa_id": "<phone-number>"
    }
  ],
  "messages": [
    {
      "id": "<message-id>"
    }
  ]
}