/**
 * @file WsHeartbeat
 * @desc ws心跳工具
 * @author howxin
 * @param opts
 */
"use strict";

const _ping = Symbol('PING');

class WsHeartbeat {

    constructor(opts) {

        if (typeof opts.socket === 'undefined')
            throw new Error('invalid_params');

        const {timeoutHandle = () => {}} = opts;
        if (timeoutHandle && typeof timeoutHandle !== 'function')
            throw new Error('invalid_params');

        this.socket = opts.socket;
        this.heartbeatTtl = opts.heartbeatTtl || 5000;
        this.pingTimeout = opts.pingTimeout || 15000;
        this.timeoutHandle = opts.timeoutHandle;

        this.heartbeatTimer = null;
        this.pingTimer = null;
    }

    set timeout(time) {
        this.heartbeatTtl = time;
    }

    start() {
        if (this.heartbeatTimer)
            this.stop();
        this.heartbeatTimer = setTimeout(() => {
            this[_ping]();
            this.stop();
            this.start();
        }, this.heartbeatTtl);
    }

    close() {
        clearTimeout(this.heartbeatTimer);
        this.heartbeatTimer = null;
        clearTimeout(this.pingTimer);
        this.pingTimer = null;
    }

    reset() {
        this.stop();
        this.start();
    }

    stop() {
        clearTimeout(this.heartbeatTimer);
        this.heartbeatTimer = null;
    }

    onPong() {
        clearTimeout(this.pingTimer);
        this.pingTimer = null;
    }

    [_ping]() {
        try {
            if (this.pingTimer === null)
                this.pingTimer = setTimeout(() => {
                    this.timeoutHandle();
                }, this.pingTimeout);
            this.socket.ping();
        } catch (err) {
            this.timeoutHandle();
        }
    }
}

module.exports = WsHeartbeat;