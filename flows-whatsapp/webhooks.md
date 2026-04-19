Flows Webhooks
There are various webhook you should subscribe to and monitor which are related to WA Flows.

Message webhook:

Flow response message webhook
Webhook to monitor the status of your business' Flows:

Flows status changes
Webhooks to monitor performance of endpoint powered Flows :

Client error rates
Endpoint error rates
Endpoint channel latencies
Endpoint channel availability
Flow Versions webhooks:

Flow Version Freeze/Expiry warning Webhooks
Webhook Setup
Create an Endpoint
Before you can start receiving notifications you will need to create an endpoint on your server to receive notifications.

Your endpoint must be able to process two types of HTTPS requests: Verification Requests and Event Notifications. Since both requests use HTTPs, your server must have a valid TLS or SSL certificate correctly configured and installed. Self-signed certificates are not supported.

Learn more about Verifying Requests and Event Notifications

Sample App Endpoints
To test your Webhooks, you can create a sample app with an endpoint for receiving notifications.

Subscribe to Webhooks
Once your endpoint is ready, go to your App Dashboard. If you do not have app, create a Business Type App. In your App Dashboard, find the WhatsApp product and click Configuration. Then, find the webhooks section and select Configure a webhook. A dialog will then appear asking you for the following:

Callback URL: The URL WhatsApp will be sending the events to. This is the endpoint you have created above

Verify Token: Set up when you create your webhook endpoint

After adding the information, click Verify and Save.

Back in the App Dashboard, click WhatsApp > Configuration on the left-side panel. From there, select Webhooks > Manage. A dialog box will open with all the objects you can get notified about. To receive messages from your users, click Subscribe for flows AND messages.

A Meta App can have only one endpoint configured. If you need to send your webhook updates to multiple endpoints, you need multiple Meta Apps.

If you are a Solution Partner, you may need to:

Add the whatsapp_business_messaging permission in your App Dashboard
Successfully complete Meta App Review – This step will take time but you can continue to test during the entire review process.
To get Webhook events for a specific WABA, you must explicitly subscribe to that WABA.

Flow Response Message Webhook
When user completes the flow, a message is sent to WhatsApp chat. You will receive that message through a webhook which you normally use to process chat messages from the user. Below is the structure of flow response message webhook payload:

{
  "messages": [{
    "context": {
      "from": "16315558151",
      "id": "gBGGEiRVVgBPAgm7FUgc73noXjo"
    },
    "from": "<USER_ACCOUNT_NUMBER>",
    "id": "<MESSAGE_ID>",
    "type": "interactive",
    "interactive": {
      "type": "nfm_reply",
      "nfm_reply": {
        "name": "flow",
        "body": "Sent",
        "response_json": "{\"flow_token\": \"<FLOW_TOKEN>\", \"optional_param1\": \"<value1>\", \"optional_param2\": \"<value2>\"}"
      }
    },
    "timestamp": "<MESSAGE_SEND_TIMESTAMP>"
  }]
}
Parameter	Description
context

object	
Context of the message that the user replied to. Context object contains message_id of flows request message and sender number.

context.from

string	
User's WhatsApp account number

context.id

string	
Message ID

context.type

string	
Always interactive

interactive.type

string	
Always nfm_reply

interactive.nfm_reply.name

string	
flow

interactive.nfm_reply.body

string	
Always Sent

interactive.nfm_reply.response_json

string	
Flow-specific data. The structure is either defined in flow JSON (see Complete action) or, if flow is using an endpoint, controlled by endpoint (see Final Response Payload in Data Exchange Request)

timestamp

string	
Time of flow response message

Flows Status and Performance Webhooks
Webhook Notification Object
A combination of nested objects of JSON arrays and objects that contain information about a change.

Name	Description
object

string	
The webhook a business has subscribed to

entry

array of objects	
An array of entry objects. Entry objects have the following properties:

id - string. The WhatsApp Business Account ID for the business that is subscribed to the webhook.

changes - Array of objects. An array of change objects. Change objects have the following properties:

value — Object. A value object. See Value Object.

field — String. Notification type. Value will be flows.

Value Object
Contains details for the change that triggered the webhook. This object is nested within the changes array of the entry array.

Name	Description
flow_id

string	
ID of the flow

threshold

number	
The alert threshold that was reached or recovered from

event

string	
Type of webhook notification sent, value being one of:

