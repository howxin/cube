/**
 * @file sessionService
 * @desc 本地session管理模块，用于存储客户端与本地服务器沟通的会话信息，可以绑定用户id，存储比如游戏中用户信息、手牌等临时信息
 * @date 2019-04-01
 * @author howxin
 */
"use strict";
const {common} = require('../../utils');
const {SESSION_SERVICE_ERROR} = require('./constants.js');

const _session = Symbol('SESSION');

function Session() {

    this[_session] = {};

    this.get = (key) => {
        if (key)
            return this[_session][key];
        else
            return {...this[_session]};
    };

    this.set = (session, cover = false) => {
        if (common.typeOf(session) !== 'object')
            throw new Error(SESSION_SERVICE_ERROR.ER_INVALID_PARAMS);

        if (cover) {
            for (let key in this[_session])
                delete this[_session][key];
        }
        Object.assign(this[_session], session);
    };

    this.del = (key) => {
        if (key)
            delete this[_session][key];
        else
            for (let key in this[_session])
                delete this[_session][key];
    };
}


class SessionService {

    constructor() {
        this.sessionMap = new Map();
        this.groupIdMap = new Map();
        this.userIdMap = new Map();
        this.userIdSessionIdMap = new Map();
    }

    init(sessionId) {
        if (this.sessionMap.has(sessionId))
            throw new Error('');
        const session = new Session();
        this.sessionMap.set(sessionId, session);
        return session;
    }

    // set(sessionId, session, mode = 'append') {
    //     if (sessionId === null || typeof sessionId === 'undefined' || common.typeOf(session) !== 'object')
    //         throw new Error();
    //     if (!this.sessionMap.has(sessionId))
    //         return false;
    //     switch (mode) {
    //         case 'append':
    //         case 'cover':
    //             const current = this.sessionMap.get(sessionId);
    //             current.set(session, mode);
    //             break;
    //         default:
    //             throw new Error(SESSION_SERVICE_ERROR.ER_INVALID_MODE);
    //     }
    //     return true;
    // }

    get(sessionId) {
        return (this.sessionMap.get(sessionId) || null);
    }

    // del(sessionId, key) {
    //     if (this.sessionMap.has(sessionId)) {
    //         const session = this.sessionMap.get(sessionId);
    //         session.del(key);
    //     }
    // }

    delById(sessionId) {
        if (this.sessionMap.has(sessionId))
            this.sessionMap.delete(sessionId);
        // for (let sessionSet of this.groupIdMap.values()) {
        //     if (sessionSet.has(sessionId))
        //         sessionSet.delete(sessionId);
        // }
    }

    bind(sessionId, uid) {
        if (this.sessionMap.has(sessionId)) {
            this.userIdMap.set(uid, this.sessionMap.get(sessionId));
            this.userIdSessionIdMap.set(uid, sessionId);
            return true;
        } else {
            return false;
        }
    }

    rebind(sessionId, uid) {
        if (this.userIdMap.has(uid)) {
            const session = this.userIdMap.get(uid);
            this.sessionMap.set(sessionId, session);
            this.userIdSessionIdMap.set(uid, sessionId);
            return true;
        } else {
            return false;
        }
    }

    delByUid(uid, global = true) {
        if (this.userIdMap.has(uid)) {
            this.userIdMap.delete(uid);
            let sessionId = this.userIdSessionIdMap.get(uid);
            this.userIdSessionIdMap.delete(uid);
            if (global) {
                this.sessionMap.delete(sessionId);
                for (let sessionSet of this.groupIdMap.values()) {
                    if (sessionSet.has(sessionId))
                        sessionSet.delete(sessionId);
                }
            }
        }
    }

    getSessionByUid(uid) {
        return (this.userIdMap.get(uid) || null);
    }

    // addGroup(gid, sessionId = -1) {
    //     if (!this.groupIdMap.has(gid))
    //         this.groupIdMap.set(gid, new Set());
    //     if (typeof sessionId === 'number' && sessionId !== -1)
    //         this.groupIdMap.get(gid).add(sessionId);
    // }
    //
    // deleteGroup(gid) {
    //     if (this.groupIdMap.has(gid)) {
    //         const group = this.groupIdMap.get(gid);
    //         for (let sessionId of group.values())
    //             this.sessionMap.delete(sessionId);
    //         this.groupIdMap.delete(gid);
    //     }
    // }JSO

}


module.exports = new SessionService();