/**
 * @file WsClient
 * @desc ws连接载体
 * @author howxin
 * @param id {string} id
 * @param socket {object} socket
 * @param module {object} 接口处理方法
 * @param opts {object} 配置项
 *          * reqSerial {boolean} 请求序列化，默认是：true
 */
"use strict";
const Events = require("events");
const cluster = require('../cluster');
const remoteHandler = require('./remoteHandler.js');
const FrontSession = require('./FrontSession.js');
const WsRequest = require('./WsRequest.js');
const WsHeartbeat = require('./WsHeartbeat.js');
const { common, Syslog } = require('../../utils');
const { WS_CLIENT_EVENT, WS_ERROR, ER_CODE } = require('./constants.js');

const syslog = Syslog('hypercube.WsClient');

const _session = Symbol('SESSION');
const _initSocket = Symbol('INIT_SOCKET');
const _remoteReq = Symbol('REMOTE_REQ');
const _localReq = Symbol('LOCAL_REQ');
const _reqWait = Symbol('REQ_WAIT');
const _reqNext = Symbol('REQ_NEXT');
const _send = Symbol('SEND');
const _socketSend = Symbol('SOCKET_SEND');
const _onClose = Symbol('ON_CLOSE');


class WsClient extends Events {

    constructor(id, socket, module, opts = {}) {
        super();

        this.id = id;
        this.socket = socket;
        this.module = module || { actionRules: {} };
        this[_session] = {
            ip: opts.ip,
        };

        this.requesting = false;
        this.sending = false;
        this.closed = false;

        this.reqSerial = (opts.reqSerial === false) ? opts.reqSerial : true;
        this.msgLowerCase = opts.messageLowerCase || false;
        this.msgDeflate = opts.messageDeflate || '';

        this.reqQuque = [];
        this.sendQueue = [];
        this.reqActions = new Map();

        this.heartbeat = new WsHeartbeat({
            socket,
            heartbeatTtl: 5000,
            pingTimeout: 15000,
            timeoutHandle: () => this.close({
                errCode: ER_CODE.ER_HEARTBEAT_TIMEOUT,
                errMsg: WS_ERROR.ER_HEARTBEAT_TIMEOUT
            }),
        });

        this[_initSocket]();
    }

    sessionSet(obj, cover = false) {
        if (common.typeOf(obj) !== 'object')
            throw new Error('session must be an object');
        if (cover)
            for (let k in this[_session])
                delete this[_session][k];
        Object.assign(this[_session], obj);
    }

    sessionGet(key) {
        if (key)
            return this[_session][key];
        else
            return { ...this[_session] };
    }

    sessionDel(key) {
        if (key)
            delete this[_session][key];
        else
            for (let k in this[_session])
                delete this[_session][k];
    }

    getFrontSession() {
        return new FrontSession({
            sid: cluster.thisServer.id,
            sgroup: cluster.thisServer.group,
            cid: this.id,
            session: this[_session]
        });
    }

    async createReq(obj) {
        const { action } = obj;
        let tmp = action.split('.');
        let _action = tmp.length > 1 ? `${tmp[0]}.${tmp[1]}` : tmp[0];

        if ((await this[_reqWait](_action)) === false) {
            syslog.error(`client[${this.id}] frequent request =>`, this.sessionGet(), action);
            throw new Error(WS_ERROR.ER_FREQUENT_REQUEST);
        }

        // 请求判断是本机请求还是远程调用，分发
        try {
            let result = null;
            if (tmp.length > 1) {   // remote请求
                // 远程调用格式
                // ${sgroup}.${action}.${sid}          (√)
                // ${sgroup}.${route}.${action}.${sid} ( )
                result = await this[_remoteReq](obj, tmp[0], tmp[1], tmp[2]);
            } else {                // handler请求
                result = await this[_localReq](obj);
            }

            this[_reqNext](_action);
            return result;
        } catch (err) {
            this[_reqNext](_action);
            throw err;
        }
    }

    // 主动断
    async close(payload) {
        syslog.log(`client[${this.id}] 主动关闭 =>`, this.closed, payload, JSON.stringify(this[_session]));
        if (this.closed) return;
        this.closed = true;
        this.heartbeat.close();
        if (payload) {
            try {
                let closeData = JSON.stringify({ action: 'close', payload });
                await this[_socketSend](closeData);
            } catch (err) {

            }
        }
        this.socket.close();
        this.emit(WS_CLIENT_EVENT.CLOSE, this);
    }

    send(action, payload, id = 0) {
        return new Promise((resolve, reject) => {
            try {
                if (this.closed) {
                    syslog.debug(`client[${this.id}] send fail =>`, action, JSON.stringify(payload));
                    return reject(new Error(WS_ERROR.ER_SOCKET_CLOSED));
                }

                if (this.msgLowerCase)
                    payload = common.toLowerCase(payload);

                let data = JSON.stringify({ id, action, payload });
                // 放入发送队列
                this.sendQueue.push({ data, promise: { resolve, reject } });
                this[_send]();
            } catch (err) {
                reject(err);
            }
        });
    }

