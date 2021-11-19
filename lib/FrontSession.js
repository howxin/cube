/**
 * @file FrontSession
 * @desc 远程调用之间的session工具
 * @author howxin
 * @param obj {object}
 *          * sid {number} 请求服务器id
 *          * sgroup {string} 请求服务器名字
 *          * cid {string} 请求客户端id
 */
"use strict";
const cluster = require('../cluster');
const { common } = require('../../utils');
const { FRONTSESSION_ERROR, REMOTE_NATIVE_ACTION } = require('./constants.js');

const _session = Symbol('SESSION');

class FrontSession {

    constructor(obj = {}) {
        this.created = true;
        if (['sid', 'sgroup', 'cid'].filter(key => (typeof obj[key]) === 'undefined').length)
            this.created = false;

        this.sid = obj.sid;
        this.sgroup = obj.sgroup;
        this.cid = obj.cid;
        this[_session] = obj.session;
    }

    format() {
        if (this.created)
            return { sid: this.sid, sgroup: this.sgroup, cid: this.cid, session: this[_session] };
        else
            return {};
    }

    set(session, cover = false) {
        if (common.typeOf(session) !== 'object')
            throw new Error(FRONTSESSION_ERROR.ER_INVALID_PARAMS);
        if (cover)
            this.del();
        Object.assign(this[_session], session);
    }

    get(key) {
        if (key)
            return this[_session][key];
        else
            return { ...this[_session] };
    }

    del(key) {
        if (key)
            delete this[_session][key];
        else
            for (let k in this[_session])
                delete this[_session][k];
    }

    async sync() {
        if (!this.created)
            throw new Error(FRONTSESSION_ERROR.ER_NO_CREATE);

        const remoteHandler = require('./remoteHandler.js');

        let serverInfo = await cluster.getServer(this.sgroup, this, this.sid);
        let data = { cid: this.cid };

        let res = await remoteHandler.request(serverInfo, REMOTE_NATIVE_ACTION.SYNC_SESSION, data, this);
        if (res.status === 'ok')
            this.set(res.session, true);
        else
            throw res.errmsg;
    }

    async save(mode = 'append') {
        if (!this.created)
            throw new Error(FRONTSESSION_ERROR.ER_NO_CREATE);

        const remoteHandler = require('./remoteHandler.js');

        let serverInfo = await cluster.getServer(this.sgroup, this, this.sid);
        let data = { mode, cid: this.cid };

        let res = await remoteHandler.request(serverInfo, REMOTE_NATIVE_ACTION.SAVE_SESSION, data, this);
        if (res.status === 'ok')
            this.set(res.session, true);
        else
            throw res.errmsg;
    }

    async pushMessage(action, payload, id = 0) {
        if (!this.created)
            throw new Error(FRONTSESSION_ERROR.ER_NO_CREATE);

        const remoteHandler = require('./remoteHandler.js');
        let serverInfo = await cluster.getServer(this.sgroup, this, this.sid);
        let data = { id, action, payload, cid: this.cid };
        await remoteHandler.push(serverInfo, REMOTE_NATIVE_ACTION.PUSH_MESSAGE, data, this);
    }

    async disconnect(reason) {
        if (!this.created)
            throw new Error(FRONTSESSION_ERROR.ER_NO_CREATE);

        const remoteHandler = require('./remoteHandler.js');

        let serverInfo = await cluster.getServer(this.sgroup, this, this.sid);
        let data = { cid: this.cid, reason };
        let res = await remoteHandler.request(serverInfo, REMOTE_NATIVE_ACTION.CLIENT_DISCONNECT, data, this);
        return res.status === 'ok';
    }
}

module.exports = FrontSession;