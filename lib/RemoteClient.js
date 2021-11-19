/**
 * @file RemoteClient
 * @desc 接受远程调用连接载体
 * @date 2019-04-01
 * @author howxin
 * @param socket
 * @param module
 */
"use strict";
const Events = require('events');
const cluster = require('../cluster');
const WsHeartbeat = require('./WsHeartbeat.js');
const RemoteRequest = require('./RemoteRequest.js');
const FrontSession = require('./FrontSession.js');
const {common, Syslog} = require('../../utils');
const {REMOTE_CLIENT_EVENT, REMOTE_CLIENT_ERROR, REMOTE_NATIVE_ACTION} = require('./constants.js');

const syslog = Syslog('hypercube.RemoteClient');

const _session = Symbol('SESSION');
const _initSocket = Symbol('INIT_SOCKET');
const _send = Symbol('SEND');
const _socketSend = Symbol('SOCKET_SEND');
const _getId = Symbol('GET_ID');
const _onClose = Symbol('ON_CLOSE');

const MAX_REQUEST_TIMEOUT = 30 * 1000;

class RemoteClient extends Events {

    constructor(app, socket, module, opts = {}) {
        super();

        this.app = app;
        this.socket = socket;
        this.module = module || {};
        this.serverInfo = {};
        this[_session] = {};

        this.msgDeflate = opts.messageDeflate || '';
        this.sendQueue = [];
        this.requestMap = new Map();
        this.idCounter = 0;

        this.sending = false;
        this.closed = false;
        this.msgLowerCase = opts.messageLowerCase || false;

        this.heartbeat = new WsHeartbeat({
            socket,
            heartbeatTtl: 5000,
            pingTimeout: 15000,
            timeoutHandle: () => this.close()
        });

        this[_initSocket]();
    }

    sessionSet(obj, cover = false) {
        if (common.typeOf(obj) !== 'object')
            throw new Error('session must be an object');
        if (cover)
            this.sessionDel();
        Object.assign(this[_session], obj);
    }

    sessionGet(key) {
        if (key)
            return this[_session][key];
        else
            return {...this[_session]};
    }

    sessionDel(key) {
        if (key)
            delete this[_session][key];
        else
            for (let k in this[_session])
                delete this[_session][k];
    }

    // on(...args) {
    //     syslog.log('on event =>', args[0], JSON.stringify(this.serverInfo));
    //     return super.on(...args);
    // }
    //
    // once(...args) {
    //     syslog.log('once event =>', args[0], JSON.stringify(this.serverInfo));
    //     return super.once(...args);
    // }

    // reconnect(socket) {
    //     // TODO: 要看是否需要重连
    //
    //     if (this.socket !== null) {
    //         this.socket.removeAllListeners();
    //         this.socket.close();
    //     }
    //     this.socket = socket;
    //     this.closed = false;
    //     this[_initSocket]();
    //     this[_send]();
    // }

    async createReq(obj, execFn, trx = null) {
        try {
            const {action} = obj;
            if (execFn !== null && typeof execFn !== 'function')
                throw new Error(REMOTE_CLIENT_ERROR.ER_INVALID_FUNCTION + `[${action}]`);
            if (common.empty(execFn))
                execFn = this.module[action].bind(this.module);

            const req = new RemoteRequest(obj, this, trx);
            let result;
            try {
                result = await Promise.race([execFn(req), req.promise]);
                req.close();
            } catch (err) {
                //req.error(err);
                result = Promise.reject(err);
            }
            return result;
        } catch (err) {
            throw err;
        }
    }

    buildReq(obj, trx) {
        return new RemoteRequest(obj, this, trx);
    }

    request(action, payload, frontSession) {
        return new Promise((resolve, reject) => {
            try {
                let id = this[_getId]();
                let reqTimeout = setTimeout(() => {
                    if (this.requestMap.has(id)) {
                        this.requestMap.get(id).reject(new Error(REMOTE_CLIENT_ERROR.ER_REQUEST_TIMEOUT));
                        this.requestMap.delete(id);
                    }
                }, MAX_REQUEST_TIMEOUT);
                this.requestMap.set(id, {resolve, reject, reqTimeout});
                this.send(action, payload, frontSession, id);
            } catch (err) {
                reject(err);
            }
        });
    }

    send(action, payload, frontSession, id = 0) {
        return new Promise((resolve, reject) => {
            try {
                if (this.closed)
                    return reject(REMOTE_CLIENT_ERROR.ER_SOCKET_CLOSED);

                let ignoreAction = [
                    REMOTE_NATIVE_ACTION.SAVE_SESSION,
                    REMOTE_NATIVE_ACTION.SYNC_SESSION,
                ];
                if (this.msgLowerCase && !(ignoreAction.includes(action)))
                    payload = common.toLowerCase(payload);

                let msg = {id, action, payload};
                if (frontSession instanceof FrontSession)
                    msg.frontsession = frontSession.format();
                msg.origin = cluster.thisServer.group;
                // console.log('remote clie send=>', JSON.stringify(msg));
                this.sendQueue.push({data: JSON.stringify(msg), promise: {resolve, reject}});
                this[_send]();
            } catch (err) {
                reject(err);
            }
        });
    }

