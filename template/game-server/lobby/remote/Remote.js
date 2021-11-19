/**
 * @class Remote
 * @author howxin
 * @param app
 */
"use strict";
const common = require('../../common/utils/common.js');
const userModel = require('../../common/model/userModel.js');

class Remote {

    constructor(app) {
        this.app = app;
    }

    async dologin(req) {
        const {username, password, session} = req.params;
        let userInfo = null;
        if (session) {
            userInfo = await userModel.getBySession(req.trx, ['id', 'username', 'password', 'nickname'], session);
        } else if (username && password) {
            userInfo = await userModel.getByUsernameAndPsw(req.trx, ['id', 'username', 'password', 'nickname'], username, password);
        } else {
            return req.response({status: 'error', errmsg: 'invalid_params'});
        }

        if (userInfo) {
            userInfo.sessionId = common.sha1(`${userInfo.username}${userInfo.password}`);
            await userModel.updateSessionById(req.trx, userInfo.sessionId, userInfo.id);

            let _userInfo = {...{}, ...userInfo};
            delete _userInfo['password'];
            req.frontSession.set({userInfo: _userInfo});
            await req.frontSession.save();
            req.response({status: 'ok', userinfo: _userInfo});
        } else {
            req.response({status: 'error', errmsg: 'session_expired'});
        }
    }

    async dologout(req) {

    }

    async joingame(req) {
        try {
            let {action, payload} = req.params;
            let res = await this.app.remoteRequest('game', action, payload, req.frontSession);
            req.response({});
        } catch (err) {

        }
    }

}

module.exports = Remote;