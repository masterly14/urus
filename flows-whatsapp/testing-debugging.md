Testing and Debugging Flows
There are multiple options available to developers to test and debug their flows.

To test and verify that flow works as expected developers can use:

Interactive preview
Draft flow message
To debug any issues with the flow developers can use:

Action tab in the Flow Builder
Endpoint health check
Test flow using the interactive preview

Interactive preview allows easy testing of the flow throughout the development process. Interactive preview triggers the same actions as the real device would, and if the flow has an endpoint configured it will send encrypted requests to the endpoint. To start interactive prevew:

Navigate to the Flows page in WA Account Manager and click on any Flow.

Trigger the interactive preview by clicking on settings menu in the Preview section of the Flow Builder and enabling Interactive mode toggle.

In the modal that appears, select the phone number, enter any string as Flow token and choose how to Request data on first screen.

You can now interact and complete the flow in the preview. Each action will be logged in the Action tab on the bottom of the editor where you can see more details. If the Flow is using an endpoint each data_exchange action will trigger the request to the endpoint. Full request and response are also visible in Action tab.

Send draft flow to your device

Before you publish your flow you can also send it and test it on a real device. Flow messages sent in draft mode show a warning banner on the device. Once a Flow is published this warning is not displayed.

Ensure you first send a message from your test device to the sender number. This is to make sure that you are within the 24-hour customer service window to receive the message. Learn more

Navigate to the Flows page in WA Account Manager and click on any Flow in Draft state.

In the Flow Builder select three dot menu in the top right corner of the screen and select Send option.

In the modal select Sender number from the list. As the Recipient phone number, enter the phone number of your test device.

Enter any string as a Flow token (TBC link to learn more about flow tokens here), select the Request Data option (TBC link learn more about Providing data for first screen) and click on Send.

You should receive a message with a Flow attached to your device and be able to test the Flow.

Draft messages can also be sent via API by setting mode parameter to draft.

Debug Flow actions using Actions section of Builder

When the Interactive preview is enabled each Flow action is logged in the Actions tab at the bottom of the code editor in the Flow Builder.

Flows without endpoint

For Flows without an endpoint the Action tab will show:

navigate actions including any data passed between the screens
back action when user clicks on back button
complete action with the full payload submitted at the Flow completion
Flows with endpoint

For Flows with an endpoint the Action tab will show all the actions:

init action with initial data returned by the endpoint
navigate actions including any data passed between the screens
data_exchange actions with HTTP status code, unencrypted request send to the endpoint and unencrypted response received from it.
back action when user clicks on back button
complete action with the full payload submitted at the Flow completion
Debug endpoint configuration and encryption setup using Health Check

The Health Check allows users to verify that the endpoint health check ping request and encryption are working correctly.

Endpoint Health Check is accessible from the Flow Builder, from the three dot menu in top right corner of the screen. Select Setup under the Endpoint section. In the modal select Health check step and click on Run Check button to trigger the check.

Health Check triggers a ping against the provided endpoint URI and if there's an error, it returns detailed error and resolution information.

It detects various issues such as:

Missing/incorrect configuration: It checks whether all the pre-requisites are set up correctly. For example whether the public key is uploaded, or whether the endpoint URI is set.
Endpoint not being reachable or responding correctly: It checks whether the provided endpoint URI is reachable from the internet, whether it is responsive, and whether it returns expected status code.
Encryption: It checks whether the response is encrypted, whether it is encrypted with the correct key, and whether it is base64 encoded.
Payload: It checks whether the response payload is as expected.
See Also
See following reference guides for additional information:

List of all Flow error codes
Endpoint Error notification request