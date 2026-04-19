Error Codes
Flow Management API Error Codes
When managing (creating, updating, deleting, or publishing) your Flows, you may run into the occasional error. The following table outlines the different error codes you might see, and what you can do to fix the problem.

Don't see your error code listed below? Check out this list of Cloud API error codes.

Error Code	Description	Possible Solutions
100

Flow name is not unique

You may be trying to create a Flow with a name already used by another Flow on the same WhatsApp Business Account.


Flow name should be unique within one WhatsApp Business Account. Confirm that you're creating the Flow on the correct account or use a different name for your Flow. See Creating a Flow for more information.

Invalid Flow JSON version

The Flow JSON version you specified in your API call isn't valid.


Verify there isn't a mistake with version sent (e.g., a typo or leaving it blank). If the version looks correct, it may be expired and you'll need to upgrade to a later version. For the latest active versions see the Changelog. For more details on how versioning works for WhatsApp Flows, see the Versioning reference.

Invalid Flow JSON data_api_version

The Data API version you specified in your API call isn't valid.


Verify there isn't a mistake with version sent (e.g., a typo or leaving it blank). If the version looks correct, it may be expired and you'll need to upgrade to a later version. For the latest active versions see the Changelog. For more details on how versioning works for WhatsApp Flows, see the Versioning reference.

Flow with specified ID does not exist

The Flow ID you provided was not found in your account.


Confirm that the ID provided is correct and verify that you have access it with the credentials provided.

Only one clone source can be set

You provided values for both clone_flow_id and clone_template.


When cloning a Flow, you can only provide one of these fields. Unset one of them and try your request again.

Specify Endpoint Uri in Flow JSON

You provided endpoint_uri and clone_flow_id which corresponds to a Flow with Flow JSON version below 3.0.


For Flow JSON versions below 3.0 endpoint_uri should be specified as data_channel_uri property in the Flow JSON. Do not specify endpoint_uri param when cloning a Flow with Flow JSON version below 3.0.


See API reference for details.

Invalid Endpoint URI

Provide a valid URL.

139000

Blocked By Integrity

Unfortunately we've identified an issue with integrity in your account and have prevented you from creating or publishing your Flow.


To get this issue resolved for your account, get in touch with us via the Support.

139001

Flow can't be updated

You attempted to update a Flow that has already been published.


Once published, Flows can no longer be updated (see Flows Status Lifecycle). To update a published Flow, you'll have to clone the Flow (see Creating a Flow) and republish the new Flow. Once published, you can start sending the newly modified Flow instead of the existing one.

Error while processing Flow JSON

Due to an internal error, the Flow JSON was saved but internal processing failed (which may prevent the Flow from serving properly).


First, retry the exact same request as the issue may be transient. If retrying results in the same error again, contact us via the support to help get the error resolved.

Specify Endpoint Uri in Flow JSON

You provided endpoint_uri param for a Flow with Flow JSON version below 3.0.


For Flow JSON versions below 3.0 endpoint_uri should be specified as data_channel_uri property in the Flow JSON. Do not specify endpoint_uri param when updating a Flow with Flow JSON version below 3.0.


See API reference for details.

139002

Publishing Flow in invalid state

You tried to publish a Flow that isn't a draft.


Once a Flow leaves the draft state, they cannot be republished (see Flows Status Lifecycle). If you need to modify a Flow that is no longer a draft, you'll have to clone the Flow (see Creating a Flow) and republish the new Flow. Once published, you can start sending the newly modified Flow instead of the existing one.

Publishing Flow with validation errorrs

You tried to publish a draft Flow that has validation errors.


