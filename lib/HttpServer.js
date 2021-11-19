/**
 * @file HsServer
 * @desc
 * @author howxin
 */
"use strict";
const http = require('http');
const Events = require("events");
const Request = require('../lib/Request.js');
const Response = require('../lib/Response.js');

const EVENT = require('./constants.js').HTTP_SERVER_EVENT;

const _init = Symbol('init');

class HttpServer extends Events {

    constructor(app, server = null) {
        super();
        this.app = app;
        this.quene = [];
        this.server = server || http.createServer();

        this[_init]();
    }

    [_init]() {
        const self = this;

        self.server.on(EVENT.REQUEST, async (req, res) => {
            try {
                let request = new Request(req, this.app);
                await request.init();
                let response = new Response(res, this.app);
                for (let i = 0; i < self.quene.length; i++) {
                    try {
                        let fn = self.quene[i];
                        await fn(request, response);
                        if (response.close) {
                            return;
                        }
                    } catch (err) {
                        self.emit(EVENT.ERROR, err);
                    }
                }
                response.json();
            } catch (err) {
                res.end(JSON.stringify({status: 'error', error: {errMsg: err.message}}));
            }
        });
        self.server.on(EVENT.CLOSE, (...args) => self.emit(EVENT.CLOSE, ...args));
        self.server.on(EVENT.ERROR, (...args) => self.emit(EVENT.ERROR, ...args));
    }

    use(fn) {
        if (Array.isArray(fn))
            this.quene.push(...fn);
        else
            this.quene.push(fn);
    }

    listen(host, port, cb = () => {}) {
        const server = this.server;
        return new Promise((resolve, reject) => {
            server.on(EVENT.ERROR, (err) => {
                if (err.code === 'EADDRINUSE')
                    reject(new Error('EADDRINUSE'));
                else
                    reject(err);
                this.emit(EVENT.ERROR, err);
            });
            server.listen.apply(server, [port, host, () => {
                resolve();
                cb();
                this.emit(EVENT.LISTENING);
            }]);
        });
    }
}

module.exports = HttpServer;