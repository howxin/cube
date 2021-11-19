/**
 * @class Handler 客户请求处理类
 * @author howxin
 * @param app
 */
"use strict";
const actionRules = {
    'dologin': 1,
    'chat.send': -1
};

class Handler {

    constructor(app) {
        this.app = app;
        this.actionRules = actionRules;
    }


    async dologin(req) {

        try {
            if (!req.validate({
                    username: {type: 'string', min: 3, max: 10},
                    password: {type: 'string', len: 6},
                    session: {type: 'string', required: false}
                }))
                return req.error('invalid_params');

            let {username, password, session} = req.params;
            let payload = {username, password, session};
            let frontSession = req.getFrontSession();

            let lobbyRes = await this.app.remoteRequest('lobby', 'dologin', payload, frontSession);
            if (lobbyRes.status === 'error') {
                req.response({status: 'error', errmsg: lobbyRes.errmsg});
                return;
            }

            let chatRes = await this.app.remoteRequest('chat', 'join', {}, frontSession);
            if (chatRes.status === 'error') {
                req.response({status: 'error', errmsg: chatRes.errmsg});
                return;
            }

            const chatServer = frontSession.get('chat');
            req.response({
                status: 'ok',
                userinfo: frontSession.get('user'),
                chatinfo: {
                    id: chatServer.id,
                    users: chatRes.users,
                }
            });
        } catch (err) {
            console.log('handler.dologin catch err =>', err);
            req.error(err.msg);
        }
    }


}

module.exports = Handler;