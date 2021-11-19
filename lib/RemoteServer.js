/**
 * @file RemoteServer
 * @desc
 * @author howxin
 */
"use strict";
const url = require('url');
const http = require('http');
const Events = require('events');
const WsServer = require('ws').Server;
const remoteHandler = require('./remoteHandler.js');
const RemoteClient = require('./RemoteClient.js');
const { common, Syslog } = require('../../utils');

const syslog = Syslog('hypercube.RemoteServer');

class RemoteServer extends Events {

    constructor(app, opts = {}) {
        super();

        this.app = app;
        this.maxConn = opts.maxConn || 1024;
        this.server = http.createServer();
        this.wss = new WsServer({ server: this.server });
        this.remoteModule = null;

        this.wss.on('connection', async (socket, req) => {
            const { pathname } = url.parse(req.url);
            if (pathname !== '/remote')
                return socket.close();
            let remoteCli = new RemoteClient(this.app, socket, this.remoteModule, opts.client);
            remoteHandler.addRemoteClient(remoteCli);
        });
    }

    use(controller) {
        this.remoteModule = controller;
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
}

module.exports = RemoteServer;