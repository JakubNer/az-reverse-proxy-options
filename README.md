# Adding Flexibility to an API on Azure

In this write-up we'll explore usage of several Azure offerings in implementing an HTTP API, whereby the API is:

- geo-redundant for speed, availability, and safe-deployments
- throttle-able &mdash; controlling costs
- terminates a Json Web Token (JWT) on the perimeter &mdash; freeing trusted internal services from authorizations
- provides a placeholder for request and response payload rewrites &mdash; an API contract façade
- abstracts concrete service location via URL rewrites

In other words, the API is static to the outside but flexible with respect to implementation.

The intention is to think through three Azure offerings and see how they can be of help in saving us implementation time:

- Azure Front Door
- Azure API Management
- Azure Application Gateway



Consider an incoming HTTP request to serve some business need.  We want the implementation of this business logic to benefit from of all of the above value propositions; which cross-cut our API surface, without coupling to our business-logic implementation.



![](./assets/intro.png)



## What Is This?

This is a motivational article and not a detailed step-by-step.

Although I do provide screenshots from the Azure Portal as to the relevant configurations of Azure offerings, these are merely prescriptive and aren't fully elaborated on.

In this write-up we do consider custom JWT termination as well as a custom request body transformation &mdash; both of which require coding.  We explore where this code is hooked-in, in relation to Azure offerings.

It's expected that the reader is familiar with Node.js and Express.js middleware.  The write-up intermingles JavaScript code examples for middleware transformations where needed.  These transformations are abstracted by HTTP calls &mdash; I serve these with Azure Functions, but that's just for simplicity and ease.



## Custom Cross-Cutting Transformations

We leverage throttling and geo-redundancy as implemented by Microsoft on our behalf &mdash; in the Azure offerings.

However, JWT termination and our request payload transform are custom.  We will call JavaScript code from the front-matter of our API stack to perform these, before requests are forwarded to our internal service.

We do these on the perimeter &mdash; at the entry into our service stack &mdash; to allow us freedom of implementation of our business-logic on the inside.  We explicitly do not want to pollute our internal services with external user JWT-based authorizations.  We want to do authorizations on entry &mdash; against well known enterprise look-up-tables, and have all internal services protected by white-listed enterprise-internal certificates and not external JWT. 

Finally, we won't detail out actual JWT transformation and we do not have any business logic.  The JWT transformation will be represented by a simple decoding using [the jwt-decode NPM library](https://www.npmjs.com/package/jwt-decode) and the final business logic will be a Web echo using https://httpbin.org/anything.  In a similar vein, we do not show usage of an internal certificate storage (key vault) between the JWT termination on the perimeter and the trusted internal service: just imagine you'd put that there.

Our demonstration of JWT decoding is to extract the `name` property in a JWT into a `X-Identitty-ID` header and pass that to our service.  For our demo purposes, that is the extend of our JWT termination.

Our demonstration of a request payload transform is to take the passed in `text/plain` request payload and reverse it.  Pass the reversed payload to our service.



## From a Demo Request to Service Handling

Our demo request will be a `POST` with a JWT that has a `name` property and a payload body of `The cake is a lie!`.

```
curl -X POST -H "Content-Type: text/plain" -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c" --data  "The cake is a lie!" https://...
```



This request will be transformed and be handled by our business-logic in our service.  I did not write a service for this demo.  We just use an echo from https://httpbin.org/anything.  The response will be whatever we pass into https://httpbin.org/anything.  Our expectation is to see the `X-Identity-Id` header with the value `John Doe` &mdash; which is the `name` attribute value in the bearer token above.  Our expectation is to see the original payload be reversed into `!eil a si ekac ehT`.

The `https://...` in the above `curl` command stands in for your Azure Front Door hostname &mdash; replace this with your Azure Front Door hostname.



## Code Repository

The code samples for this write-up live at https://github.com/JakubNer/az-reverse-proxy-options.

All transformations are coded within Azure Functions for ease and simplicity.  

> It's very simple to run the samples on your local computer but that's out of scope for this write-up.  Use Visual Studio Code with Azure Functions extension or your command line.

We can target local runs of one of the Azure Functions with:

```
# target jwt-terminate which is used by our Azure API Management
curl -X POST -H "Content-Type: text/plain" -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c" --data  "The cake is a lie!" http://localhost:7071/api/jwt-terminate

# target rewrite-body which is used by our Azure API Management
curl -X POST -H "Content-Type: text/plain" -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c" --data  "The cake is a lie!" http://localhost:7071/api/rewrite-body

# target our codified forwarder (sans API Management)
curl -X POST -H "Content-Type: text/plain" -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c" --data  "The cake is a lie!" http://localhost:7071/api/forward/foo/bar
```





## Azure Offerings &mdash; Where we Embed API Cross-Cutting Concerns

Azure Front Door is where we receive our requests at a global level and distribute downstream to regional data-centers for handling.  This allows our DNS to resolve to a data-center close to where the use is requesting from, or any data-center that's actually available:  hence geo-redundancy.  

Azure Front Door also allows by-IP throttling right at the entry.  This is done with the help of it's Web Application Firewall.

Azure Front Door allows very simple origin and path prefix re-writes and, by itself, is not suitable for the custom URL / payload re-writes we need.



Azure API Management is regional, not geo-redundant, and as such it follows the Azure Front Door if geo-redundancy is desired.  Azure API Management allows us to receive requests and perform full custom transformations to payloads.

Azure API Management is configured with over fifty declarative rules and can call out to custom HTTP endpoints for various filtering decisions and transformations before forwarding the original request to a URL-rewritten destination.

Azure API Management is by itself fully sufficient for all our cross-cutting concerns except geo-redundancy:

- throttling
- JWT termination, in-line authorizations
- payload and URL rewrites



Azure Gateway is a Layer-7 regional load-balancer.  There is no use for Azure Gateway if we're already using Azure API Management &mdash; as Azure API Management supports all our needs.  If we decide to not use Azure API Management, Azure Gateway provides us with URL rewrites, but that's about it for our needs.  Azure Gateway does not help us with throttling, custom JWT termination, or payload transformations.  As a Layer-7 regional load-balancer it's purpose is to help with session-affinity, auto-scaling internal resources, and maybe websocket upgrades, but not what we need for the purposes of this write-up.

As such, in this write-up, the example that does not use Azure API Management also doesn't use Azure Gateway.  In that example we'll write our own entry-point HTTP middleware shim as an Azure Function, which can do the URL rewrite in its code.



## Front Door + API Management



![](./assets/management.png)



Front Door globally load-balances across data-centers while API management orchestrates our API cross-cutting concerns.

In this approach if we don't necessarily need geo-redundancy, but do want throttling, we can forego Azure Front Door and do everything with API Management.



## Front Door + Codified Forwarder (Azure Function w/Middleware)



![](./assets/fns.png)



In this approach we orchestrate API cross-cutting concerns with a middleware stack (express.js) before forwarding to internal trusted services.





## Front Door + Codified Forwarder + Azure Gateway



![](./assets/gateway.png)



Azure Gateway is a Layer-7 regional load-balancer that can accomplish some of what API Management does and helps us limit what we need to put into our Azure Function (codified forwarder).

However, for the needs of our API that we set out at the beginning of this write-up, it's hard to justify using it.

Azure Gateway has a robust URL rewrite and redirect support, but if we're already putting a middleware stack in front of it, it might not be justified.

Unfortunately Azure Gateway does not provide throttling, which necessitates the use of Front Door or adding persistence to our codified middleware (Azure function) &mdash; which we want to avoid.

Azure Gateway might be worthwhile if you want to leverage session affinity.  