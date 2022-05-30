# Adding Flexibility to an API on Azure

In this write-up we'll explore usage of several Azure offerings in implementing an HTTP API, whereby the API is:

- geo-redundant for speed, availability, and safe-deployments
- throttle-able &mdash; controlling costs
- terminates a Json Web Token (JWT) on the perimeter &mdash; freeing trusted internal services from authorizations
- provides a placeholder for request and response payload rewrites &mdash; an API contract façade
- abstracts concrete business-logic service location via URL rewrites

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

The reader should have a working familiarity with Azure and finding Azure documentation.

It's expected that the reader is familiar with Node.js and Express.js middleware.  The write-up intermingles JavaScript code examples for middleware transformations where needed.  These transformations are abstracted by HTTP calls &mdash; I serve these with Azure Functions, but that's just for simplicity and ease.



## Custom Cross-Cutting Transformations

We leverage throttling and geo-redundancy as implemented by Microsoft on our behalf &mdash; in the Azure offerings.

However, JWT termination and our request payload transform are custom.  We will call JavaScript code from the front-matter of our API stack to perform these, before requests are forwarded to our internal service.

We do these on the perimeter &mdash; at the entry into our service stack &mdash; to allow us freedom of implementation of our business-logic on the inside.  We explicitly do not want to pollute our internal services with external user JWT-based authorizations.  We want to do authorizations on entry &mdash; against well known enterprise look-up-tables, and have all internal services protected by white-listed enterprise-internal certificates and not external JWT. 

Finally, we won't detail out actual JWT transformation and we do not have any business logic.  The JWT transformation will be represented by a simple decoding using [the jwt-decode NPM library](https://www.npmjs.com/package/jwt-decode) and the final business logic will be a Web echo using https://httpbin.org/anything.  In a similar vein, we do not show usage of an internal certificate storage (key vault) between the JWT termination on the perimeter and the trusted internal service: just imagine you'd put that there.

Our demonstration of JWT decoding is to extract the `name` property from a JWT into a `X-Identitty-Id` header and pass that to our service.  For our demo purposes, that is the extent of our JWT termination.

Our demonstration of a request payload transform is to take the passed in `text/plain` request payload and reverse it.  Pass the reversed payload to our service.



## From a Demo Request to Service Handling

Our demo request will be a `POST` with a JWT that has a `name` property with the value `John Doe` and a payload body of `The cake is a lie!`.

```
curl -X POST -H "Content-Type: text/plain" -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c" --data  "The cake is a lie!" https://???.azurefd.net/api/forward
```



This request will be transformed and be handled by our business-logic in our service.  I did not write a service for this demo.  We just use an echo from https://httpbin.org/anything.  The response will be whatever we pass into https://httpbin.org/anything.  Our expectation is to see the `X-Identity-Id` header with the value `John Doe` &mdash; which is the `name` attribute value in the bearer token above.  Our expectation is to see the original payload be reversed into `!eil a si ekac ehT`.

The `https://???` in the above `curl` command stands in for your Azure Front Door hostname &mdash; replace this with your Azure Front Door hostname.



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





## Azure Offerings &mdash; Where We Embed API Cross-Cutting Concerns

Azure Front Door is where we receive our requests at a global level and distribute downstream to regional data-centers for handling.  This allows our DNS to resolve to a data-center close to where the user is requesting from, or any data-center that's actually available:  hence geo-redundancy.  

Azure Front Door also allows by-IP throttling right at the entry.  This is done with the help of its Web Application Firewall.

Azure Front Door allows very simple origin and path prefix re-writes and, by itself, is not suitable for the custom URL / payload re-writes we need.



Azure API Management is regional, not geo-redundant (especially if you want  to keep costs down), and as such it follows the Azure Front Door if geo-redundancy is desired.  Azure API Management allows us to receive requests and perform full custom transformations to payloads.

Azure API Management is configured with over fifty declarative rules and can call out to custom HTTP endpoints for various filtering decisions and transformations before forwarding the original request to a URL-rewritten destination.

Azure API Management is by itself fully sufficient for all our cross-cutting concerns except geo-redundancy:

- throttling
- JWT termination, in-line authorizations
- payload and URL rewrites



Azure Application Gateway is a Layer-7 regional load-balancer.  There is no use for Azure Gateway if we're already using Azure API Management &mdash; as Azure API Management supports all our needs.  If we decide to not use Azure API Management, Azure Gateway provides us with URL rewrites, but that's about all it can do for us.  Azure Gateway does not help us with throttling, custom JWT termination, or payload transformations.  As a Layer-7 regional load-balancer it's purpose is to help with session-affinity, auto-scaling internal resources, and maybe websocket upgrades, but not what we need for the purposes of this write-up.