    [_initSocket]() {
        // this.socket.removeAllListeners('close');
        // this.socket.removeAllListeners('event');
        // this.socket.removeAllListeners('pong');
        // this.socket.removeAllListeners('message');
        // this.socket.removeAllListeners();

        this.socket.on('error', this[_onClose].bind(this));
        this.socket.on('close', this[_onClose].bind(this));
        this.socket.on('pong', () => this.heartbeat.onPong());

        this.socket.on('message', msg => {
            this.heartbeat.onPong();
            // syslog.debug(`client[${this.id}]  receive message =>`, msg, this.msgDeflate);
            try {
                msg = common.decompress(msg, this.msgDeflate);
                if (typeof msg !== 'string') return;

                const { id, action, payload } = JSON.parse(msg);
                if (typeof action !== 'string') return;
                if (action === 'ping') {
                    // 如果是ping请求直接返回pong
                    let pongData = JSON.stringify({ id, action: 'pong', payload: {} });
                    this[_socketSend](pongData);
                    return;
                }
                // 为本次请求创建请求对象
                this.createReq({ id, action, payload }).catch(e => {
                    syslog.error(`client[${this.id}] createReq catch error =>`, e);
                    this.send(action, { errmsg: e.message }, id);
                });
            } catch (err) {
                syslog.error(err, msg, this.msgDeflate);
                this.close(err);
            }
        });
        this.heartbeat.start();
        this.emit(WS_CLIENT_EVENT.OPEN, this);
    }

    async [_remoteReq](obj, sgroup, action, sid) {
        try {
            const frontSession = new FrontSession({
                sid: cluster.thisServer.id,
                sgroup: cluster.thisServer.group,
                cid: this.id,
                session: this[_session],
            });
            const serverInfo = await cluster.getServer(sgroup, frontSession, sid);
            if (serverInfo === null) {
                this.send('error', { errMsg: WS_ERROR.ER_SERVER_NOT_FOUND }, obj.id);
                return;
            }
            await remoteHandler.push(serverInfo, action, obj.payload, frontSession, obj.id);
        } catch (err) {
            syslog.error(`client[${this.id}] _remoteReq =>`, sgroup);
            let errmsg = err ? err : `request ${obj.event} error`;
            this.send('error', { errmsg, action }, obj.id);
            throw err;
        }
    }

    async [_localReq](obj) {
        const { action } = obj;
        const req = new WsRequest(obj, this);
        try {
            let result = await Promise.race([this.module[action](req), req.promise]);
            req.close();
            return result;
        } catch (err) {
            req.error(err);
            throw err;
        }
    }

    [_reqWait](action) {
        return new Promise((resolve, reject) => {
            if (!this.module.actionRules.hasOwnProperty(action))
                return resolve(false);

            let limit = this.module.actionRules[action];
            let count = (this.reqActions.get(action) || 0) + 1;
            if (limit !== -1 && count > limit) {
                return resolve(false);
            }
            this.reqActions.set(action, count);

            if (!this.reqSerial)
                return resolve(true);

            if (this.requesting) {
                this.reqQuque.push({ resolve, reject });
            } else {
                this.requesting = true;
                resolve(true);
            }
        });
    }

    [_reqNext](action) {
        let count = this.reqActions.get(action) || 0;
        count = (count === 0) ? count : count - 1;
        this.reqActions.set(action, count);

        if (!this.reqSerial) return;

        if (this.reqQuque.length > 0) {
            let prom = this.reqQuque.shift();
            prom.resolve(true);
        } else {
            this.requesting = false;
        }
    }

    [_onClose](err) {
        syslog.log(`client[${this.id}] 监听到关闭 =>`, err, this.closed, JSON.stringify(this[_session]));
        try {
            if (this.closed === false)
                this.emit(WS_CLIENT_EVENT.CLOSE, this);
            this.closed = true;
            this.heartbeat.close();
            if (this.socket !== null) {
                this.socket.removeAllListeners();
                this.socket = null;
            }
            this.removeAllListeners();
            for (let obj of this.sendQueue)
                obj.promise.reject(new Error(WS_ERROR.ER_SOCKET_CLOSED));
            this.sendQueue = [];
        } catch (err) {
            syslog.error(err);
        }
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
                        obj.promise.reject(new Error(WS_ERROR.ER_SOCKET_CLOSED));
                    this.sendQueue = [];
                } else {
                    // ws会出现未触发onClose的情况进入死循环
                    setImmediate(() => this[_send]());
                }
            } else {
                let obj = this.sendQueue.shift();
                obj.promise.resolve();
                if (this.sendQueue.length > 0)
                    setImmediate(() => this[_send]());
            }
        } catch (err) {
            syslog.error(`client[${this.id}] _send catch err =>`, err);
            this.sending = false;
            setImmediate(() => this[_send]());
        }
    }

    async [_socketSend](msg) {
        let data = common.compress(msg, this.msgDeflate);
        return await new Promise(r => this.socket.send(data, r));
    }
}

module.exports = WsClient;