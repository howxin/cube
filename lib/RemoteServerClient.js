/**
 * @file RemoteServerClient
 * @desc 连接远程服务器客户端
 * @author howxin
 */
"use strict";
const Events = require('events');
const WebSocket = require('ws');
const cluster = require('../cluster');
const WsHeartbeat = require('./WsHeartbeat.js');
const FrontSession = require('./FrontSession.js');
const RemoteRequest = require('./RemoteRequest.js');
const {
    REMOTE_SERVER_STATE,
    REMOTE_SERVER_EVENT,
    REMOTE_SERVER_ERROR,
    REMOTE_NATIVE_ACTION
} = require('./constants.js');
const { Syslog, common } = require('../../utils');

const syslog = Syslog('hypercube.RemoteServerClient');

const _initSocket = Symbol('INIT_SOCKET');
const _ping = Symbol('PING');
const _send = Symbol('SEND');
const _socketSend = Symbol('SOCKET_SEND');
const _getId = Symbol('GET_ID');
const _onClose = Symbol('ON_CLOSE');
const _sendServerInfo = Symbol('SEND_SERVER_INFO');

const PING_TIMEOUT = 5 * 1000;
const MAX_REQUEST_TIMEOUT = 30 * 1000;

class RemoteServerClient extends Events {

    constructor(app, serverInfo, module = {}, opts = {}) {
        syslog.debug(`建立新的RemoteServerClient =>`, serverInfo.group, serverInfo.id, opts);
        super();

        this.app = app;
        this.serverInfo = serverInfo;
        this.socket = null;
        this.state = REMOTE_SERVER_STATE.INIT;
        this.closed = false;
        this.sending = false;
        this.sendQueue = [];
        this.initQueue = [];
        this.requestMap = new Map();

        this.msgDeflate = opts.messageDeflate || '';
        this.msgLowerCase = opts.messageLowerCase || false;
        this.module = module;

        this.retryConnect = 0;
        this.retryCount = 0;
        this.idCounter = 0;
        this.heartbeat = null;

        this[_initSocket]();
    }

    async reconnect() {
        if (!this.closed) {
            syslog.debug('remoteServerClient重连....', JSON.stringify(this.serverInfo));
            try {
                await this[_initSocket]();
                this.closed = false;
            } catch (err) {
                throw err;
            }
        }
    }

    buildReq(obj, trx) {
        return new RemoteRequest(obj, this, trx);
    }

    async createReq(obj, execFn, trx = null) {
        const { action } = obj;
        try {
            if (common.empty(execFn))
                execFn = this.module[action].bind(this.module);
            if (typeof execFn !== 'function')
                throw new Error(REMOTE_SERVER_ERROR.ER_INVALID_FUNCTION + `[${action}]`);

            const req = new RemoteRequest(obj, this, trx);
            let result;
            try {
                result = await Promise.race([execFn(req), req.promise]);
                req.close();
            } catch (err) {
                // req.error(err);
                result = Promise.reject(err);
            }
            return result;
        } catch (err) {
            throw err;
        }
    }

    request(action, payload, frontSession) {
        return new Promise((resolve, reject) => {
            try {
                let id = this[_getId]();
                let reqTimeout = setTimeout(() => {
                    if (this.requestMap.has(id)) {
                        this.requestMap.get(id).reject(new Error(REMOTE_SERVER_ERROR.ER_REQUEST_TIMEOUT));
                        this.requestMap.delete(id);
                    }
                }, MAX_REQUEST_TIMEOUT);
                this.requestMap.set(id, { resolve, reject, reqTimeout });
                this.send(action, payload, frontSession, id);
            } catch (err) {
                reject(err);
            }
        });
    }