As such, in this write-up, the example that does not use Azure API Management also doesn't use Azure Gateway.  In that example we'll write our own entry-point HTTP middleware shim as an Azure Function, which also does the URL rewrite in its code.



## Our Front Door Setup

In the usual case Azure Front Door load-balances requests to the closest data-center.  However, it can also weighted-round-robin load-balance requests to whatever implementation of an API we configure it to.  

We leverage the latter.

Our demo Azure Front Door is setup with an "origin group" that splits request between our instance of API Management (next section) and our alternate route, the "codified forwarder" (two sections below).

> Our "codified forwarder" is an Azure Function that does all the same orchestrations of our middleware transformations, just like we do with our API Management setup, but in lieu of leveraging (and paying for) API Management.
>
> Mind you, the flexibility of API Management is worth the cost. 

Our demo Azure Front Door tees API calls against `https://???..azurefd.net` :

- to either our Azure API Management instance 
- or our "codified forwarder" (Azure Function that does the API Management middleware functions for us)



![](./assets/frontdoor.png)



The most interesting part of our demo Azure Front Door setup is the "origin group" configuration where we have both, our API Management, and "codified forwarder", equally weighted.  

Both are custom "origins" just configured with their respective HTTP  URLs.

![image-20220529164957501](./assets/image-20220529164957501.png)


> ⚠ It's important to keep in mind that Azure Front Door origins are just host names: no paths.  All origins in a group must be able to consume the same paths and matching API contracts.  
>
> As such, our API Management consumes our demo API as `https://???.azure-api.net/api/forward`.
>
> Our "codified forwarder" Azure Function consumes the same API contract as `https://???.azurewebsites.net/api/forward`.


## Front Door + API Management



![](./assets/management.png)



Front Door globally load-balances across data-centers while API management orchestrates our API cross-cutting concerns.

Both offerings can throttle; if we don't necessarily need geo-redundancy, but still want throttling, we can forego Azure Front Door and do everything with API Management.

### Setting Up API Management

We setup our demo API Management with a single *operation* (API Management lingo), one that forwards all requests to `https://httpbin.org/anything`.  

API Management is used to declaratively (XML) orchestrate some transformations on our requests before forwarding to the final business-logic service:

1. deals with the JWT by extracting the `name` and setting it to the `X-Identity-Id` header
2. reverses the payload content
3. forwards the result to a rewritten URL, namely https://httpbin.org/anything

