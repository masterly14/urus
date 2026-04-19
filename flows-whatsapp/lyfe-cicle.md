Lifecycle of a Flow
Flows can exist in a variety of states during their lifetime, with each state conveying different requirements, abilities, and limitations. This article outlines the different states that exist, how a Flow transitions into each state, and what each state means for developers building and sending Flows.


Business-set Flow states
Most common states are the result of API calls, such as creating or publishing a Flow. This section covers the various states that you have control over as a business.

Draft
When a Flow is initially created, it enters the "Draft" state which indicates that the Flow is actively being modified.

While in the Draft state, the Flow is only able to be sent for testing, and also has the ability to be fully deleted if no longer needed.

A banner is shown at the top of the Flow when viewed by a user in Draft state.

Next states: Deleted, Published

Deleted
Technically this is not a "state" of a Flow because this represents a Flow that no longer exists. However, it's important to note that Flows may be deleted, but only if they are in the Draft state.

You can delete a Flow using Flow Builder.

Next states: None (terminal)

Published
Once a Flow is ready to be sent, it transitions from the Draft state to the Published state. This allows it to be sent to real users rather than just for testing.

After a flow has been published, it is possible to make some changes and make the flow "Draft". Please consider this option for some small changes and fixed, rather than significant changes.

There are the following alternatives to edit a flow after publishing:

Edit flow metadata or flow json. This will put the flow back to the "Draft". Old messages will have previous content, but the new messages will reflect the changes. Consider this for some small fixes.
In case you need to change the flow significantly, please consider creating a new Flow that clones the existing one (using the clone_flow_id field).
Since you cannot delete published flow, deprecate it instead using the /deprecate API call.
Next states: Draft, Deprecated, Throttled

Deprecated
Once a Flow enters the Deprecated state, it can no longer be sent to real users. Keep in mind that a deprecated Flow may still be present on users' devices and you may still see responses from the deprecated Flow.

Next states: None (terminal)

System-set Flow States
This section covers the states that can only be entered based on WhatsApp monitoring determining that there is an issue or that an issue has been resolved.

Throttled
In the case that WhatsApp monitoring detects that the endpoint or screen navigations for your Flow are unhealthy, it transitions the Flow to a Throttled state. A throttled Flow can still be opened and sent, however sending is limited to 10 messages per hour.

If your Flow enters the Throttled state and you need help diagnosing the issue, start by opening a support case using the Support Portal.

If WhatsApp monitoring detects an improvement in the health of the Flow's endpoint, the Flow will be transitioned out of the Throttled state and back into the Published state.

Next states: Published, Deprecated, Blocked

Blocked
If a Flow has entered the Throttled state and WhatsApp monitoring detects that the health of the provided endpoint has deteriorated even further, the Flow will be transitioned into the Blocked state. This is to prevent a degraded user experience for WhatsApp Flows.

While in the Blocked state, the Flow cannot be sent by the business and cannot be opened by users. WhatsApp monitoring will continue to check the health of the endpoint, and upon improvement the Flow will be transitioned back to Throttled and then to Published state.

Next states: Deprecated, Throttled

Editing published flow
After a flow has been published, some changes still might be required to this flow. We allow to modify published flow by updating the metadata or flow json. After that the flow will be in the "Draft" state again.

It's very important to understand that the old cloning functionality still works the same way as before. You can always move your progress to a new flow by cloning the current one. It's your decision whether you want to make changes in the current flow or create a new one by cloning, depending on what fits better.

Flow messages that have been already sent to the WhatsApp users will not reflect the updates made to the flow. Only the new messages sent after the flow is published again will have the new version of the flow json. We support up to 5 last versions. Older flow versions will be deprecated.

It is critically important to keep the new flow json in sync with the flow endpoint if it’s been used. Breaking changes to the flow json will break the whole flow experience if the flow data doesn’t correspond to the endpoint contract.

Quality features like flow endpoint webhook notifications, error rate and latency metrics will only measured for the last published flow version.

Restrictions
Some old flows still don't support editing. You can create the new flow by cloning the old one, and the new flow will support editing.
Flows editing is only available for Business Accounts that do not have OnPrem phone numbers linked to them. If you have such numbers in the Business Account, remove them, and flows editing will be available for new flows.
Example Flow Lifecycles
To illustrate how Flows might transition through the various states, here are some real-life examples of the stages and events leading to transitions.

A successful Flow
In this example, we publish a Flow and it continues to run with no issues. One day it may be deprecated, but it has not entered that state yet.

State	Event	Action	New state
Create a new Flow

Create

Draft

Draft

Update the Flow JSON content

Update JSON

Draft

Draft

Update the data_channel_uri

Update

Draft

Draft

Decide that the Flow is ready for production

Publish

Published

A Flow with health issues
In this example, we publish a Flow that has intermittent health issues with the provided endpoint. WhatsApp monitoring detects problems, recoveries, and then further problems. Finally, health is fully restored.

State	Event	Action	New state
Create a new Flow

Create

Draft

Draft

Update the Flow JSON content

Update JSON

Draft

Draft

Decide that the Flow is ready for production

Publish

Published

Published

WhatsApp monitoring detects health issues with the provided endpoint or screen navigations for your Flow

Throttle

Throttled

Throttled

WhatsApp monitoring detects the endpoint is healthy

Unthrottle

Published

Published

WhatsApp monitoring detects health issues again

Throttle

Throttled

Throttled

WhatsApp monitoring detects health has deteriorated further

Block

Blocked

Blocked

WhatsApp monitoring detects the endpoint is healthy

Unblock

Throttled

Throttled

WhatsApp monitoring detects the endpoint is still healthy

Unthrottle

Published

A Flow that never makes it to production
In this example, we work on a Flow but decide that we no longer need it. This Flow never ends up being visible to real users.

State	Event	Action	New state
Create a new Flow

Create

Draft

Draft

Update the Flow JSON content

Update JSON

Draft

Draft

Update the data_channel_uri

Update

Draft

Draft

Decide that the Flow isn't needed anymore

Delete

Deleted