/**
 * @file RemoteHandler
 * @desc 远程调用请求载体封装
 * @date 2019-04-01
 * @author howxin
 *
 */
"use strict";
const EventEmitter = require('events');
const {common} = require('../../utils');
const FrontSession = require('./FrontSession.js');
const {Model} = require('../../db');

let model = null;

class RemoteRequest extends EventEmitter {

    constructor(msg = {}, cli, trx = null) {
        super();

        this.id = msg.id || 0;
        this.action = msg.action || '';
        this.params = msg.payload || {};
        this.msg = msg;

        this.app = cli.app;
        this.cli = cli;

        this.trx = trx;
        this.isRollBack = false;
        this.err = null;
        this.frontSession = new FrontSession(msg.frontsession);
        this.promise = new Promise((resolve, reject) => {
            this._promise = {resolve, reject};
        });
        this.closed = false;
        this.responseMap = new Map();
        this.frontMap = new Map();
    }

    async begin() {
        try {
            if (model === null)
                model = new Model()
            if (this.trx === null)
                this.trx = await model.begin();
        } catch (err) {
            throw err;
        }
    }

    trxErr() {
        if (this.trx !== null)
            this.isRollBack = true;
    }

    async trxCommit() {
        try {
            if (this.trx) {
                await model.commit(this.trx);
                this.trx = null;
            }
        } catch (err) {
            throw err;
        }
    }

    reject(err) {
        this.err = err;
        if (this.trx !== null)
            this.isRollBack = true;
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

    send(action, payload) {
        return this.cli.send(action, payload, this.frontSession, this.id);
    }

    /**
     * 直接通知客户端
     * @param action
     * @param payload
     */
    pushMessage(action, payload) {
        return this.frontSession.pushMessage(action, payload, this.id);
    }

    frontPush(action, payload = {status: 'ok'}) {
        if (this.frontMap.has(action)) {
            let _payload = this.frontMap.get(action);
            if (typeof _payload === 'object' && _payload !== null && typeof payload === 'object')
                this.frontMap.set(action, {..._payload, ...payload});
            else
                this.frontMap.set(action, payload);
        } else {
            this.frontMap.set(action, {...{status: 'ok'}, ...payload});
        }
    }

    frontError(action, error) {
        this.reject(error);
        if (this.frontMap.has(action)) {
            let _payload = this.frontMap.get(action);
            if (typeof _payload === 'object' && _payload !== null && typeof error === 'object')
                this.frontMap.set(action, {..._payload, ...error});
            else
                this.frontMap.set(action, error);
        } else {
            this.frontMap.set(action, {...{status: 'error'}, ...error});
        }
    }

    async close(result) {
        try {
            if (this.closed) return;

            this.emit('beforeClose', this.err, result);

            this.closed = true;

            if (this.trx !== null) {
                if (this.isRollBack)
                    await model.rollback(this.trx);
                else
                    await model.commit(this.trx);
            }

            this.responseMap.forEach((payload, action) => {
                this.cli.send(action, payload, this.frontSession, this.id);
            });
            this.frontMap.forEach((payload, action) => {
                this.pushMessage(action, payload);
            });

            this.emit('afterClose', this.err, result);
            return this._promise.resolve(result);
        } catch (err) {
            console.error('remoteRequest close catch err =>', err);
            if (this.trx !== null)
                await model.rollback(this.trx).catch(err => {});
            this.closed = true;
            return this.error(err);
        }
    }

    async error(err) {
        if (this.closed) return;
        this.emit('beforeClose', err);
        this.closed = true;
        let msg = '';
        if (err instanceof Error) {
            msg = err.stack;
        } else if (typeof err === 'object' && err !== null) {
            try {
                msg = JSON.stringify(err);
            } catch (err) {
                msg = String(err);
            }
        } else {
            msg = String(err);
        }

        if (this.trx !== null)
            await model.rollback(this.trx);

        this.emit('afterClose', err);
        this._promise.reject(msg);
        this.cli.send('error', msg, this.frontSession, this.id);
    }

    validate(pattern, data = this.params) {
        return common.validate(pattern, data);
    }
}

module.exports = RemoteRequest;