    async close(force, payload = {}) {
        syslog.debug(`remote[client]连接关闭, closed => ${this.closed}`);
        if (this.closed) return;
        this.closed = true;
        this.heartbeat.close();

        if (force) {
            try {
                let msg = JSON.stringify({action: REMOTE_NATIVE_ACTION.CLOSE_SOCKET, payload});
                await this[_socketSend](msg);
            } catch (e) {
                syslog.error('close =>', e);
                // _rej(e);
            }
        }
        this.socket.close();
    }

    [_initSocket]() {
        this.socket.removeAllListeners();

        this.socket.on('error', this[_onClose].bind(this));
        this.socket.on('close', this[_onClose].bind(this));
        this.socket.on('pong', () => this.heartbeat.onPong());

        this.socket.on('message', msg => {
            try {
                this.heartbeat.onPong();
                // syslog.debug('remoteClient receive message =>', msg);
                msg = common.decompress(msg, this.msgDeflate);
                if (typeof msg !== 'string') return;

                let obj = JSON.parse(msg);
                let {id, action, payload} = obj;
                if (typeof action !== 'string') return;

                if (this.requestMap.has(id)) {
                    let prom = this.requestMap.get(id);
                    if (action === 'error')
                        prom.reject(payload);
                    else
                        prom.resolve(payload);
                    clearTimeout(prom.reqTimeout);
                    this.requestMap.delete(id);
                    return;
                }

                switch (action) {
                    case REMOTE_NATIVE_ACTION.SERVER_INFO:
                        syslog.debug(`remoteClient连接成功,serverId => ${payload.id},serverGroup => ${payload.group}`);
                        this.serverInfo = payload;
                        this.emit(REMOTE_CLIENT_EVENT.INIT, this);
                        break;
                    case REMOTE_NATIVE_ACTION.CLOSE_SOCKET:
                        syslog.debug(`remoteClient连接监听到关闭, serverId: ${this.serverInfo.id}, serverGroup: ${this.serverInfo.group}`, payload);
                        this.emit(REMOTE_CLIENT_EVENT.DROP, this);
                        break;
                    default:
                        if (typeof this.module[action] !== 'function') {
                            syslog.error(action, this.serverInfo);
                            throw new Error(REMOTE_CLIENT_ERROR.ER_INVALID_FUNCTION + `[${action}]`);
                        }
                        this.createReq(obj, this.module[action].bind(this.module)).catch(e => {
                            syslog.error('remoteClient.createReq catch err =>', e)
                        });
                }
            } catch (err) {
                syslog.error("remote server receive error message", err);
            }
        });

        this.heartbeat.start();
        this.emit(REMOTE_CLIENT_EVENT.OPEN);
    }

    async [_send]() {
        if (this.closed || this.sendQueue.length <= 0 || this.sending) return;
        this.sending = true;

        try {
            this.heartbeat.reset();

            let err = await this[_socketSend](this.sendQueue[0].data);
            this.sending = false;
            if (err) {
                if (this.closed) {
                    for (let obj of this.sendQueue)
                        obj.promise.reject(REMOTE_CLIENT_ERROR.ER_SOCKET_CLOSED);
                    this.sendQueue = [];
                } else {
                    setImmediate(() => this[_send]());
                }
            } else {
                let obj = this.sendQueue.shift();
                obj.promise.resolve();
                if (this.sendQueue.length > 0)
                    setImmediate(() => this[_send]());
            }
        } catch (err) {
            this.sending = false;
            setImmediate(() => this[_send]());
        }
    }

    async [_socketSend](msg) {
        let data = common.compress(msg, this.msgDeflate);
        await new Promise(resolve => this.socket.send(data, resolve));
    }

    [_onClose](err) {
        syslog.log(`remoteClient连接关闭,serverId => ${this.serverInfo.id},serverGroup => ${this.serverInfo.group}`, err);
        this.closed = true;
        this.heartbeat.close();
        if (this.socket !== null) {
            this.socket.removeAllListeners();
            this.socket = null;
        }
        this.emit(REMOTE_CLIENT_EVENT.CLOSE, this);
        this.emit(REMOTE_CLIENT_EVENT.DESTROY, this);
        this.removeAllListeners();

        for (let prom of this.sendQueue)
            prom.reject(REMOTE_CLIENT_ERROR.ER_SOCKET_CLOSED);
        this.sendQueue = [];
    }

    [_getId]() {
        const {id, group} = cluster.thisServer;
        let idx;
        do {
            idx = `${group}#${id}#${++this.idCounter}`;
        } while (this.requestMap.has(idx));

        if (this.idCounter > 9999) this.idCounter = 0;
        return idx;
    }

}

module.exports = RemoteClient;