    send(action, payload, frontSession, id = 0) {
        return new Promise((resolve, reject) => {
            if (this.closed)
                return reject(REMOTE_SERVER_ERROR.ER_SOCKET_CLOSED);

            let ignoreAction = [
                REMOTE_NATIVE_ACTION.SAVE_SESSION,
                REMOTE_NATIVE_ACTION.SYNC_SESSION,
            ];
            if (this.msgLowerCase && !(ignoreAction.includes(action)))
                payload = common.toLowerCase(payload);

            let msg = { id, action, payload };
            if (frontSession instanceof FrontSession)
                msg.frontsession = frontSession.format();
            msg.origin = cluster.thisServer.group;
            this.sendQueue.push({ data: JSON.stringify(msg), promise: { resolve, reject } });
            this[_send]();
        });
    }

    async close(force, payload) {
        syslog.debug(`remote[server]扑街了！！！, closed => ${this.closed} serverInfo => ${JSON.stringify(this.serverInfo)}`);
        if (force) {
            this.closed = true;
            if (this.socket !== null) {
                try {
                    let msg = JSON.stringify({ action: REMOTE_NATIVE_ACTION.CLOSE_SOCKET, payload });
                    await this[_socketSend](msg);
                } catch (e) {
                    syslog.error('close =>', e);
                }
            }
        }

        this.heartbeat && this.heartbeat.close();
        if (this.socket !== null)
            this.socket.close();
    }

    [_initSocket](pass = false) {
        return new Promise((resolve, reject) => {
            if (!pass) {
                switch (this.state) {
                    case REMOTE_SERVER_STATE.INIT:
                        this.state = REMOTE_SERVER_STATE.CONNECTING;
                        break;
                    case REMOTE_SERVER_STATE.CONNECTING:
                        this.initQueue.push({ resolve, reject });
                        return;
                    case REMOTE_SERVER_STATE.CONNECTED:
                        return resolve();
                    default:
                        throw new Error();
                }
            }

            const url = `ws://${this.serverInfo.host}:${this.serverInfo.remotePort}/remote`;
            const socket = new WebSocket(url);

            const errorHandler = async (err) => {

                if (this.retryConnect++ < 3) {
                    try {
                        await this[_initSocket](true);
                    } catch (err) {
                        reject(err);
                    }
                } else {
                    this.emit(REMOTE_SERVER_EVENT.DROP, this);
                    this.emit(REMOTE_SERVER_EVENT.DESTROY, this);
                    reject(REMOTE_SERVER_ERROR.ER_INIT_FAIL);
                    for (let prom of this.initQueue)
                        prom.reject(REMOTE_SERVER_ERROR.ER_INIT_FAIL);
                    this.initQueue = [];
                    this.state = REMOTE_SERVER_STATE.INIT;
                }
            };
            socket.on('error', errorHandler);
            socket.on('close', errorHandler);
            socket.on('open', async () => {
                syslog.debug(`remoteServerClient连接建立成功,serverId => ${this.serverInfo.id},serverGroup => ${this.serverInfo.group}`);

                this.socket = socket;
                this.heartbeat = new WsHeartbeat({
                    socket,
                    heartbeatTtl: 5000,
                    pingTimeout: 15000,
                    timeoutHandle: () => this.close()
                });

                socket.removeListener('error', errorHandler);
                socket.removeListener('close', errorHandler);
                socket.on('error', this[_onClose].bind(this));
                socket.on('close', this[_onClose].bind(this));
                socket.on('pong', () => this.heartbeat.onPong());

                // 告诉对方远程服务器本机的信息
                this[_sendServerInfo]();

                // 开启心跳
                this.heartbeat.start();
                this.state = REMOTE_SERVER_STATE.CONNECTED;
                this.retryConnect = 0;

                socket.on('message', msg => {
                    try {
                        this.heartbeat.onPong();
                        // syslog.debug('remoteServerClient receive msg =>', msg);
                        msg = common.decompress(msg, this.msgDeflate);
                        if (typeof msg !== 'string') return;

                        const obj = JSON.parse(msg);
                        let { id, action, payload } = obj;
                        if (typeof action !== 'string') return;
                        // 如果是request请求，有返回信息
                        if (this.requestMap.has(id)) {
                            let prom = this.requestMap.get(id);
                            if (action === 'error')
                                prom.reject(payload);
                            else
                                prom.resolve(payload);

                            clearTimeout(prom.reqTimeout);
                            this.requestMap.delete(id);
                        } else if (action === REMOTE_NATIVE_ACTION.CLOSE_SOCKET) {
                            syslog.debug(`remoteServerClient连接关闭,serverId=>${this.serverInfo.id},serverGroup=>${this.serverInfo.group}`, payload);
                            this.closed = true;
                            this.heartbeat.close();
                        } else {
                            try {
                                this.createReq(obj, this.module[action].bind(this.module));
                            } catch (err) {
                                syslog.error(action, this.module);
                                throw err;
                            }
                        }
                    } catch (err) {
                        syslog.error('remote server receive error message =>', err);
                    }
                });

                resolve();
                for (let prom of this.initQueue)
                    prom.resolve();
                this.initQueue = [];
            });
        });
    }