FLOW_STATUS_CHANGE
CLIENT_ERROR_RATE
ENDPOINT_ERROR_RATE
ENDPOINT_LATENCY
ENDPOINT_AVAILABILITY
message

string	
Detailed message describing webhook

old_status

string	
Previous status of the flow, value being one of:

DRAFT
PUBLISHED
DEPRECATED
BLOCKED
THROTTLED
new_status

string	
Previous status of the flow, value being one of:

DRAFT
PUBLISHED
DEPRECATED
BLOCKED
THROTTLED
alert_state

string	
Status of the alert, value being one of:

ACTIVATED

DEACTIVATED

requests_count

integer	
Number of requests used to calculate metric

errors

array of objects	
An array of error objects describing each error included in the alert. Error objects have the following properties:

error_count — Integer. Number of occurrences of the error. Example: 29.

error_rate — Integer. Error specific error rate. Example: 16.

error_type — String. The name of the error. See Webhook Alerts and Endpoint Error Types section of Error Codes page for details and suggestions for resolutions.

p50_latency

integer	
P50 latency of the endpoint requests

p90_latency

integer	
P90 latency of the endpoint requests

error_rate

integer	
Overall error rate for the alert

Types of Webhook Notifications
Status Change Webhook
A notification is sent when the status for the flow changes, specifically when the flow is either Published, Throttled, Blocked or Deprecated.

{
  "entry": [
      {
        "id": "644600416743275",
        "time": 1684969340,
        "changes": [
          {
            "value": {
              "event": "FLOW_STATUS_CHANGE",
              "message": "Flow Webhook 3 changed status from DRAFT to PUBLISHED",
              "flow_id": "6627390910605886",
              "old_status": "DRAFT",
              "new_status": "PUBLISHED"
            },
            "field": "flows"
          }
        ]
      }
    ],
    "object": "whatsapp_business_account"
}
The notification is also sent on the flow creation event. In this case the old status value will not be set, and the new value will be Draft as a default status.

{
  "entry": [
      {
        "id": "644600416743275",
        "time": 1684969340,
        "changes": [
          {
            "value": {
              "event": "FLOW_STATUS_CHANGE",
              "message": "Flow Webhook 3 has been created with DRAFT status",
              "flow_id": "6627390910605886",
              "new_status": "DRAFT"
            },
            "field": "flows"
          }
        ]
      }
    ],
    "object": "whatsapp_business_account"
}
Client Error Rate Webhook
Client error rate is approximate as it’s not available for all the client devices and regions.

A notification is sent to you when the error rate for screen navigations on the client goes over one of the following thresholds and then again when it goes below these thresholds.

Error rate thresholds:

5%
10%
50%
The detection period for these thresholds is 60 minutes, which is the period that we calculate the error rate. WhatsApp will only send a webhook if the error rate of the events in the past 60 minutes reaches any of these thresholds or goes below them.

Possible resolutions
Check the errors listed in the alert and check the error codes reference guide for possible resolutions.
{
  "entry": [
    {
      "id": "106181168862417",
      "time": 1674160476,
      "changes": [
        {
          "value": {
            "event": "CLIENT_ERROR_RATE",
            "message": "The flow client request error rate has reached the 5% threshold in the last 60 minutes. A higher error rate will make it harder for users to complete the flow, resulting in drop-offs.",
            "flow_id": "691244242662581",
            "error_rate": 14.28,
            "threshold": 10,
            "alert_state": "ACTIVATED",
            "errors": [
              {
                "error_type": "INVALID_SCREEN_TRANSITION",
                "error_rate": 66.66,
                "error_count": 2
              },
              {
                "error_type": "PUBLIC_KEY_MISSING",
                "error_rate": 33.33,
                "error_count": 1
              },
            ],
          },
          "field": "flows"
        }
      ]
    }
  ],
  "object": "whatsapp_business_account"
}
Endpoint Error Rate Webhook
A notification is sent to you when the error rate for endpoint requests goes over one of the following thresholds and then again when it goes below these thresholds.

Error rate thresholds:

5%
10%
50%
The detection period for these thresholds is 30 minutes, which is the period that we calculate the error rate. WhatsApp will only send a webhook if the error rate of the events in the past 30 minutes reaches any of these thresholds or goes below them.

