/**
 * @file RemoteConnector
 * @desc 远程调用连接器内置方法
 * @param app {object}
 */
"use strict";
const { REMOTE_NATIVE_ACTION } = require('./constants.js');

class RemoteConnector {

    constructor(app) {
        this.app = app;
    }


    [REMOTE_NATIVE_ACTION.SYNC_SESSION](req) {
        try {
            const { cid } = req.params;
            const client = this.app.clientServer.getClient(cid);
            if (client === null)
                return req.response({ status: 'error', errMsg: 'no client' });
            req.response({ status: 'ok', session: client.sessionGet() });
        } catch (err) {
            req.response({ status: 'error', errMsg: err });
        }
    }

    [REMOTE_NATIVE_ACTION.SAVE_SESSION](req) {
        try {
            const { mode, cid } = req.params;
            const client = this.app.clientServer.getClient(cid);
            if (client === null)
                return req.response({ status: 'error', errMsg: 'no client' });

            const session = req.frontSession.get();
            client.sessionSet(session, (mode === 'cover'));
            req.response({ status: 'ok', session: client.sessionGet() });
        } catch (err) {
            req.response({ status: 'error', errMsg: err });
        }
    }

    [REMOTE_NATIVE_ACTION.PUSH_MESSAGE](req) {
        const { id, action, payload, cid } = req.params;
        const client = this.app.clientServer.getClient(cid);
        if (client === null) return;
        client.send(action, payload, id);
    }

    [REMOTE_NATIVE_ACTION.CLIENT_DISCONNECT](req) {
        try {
            const { cid, reason } = req.params;
            const client = this.app.clientServer.getClient(cid);
            if (client === null)
                return req.response({ status: 'error', errMsg: 'no client' });

            client.close(reason);
            req.response({ status: 'ok' });
        } catch (err) {
            req.response({ status: 'error', errMsg: err });
        }
    }

}

module.exports = RemoteConnector;