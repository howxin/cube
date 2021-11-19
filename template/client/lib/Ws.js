/**
 * @class Ws
 * @author howxin
 * @param url
 */
"use strict";
const Events = require('events');
const WebSocket = require('ws');

const _initSocket = Symbol('INIT_SOCKET');
const _ping = Symbol('PING');
const _getId = Symbol('GET_ID');
const _onClose = Symbol('ON_CLOSE');

const PING_TIMEOUT = 5 * 1000;
const MAX_REQUEST_TIMEOUT = 30 * 1000;
const STATE = {
    INIT: 'init',
    CONNECTING: 'connecting',
    CONNECTED: 'connected',
};

class Ws extends Events {

    constructor(url) {
        super();

        const self = this;
        self.state = STATE.INIT;
        self.url = url;
        self.socket = null;
        self.closed = false;
        self.requestMap = new Map();
        self.idCounter = 0;

        self.heartbeat = {
            timer: null,
            timeout: 1000,
            pingTimer: null,
            start: () => {
                self.heartbeat.timer = setTimeout(() => {
                    self[_ping]();
                    clearTimeout(self.heartbeat.timeout);
                    self.heartbeat.start();
                }, self.heartbeat.timeout);
            },
            reset: () => {
                clearTimeout(self.heartbeat.timer);
                self.heartbeat.start();
            },
            stop: () => {
                clearTimeout(self.heartbeat.timer);
            },
            onPong: () => {
                clearTimeout(self.heartbeat.pingTimer);
                self.heartbeat.pingTimer = null;
            }
        };

        self[_initSocket]();
    }

    [_initSocket]() {

        this.state = STATE.CONNECTING;

        const socket = new WebSocket(this.url);
        socket.on('error', this[_onClose].bind(this));
        socket.on('close', this[_onClose].bind(this));
        socket.on('open', () => {
            console.log(`client connect server`);
            this.state = STATE.CONNECTED;
            this.socket = socket;
            this.emit('open');

            socket.on('pong', this.heartbeat.onPong.bind(this));
            socket.on('message', msg => {
                // console.log('msg=>', data);
                try {
                    if (typeof msg === 'string') {
                        const obj = JSON.parse(msg);
                        let {id, action, payload} = obj;
                        if (typeof action !== 'string') return;
                        // 如果是request请求，有返回信息
                        if (this.requestMap.has(id)) {
                            let prom = this.requestMap.get(id);
                            prom.resolve(payload);
                            clearTimeout(prom.reqTimeout);
                            this.requestMap.delete(id);
                        } else {
                            this.emit('message', obj);
                        }
                    }
                } catch (err) {
                    console.log('ws receive msg catch error =>', err);
                }
            });
            this.heartbeat.start();
        });
    }

    request(action, payload) {
        return new Promise(async (resolve, reject) => {
            let id = this[_getId]();
            try {
                let reqTimeout = setTimeout(() => {
                    if (this.requestMap.has(id)) {
                        this.requestMap.get(id).reject(new Error('request_timeout'));
                        this.requestMap.delete(id);
                    }
                }, MAX_REQUEST_TIMEOUT);
                this.requestMap.set(id, {resolve, reject, reqTimeout});
                await this.send(action, payload, id);
            } catch (err) {
                if (this.requestMap.has(id)) {
                    clearTimeout(this.requestMap.get(id).reqTimeout);
                    this.requestMap.delete(id);
                }
                reject(err);
            }
        });
    }

    async send(action, payload, id) {
        try {
            if (this.closed)
                throw new Error('socket_closed');
            if (this.socket === null)
                return;

            let msg = JSON.stringify({id, action, payload});
            let err = await new Promise(cb => this.socket.send(msg, cb));
            if (err)
                throw err;
        } catch (err) {
            console.log(err);
            this.close(true);
            throw err;
        }
    }

    close(force) {
        if (force)
            this.closed = true;
        this.heartbeat.stop();
        if (this.socket !== null)
            this.socket.close();
    }

    [_ping]() {
        try {
            if (this.closed) return;
            if (this.heartbeat.pingTimer === null)
                this.heartbeat.pingTimer = setTimeout(() => {
                    console.log(`heartbeat timeout.`);
                    this.close()
                }, PING_TIMEOUT);
            this.socket.ping();
        } catch (err) {
            this.close();
        }
    }

    [_onClose](err) {
        console.log('on close =>', err);
        this.state = STATE.INIT;
        this.heartbeat.stop();
        if (this.socket !== null) {
            this.socket.removeAllListeners();
            this.socket = null;
        }
        this.emit('disconnect', this);
        if (this.closed) {
            this.emit('drop', this);
            this.emit('destroy', this);
            this.removeAllListeners();
        }
    }

    [_getId]() {
        if (this.idCounter > 9999)
            this.idCounter = 0;
        return ++this.idCounter;
    }
}

module.exports = Ws;