Flows with validation errors can be saved as a draft, but not published. Try viewing the Flow in the Flow Builder UI which will highlight and explain any errors (see Create Your First Flow for a guide to getting started with the Flows Builder UI. You can also view a list of validation errors for your Flow via the API (see Retrieving Flow Details). Once the errors are resolved, try publishing your Flow again.

Publishing Flow without data_channel_uri

You need to set the "data_channel_uri" property before you can send or publish a flow.

Publishing without specifying endpoint_uri is forbidden

Please set endpoint_uri property for a Flow before publishing.


Starting from Flow JSON version 3.0 endpoint_uri should be specified via API.


See API reference for details.

Versions in Flow JSON file are not available for publishing

The flow is using an unsupported version. You can check the list of currently available versions in the changelog.

No Phone Number connected to WhatsApp Business Account

You need to add a phone number to your WhatsApp Business Account before you can send or publish a flow.

Missing Flows Signed Public Key

You need to upload and sign a public key to a phone number before you can send or publish a flow.

No Application Connected to the Flow

You need to connect a Meta app to the flow before you can publish it.

Endpoint Not Available

You need to verify that the endpoint is available and that you’ve implemented a health check before publishing.

WhatsApp Business Account is not subscribed to Flows Webhooks

You need to verify that your WhatsApp Business account is subscribed to Flows webhooks.

139003

Can't deprecate unpublished flow

You attempted to deprecate a Flow that hasn't yet been published.


Deprecating a Flow is only permitted after it's been published (see Deprecating a Flow). For Flows that are still drafts, you should delete any Flows you no longer need (see Deleting a Flow).

Flow is already deprecated

You tried to deprecate a Flow that is already marked as deprecated.


You may ignore this error as your target state (the Flow being deprecated) has already been achieved.

139004

Can't delete published Flow

After a Flow has been published, it cannot be deleted. Please deprecate instead.

139006

Metrics threshold is not reached

Not enough data to provide flow metrics

Business Endpoint Error Codes
If the Flow is using a business-provided endpoint, that endpoint may return specific HTTP response codes in case of certain types of errors to trigger appropriate client-side behavior.

HTTP Response Code	Server-side situation	Client-side behavior and details
421

The payload cannot be decrypted

The WhatsApp client will re-fetch a public key and re-send the request. If the request fails, a generic error will be shown on the client.


See Implementing Endpoints for Flows for more details.

432

The request signature authentication fails

A generic error will be shown on the client.

427

The Flow token is no longer valid

A generic error will be shown on the client, and the CTA button will be disabled for the user. You can send a new message to the user generating a new Flow token. This action may be used to prevent users from initiating the same Flow again.

You are able to set an error message to display to the user. For example:

HTTP/2 427
content-type: application/json
content-length: 51
date: Wed, 06 Jul 2022 14:03:03 GMT

{“error_msg”: “The order has already been placed”}
See Implementing Endpoints for Flows for more details.

On-Premise WhatsApp Business API Client Error Codes
Flow specific error codes returned by On-Premise Client. For the full list of On-Premise error codes see this page.

Error Code	Description
2064 - Invalid Flow ID

Flow with specified ID does not exist or does not belong to your WhatsApp Business Account (WABA), or it is in invalid state.

2065 - Invalid Flow Message Version

Flow message Version is invalid. See currently supported message version in Flows Changelog

2066 - Invalid Flow Mode

Returned when Flow in DRAFT state is sent with specifying draft mode or PUBLISHED Flow is sent with draft mode.

2067 - Flow DRAFT Mode Not Allowed

Unable to send DRAFT Flow, please check status page for any ongoing issues and if problem persists please contact support.

2068 - Flow is blocked

Flow is in blocked state.

This error may also be returned if flow uses an endpoint and required setup is incomplete, e.g. public key is not uploaded or became invalid. See Implementing Endpoint for Flows.

2069 - Flow is throttled

Flow is in throttled state and 10 messages using this flow were already sent in the last hour.

2070 - Invalid Flow Version

Flow version is invalid or expired. See currently supported versions in Flows Changelog

Cloud API Error Codes
Flow specific error codes returned by Cloud API. For the full list of Cloud API error codes see this page.

Code	Description	Possible Solutions	HTTP Status Code
132068

Flow is blocked

Flow is in blocked state.

Correct the Flow

400

Bad Request

132069

Flow is throttled

Flow is in throttled state and 10 messages using this flow were already sent in the last hour.

Correct the Flow

400

Bad Request

Error Types Reported via WebHook Alerts or Propagated Back to Endpoint
These error codes might be sent through business endpoint from client devices or be included in webhook alert payload.

Code	Description	Possible Solutions
timeout_error

Endpoint request has timed out. It took more than 10 seconds to process the endpoint request.

Improve the endpoint performance so it can process requests in less than 10 seconds.

missing_capability

The app linked to Flow does not have required endpoint capability

cannot_be_served

The Flow message cannot be sent and opened by recipients.

Flow is not in DRAFT or PUBLISHED state.

Other common problems:

WABA is blocked by Integrity. Check the Business account page for any quality issues.

The version or data_api_version properties are missing in Flow JSON. Add these properties to the Flow JSON file

no_http_response_error

Endpoint request connection closed without receiving valid http response.

Ensure that the endpoint always returns a valid response in the correct format.

unexpected_http_status_code

The endpoint response had unexpected status code (eg. 500)

Ensure that the endpoint response always has expected status code.

public-key-missing

The client was not able to retrieve the business's public key from WA servers.

Make sure that the correct flow public key is uploaded for the phone number from which you are sending flows.


If a problem persists contact support.

public-key-signiture-verification

The client was not able to verify the signature of the business's public key.

Make sure that the correct flow public key with signature is uploaded for the phone number from which you are sending flows.


If you re-installed on-prem client recently please make sure you re-upload public key with updated signature.


If a problem persists contact support.

response-decryption-error

The client failed to decrypt the payload sent by the business.

Verify that the same key is uploaded for the phone number and is also being used to encrypt endpoint payloads.


If a problem persists contact support.

invalid-screen-transition

The client received the next screen which is not matching the routing model expressed in flow JSON layout.

Next screen navigation needs to match what’s expressed in the routing model of the flow layout.


If the routing model needs to be updated for a published flow, the flow needs to be cloned, edited and published again.

payload-schema-error

The client received the screen data which are not conforming to screen data schema defined in flow JSON layout.

Make sure the screen data sent for each screen complies with the schema defined in the flow JSON layout.

business-decryption-error

The client received the 421 error code from the business even after refreshing the public key.

Re-upload the Flow's public key and try again.

Static Validation Errors
The following tables detail the static validation errors that may be returned while developing Flow JSON.

Schema Validation Errors
Error Code	Error Message	Details	Sample Flow JSON
INVALID_PROPERTY_KEY

Property (propertyName) cannot be specified at (errorPath).

When inside a component:

Property (propertyName) cannot be specified at (componentName) on (errorPath).

Additional properties are not allowed in Flow JSON.

See here for all allowed properties in Flow JSON.

{
   "version": "2.1",
   "myNewProp": "hello"
   ...
}
INVALID_PROPERTY_VALUE

Invalid value found for property (propertyName) at (errorPath).

See here for all allowed property values in Flow JSON.

{
   ...
   "layout": "myNewLayout"
}
{
  ...
  "layout": {
    "type": "SingleColumnLayout",
  "children": [
      {
        "type": "newComponent"
         ...
      }
   ]
}
INVALID_PROPERTY_TYPE

Expected property (errorPath) to be of type (expectedType), but found (actualType).

Invalid type of value found for a valid property type.

See here for all expected types of each property in Flow JSON.

{
  "type": "TextArea",
  "label": "Your input",
  "enabled": "yes"
}
INVALID_PROPERTY_VALUE_FORMAT

Property '${propertyName}' should be in '${format}' format.

For example, property data_channel_uri must be in uri format.

{
  "version": "2.1",
  "data_channel_uri": "placeholder_uri",
  "screens": [
    ...
  ]
}
MIN_ITEMS_REQUIRED MIN_CHARS_REQUIRED

Property '${propertyName}' should have at least '${minQuantityCount}' ${quantityUnit}.

Attributes that must have minimum items or characters.

For example, screen id must have a minimum length of 1.

The Screens array should have at least 1 item.

{
  "screens": [
    {
      "id": "",
     }
  ]
}
{
  "version": "2.1",
  "screens": []
}
MISSING_REQUIRED_TYPE_PROPERTY

Required property '${propertyName}' is missing.

Attributes that must exist.

For example, “type” of a component must be specified.

{
  "screens": [
    {
      "id": "FIRST",
      "layout": {
        "children": [
          {
            "text": "Description",
          }
        ]
      }
    }
  ]
}
PATTERN_MISMATCH

Property (propertyName) should only consist of alphabets and underscores.

Property (propertyName) should be of type '(type)' or have dynamic data format of the form ${screen.data.your_value} or ${data.your_value}.

Property (propertyName) should have dynamic data format of the form ${data.your_value}.

Property (propertyName) should not be blank or empty string.

Property (propertyName) should match the pattern ‘(pattern)'.

Certain attributes must be in a specified format.

For example, a screen name can only contain alphabets and underscores.

Property ‘max-chars’ in TextInput must be a number or a string of the form “${data.___}.

{
  "screens": [
    {
      "id": "FIRST_1",
      "layout": {
        "children": [
          {
            "type": "TextInput",
            "name": "Description",
            "label": "Enter decsription",
            "max-chars": "Hundred"
          }
        ]
      }
    }
  ]
}
INVALID_ENUM_VALUE

Value should be one of: [${allowedValues}].

Example, Value should be one of: [data_exchange, navigate].

Value can only be one of the allowed values.

For example, Action complete can only be specified on Footer.

{
  "screens": [
    {
      "id": "FIRST_SCREEN",
      "layout": {
        "children": [
          {
            "type": "EmbeddedLink",
            "text": "link",
            "on-click-action": {
              "name": "complete",
              "payload": {}
            }
          }
        ]
      }
    }
  ]
}
INVALID_DEPENDENCIES

Footer should have property left-caption when property right-caption is present.

Indicates the dependency of a property to exist based on another property.

For example, if ‘left-caption’ is specified at Footer then ‘right-caption’ must be specified as well.

{
  "screens": [
    {
      "id": "FIRST_SCREEN",
      "layout": {
        "children": [
          {
            "type": "Footer",
            "left-caption": "left",
            "on-click-action": {
              "name": "complete",
              "payload": {}
            }
          }
        ]
      }
    }
  ]
}
NOT_KEYWORD_SCHEMA_VALIDATION_FAILED

Properties '(propertyName)' and [(not_required_properties)] must be present exclusively at (componentName).

Properties [(not_required_properties)] must be present exclusively at (componentName).

Property 'success' can only be specified on a terminal screen.

The NOT keyword schema validation failed. Please refer to the Flow JSON schema.

Indicates the properties which cannot exist together in the Flow JSON component.

For example, only one of ‘center-caption’ and [‘left-caption’ or ‘right-caption’] can be specified at Footer.

Or

Property ‘success’ is specified on a non-terminal screen.

{
  "screens": [
    {
      "id": "FIRST_SCREEN",
      "layout": {
        "children": [
          {
            "type": "Footer",
            "left-caption": "left",
            "center-caption": "center",
            "on-click-action": {
              "name": "complete",
              "payloadx": {}
            }
          }
        ]
      }
    }
  ]
}
{
      "version": "2.1",
      "screens": [
        {
          "terminal": "false",
          "success": "true",
           ...    
        }
      ]
  }
INVALID_PROPERTY_VALUE

At least one terminal screen must have property 'success' set as true.

This property marks whether terminating on a terminal screen should be considered a successful business outcome. More info .

    "version": "2.1",
    "screens": [
      {
        "terminal": "true",
        "success": "false",
         ...    
      }
    ]
}
INVALID_FLOW_JSON

Flow JSON is not valid.

There can be multiple reasons for an invalid Flow JSON.

For example, there may be an unnecessary trailing comma.

Exact location of these errors is hard to point out since an invalid JSON cannot be parsed.

{
        "routing_model": {},
        "screens": [
          ...
        ],,
}
INVALID_FLOW_JSON

No schema found for the given version (version).

Invalid schema found for the given version ${version}.

Either the Flow JSON version is not valid or there is an internal error.

INVALID_PROPERTY_KEY

Property data_api_version is no longer supported in Flow JSON as of version '3.0'. Please configure your endpoint URI using Flows API or Builder. Refer Flows documentation at ‘/docs/whatsapp/flows‘ for more information.

Property data_api_version cannot be specified inside the Flow JSON starting from version 3.0.

{
        "version": "3.0",
        "data_api_version": "3.0",
        "screens": [
          ...
        ],
}
KEYWORD_ONE_OF

Property '(propertyName)' must be defined inside parent property 'Form'.

Before version 4.0, form components can only be defined inside a parent Form component.

Starting from version 4.0, Forms are optional.

{
    "version": "2.1",
    "screens": [
      {
        "layout": {
          "type": "SingleColumnLayout",
          "children": [
            {
              "type": "TextInput",
              "name": "path2",
              "label": "Path"
            },
            {
              "type": "Form",
              "name": "flow_path",
              "children": [
                {
                  "type": "TextInput",
                  "name": "path",
                  "label": "Path"
                },
                ...
            }
          ]
       }
    }
}
FLow JSON Version Errors
Error Code	Error Message	Details	Sample Flow JSON
INVALID_FLOW_JSON_VERSION

Invalid Flow JSON version.

{
        "version": "2024.0",
         ...
}
MISSING_FLOW_JSON_VERSION

Flow JSON version is not specified.

Specifying the Flow JSON version is necessary.

{
        "data_api_version": "3.0",
        "screens": [
          ...
        ]
}
UNSUPPORTED_FLOW_JSON_VERSION

Unsupported Flow JSON version.

Flow JSON versions which are not supported anymore.

{
        "version": 100,
        "screens": [
          ...
        ]
}
UNAVAILABLE_FLOW_JSON_VERSION

The Flow JSON version is not available for your WABA ID.

Some versions are enabled only for Beta users and may not be enabled for public use.

{
        "version": "A.B",
        "screens": [
          ...
        ]
}
NO_SUPPORTED_DATA_API_VERSION

No supported Data API version found for given Flow JSON version.

Data api version is required for data_exchange action.

This error should ideally never be shown in production flows if the Flow JSON version is valid.

{
        "version": "A.B",
        "data_api_version": "C.D",
        "screens": [
          ...
        ]
}
Routing Model Errors
Error Code	Error Message	Details	Sample Flow JSON
INVALID_ROUTING_MODEL

Following screens are missing in the routing model: (screenIDs).

In data channel flow json, when screen is not present in routing_model

{
        "routing_model": {"ABC":[]},
        "screens": [
            {
                "id": "FIRST_SCREEN",
...
INVALID_ROUTING_MODEL

Invalid screens found in the routing model: (screenIDs).

In data channel flow json, when source screen id of routing_model does not exist

{
        "routing_model": {"ABC":[]},
        "screens": [
            {
                "id": "FIRST_SCREEN",
...
INVALID_ROUTING_MODEL

Following screens are not connected to any of the screens: (screenIDs). A connection is formed by the navigate screen action.

In data channel less flow json, when screen id not present in routing_model generated by actions data

{
        "screens": [
            {
                "id": "FIRST_SCREEN",
                "layout": {
                    "children": [
                        {  "type": "Footer",                              
                            "on-click-action": {                                       
                            "name": "data_exchange",                                        
...
INVALID_ROUTING_MODEL

Following screens are not connected with the rest of the screens : (screenIDs). All screens should be connected.

In data channel flow json, when some screens can not be reached out starting from other screens

{
        "routing_model": {
"FIRST_SCREEN":["SECOND_SCREEN"],
"THIRD_SCREEN":[]
},
...
INVALID_ROUTING_MODEL

Following screens are not connected with the rest of the screens via navigate screen action: (screenIDs). All screens should be connected.

In data channel less flow json, when some screens can not be reached out starting from other screens, via ‘navigate’ actions

{
  "screens": [
    {
      "id": "FIRST_SCREEN",
      "layout": {
        "children": [
          {
            "type": "Footer",
            "on-click-action": {
              "name": "navigate",
              "next": {
                "name": "SECOND_SCREEN",
                "type": "screen"
              },
            }
          }
        ]
      }
    },
    {
      "id": "SECOND_SCREEN",
      ...
    },
    {
      "id": "THIRD_SCREEN",
      ...
    }
  ]
}
INVALID_ROUTING_MODEL

No entry screen found in the routing model. Expected a screen with no inbound edges as the entry screen.

In data channel flow json, when there is no entry screens, which do not have incoming screen

{
  "screens": [
    {
      "id": "FIRST_SCREEN",
      "layout": {
        "children": [
          {
            "type": "Footer",
            "on-click-action": {
              "name": "navigate",
              "next": {
                "name": "SECOND_SCREEN",
                "type": "screen"
              },
            }
          }
        ]
      }
    },
    {
      "id": "SECOND_SCREEN",
      "layout": {
        "children": [
          {
            "type": "Footer",
            "on-click-action": {
              "name": "navigate",
              "next": {
                "name": "FIRST_SCREEN",
                "type": "screen"
              },
            }
          }
        ]
      },
      ...
    }
  ]
}
INVALID_ROUTING_MODEL

No entry screen found in the routing model. Add a screen that is not used as the next screen in any of the navigate actions.

In data channel less flow json when there is no entry screen i.e. a screen which does not have an incoming screen.

{
        "routing_model": {
"FIRST_SCREEN":["SECOND_SCREEN"],
"SECOND_SCREEN":["FIRST_SCREEN"]
},
...
INVALID_ROUTING_MODEL

Loop detected in the routing model for screens: (screenIds).

In data channel flow json, when there is no loop between two screens.

{
        "routing_model": {
"FIRST_SCREEN":["SECOND_SCREEN"],
"SECOND_SCREEN":["FIRST_SCREEN"]
},
...
INVALID_ROUTING_MODEL

Invalid screen found in the routing model: (screenId).

In data channel flow json, when a screen is not present in destinations in routing_model.

{
  "routing_model": {"FIRST_SCREEN": []},
  "screens": [
    {
      "id": "FIRST_SCREEN",
      "terminal": true,
      ...
    },
    {
      "id": "SECOND_SCREEN",
      ...
    }
  ]
}
INVALID_ROUTING_MODEL

Number of branches exceeds the max limit of 10 for screen: (screenId).

In data channel flow json, a screen cannot have more than 10 outgoing screens.

{
        "routing_model": {
"FIRST_SCREEN":["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"],
...
},
...
INVALID_ROUTING_MODEL

Number of branches exceeds the max limit of 10 for screen: (screenId). Reduce navigate actions for the screen.

In data channel less flow json, when a screen has more than 10 outgoing screens calculated by ‘navigate’ actions

{
  "screens": [
    {
      "id": "FIRST_SCREEN",
      "layout": {
        "children": [
          {
            "type": "Footer1",
            "on-click-action": {
              "name": "navigate",
              "next": {
                "type": "screen",
                "name": "1",
                ...
          },
          {
            "type": "Footer2",
            "on-click-action": {
              "name": "navigate",
              "next": {
                "type": "screen",
                "name": "2",
                ...
          }, 
          ...  
          {
            "type": "Footer11",
            "on-click-action": {
              "name": "navigate",
              "next": {
                "type": "screen",
                "name": "11",
                ...
              },
          ...
  ]
}
INVALID_ROUTING_MODEL

Backward route [(destination)-)(source)] corresponding to forward route [(source)-)(destination)] is not allowed in the routing model. Only forward routes can be specified.

In data channel flow json, when there is a route from A -) B then B -) A.

{
        "routing_model": {
"FIRST_SCREEN":["SECOND_SCREEN", ...],
"SECOND_SCREEN":["FIRST_SCREEN", ...]
},
...
INVALID_ROUTING_MODEL

Missing direct route from screen '${source}' to screen '${destination}' in the routing model, while it exists in the navigate screen action of screen '${source}'.

In data channel flow json, when the routes formed by navigate actions are not present in the routing model supplied in the template

{
  "version": "2.1",
  "routing_model": {"FIRST_SCREEN":[]},
  "screens": [
    {
      "id": "FIRST_SCREEN",
      "layout": {
        "children": [
          {
            "type": "Footer",
            "on-click-action": {
              "name": "navigate",
              "next": {
                "type": "screen",
                "name": "SECOND_SCREEN"
              },
              ...
    },
    {
      "id": "SECOND_SCREEN",
      ...
    }
  ]
}
On-click Action Errors
Error Code	Error Message	Details	Sample Flow JSON
INVALID_ON_CLICK_ACTION_PAYLOAD

Missing Form component ${expression} for screen '${screenId}'.

Form binding does not exist

{
  "type": "Form",
  "name": "PASS_CUSTOM_VALUE",
  "children": [
    {
      "type": "Footer",
      "on-click-action": {
        "name": "complete",
        "payload": {
          "input": "${form.not_present}"
        }
      }
    }
  ]
}
INVALID_ON_CLICK_ACTION_PAYLOAD

Missing dynamic data '${expression}' in the data model for screen ${screenId}.

Missing dynamic data '${expression}' in the screen data model.

Data binding does not exist

{
  "type": "Form",
  "name": "PASS_CUSTOM_VALUE",
  "children": [
    {
      "type": "Footer",
      "on-click-action": {
        "name": "complete",
        "payload": {
          "input": "${data.not_present}"
        }
      }
    }
  ]
}
INVALID_ON_CLICK_ACTION_PAYLOAD

In the complete action payload, PhotoPicker can only be used if the value of the 'max-uploaded-photos' property doesn't exceed 1.

PhotoPicker’s 'max-uploaded-photos' property value has to be 1 to be used in top level of on-click-action payload

{
  "children": [
    {
      "type": "PhotoPicker",
      "name": "photo",
      "label": "PASS_CUSTOM_VALUE"
    },
    {
      "type": "Footer",
      "label": "PASS_CUSTOM_VALUE",
      "on-click-action": {
        "name": "complete",
        "payload": {
          "photo": "\${screen.FIRST_SCREEN.form.photo}"
        }
      }
    }
  ]
}
INVALID_ON_CLICK_ACTION_PAYLOAD

In the complete action payload, DocumentPicker can only be used if the value of the 'max-uploaded-documents' property doesn't exceed 1.

DocumentPicker 'max-uploaded-documents' property value has to be 1 to be used in top level of on-click-action payload

{
  "children": [
    {
      "type": "DocumentPicker",
      "name": "doc",
      "label": "PASS_CUSTOM_VALUE"
    },
    {
      "type": "Footer",
      "label": "PASS_CUSTOM_VALUE",
      "on-click-action": {
        "name": "complete",
        "payload": {
          "doc": "\${screen.FIRST_SCREEN.form.doc}"
        }
      }
    }
  ]
}
INVALID_ON_CLICK_ACTION_PAYLOAD

The PhotoPicker component's value is not allowed in the payload of the navigate action.

The native component's value is not allowed in the payload of the navigate action.

{
  "children": [
    {
      "type": "PhotoPicker",
      "name": "photo",
      "label": "PASS_CUSTOM_VALUE"
    },
    {
      "type": "Footer",
      "label": "PASS_CUSTOM_VALUE",
      "on-click-action": {
        "name": "navigate",
        "payload": {
          "photo": "\${screen.FIRST_SCREEN.form.photo}"
        }
      }
    }
  ]
}
INVALID_ON_CLICK_ACTION_PAYLOAD

The DocumentPicker component's value is not allowed in the payload of the navigate action.

The native component's value is not allowed in the payload of the navigate action.

{
  "children": [
    {
      "type": "DocumentPicker",
      "name": "doc",
      "label": "PASS_CUSTOM_VALUE"
    },
    {
      "type": "Footer",
      "label": "PASS_CUSTOM_VALUE",
      "on-click-action": {
        "name": "navigate",
        "payload": {
          "doc": "\${screen.FIRST_SCREEN.form.doc}"
        }
      }
    }
  ]
}
Complete Action Errors
Error Code	Error Message	Details	Sample Flow JSON
INVALID_COMPLETE_ACTION

On-click-action 'complete' can only be configured on a terminal screen.

Complete action can only be in terminal screens

{
  "version": "2.1",
  "screens": [
    {
      "id": "FIRST_SCREEN",
      "layout": {
        "type": "SingleColumnLayout",
        "children": [
          {
            "type": "Footer",
            "on-click-action": {
              "name": "complete",
              "payload": {}
            }
          }
        ]
      }
    }
  ]
}
Navigate Action Errors
Error Code	Error Message	Details	Sample Flow JSON
INVALID_NAVIGATE_ACTION_PAYLOAD

No data model is defined in the next screen ‘(screenName)’.

Navigate action’s target screen does not have a data model.

In data channel less flows, data passed from the current screen must be used on the navigate action’s target screen.

If it is not required on the next screen but some screen later in the Flow, use global dynamic data binding to access the data from version 4.0 and above.

{
  "version": "2.1",
  "screens": [
    {
      "id": "FIRST_SCREEN",
      ...
        {
          "on-click-action": {
            "name": "navigate",
            "next": {
              "type": "screen",
              "name": "SECOND_SCREEN"
            },
            "payload": {
              "name": "some name"
            }
          }
        }
    },
    {
      "id": "SECOND_SCREEN",
      "layout": {
        ...
      }
    }
  ]
}
INVALID_NAVIGATE_ACTION_PAYLOAD

Following fields are missing in the next screen's data model: [fieldNames].

Fields in the navigation action payload are missing in the next screen’s data model.

  "version": "2.1",
  "screens": [
    {
      "id": "FIRST_SCREEN",
      ...
        {
          "on-click-action": {
            "name": "navigate",
            "next": {
              "type": "screen",
              "name": "SECOND_SCREEN"
            },
            "payload": {
              "name": "some name"
            }
          }
        }
    },
    {
      "id": "SECOND_SCREEN",
      "data": {},
      "layout": {
        ...
      }
    }
  ]
}
INVALID_NAVIGATE_ACTION_PAYLOAD

Following fields are expected in the next screen's data model but missing in payload: [fieldNames].

Fields in the next screen’s data model are missing from navigate action’s payload.

{
  "version": "2.1",
  "screens": [
    {
      "id": "FIRST_SCREEN",
      ...
        {
          "on-click-action": {
            "name": "navigate",
            "next": {
              "type": "screen",
              "name": "SECOND_SCREEN"
            },
            "payload": {}
          }
        }
    },
    {
      "id": "SECOND_SCREEN",
      "data": {
          "name": {"type": "string"}
      },
      "layout": {
        ...
      }
    }
  ]
}
INVALID_NAVIGATE_ACTION_PAYLOAD

Schema of payload data at '${payloadField}' on screen '${payloadScreen}' is not matching with schema of data model field on screen '${dataModelScreen}'. Property is expecting '${dataModelFieldType}' but got '${payloadFieldType}'.

Type of field in navigate action payload do not match that in next screen’s data model

{
  "version": "2.1",
  "screens": [
    {
      "id": "FIRST_SCREEN",
      ...
        {
          "on-click-action": {
            "name": "navigate",
            "next": {
              "type": "screen",
              "name": "SECOND_SCREEN"
            },
            "payload": {
                 "name": 123
            }
          }
        }
    },
    {
      "id": "SECOND_SCREEN",
      "data": {
          "name": {"type": "string"}
      },
      "layout": {
        ...
      }
    }
  ]
}
INVALID_NAVIGATE_ACTION_NEXT_SCREEN_NAME

Same screen navigation is not allowed. Loop detected at [ScreenNames].

The source and target screen of navigate action are the same

{
  "version": "2.1",
  "screens": [
    {
      "id": "FIRST_SCREEN",
      ...
        {
          "on-click-action": {
            "name": "navigate",
            "next": {
              "type": "screen",
              "name": "FIRST_SCREEN"
            },
            "payload": {}
          }
        }
    }
  ]
}
INVALID_NAVIGATE_ACTION_NEXT_SCREEN_NAME

Unknown screen ids found: [screenNames].

The target screen of navigate action not present in flow json

{
  "version": "2.1",
  "screens": [
    {
      "id": "FIRST_SCREEN",
      ...
        {
          "on-click-action": {
            "name": "navigate",
            "next": {
              "type": "screen",
              "name": "not_present"
            },
            "payload": {}
          }
        }
    }
  ]
}
INVALID_NAVIGATE_ACTION_PAYLOAD

Schema of dynamic data '${payloadFieldValue}' is not matching schema of data model field '${payloadField}' on screen '${dataModelScreen}'. Property is expecting '${dataModelFieldType}' but got '${payloadFieldType}'.

The type of dynamic binding in action payload does not match that in data model of next screen

{
  "version":  "2.1",
  "screens":  [
    {
      "id":  "FIRST_SCREEN",
      "layout":  {
        "children":  [
          {
            "type": "Form",
            "children": [
              {
                "type": "TextInput",
                "name": "input"
              },
              {
                "type":  "Footer",
                "label":  "Done",
                "on-click-action":  {
                  "name":  "navigate",
                  "next": {
                    "type": "screen",
                    "name": "SECOND_SCREEN"
                  },
                  "payload":  {
                    "text": "${form.input}"
                  }
                }
              }
            ]
          }
        ]
      }
    },
    {
      "id":  "SECOND_SCREEN",
      "title":  "Test",
      "terminal":  true,
      "data": {
        "text": {
          "type": "boolean",
          "__example__": true
        }
      },
      ...
    }
  ]
}
INVALID_ON_CLICK_ACTION_PAYLOAD

Missing Form component ${expression} for screen '${screenId}'.

Form binding in action payload does not exist

{
  "version":  "2.1",
  "screens":  [
    {
      "id":  "FIRST_SCREEN",
      "layout":  {
        ...
        {
          "type": "Form",
          "children": [
            {
              "type":  "Footer",
              "label":  "Done",
              "on-click-action":  {
                "name":  "navigate",
                "payload":  {
                  "text": "${form.not_present}"
                }
              }
            }
          ]
        },
      }
    }
  ]
}
INVALID_ON_CLICK_ACTION_PAYLOAD

Missing dynamic data '${expression}' in the data model for screen ${screenId}.

Dynamic binding in action payload does not exist

TBD?

INVALID_ON_CLICK_ACTION_PAYLOAD

Dynamic binding in action payload does not exist in the data model of the navigate action’s target screen.

INVALID_ON_CLICK_ACTION_PAYLOAD

Invalid value found for the property '${propertyName}'.

INVALID_ON_CLICK_ACTION_PAYLOAD

Properties in navigate action payload differ from properties in data model of screen '${screenName}'.

INVALID_ON_CLICK_ACTION_PAYLOAD

Value of 'Form' component cannot be used in form binding.

Dynamic binding in action payload references to form value

{
  "version":  "2.1",
  "screens":  [
    {
      "id":  "FIRST_SCREEN",
      "layout":  {
        ...
        {
          "type": "Form",
          "name": "form_name",
          "children": [
            {
              "type":  "Footer",
              "label":  "Done",
              "on-click-action":  {
                "name":  "navigate",
                "payload":  {
                  "text": "${form.form_name}"
                }
              }
            }
          ]
        },
      }
    }
  ]
}
Screen Data Model Errors
Error Code	Error Message	Details	Sample Flow JSON
INVALID_SCREEN_DYNAMIC_DATA

Missing dynamic data '${expression}' in the screen data model.

dynamic data not present in data model

{
  "version": "2.1", 
  "screens": [
    {
      "id": "SCREEN_A",
      "title": "Test",
      "terminal": true,
      "layout": {
        "type": "SingleColumnLayout",
        "children": [
          {
            "type": "TextHeading",
            "text": "${data.screen_title}"
          }
        ]
      }
    }
  ]
}
INVALID_SCREEN_DYNAMIC_DATA

Expected '${dataModelPointer}' to be of type '${expectedPropertyType}'.

Type of dynamic data and type of its reference field in data model are not matched

{
  "version": "2.1", 
  "screens": [
    {
      "id": "SCREEN_A",
      "data": {
        "top": {
          "type": "object",
          "properties": {
              "secondLevel": {
                "type": "object",
                "properties": {
                  "target": {
                    "type": "boolean"
                  }
                }
              }
            }
        }
      },
      "layout": {
        "children": [
          {
            "type": "TextHeading",
            "text": "${data.top.secondLevel.target}"
          }
        ]
      }
    }
  ]
}
INVALID_SCREEN_DYNAMIC_DATA

Data model schema is invalid for '${expression}'. Missing schema for ${objectProperty}.

Required property of component’s field is not in schema defined in data model

{
  "version": "2.1",
  "screens": [
    {
      "id": "SCREEN_A",
      "data": {
        "products": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "id": {
                "type": "string"
              }
            }
          },
          "__example__": []
        }
      },
      "layout": {
        "type": "SingleColumnLayout",
        "children": [
          {
            "type": "Form",
            "children": [
              {
                "type": "CheckboxGroup",
                "name": "PASS_CUSTOM_VALUE",
                "data-source": "${data.products}"
              }
            ]
          }
        ]
      }
    }
  ]
}
INVALID_SCREEN_DATA

Property '__example__' is allowed only as a top level property of data model. Invalid entry: '(path to error)'.

‘__example__’ can only be present in the top level fields of the data model.

{
  "version": "2.1",
  "screens": [
    {
      "id": "SCREEN_A",
      "data": {
        "initial_values": {
          "type": "object",
          "properties": {
            "number": {
              "type": "number"
            },
            "__example__": {"number": 8553906697}
          },
          "__example__": {
            "number": 8553906697
          }
        }
      },
      ...
    }
  ]
}
INVALID_SCREEN_DATA

Missing the definition of property ‘type’.

Fields in data model must have ‘type’ property

{
  "version": "2.1",
  "screens": [
    {
      "id": "SCREEN_A",
      "data": {
        "name": {}
      },
      ...
    }
  ]
}
INVALID_SCREEN_DATA

Expected the property ‘type’ to be of type string.

The value of the ‘type’ property in the data model must be of type ‘string’.

{
  "version": "2.1",
  "screens": [
    {
      "id": "SCREEN_A",
      "data": {
        "name": {
           "type": 123
         }
      },
      ...
    }
  ]
}
INVALID_SCREEN_DATA

Missing the schema for property 'items' in array.

The schema of ‘array’ type must have ‘items’ property

{
  "version": "2.1",
  "screens": [
    {
      "id": "SCREEN_A",
      "data": {
        "name": {
          "type": "array",
          "__example__": []
        }
      },
      "layout": {
        "children": [...]
      }
    }
  ]
}
INVALID_SCREEN_DATA

Expected the property 'items' to be of type boolean or object.

The type of ‘items’ property can only be boolean or object

{
  "version": "2.1",
  "screens": [
    {
      "id": "SCREEN_A",
      "data": {
        "name": {
          "type": "array",
          "items": "string",
          "__example__": []
        }
      },
      "layout": {
        "children": [...]
      }
    }
  ]
}
INVALID_SCREEN_DATA

Invalid data model schema. Expected property '__example__' to be of type (type in schema), but found (actual type).

The type of ‘__example__’ property does not match schema definition

{
  "version": "2.1",
  "screens": [
    {
      "id": "SCREEN_A",
      "data": {
        "name": {
          "type": "number",
          "__example__": "123"
        }
      },
      "layout": {
        "children": [...]
      }
    }
  ]
}
INVALID_SCREEN_DATA

Global Dynamic data ‘(expression)’ on screen ROOT does not exist, but is used on screen (screenID).

The data, which dynamic binding expression refers to, does not exist

{
        "id": "MAIN",
        "title": "Title",
        "terminal": true,
        "layout": {
          "type": "SingleColumnLayout",
          "children": [
            {
              "type": "Footer",
              "label": "${screen.ROOT.form.intro_text.type}",
              "on-click-action": {
                "name": "complete",
                "payload": {}
              }
            }
          ]
        }
      }
Global dynamic data '${expression}' used on screen '${screenId}' for ${componentType} property '${property}' is invalid since screen '${screenId}' represents current screen. Convert expression to local referencing of the form ${data.(property)}.

Global dynamic data '${expression}' used on screen '${currentScreenId}' for ${componentType} property '${property}' is invalid since screen '${referencedScreenId}' is missing in the Flow JSON.

INVALID_SCREEN_DYNAMIC_DATA

${screen.ROOT.data.products.items.properties.title} on screen 'ROOT' for TextHeading property 'text' is invalid as 'items' is defined in an array schema in the data model.

When the type of property using dynamic data ({$data.val}) does not match the type specified in the data model.

For example, the TextHeading property ‘text’ expects a string value. If it is taking a dynamic data value whose type is an array, this error is returned.

{
   "version": "4.0",
   "screens": [
     {
       "id": "ROOT",
       "title": "Test",
       "data": {
         "products": {
           "type": "array",
           "items": {
             "type": "object",
             "properties": {
               "id": {"type": "string"},
               "title": {"type": "string"}
             }
           },
           "__example__": []
         }
       },
       "layout": {
         "type": "SingleColumnLayout",
         "children": [
           {
             "type": "Footer",
             "label": "PASS_CUSTOM_VALUE",
             "on-click-action": {
               "name": "navigate",
               "next": {
                 "type": "screen",
                 "name": "MAIN_SCREEN"
               },
               "payload": {}
             }
           }
         ]
       }
     },
     {
       "id": "MAIN_SCREEN",
       "title": "Test",
       "terminal": true,
       "layout": {
         "type": "SingleColumnLayout",
         "children": [
           {
             "type": "TextSubheading",
             "text": "${screen.ROOT.data.products.items.properties.title}"
           },
           {
             "type": "Footer",
             "label": "PASS_CUSTOM_VALUE",
             "on-click-action": {
               "name": "complete",
               "payload": {}
             }
           }
         ]
       }
     }
   ]
 }
INVALID_SCREEN_DYNAMIC_DATA

${expression} defined for screen '${screenId}' ${componentType} property '${componentProperty}' is invalid as its schema is missing in the data model.

When the type of property using dynamic data ({$data.val}) is missing in the data model.

INVALID_SCREEN_DYNAMIC_DATA

Expected '${dataModelPointer}' to be of one of these types: [string, object].

Properties like ‘error-message’ can only be of type string or object.

{
   "version": "4.0",
   "data_api_version": "3.0",
   "routing_model": {},
   "screens": [
     {
       "id": "screenA",
       "title": "Screen Title",
       "terminal": true,
       "data": {
           "error": {
             "type": "boolean",
             "__example__": true
           }
       },
       "layout": {
         "type": "SingleColumnLayout",
         "children": [
           {
             "type": "PhotoPicker",
             "name": "photo",
             "label": "Add ID proof",
             "error-message": "${data.error}"
           }
         ]
       }
     }
   ]
 }
Min Max Limit Violation Errors
Error Code	Error Message	Details	Sample Flow JSON
MAX_SCREENS_NUMBER

Maximum number of screens allowed per Flow is 100 but found (actualCount).

A Flow cannot have more than 100 screens.

A Flow with more than 100 screens.

{
  "version": "2.1",
  "screens": [
    {
      "id": "SCREEN_ONE",
       ...
    },
    ...
    {
      "id": "SCREEN_HUNDRED_ONE",
       ...
    }
  ]
}
MAX_EMBEDDED_LINK_PER_SCREEN

MAX_FOOTER_PER_SCREEN

MAX_IMAGE_PER_SCREEN

MAX_OPT_IN_PER_SCREEN

Maximum number of (componentName) allowed per screen is (maxAllowedCount) but found (actualCount).

Limit on the count of certain components that be added per screen is as follows-

Footer 1

EmbeddedLink 2

Image 3

OptIn 5

{
  "version": "2.1",
  "screens": [
    {
      "id": "screenA",
      "refresh_on_back": true,
      "layout": {
        "children": [
          {
            "type": "Footer",
            "label": "Submit",
            "on-click-action": {
               "name": "complete",
                "payload": {}
             }
           },
          {
            "type": "Footer",
            "label": "Submit",
            "on-click-action": {
               "name": "complete",
                "payload": {}
             }
           }
         ]
      }
    }
  ]
}
MIN_VALUE_GREATER_THAN_MAX

(min_attribute_name) cannot be greater than (max_attribute_name) for (component_type) (component_name).

Components that have a minimum and maximum attribute (eg. min / max length, min-selected-items / max-selected-items) should not allow the min attribute’s value to be greater than the max attribute’s value.

{
  "screens": [
    {
      "id": "FIRST_SCREEN",
      "layout": {
        "children": [
          {
            "type": "Form",
            "name": "PASS_CUSTOM_VALUE",
            "children": [
               {
                 "type": "CheckboxGroup",
                 "name": "cbg",
                 "min-selected-items": 3,
                 "max-selected-items": 2,
                 "data-source": [
                    {
                       "id":"1",
                       "title":"Title 1"
                     },
                     {
                       "id": "2", 
                       "title": "Title 2"
                     },
                     {
                       "id": "3", 
                       "title": "Title 3"
                     }
                   ]
                 }
               ]
            },
        ]
      }
    }
  ]
}
MINIMUM_VALUE_REQUIRED

MAXIMUM_VALUE_REQUIRED

The minimum value allowed for property '${propertyName}' is ${limit}.

The maximum value allowed for property '${propertyName}' is ${limit}.

Some attributes are required to have a value between a range (min,max).

For example, min-uploaded-photos in PhotoPicker must be between [0, 30].

{
  "screens": [
    {
      "id": "FIRST_SCREEN",
      "layout": {
        "children": [
          {
            "type": "PhotoPicker",
            "name": "ID_Proof",
            "min-uploaded-photos": -1,
            "max-uploaded-photos": 40,
            ...
          },
          ...
        ]
      }
    }
  ]
}
Data_api_version | Refresh_on_back errors
Error Code	Error Message	Details	Sample Flow JSON
MISSING_REQUIRED_PROPERTY

The property 'data_api_version' is required for data_exchange action.

Action data_exchange cannot be executed without a server endpoint.

Property ‘data_api_version’ indicates that Flow is connected to a server.

{
  "version": "2.1",
  "screens": [
    {
      "id": "screenA",
      "title": "screenTitle",
      "type": "SingleColumnLayout",
      "layout": {
        "children": [
          {
            "type": "Footer",
            "label": "Submit",
            "on-click-action": {
               "name": "data_exchange",
                "payload": {}
             }
           }
         ]
      }
    }
  ]
}
Missing data_api_version when using action data_exchange.

MISSING_REQUIRED_PROPERTY

The property 'routing_model' is required for property 'data_api_version'.

Action data_exchange cannot be executed without a routing_model.

{
  "version": "2.1",
  "screens": [
    {
      "id": "screenA",
      "title": "screenTitle",
      "layout": {
        "type": "SingleColumnLayout",
        "children": [
          {
            "type": "Footer",
            "label": "Submit",
            "on-click-action": {
               "name": "data_exchange",
                "payload": {}
             }
           }
         ]
      }
    }
  ]
}
INVALID_PROPERTY_VALUE

Property 'refresh_on_back' can be true only when property 'data_api_version' is set.

Data channel less flows i.e. Flows without an endpoint setup are not allowed to set property refresh_on_back as true.If a Flow does not have property ‘data_api_version’ set, it is considered a data channel less flow.

{
  "version": "2.1",
  "screens": [
    {
      "id": "screenA",
      "refresh_on_back": true,
      "layout": {
        "children": [...]
      }
    }
  ]
}
Naming Errors
Error Code	Error Message	Details	Sample Flow JSON
DUPLICATE_FORM_COMPONENT_NAMES

Duplicate name found for Form components: (duplicateName).

Components inside a Form must have unique names.

{
      "version": "2.1",
      "screens": [
        {
          "id": "screenA",
          "title": "Screen Title",
          "terminal": true,
          "layout": {
            "type": "SingleColumnLayout",
            "children": [
              {
                "type": "Form",
                "name": "form",
                "children": [
                  {
                    "name": "textInput",
                    "type": "TextInput",
                    "label": "Text 1"
                  },
                  {
                    "name": "textInput",
                    "type": "TextInput",
                    "label": "Text 2"
                  }
                ]
              }
              ...
            ]
          }        
        }
      ]
    }
DUPLICATE_FORM_COMPONENT_NAMES

Duplicate name found for Form components: (duplicateName).

Components inside a Form must have unique names inside all If and switch branches.

{
  "version": "4.0",
  "screens": [
    {
      "id": "PATH_SIMULATION",
      "layout": {
        "type": "SingleColumnLayout",
        "children": [
          {
            "type": "If",
            "then": [
              {
                "type": "OptIn",
                "name": "name"
              }
            ],
            "else": [
              {
                "type": "TextInput",
                "name": "name1"
              }
            ]
          },
          {
            "type": "Switch",
            "cases": {
              "case1": [
                {
                  "type": "DatePicker",
                  "name": "name"
                }
              ],
              "case2": [
                {
                  "type": "TextArea",
                  "name": "name1"
                }
              ]
            }
          },
          {
            "type": "Form",
            "children": [
              {
                "name": "name"
              },
              {
                "name": "name1"
              }
            ]
          }
        ]
      }
    }
  ]
}{
  "version": "4.0",
  "screens": [
    {
      "id": "PATH_SIMULATION",
      "layout": {
        "type": "SingleColumnLayout",
        "children": [
          {
            "type": "If",
            "then": [
              {
                "type": "OptIn",
                "name": "name"
              }
            ],
            "else": [
              {
                "type": "TextInput",
                "name": "name1"
              }
            ]
          },
          {
            "type": "Switch",
            "cases": {
              "case1": [
                {
                  "type": "DatePicker",
                  "name": "name"
                }
              ],
              "case2": [
                {
                  "type": "TextArea",
                  "name": "name1"
                }
              ]
            }
          },
          {
            "type": "Form",
            "children": [
              {
                "name": "name"
              },
              {
                "name": "name1"
              }
            ]
          }
        ]
      }
    }
  ]
}
DUPLICATE_SCREEN_IDS

Duplicate screen id found: (duplicate screen ID).

Screen IDs must be unique.

{
      "version": "2.1",
      "screens": [
        {
          "id": "screenA",
           ...    
        },
        {
          "id": "screenA",
           ...    
        }
      ]
  }
SCREEN_ID_IS_RESERVED_KEYWORD

Screen id cannot be 'success' since it is a reserved keyword.

‘success’ is a reserved keyword for receiving termination response’s next screen in data_exchange action.

{
      "version": "2.1",
      "screens": [
        {
          "id": "success",
           ...    
        }
      ]
  }
Terminal Screen Errors
Error Code	Error Message	Details	Sample Flow JSON
MISSING_FOOTER_ON_TERMINAL_SCREEN

Footer component is missing on terminal screens: (screen IDs).

Terminal screen must have a Footer component to be able to terminate the Flow.

{
      "version": "2.1",
      "screens": [
        {
          "id": "screenA",
          "title": "Screen Title",
          "terminal": true,
          "layout": {
            "type": "SingleColumnLayout",
            "children": [
              {
                "type": "TextHeading",
                "text": "Heading"
              }
            ]
          }        
        }
      ]
  }
MISSING_TERMINAL_SCREEN

Terminal screen is required but not provided.

At least one terminal screen must exist in a Flow.

{
      "version": "2.1",
      "screens": [
        {
          "id": "screenA",
          "title": "Screen Title",
          "layout": {
            "type": "SingleColumnLayout",
            "children": [..]
          }        
        }
      ]
  }
Optional Form
Error Code	Error Message	Details	Sample Flow JSON
COMPONENTS_OUTSIDE_FORM

Component '${components.join(`', '`)}' is not allowed outside Form when Form component is present.

Components '${components.join(`', '`)}' are not allowed outside Form when Form component is present.

Any Form component cannot exist outside Form when Form exists on the screen.

Form components are the ones which can take user inputs.

{
    "version": "4.0",
    "screens": [
      {
        "layout": {
          "type": "SingleColumnLayout",
          "children": [
            {
              "type": "TextInput",
              "name": "path2",
              "label": "Path"
            },
            {
              "type": "Form",
              "name": "flow_path",
              "children": [
                {
                  "type": "TextInput",
                  "name": "path",
                  "label": "Path"
                },
                ...
            }
          ]
       }
    }
}
Footer Errors
Error Code	Error Message	Details	Sample Flow JSON
MISSING_FOOTER_IN_IF_ELSE_BRANCHES

Missing Footer inside one of the 'If' component branches. Branch 'else' should exist and contain one Footer.

There is a footer inside ‘then’ branch of IF component, which does not have ‘else’ branch

{
    "version": "4.0",
    "screens": [
      {
        "id": "PATH_SIMULATION",
        "layout": {
          "type": "SingleColumnLayout",
          "children": [
            {
              "type": "If",
              "condition": "\${data.ti}",
              "then": [
                {
                  "type": "Footer",
                  "label": "PASS_CUSTOM_VALUE",
                  "on-click-action": {
                    "name": "complete",
                    "payload": {}
                  }
                }
              ]
            }
          ]
        }
      }
    ]
  }
MISSING_FOOTER_IN_IF_ELSE_BRANCHES

Footer component must be present in all branches of 'If' component if it exists in any one branch.

There is a footer inside ‘then’ branch of IF component, but ‘else’ branch does not have

{
    "version": "4.0",
    "screens": [
      {
        "id": "PATH_SIMULATION",
        "title": "Title",
        "terminal": true,
        "data": {
          "ti": {"type": "boolean", "__example__": true}
        },
        "layout": {
          "type": "SingleColumnLayout",
          "children": [
            {
              "type": "If",
              "condition": "\${data.ti}",
              "then": [
                {
                  "type": "TextInput",
                  "label": "PASS_CUSTOM_VALUE",
                  "name": "PASS_CUSTOM_VALUE"
                }
              ],
              "else": [
                {
                  "type": "Footer",
                  "label": "PASS_CUSTOM_VALUE",
                  "on-click-action": {
                    "name": "complete",
                    "payload": {}
                  }
                }
              ]
            }
          ]
        }
      }
    ]
  }
MISSING_FOOTER_IN_SWITCH_BRANCHES

Footer component must be present in all switch cases if it exists in one of the cases.

Part of branches of Switch component have footer, but others do not have

{
    "version": "4.0",
    "screens": [
      {
        "id": "PATH_SIMULATION",
        "layout": {
          "type": "SingleColumnLayout",
          "children": [
            {
              "type": "Switch",
              "value": "\${data.ti}",
              "cases": {
                "case1": [],
                "case2": [
                  {
                    "type": "Footer",
                    "label": "PASS_CUSTOM_VALUE",
                    "on-click-action": {
                      "name": "complete",
                      "payload": {}
                    }
                  }
                ],
                "case3": [
                  {
                    "type": "TextInput",
                    "label": "PASS_CUSTOM_VALUE",
                    "name": "PASS_CUSTOM_VALUE"
                  }
                ]
              }
            }
          ]
        }
      }
    ]
  }
MORE_THAN_ONE_FOOTER

Maximum number of Footer component allowed per screen is 1.

Screen contains more than one footer considering all branches of if and switch components.

{
    "version": "4.0",
    "screens": [
      {
        "id": "PATH_SIMULATION",
        "layout": {
          "type": "SingleColumnLayout",
          "children": [
            {
              "type": "Switch",
              "value": "${data.ti}",
              "cases": {
                "case1": [
                  {
                    "type": "Footer",
                    "label": "PASS_CUSTOM_VALUE",
                    "on-click-action": {
                      "name": "complete",
                      "payload": {}
                    }
                  }
                ],
                "case2": [
                  {
                    "type": "Footer",
                    "label": "PASS_CUSTOM_VALUE",
                    "on-click-action": {
                      "name": "complete",
                      "payload": {}
                    }
                  }
                ]
              }
            },
            {
              "type": "Footer",
              "label": "PASS_CUSTOM_VALUE",
              "on-click-action": {
                "name": "complete",
                "payload": {}
              }
            }
          ]
        }
      }
    ]
  }
"IF" Component Errors
Error Code	Error Message	Details	Sample Flow JSON
INVALID_PROPERTY_VALUE

Expected array to contain at least one component.

Property ‘then’ inside ‘If’ component must contain at least one component to display if property ‘condition’ is true.

{
    "version": "4.0",
    "screens": [
      {
        "id": "SCREEN_A",
        "layout": {
          "type": "SingleColumnLayout",
          "children": [
            {
              "type": "If",
              "condition": "${data.val}",
              "then": []
            }
          ]
        }
      }
    ]
  }
INVALID_PROPERTY_VALUE

Expected property 'condition' to contain at least one operand.

Property ‘condition’ cannot be blank or empty. It should either contain a valid expression or a single boolean operand.

{
    "version": "4.0",
    "screens": [
      {
        "id": "SCREEN_A",
        "layout": {
          "type": "SingleColumnLayout",
          "children": [
            {
              "type": "If",
              "condition": " ",
              "then": [...]
            }
          ]
        }
      }
    ]
  }
INVALID_PROPERTY_VALUE

Found invalid empty parentheses at column (col).

Property ‘condition’ cannot be blank or empty. It should either contain a valid expression or a single boolean operand.

{
    "version": "4.0",
    "screens": [
      {
        "id": "SCREEN_A",
        "layout": {
          "type": "SingleColumnLayout",
          "children": [
            {
              "type": "If",
              "condition": "( )",
              "then": [...]
            }
          ]
        }
      }
    ]
  }
INVALID_PROPERTY_VALUE

An operator cannot not have literals on both sides. Found invalid syntax at column (col).

Property ‘condition’ cannot have literals on both ends of an operator since that condition always evaluates to the same result.

{
    "version": "4.0",
    "screens": [
      {
        "id": "SCREEN_A",
        "layout": {
          "type": "SingleColumnLayout",
          "children": [
            {
              "type": "If",
              "condition": "573 == 376",
              "then": [...]
            }
          ]
        }
      }
    ]
  }
INVALID_PROPERTY_VALUE

Missing opening parenthesis for the closing parenthesis at column (col).

Missing closing parenthesis.

Missing closing quote for string.

Missing operator between '${firstValue}' and '${secondValue}'.

Invalid operator '${operator}' found at column (col).

Invalid operand format '${operand}' found at column (col).

Unexpected character '${character}' found at column (col).

Wrong positioning of operator '${operator}'. It cannot be used in concatenation with '${firstValue}'.

"Wrong positioning of operator '||'. It cannot be used after '${data.string_value}' at column 21."

Type mismatch in an equality operation between '${firstValue}' and '${secondValue}' at column (col).

Invalid literal '${literal}'.

Missing operand after last operator '${operator}'.

Property ‘condition’ should have valid expression syntax.

{
    "version": "4.0",
    "screens": [
      {
        "id": "SCREEN_A",
        "layout": {
          "type": "SingleColumnLayout",
          "children": [
            {
              "type": "If",
              "condition": "))${data.value_1}((",
              "then": [...]
            }
          ]
        }
      }
    ]
  }
INVALID_PROPERTY_VALUE

A numerical value is expected to follow the negative sign.

{
    "version": "4.0",
    "screens": [
      {
        "id": "SCREEN_A",
        "layout": {
          "type": "SingleColumnLayout",
          "children": [
            {
              "type": "If",
              "condition": "${data.val} ) -a",
              "then": [...]
            }
          ]
        }
      }
    ]
  }
INVALID_PROPERTY_VALUE

Expected single operand to be a boolean.

{
    "version": "4.0",
    "screens": [
      {
        "id": "SCREEN_A",
        "layout": {
          "type": "SingleColumnLayout",
          "children": [
            {
              "type": "If",
              "condition": "((${data.string_value}))",
              "then": [...]
            }
          ]
        }
      }
    ]
  }
INVALID_PROPERTY_VALUE

The only operand is a literal value. Expected single operand to be a boolean.

{
    "version": "4.0",
    "screens": [
      {
        "id": "SCREEN_A",
        "layout": {
          "type": "SingleColumnLayout",
          "children": [
            {
              "type": "If",
              "condition": "true",
              "then": [...]
            }
          ]
        }
      }
    ]
  }
Switch Component Errors
Error Code	Error Message	Details	Sample Flow JSON
MISSING_FOOTER_IN_SWITCH_BRANCHES

Footer component must be present in all switch cases if it exists in any one case.

Part of branches of Switch component have footer, but others do not have

{
    "version": "4.0",
    "screens": [
      {
        "id": "PATH_SIMULATION",
        "layout": {
          "type": "SingleColumnLayout",
          "children": [
            {
              "type": "Switch",
              "value": "${data.ti}",
              "cases": {
                "case1": [],
                "case2": [
                  {
                    "type": "Footer",
                    "label": "Submit",
                    "on-click-action": {
                      "name": "complete",
                      "payload": {}
                    }
                  }
                ],
                "case3": [
                  {
                    "type": "TextInput",
                    "label": "input",
                    "name": "Add name"
                  }
                ]
              }
            }
          ]
        }
      }
    ]
  }
Native Component Errors
Error Code	Error Message	Details	Sample Flow JSON
NATIVE_COMPONENT_IN_FORM_INIT_VALUES

Property 'init-values' should not contain value for components: [(native components’ type)].

User tries to initialize native components via the “init-values” property of Form component.

However, native components like PhotoPicker and DocumentPicker cannot be initialized via init-values.

{
    "version": "4.0",
    "screens": [
      {
        "id": "MAIN_SCREEN",
        "layout": {
          "type": "SingleColumnLayout",
          "children": [
            {
              "type": "Form",
              "name": "PASS_CUSTOM_VALUE",
              "init-values": {"photo": "abc", "doc": "efg"},
              "children": [
                {
                  "type": "PhotoPicker",
                  "name": "photo",
                  "label": "Add your picture"
                },
                {
                  "type": "DocumentPicker",
                  "name": "doc",
                  "label": "Add ID proof"
                }
              ]
            },
            ......
          ]
        }
      }
    ]
  }
INVALID_ON_CLICK_ACTION_PAYLOAD

The value of ${componentType} component is not allowed in the payload of navigate action.

Values of native components (PhotoPicker and DocumentPicker) cannot be passed to any other screen using navigate action payload.

Use global data to access native components from one screen in another.

{
  "screens": [
    {
      "id": "FIRST_SCREEN",
      "layout": {
        "children": [
          {
                  "type": "PhotoPicker",
                  "name": "photoPicker",
                  "label": "PASS_CUSTOM_VALUE"
          },
          {
            "type": "Footer",
            "on-click-action": {
              "name": "navigate",
              "next": {
                "name": "SECOND_SCREEN",
                "type": "screen"
              },
              "payload": {
                "photo": "${form.photoPicker}"
              }
            }
          }
        ]
      }
    },
    {
      "id": "SECOND_SCREEN",
      ...
    }
  ]
}
INVALID_ON_CLICK_ACTION_PAYLOAD

The value of following components must be a top-level string in complete and data_exchange on-click-action payload: : [PhotoPicker, DocumentPicker].

PhotoPicker and DocumentPicker component value can only be used as a top-level string property in the on-click-action payload.

{
  "children": [
    {
      "type": "DocumentPicker",
      "name": "doc",
      "label": "Add ID proof"
    },
    {
      "type": "Footer",
      "label": "Submit",
      "on-click-action": {
        "name": "navigate",
        "payload": {
          "doc": {"first": {"second": ["in_array", "${screen.FIRST_SCREEN.form.doc}"]}}
        }
      }
    }
  ]
}
{
  "children": [
    {
      "type": "PhotoPicker",
      "name": "photo",
      "label": "Add your picture"
    },
    {
      "type": "Footer",
      "label": "Submit",
      "on-click-action": {
        "name": "navigate",
        "payload": {
          "photo": {"first": {"second": ["in_array", "${screen.FIRST_SCREEN.form.photo}"]}}
        }
      }
    }
  ]
}
INVALID_ON_CLICK_ACTION_PAYLOAD

PhotoPicker can only be used in complete action payload if value of property 'max-uploaded-photos' doesn't exceed 1. Default value is 30.

DocumentPicker can only be used in complete action payload if value of property 'max-uploaded-documents' doesn't exceed 1. Default value is 30.

If the property ‘max-uploaded-photo’ or ‘max-uploaded-documents’ have not been defined in the component, default value of 30 is considered.

{
  "screens": [
    {
      "id": "FIRST_SCREEN",
      "layout": {
        "children": [
          {
             "type": "PhotoPicker",
             "name": "photoPicker",
             "label": "photoLabel"
          },
          {
             "type": "DocumentPicker",
             "name": "DocumentPicker",
             "label": "DocLabel",
             "max-uploaded-documents": 3
          },
          {
            "type": "Footer",
            "on-click-action": {
              "name": "complete",
              "payload": {
                "photo": "${form.photoPicker}",
                "doc": "${form.DocumentPicker}"
              }
            }
          }
        ]
      }
    }
  ]
}
INVALID_ON_CLICK_ACTION_PAYLOAD

Complete action payload can contain either a single PhotoPicker or a single DocumentPicker component.

{
  "screens": [
    {
      "id": "FIRST_SCREEN",
      "layout": {
        "children": [
          {
             "type": "PhotoPicker",
             "name": "photoPicker",
             "label": "photoLabel"
          },
          {
             "type": "DocumentPicker",
             "name": "DocumentPicker",
             "label": "DocLabel",
             "max-uploaded-documents": 3
          },
          {
            "type": "Footer",
            "on-click-action": {
              "name": "complete",
              "payload": {
                "photo": "${form.photoPicker}",
                "doc": "${form.DocumentPicker}"
              }
            }
          }
        ]
      }
    }
  ]
}
Action errors
Error Code	Error Message	Details	Sample Flow JSON
INVALID_ACTION_PAYLOAD_PROPERTY

The following property (property) does not exist in the screen data model

The property for the payload as part of an action is not valid. This means the value for that property could not be parsed, for example if it references a property that doesn't exist in the data model.

{
  ...
  "data": {},
  ...
  "on-unselect-action": {
    "name": "update_data",
    "payload": {
      "property": "`${data.value_that_does_not_exist_in_data_model}`"
    }
  },
}