Our API Management setup does [1] and [2] by calling our very simple custom [JWT processing](https://github.com/JakubNer/az-reverse-proxy-options/tree/master/jwt-terminate) and [payload re-write](https://github.com/JakubNer/az-reverse-proxy-options/tree/master/rewrite-body) Azure Functions.  These are called before the final rewrite, as per [3].



At the very start of setting up our API Management, right after initializing the resource (which took a very long time, be patient), we turn off the subscription requirement:

![image-20220529144034909](./assets/image-20220529144034909.png)



To do our custom [JWT processing](https://github.com/JakubNer/az-reverse-proxy-options/tree/master/jwt-terminate) and [payload re-write](https://github.com/JakubNer/az-reverse-proxy-options/tree/master/rewrite-body) &mdash; both of which we do by calling their respective custom Azure Functions from this here our Azure API Management &mdash; we replace the default empty API Management *policy* with one that calls said Azure Functions:

![image-20220529145359532](./assets/image-20220529145359532.png)



Replace the above with:

```
1 <policies>
2     <inbound>
3         <base />
4         <send-request mode="new" response-variable-name="jwt-response" timeout="10" ignore-error="false">
5             <set-url>https://???.azurewebsites.net/api/jwt-terminate</set-url>
6             <set-method>POST</set-method>
7             <set-header name="Authorization" exists-action="override">
8                 <value>@(context.Request.Headers.GetValueOrDefault("Authorization"))</value>
9             </set-header>
10         </send-request>
11         <set-header name="X-Identity-ID" exists-action="override">
12             <value>@(((IResponse)context.Variables["jwt-response"]).Body.As<String>())</value>
13         </set-header>
14         <send-request mode="new" response-variable-name="rewrite" timeout="10" ignore-error="false">
15             <set-url>https://???.azurewebsites.net/api/rewrite-body</set-url>
16             <set-method>POST</set-method>
17             <set-body>@{return context.Request.Body.As<string>();}</set-body>
18         </send-request>
19         <set-body>@{return ((IResponse)context.Variables["rewrite"]).Body.As<String>();}</set-body>
20     </inbound>
21     <backend>
22         <base />
23     </backend>
24     <outbound>
25         <base />
26     </outbound>
27     <on-error>
28         <base />
29     </on-error>
30 </policies>
```



The above policy will call out [/jwt-terminate](https://github.com/JakubNer/az-reverse-proxy-options/tree/master/jwt-terminate) Azure Function (lines 4-10) and save the response to the `X-Identity-Id` header (lines 11-13).  Subsequently it calls the [/rewrite-body](https://github.com/JakubNer/az-reverse-proxy-options/tree/master/rewrite-body) Azure Function (lines 14-18) to reverse to request payload and rewrite its content (line 19).  It processes the above policy in-line while handling the request, before forwarding the transformed payload to `https://httpbin.org/anything`; our "service" (first screenshot in section).  

The result is the expected echo response proving that we've setup our Azure API Management successfully:

![image-20220529153841747](./assets/image-20220529153841747.png)



As a final note, a very nice feature of Azure API Management is it's "Test" and "Trace" feature which allows debugging the various orchestrated steps with use-cases.

![image-20220530073425468](./assets/image-20220530073425468.png)



## Front Door + Codified Forwarder (Azure Function w/Middleware)



![](./assets/fns.png)



In this approach we orchestrate API cross-cutting concerns with [a single Azure Function]([az-reverse-proxy-options/jwt-terminate-rewrite-and-forward at master · JakubNer/az-reverse-proxy-options · GitHub](https://github.com/JakubNer/az-reverse-proxy-options/tree/master/jwt-terminate-rewrite-and-forward)) containing our middleware stack (express.js), before forwarding to the target business-logic service.

This does exactly the same steps as API Management.  Although API Management is much nicer &mdash; with its declarative orchestrations &mdash; this approach is much cheaper:  API Management is pricey.

The Azure Function does the same things:

- deals with the JWT by extracting the `name` and setting it to the `X-Identity-Id` header
- reverses the payload
- forwards the result to a rewritten URL, namely https://httpbin.org/anything

To try and avoid having this be some dirty monolith, we wrap it with "express" to give it a semblance of being orchestrated (line 2 below).

```
1 // Let's do a permiter middleware stack using "express" before forwarding to internal services
2 const app = express();
3 
4 // Deal with JWT
5 app.use((req, res, next) => {
6     req.headers["X-Identity-Id"] = jwt_decode(/Bearer (.+)/.exec(req.headers.authorization)[1]).name;
7     delete req.headers.authorization;
8     delete req.headers.host;
9     next();
10 })
11 
12 // Rewrite request payload
13 app.use((req, res, next) => {
14     req.body = req.body.split("").reverse().join("");
15     next();
16 })
17 
18 // Forward all requests to https://httpbin.org/anything
19 app.post("*", async (req, res) => {
20     const response = await fetch('https://httpbin.org/anything', {
21         method: 'post',
22         body: req.body,
23         headers: req.headers
24     });
25   
26     res.send(await response.text())  
27 });
```

See [the Azure Function](https://github.com/JakubNer/az-reverse-proxy-options/blob/master/jwt-terminate-rewrite-and-forward/index.js) for full code listing.

Calling the above Azure Function, in-line, before having it forward to our business-logic service (lines 18-27 above), we have it terminate our JWT by extracting the same `name` attribute (lines 4-10) into a header (line 23).  We have it rewrite the payload (lines 12-16) into the body (line 22).  It does all the transformations, but since it's code, it requires more discipline to keep clean (e.g. use of express).

The results from using this function are the same as using our API Management in the previous section.  As such, we're able to put it in the same origin group behind our demo API Front Door.



## Front Door + Codified Forwarder + Azure Gateway



![](./assets/gateway.png)



Azure Gateway is a Layer-7 regional load-balancer that can accomplish only a small subset of what API Management does.  We wanted to see if it can support our requirements.  Whether use of the Application gateway will help us limit what we need to put into our Azure Function ("codified forwarder" from previous section) &mdash; or perhaps eliminate it &mdash; but at a fraction of what API Management would cost.

However, with reference to our API requirements that we set out at the beginning of this write-up, it's hard to justify using it.

Azure Gateway has a robust URL rewrite and redirect support, but that's the only functionality it provides out of our list of requirements.  It does not help us terminate JWT in a custom way.  It does not rewrite payloads.  We would need to continue to put our "codified forwarder" middleware stack in front of it.  As such, its use is not justified.

Furthermore, Azure Gateway does not provide throttling, which necessitates the use of Front Door or adding persistence to our codified middleware (Azure function) &mdash; which we want to avoid.

Azure Gateway might be worthwhile if you want to leverage session affinity.  It just doesn't fit the bill here.