Possible resolutions
Check the errors listed in the alert and check the error codes reference guide for possible resolutions.
{
  "entry": [
    {
      "id": "106181168862417",
      "time": 1674160476,
      "changes": [
        {
          "value": {
            "event": "ENDPOINT_ERROR_RATE",
            "message": "The flow endpoint request error rate has reached the 10% threshold in the last 30 minutes. A higher error rate will make it harder for users to complete the flow, resulting in drop-offs.",
            "flow_id": "691244242662581",
            "error_rate": 14.28,
            "threshold": 10,
            "alert_state": "ACTIVATED",
            "errors": [
              {
                "error_type": "CAPABILITY_ERROR",
                "error_rate": 66.66,
                "error_count": 2
              },
              {
                "error_type": "TIMEOUT",
                "error_rate": 33.33,
                "error_count": 1
              },
            ],
          },
          "field": "flows"
        }
      ]
    }
  ],
  "object": "whatsapp_business_account"
}
Endpoint Latency Webhook
A notification is sent to you when the p90 latency for endpoint requests goes over one of these thresholds and then again when it goes below these thresholds.

p90 latency thresholds:

1s
5s
7s
The detection period for these thresholds is 30 minutes, which is the period that we calculate the latency. WhatsApp will only send a webhook if the latency of the events in the past 30 minutes reaches any of these thresholds or goes below them.

Possible resolutions
Improve responsiveness of your endpoint and aim to return response in less than 1 second.
{
  "entry": [
    {
      "id": "106181168862417",
      "time": 1674160476,
      "changes": [
        {
          "value": {
            "event": "ENDPOINT_LATENCY",
            "message": "Flow endpoint latency has reached the p90 threshold in the last 30 minutes. High latency will increase the loading time between screens in the flow, impacting user experience.",
            "flow_id": "691244242662581",
            "p90_latency": 8000,
            "p50_latency": 500,
            "requests_count": 34,
            "threshold": 7000,
            "alert_state": "ACTIVATED",
          },
          "field": "flows"
        }
      ]
    }
  ],
  "object": "whatsapp_business_account"
}
Endpoint Availability Webhook
A notification is sent to you when the the endpoint availability goes below 90% threshold and then again when it goes above the threshold.

The detection period for the alert is 10 minutes.

Possible resolutions
Ensure that your endpoint is available all the time and reachable from the internet.
Check that it can correctly responds to health check requests.
{
  "entry": [
    {
      "id": "106181168862417",
      "time": 1674160476,
      "changes": [
        {
          "value": {
            "event": "ENDPOINT_AVAILABILITY",
            "message": "The flow endpoint availability has breached the 90% threshold in the last 10 minutes. Users will be unable to open or use the flow.",
            "flow_id": "12345678",
            "alert_state: "ACTIVATED",
            "availability": 75,
            "threshold" : 90,
          },
          "field": "flows"
        }

      ]
    }
  ],
  "object": "whatsapp_business_account"
}
Flow Version Freeze/Expiry warning Webhook
A notification is sent to you on the flow creation event if any of the versions used is about to be frozen. You won't be able to publish the Flow after the version freezes.

Possible resolutions
Please migrate to the recommended version as soon as possible.
{
  "entry": [
      {
        "id": "644600416743275",
        "time": 1684969340,
        "changes": [
          {
            "value": {
              "event": "FLOW_STATUS_CHANGE",
              "message": "Flow Webhook 3 has been created with DRAFT status",
              "flow_id": "6627390910605886",
              "new_status": "DRAFT"
              "warning": "Your current Flow version will freeze in 21 days. You won't be able to send the Flow after it expires. Please migrate to the recommended version as soon as possible. https://developers.facebook.com/docs/whatsapp/flows/changelogs#currently-supported-versions" 
            },
            "field": "flows"
          }
        ]
      }
    ],
    "object": "whatsapp_business_account"
}
The notification is also sent when you send Flow with version which is about to expire. You won't be able to send the Flow after it expires.

We aim to send only single webhook per each Flow which version is about to expire.

Possible resolutions
Please migrate to the recommended version as soon as possible.
{
  "entry": [
      {
        "id": "644600416743275",
        "time": 1684969340,
        "changes": [
          {
            "value": {
              "event": "FLOW_VERSION_EXPIRY_WARNING",
              "warning": "Your current Flow version will freeze in 21 days. You won't be able to send the Flow after it expires. Please migrate to the recommended version as soon as possible. https://developers.facebook.com/docs/whatsapp/flows/changelogs#currently-supported-versions"
              "flow_id": "6627390910605886",
            },
            "field": "flows"
          }
        ]
      }
    ],
    "object": "whatsapp_business_account"
}