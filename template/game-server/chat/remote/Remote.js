"use strict";

const _broadcast = Symbol('BROADCAST');

class Remote {

    constructor(app) {
        this.app = app;
        this.userMap = new Map();
    }

    async join(req) {
        let {username} = req.frontSession.get('user');
        console.log('chatServer join user =>', username);
        if (!this.userMap.has(username)) {
            this[_broadcast]('onadd', {username});
        }
        this.userMap.set(username, req.frontSession);
        let chatServer = this.app.cluster.thisServer;
        req.frontSession.set({chatServer});
        await req.frontSession.save();

        return req.response({status: 'ok', users: [...this.userMap.keys()]});
    }

    kick(req) {
        let {username} = req.frontSession.get('user');
        if (!this.userMap.has(username))
            return req.frontSession.disconnect('no join');
        this.userMap.delete(username);
        this[_broadcast]('onkick', {username});
    }

    send(req) {
        let {username} = req.frontSession.get('user');
        if (!this.userMap.has(username))
            return req.frontSession.disconnect('no join');

        let {msg} = req.params;
        let pushData = {from: username, msg};
        this[_broadcast]('onchat', pushData);

    }

    [_broadcast](action, payload) {
        for (let frontSession of this.userMap.values())
            frontSession.pushMessage(action, payload);
    }

}

module.exports = Remote;