    async [_send]() {
        if (this.closed || this.sendQueue.length <= 0 || this.sending) return;
        this.sending = true;

        try {
            if (this.socket === null)
                await this[_initSocket]();
            this.heartbeat.reset();

            let err = await this[_socketSend](this.sendQueue[0].data);
            if (err) {
                if (this.retryCount++ < 3) {
                    setImmediate(() => this[_send]());
                } else {
                    this.close(true);
                    for (let obj of this.sendQueue)
                        obj.promise.reject(REMOTE_SERVER_ERROR.ER_SOCKET_CLOSED);
                    syslog.debug('remoteServer retry sendQueue reject');
                }
            } else {
                this.retryCount = 0;
                let obj = this.sendQueue.shift();
                obj.promise.resolve();
                this.sending = false;
                if (this.sendQueue.length)
                    setImmediate(() => this[_send]());
            }
        } catch (err) {
            this.sending = false;
            if (this.retryCount++ < 3) {
                setImmediate(() => this[_send]());
            } else {
                this.close(true);
                for (let obj of this.sendQueue)
                    obj.promise.reject(REMOTE_SERVER_ERROR.ER_SOCKET_CLOSED);
                syslog.debug('remoteServer retry sendQueue reject');
            }
        }
    }

    async [_socketSend](msg) {
        let data = common.compress(msg, this.msgDeflate);
        await new Promise(resolve => this.socket.send(data, resolve));
    }

    [_ping]() {
        try {
            if (this.closed) return;
            if (this.heartbeat.pingTimer === null)
                this.heartbeat.pingTimer = setTimeout(() => {
                    syslog.warn(`wsClient[${this.id}] heartbeat timeout.`);
                    this.close()
                }, PING_TIMEOUT);
            this.socket.ping();
        } catch (err) {
            this.close();
        }
    }

    [_onClose](err) {
        syslog.log(`remote[server]连接监听到关闭, serverId: ${this.serverInfo.id}, serverGroup: ${this.serverInfo.group}`, err);
        this.state = REMOTE_SERVER_STATE.INIT;
        this.heartbeat.close();
        if (this.socket !== null) {
            this.socket.removeAllListeners();
            this.socket = null;
        }
        this.emit(REMOTE_SERVER_EVENT.DISCONNECT, this);
        if (this.closed) {
            this.emit(REMOTE_SERVER_EVENT.DROP, this);
            this.emit(REMOTE_SERVER_EVENT.DESTROY, this);
            this.removeAllListeners();
            for (let prom of this.sendQueue)
                prom.reject(REMOTE_SERVER_ERROR.ER_SOCKET_CLOSED);
        }
    }

    [_getId]() {
        const { id, group } = cluster.thisServer;
        let idx;
        do {
            idx = `${group}#${id}#${++this.idCounter}`;
        } while (this.requestMap.has(idx));

        if (this.idCounter > 9999) this.idCounter = 0;
        return idx;
    }

    [_sendServerInfo]() {
        return new Promise((resolve, reject) => {
            let msg = JSON.stringify({
                id: 0, action: REMOTE_NATIVE_ACTION.SERVER_INFO, payload: cluster.thisServer,
            });
            this.sendQueue.unshift({ data: msg, promise: { resolve, reject } });
            this[_send]();
        });
    }
}

module.exports = RemoteServerClient;