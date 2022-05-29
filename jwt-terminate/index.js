const jwt_decode = require("jwt-decode");

module.exports = async function (context, req) {
    context.res = {
        body: jwt_decode(/Bearer (.+)/.exec(req.headers.authorization)[1])
    };
}