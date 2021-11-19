/**
 * @file WsRequest
 * @desc ws请求封装类
 * @author howxin
 */
"use strict";
const {common} = require('../../utils');

class WsRequest {

    constructor(msg = {}, cli) {
        this.id = msg.id || 0;
        this.action = msg.action || '';
        this.params = msg.payload || {};
        this.msg = msg;
        this.cli = cli;
        this.promise = new Promise((resolve, reject) => {
            this._promise = {resolve, reject};
        });
        this.closed = false;
        this.responseMap = new Map();
    }

    response(payload, action = this.action) {
        if (this.responseMap.has(action)) {
            let _payload = this.responseMap.get(action);
            if (typeof _payload === 'object' && _payload !== null && typeof payload === 'object')
                this.responseMap.set(action, {..._payload, ...payload});
            else
                this.responseMap.set(action, payload);
        } else {
            this.responseMap.set(action, payload);
        }
    }

    send(payload, action) {
        return this.cli.send(action, payload, this.id);
    }

    close(reason) {
        if (this.closed) return;
        this.closed = true;
        this.responseMap.forEach((payload, action) => {
            this.cli.send(action, payload, this.id);
        });
        this._promise.resolve(reason);
    }

    error(err) {
        if (this.closed) return;
        this.closed = true;
        let msg = '';
        if (err instanceof Error)
            msg = err.stack;
        else if (typeof err === 'object' && err !== null)
            msg = JSON.stringify(err);
        else
            msg = String(err);

        this._promise.reject(msg);
        this.cli.send('error', msg, this.id);
    }

    validate(pattern, data = this.params) {
        return common.validate(pattern, data);
    }

    getFrontSession() {
        return this.cli.getFrontSession();
    }
}

module.exports = WsRequest;