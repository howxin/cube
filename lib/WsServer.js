/**
 * @file WsServer
 * @desc websocket服务器
 * @author howxin
 * @param opts {object} 启动选项
 *          * server {object} http服务器
 *          * maxConn {number} 最大连接数，默认为100
 *          * encode {string} 传输加压模式
 */
"use strict";
const ws = require('ws');
const url = require('url');
const http = require('http');
const Events = require('events');
const qs = require('querystring');
const remoteHandler = require('./remoteHandler.js');
const WsClient = require('./WsClient.js');
const RemoteClient = require('./RemoteClient.js');
const { common, Syslog } = require('../../utils');
const cluster = require('../cluster');
const { WS_SERVER_EVENT, WS_ERROR } = require('./constants.js');

const syslog = Syslog('hypercube.WsServer');

class WsServer extends Events {

    constructor(opts = {}) {
        super();

        this.maxConn = opts.maxConn || 1024;
        this.server = opts.server || http.createServer();
        this.wss = new ws.Server({ server: this.server });
        this.clientMap = new Map();
        this.moduleMap = new Map();

        // setInterval(() => {
        //     syslog.debug('当前ws连接数 =>', this.clientMap.size);
        // }, 30000);

        this.wss.on('connection', async (socket, req) => {
            // syslog.debug(`有新的ws连接进来，当前ws连接数：${this.clientMap.size}`);
            const urlObj = url.parse(req.url);
            const route = urlObj.pathname;
            if (!this.moduleMap.has(route))
                return socket.close();

            switch (route) {
                // 远程调用连接
                case '/remote': {
                    // syslog.debug(`worker_${process.pid} 本次连接类型[remote]，remote连接开始建立`);
                    let remoteModule = this.moduleMap.get('/remote');
                    let remoteCli = new RemoteClient(socket, remoteModule);
                    remoteHandler.addRemoteClient(remoteCli);
                    return;
                }
                // 用户调用连接
                default: {
                    if (this.clientCount >= this.maxConn)
                        return socket.close();

                    let client = new WsClient(this.getNewCid, socket, this.moduleMap.get(route), opts);
                    client.sessionSet(qs.parse(urlObj.query));
                    this.clientMap.set(client.id, { route: route, client });
                    client.once('close', _cli => {
                        if (this.clientMap.has(_cli.id)) {
                            const _client = this.clientMap.get(_cli.id);
                            this.clientMap.delete(_cli.id);
                            this.emit(WS_SERVER_EVENT.DISCONNECT, _cli, _client.route);
                            client = null;
                        }
                    });

                    // 通知已经连接
                    this.emit(WS_SERVER_EVENT.CONNECTION, client, route);
                }
            }
        });
    }

    use(controllers) {
        if (common.typeOf(controllers) !== 'map')
            throw new Error(WS_ERROR.ER_INVALID_PARAMS);
        for (let [route, controller] of controllers.entries())
            this.moduleMap.set(route, controller);
    }

    listen(...args) {
        this.server.listen.apply(this.server, ...args);
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

module.exports = WsServer;