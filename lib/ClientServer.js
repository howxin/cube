/**
 * @file ClientServer
 * @desc
 * @author howxin
 */
"use strict";
const ws = require('ws');
const url = require('url');
const http = require('http');
const Events = require('events');
const qs = require('querystring');
const WsClient = require('./WsClient.js');
const { common, Syslog } = require('../../utils');
const cluster = require('../cluster');
const { WS_SERVER_EVENT, WS_ERROR } = require('./constants.js');

const syslog = Syslog('hypercube.ClientServer');

const getIp = (req) => {
    if (!common.empty(req.headers['cf-connecting-ip']))
        return req.headers['cf-connecting-ip'];
    else if (!common.empty(req.headers['x-forwarded-for']))
        return req.headers['x-forwarded-for'];
    else
        return req.connection.remoteAddress;
};

class ClientServer extends Events {

    constructor(app, opts = {}) {
        super();

        this.app = app;
        this.maxConn = opts.maxConn || 1024;
        this.server = http.createServer();
        this.wss = new ws.Server({ server: this.server });
        this.clientMap = new Map();
        this.moduleMap = new Map();

        setInterval(() => syslog.debug(`当前连接数：${this.clientMap.size}`), 60000 * 5);

        this.wss.on('connection', async (socket, req) => {

            const ip = getIp(req);

            const urlObj = url.parse(req.url);
            const route = urlObj.pathname;
            if (!this.moduleMap.has(route)) {
                syslog.log(`invalid connect, ip =>`, ip, 'route =>', route);
                return socket.terminate();
            }
            if (this.clientCount >= this.maxConn) {
                syslog.log('max connect', route, [...this.moduleMap.keys(), this.clientCount, this.maxConn]);
                return socket.terminate();
            }

            let client = new WsClient(this.getNewCid, socket, this.moduleMap.get(route), { ...opts.client, ...{ ip } });
            client.sessionSet(qs.parse(urlObj.query));
            this.clientMap.set(client.id, { route: route, client });
            syslog.debug(`client[${client.id}] connect, ip => ${ip}, 当前连接数 => ${this.clientMap.size}`);
            client.once('close', _cli => {
                if (this.clientMap.has(_cli.id)) {
                    const _client = this.clientMap.get(_cli.id);
                    this.clientMap.delete(_cli.id);
                    syslog.debug(`client[${_cli.id}] disconnect, 当前连接数 => ${this.clientMap.size}`);
                    this.emit(WS_SERVER_EVENT.DISCONNECT, _cli, _client.route);
                    client = null;
                }
            });

            // 通知已经连接
            this.emit(WS_SERVER_EVENT.CONNECTION, client, route);
        });
    }

    use(router = '/', controller) {
        // if (typeof controller !== 'function')
        //     throw new Error(WS_ERROR.ER_INVALID_PARAMS);
        this.moduleMap.set(router, controller);
    }

    listen(host, port, cb = () => {
    }) {
        const server = this.server;
        return new Promise((resolve, reject) => {
            server.on('error', (err) => {
                if (err.code === 'EADDRINUSE')
                    reject(new Error('EADDRINUSE'));
                else
                    reject(err);
                this.emit('error', err);
            });
            server.listen.apply(server, [port, host, () => {
                resolve();
                cb();
                this.emit('listening');
            }]);
        });
    }

    broadcast(action, payload, route = null) {

    }

    get clientCount() {
        return this.clientMap.size;
    }

    getClient(id) {
        if (id === '*')
            return [...this.clientMap.values()];
        else if (this.clientMap.has(id))
            return this.clientMap.get(id).client;
        else
            return null;
    }

    get getNewCid() {
        let idx = null;
        do {
            idx = `${cluster.thisServer.id}${common.gencode()}`;
        } while (this.clientMap.has(idx));
        return idx;
    }
}

module.exports = ClientServer;