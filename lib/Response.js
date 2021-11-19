/**
 * @file Response
 * @desc
 * @author howxin
 */
"use strict";
const ERROR = require('../lib/constants.js').APIERRORS;
const DEFAULT_RES = {
    status: 'error',
    error: {
        errMsg: ERROR.ERR_METHOD_NOFOUND
    }
};

class Response {
    constructor(_res, app) {
        this.app = app;
        this.response = _res;
        this.close = false;
    }

    end() {
        this.response.writeHead(200, { 'Content-Type': 'application/json' });
        this.response.end(JSON.stringify(DEFAULT_RES));
        this.close = true;
    }

    json(payload) {
        this.response.writeHead(200, { 'Content-Type': 'application/json' });
        if (payload !== undefined)
            this.response.end(JSON.stringify({ ...{ status: 'ok', ...payload } }));
        else
            this.response.end(JSON.stringify(DEFAULT_RES));
        this.close = true;
    }

    error(error) {
        this.response.writeHead(200, { 'Content-Type': 'application/json' });
        this.response.end(JSON.stringify({ status: 'error', error }));
        this.close = true;
    }

    get isClose() {
        return this.close;
    }

    // render(htmlText, params) {
    //     this.response.writeHead(200, { 'Content-Type': 'text/html' });
    //     let html = template.render(htmlText, params);
    //     this.response.end(html);
    //     this.close = true;
    // }

}

module.exports = Response;