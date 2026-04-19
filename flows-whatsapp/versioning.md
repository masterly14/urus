Versioning
Versioning allows you to control the details of the services you interact with so you can maintain stability for your Flows even as functionality is added and modified. This document explains the different APIs you can specify versions for and how they work for your Flows.

Overview
WhatsApp Flows allows you to indicate the following versions:

Flow JSON version controls the implementation and parameters used with Flow components and layouts.
Message version allows you to set the version for the message payload.
Data API version indicates which API you want to use for encryption and payload format for your endpoint (only applicable for endpoint Flows).
Version Formats
Version	Type	Format	Example
Flow JSON

string

{major}.{minor}

1.9

Data API

string

{major}.{minor}

1.3

Message

integer

{int}

1

Major versus minor versions
Adapting the guidance provided by Semantic Versioning (see semver.org), version numbers adhere to the following rules:

Major versions are incremented whenever there is a "breaking change". A "breaking change" is one where existing code will not function as expected given the same inputs as before (e.g., a field being removed or functional behavior being altered).
Minor versions are incremented for any other material change where existing inputs continue to function as expected (e.g., adding new paremeters or functionality that does not affect existing behavior).
Later versions (higher version numbers) will include all features and functionality present in previous versions unless explicitly marked as deprecated.
Version numbers are incremented separately, not as a single decimal number. For example the version after 1.9 is 1.10 (not 2.0).
After a major version increase (e.g., a breaking change to 1.5 leads to the release of version 2.0), new changes will be added to the latest major version. This means that new (non breaking) functionality will be added as version 2.1 and there will not be a version 1.6.
Example timeline
The following is an example timeline of changes made to an API using the {major}.{minor} syntax, starting from an initial version of 1.0.

Change	Version Change
Add a new parameter

1.0 -> 1.1

Add new non-breaking functionality

1.1 -> 1.2

Deprecate and remove functionality

1.2 -> 2.0

Add a new layout type

2.0 -> 2.1

Add a new component

2.1 -> 2.2

Breaking behavior change

2.2 -> 3.0

Early Release Versions
The early release versions are intended to allow early integration and once all the client devices suport the version, we will remove early release designation from the version.

Versions marked as "early release" work in the same way as standard versions, with only difference being that they are not yet supported across all the client devices. This means that some of the Flow messages with this version might not be deliverable to all the client devices (the 131026 Message Undeliverable error will be returned in the webhook)

Version support and lifecycle
In the process of improving functionality and responding to external requirements, versions may be frozen or expired after launch.

To minimize upgrading effort for Flow developers, the goal is to support viable versions and provide notice for migration when a version's state changes.

States
The different states a version can have are as follows:

Frozen: When a version is frozen, publishing a Flow that targets this version is prohibited. This means that any Flow relying on this version can no longer be created or updated as the publishing step will fail. However, existing Flows that target a frozen version are still able to be sent to customers and customers are still able to open Flows targeting a frozen version.
Expired: When a version is expired, it is no longer able to be sent to customers, and any Flows targeting an expired version are no longer able to be opened by the customer.
Target support schedule
The changelog documentation page will be updated with dates for new versions and before a version freezes or expires.

In general, the period before freeze or expiry will be 90 days from the release of a new version - but not all versions will start the freeze notice when a new version is introduced.

Circumstances may require that a version be frozen or expired in less than 90 days, and the "freezing" period may be skipped entirely in cases where a version needs to expire as soon as possible.

Please refer to the changelog for details of available versions and freeze/expiry dates.

Examples
General support timeline
In this example, a new major version (2.0) is released 2 months after the first release (1.0). This example shows what our general support timeline is.

Date	Event
1-Jan-2024

Version 1.0 launches

1-Mar-2024

Version 2.0 launches

1-Mar-2024

Notice period for 1.0 being frozen begins

31-May-2024

Version 1.0 is frozen. No new Flows can be published targeting 1.0

Reduced timeline due to security vulnerability
In this example, a security vulnerability is found in a specific minor version (1.1) requiring that the version be expired as quickly as possible to keep users safe. In this scenario, the version is never frozen, but instead skips directly to being expired for security reasons.

Date	Event
1-Dec-2023

Version 1.1 launches

31-Dec-2023

Security vulnerability in 1.1 discovered

31-Dec-2023

Version 1.2 launches, fixing the security bug

1-Jan-2024

Notice period for 1.0 being expired begins

31-Mar-2024

Version 1.0 is expired. No Flows can be sent or opened targeting 1.0