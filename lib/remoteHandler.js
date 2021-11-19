/**
 * @file RemoteHandler
 * @desc 远程调用管理器
 * @author howxin
 */
"use strict";
const Events = require('events');
const cluster = require('../cluster');
const RemoteClient = require('../lib/RemoteClient.js');
const RemoteServerClient = require('./RemoteServerClient.js');
const { REMOTE_CLIENT_EVENT, REMOTE_SERVER_EVENT, ER_CODE } = require('../lib/constants.js');
const { Syslog } = require('../../utils');

const syslog = Syslog('hypercube.RemoteHandler');

const _onServerDestroy = Symbol('ON_SERVER_DESTROY');
const _onServerDrop = Symbol('ON_SERVER_DROP');
const _getServerGroup = Symbol('GET_SERVER_GROUP');
const _addServer = Symbol('ADD_SERVER');
const _getServer = Symbol('GET_SERVER');
const _delServer = Symbol('DEL_SERVER');
const _remainCheck = Symbol('REMAIN_CHECK');


class RemoteHandler extends Events {

    constructor() {
        super();
        this.opts = {};
        this.serverMap = new Map();
        this.remainServer = null;
        this.remoteModule = null;
        this.retryInterval = [5000, 10000, 60000];
        this.updateTimeout = 30 * 1000;
    }

    /**
     * 初始化
     * @param app
     * @param servers  默认连接服务器群
     * @param module {object}
     * @param opts
     *          * retryInterval {array} 重试次数与每次的重试时间间隔
     *          * updateTimeout {number}
     *
     * @returns {Promise.<void>}
     */
    async init(app, servers, module, opts = {}) {
        this.app = app;
        if (this.remoteModule !== null)
            return;
        this.remoteModule = module;
        this.opts = opts;

        if (Array.isArray(opts.retryInterval)) {
            this.retryInterval.splice(0);
            this.retryInterval.concat(opts.retryInterval);
        }

        if (opts.hasOwnProperty(opts.updateTimeout)) {
            let updateTimeout = parseInt(opts.updateTimeout);
            if (!Number.isNaN(updateTimeout) && updateTimeout > 0)
                this.updateTimeout = updateTimeout;
        }

        if (servers === null || typeof servers === 'undefined')
            servers = [];
        else if (!Array.isArray(servers))
            servers = Array.of(servers);

        this.remainServer = new Set(servers);
        for (let sgroup of this.remainServer.values()) {
            let serverInfos = await cluster.getServers(sgroup);
            if (serverInfos.length === 0) {
                this[_remainCheck](sgroup, 0);
                continue;
            }

            // 默认连接远程服务器
            let smap = this[_getServerGroup](sgroup);
            for (let serverInfo of serverInfos) {
                let remoteServerCli = new RemoteServerClient(this.app, serverInfo, this.remoteModule, opts.client);
                smap.set(serverInfo.id, remoteServerCli);
                remoteServerCli.on(REMOTE_SERVER_EVENT.DISCONNECT, _rs => _rs.reconnect());
                remoteServerCli.on(REMOTE_SERVER_EVENT.DESTROY, this[_onServerDestroy].bind(this));
                remoteServerCli.on(REMOTE_SERVER_EVENT.DROP, this[_onServerDrop].bind(this));
            }
            this[_remainCheck](sgroup, 0, true);
        }
    }

    /**
     * 请求远程服务器，有返回
     * @param serverInfo
     * @param action
     * @param payload
     * @param frontSession
     * @returns {Promise.<*>}
     */
    async request(serverInfo, action, payload, frontSession) {
        let server = await this.load(serverInfo);
        return server.request(action, payload, frontSession);
    }

    /**
     * 指定远程服务器直接推送
     * @param serverInfo
     * @param action
     * @param payload
     * @param frontSession
     * @param id
     * @returns {Promise.<void>}
     */
    async push(serverInfo, action, payload, frontSession, id) {
        let server = await this.load(serverInfo);
        await server.send(action, payload, frontSession, id);
    }

    /**
     * 获取指定服务器，如果缓存没有直接创建并缓存
     * @param serverInfo
     * @returns {*}
     */
    load(serverInfo) {
        try {
            if (serverInfo === null || typeof serverInfo !== "object") {
                syslog.error(serverInfo);
                throw new Error("no such server");
            }
            let rsc = this[_getServer](serverInfo.group, serverInfo.id);
            if (!!rsc)
                return rsc;
            rsc = new RemoteServerClient(this.app, serverInfo, this.remoteModule, this.opts.client);
            this[_addServer](rsc);
            rsc.on(REMOTE_SERVER_EVENT.DESTROY, this[_onServerDestroy].bind(this));
            rsc.on(REMOTE_SERVER_EVENT.DROP, this[_onServerDrop].bind(this));
            return rsc;
        } catch (err) {
            syslog.error('load catch err =>', err, serverInfo);
            throw err;
        }
    }

