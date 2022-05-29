const createHandler = require("azure-function-express").createHandler;
const express = require("express");
const jwt_decode = require("jwt-decode");
const fetch = require("node-fetch");

// Let's do a permiter middleware stack using "express" before forwarding to internal services
const app = express();

// Deal with JWT
app.use((req, res, next) => {
    req.headers["X-Identity-Id"] = jwt_decode(/Bearer (.+)/.exec(req.headers.authorization)[1]).name;
    delete req.headers.authorization;
    delete req.headers.host;
    next();
})

// Rewrite request payload
app.use((req, res, next) => {
    req.body = req.body.split("").reverse().join("");
    next();
})

// Forward all requests to https://httpbin.org/anything
app.post("*", async (req, res) => {
    const response = await fetch('https://httpbin.org/anything', {
        method: 'post',
        body: req.body,
        headers: req.headers
    });
  
    res.send(await response.text())  
});
 
// Binds the "express" middleware stack to an Azure Function handler
module.exports = createHandler(app);