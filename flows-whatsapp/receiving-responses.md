Receiving Flow Response
Upon flow completion a response message will be sent to the WhatsApp chat. You will receive it in the same way as you receive all other messages from the user - via message webhook. response_json field will contain flow-specific data.

The structure of flow-specific data is controlled by Flow JSON or, in case you are using Endpoint for your flow, by final response payload from endpoint. See Response Message Webhook reference page for more details.

The Flow response does not include the Flow ID. You can include a custom field in your Flow payload or an identifier in the flow_token field to identify the corresponding Flow.

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