    /**
     * 添加远程调用客户端
     * @param remoteCli
     */
    addRemoteClient(remoteCli) {
        if (!(remoteCli instanceof RemoteClient)) return;

        // 建立连接之后添加至缓存
        remoteCli.once(REMOTE_CLIENT_EVENT.INIT, async rc => {
            let { id, group } = rc.serverInfo;
            let _server = this[_getServer](group, id);
            if (!!_server) {
                syslog.debug(`有重复的远程调用连接，需要关闭，worker_${process.pid}`, id, group);
                remoteCli.close(true, {
                    errCode: ER_CODE.ER_REPEAT_CONNECT,
                    errMsg: 'repeat connect'
                });
                return;
            }
            await this[_addServer](rc);
            rc.on(REMOTE_CLIENT_EVENT.DESTROY, this[_onServerDestroy].bind(this));
            rc.on(REMOTE_CLIENT_EVENT.DROP, this[_onServerDrop].bind(this));
            //
            this.emit('connection', rc);
        });
    }

    /**
     * 关闭所有远程连接
     * @returns {Promise.<void>}
     */
    async drop() {
        const servers = [];
        const allServer = this[_getServerGroup]('*');
        for (let smap of allServer) {
            for (let r of smap.values())
                servers.push(r.close(true));
        }
        await Promise.all(servers);
    }

    [_getServerGroup](sgroup) {
        if (sgroup === '*') {
            return this.serverMap.values();
        } else {
            if (!this.serverMap.has(sgroup))
                this.serverMap.set(sgroup, new Map());
            return this.serverMap.get(sgroup);
        }
    }

    [_getServer](sgroup, sid) {
        return this[_getServerGroup](sgroup).get(sid);
    }

    /**
     * 添加远程服务连接
     * @param remoteCli
     * @returns {Promise.<boolean>}
     */
    async [_addServer](remoteCli) {
        const { id, group } = remoteCli.serverInfo;
        const smap = this[_getServerGroup](group);
        if (smap.has(id))
            return false;
        smap.set(id, remoteCli);
        await cluster.addServer(remoteCli.serverInfo);
        return true;
    }

    [_delServer](sgroup, sid) {
        const smap = this[_getServerGroup](sgroup);
        if (smap.has(sid)) {
            let rc = smap.get(sid);
            rc.removeAllListeners();
            smap.delete(sid);
        }
        if (!smap.size)
            this.serverMap.delete(sgroup);
    }

    /**
     * 常用远程服务器连接检查
     * @param sgroup
     * @param retry
     * @param isUpdate
     */
    [_remainCheck](sgroup, retry = 0, isUpdate = false) {
        let timeout = 1000;
        if (isUpdate) {
            timeout = this.updateTimeout;
        } else {
            retry = (retry < this.retryInterval.length) ? retry : this.retryInterval.length - 1;
            timeout = this.retryInterval[retry];
        }

        setTimeout(async () => {
            try {
                let serverInfos = await cluster.getServers(sgroup);
                if (serverInfos.length === 0) {
                    await cluster.sync();
                    this[_remainCheck](sgroup, ++retry);
                } else {
                    let smap = this[_getServerGroup](sgroup);
                    for (let serverInfo of serverInfos) {
                        if (smap.has(serverInfo.id)) continue;

                        let remoteServerCli = new RemoteServerClient(this.app, serverInfo, this.remoteModule, this.opts.client);
                        smap.set(serverInfo.id, remoteServerCli);
                        remoteServerCli.on(REMOTE_SERVER_EVENT.DISCONNECT, _rs => _rs.reconnect());
                        remoteServerCli.on(REMOTE_SERVER_EVENT.DESTROY, this[_onServerDestroy].bind(this));
                        remoteServerCli.on(REMOTE_SERVER_EVENT.DROP, this[_onServerDrop].bind(this));
                    }
                    this[_remainCheck](sgroup, 0, true);
                }
            } catch (err) {
                syslog.error("remote handler remain error =>", err);
                this[_remainCheck](sgroup, ++retry);
            }
        }, timeout);
    }

    /**
     * server断线处理
     * @param r
     */
    [_onServerDestroy](r) {
        // syslog.log('------_onServerDestroy------', r.serverInfo.id);
        let { id, group } = r.serverInfo;
        this[_delServer](group, id);
        // if (this.remainServer.has(sgroup))
        //     this[_remainCheck](sgroup, 0)
        cluster.removeServer(r.serverInfo);
        this.emit('destroy', r);
    }

    /**
     * server下线处理
     * @param r
     */
    [_onServerDrop](r) {
        // syslog.log('------_onServerDrop------', r.serverInfo.id);
        cluster.dropServer(r.serverInfo);
        this.emit('drop', r);
    }
}

module.exports = new RemoteHandler();