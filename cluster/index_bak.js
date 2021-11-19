/**
 * @file Cluster
 * @desc 服务器集群管理类
 * @author howxin
 */
"use strict";
const Storage = require('./Storage.js');
const {CLUSTER_ERROR} = require('../lib/constants.js');

const _monitor = Symbol('MONITOR');
const _wait = Symbol('WAIT');
const _next = Symbol('NEXT');

class Cluster {

    constructor() {
        this.storage = null;
        this.serverInfo = {};
        this.serverGroupMap = new Map();
        this.dispatchMap = new Map();


        this.monitorId = null;
        this.monitorQueue = [];
        this.monitoring = false;
        this.monitorInterval = 30 * 1000;
        this.lastMonitorTime = null;
        this.monitorTtl = 5 * 1000;
    }

    /**
     * 配置
     * @param opts
     *          * serverInfo    {object}    本机信息
     *          * storage       {module}    查询模块
     *          * dispatcher    {object}    服务器分配方法
     *          * autoSync      {boolean}   是否自动更新
     *          * syncInterval  {number}    自动更新间隔
     */
    configure(opts = {}) {
        const {serverInfo, storage, dispatcher = [], autoSync = false, syncInterval} = opts;
        if (!serverInfo || !storage)
            throw new Error(CLUSTER_ERROR.ER_INVALID_PARAMS);
        this.serverInfo = serverInfo;
        this.storage = new Storage({module: storage});

        for (let sgroup in dispatcher)
            this.dispatchMap.set(sgroup, dispatcher[sgroup]);

        this.autoSync = autoSync;
        if (!!syncInterval && (typeof syncInterval === 'number') && autoSync === true)
            this.monitorInterval = syncInterval;
    }

    async start() {
        await this.storage.start(this.serverInfo);
        if (this.autoSync)
            await this[_monitor]();
    }

    get thisServer() {
        return {...this.serverInfo};
    }

    async getServer(sgroup, frontSession, sid) {
        if (!this.serverGroupMap.has(sgroup))
            await this[_monitor]();
        if (!this.serverGroupMap.has(sgroup))
            return null;

        let servers = this.serverGroupMap.get(sgroup);
        if (!!sid)
            return (servers.get(String(sid)) || null);
        else
            return this.dispatch(sgroup, frontSession);
    }

    async getServers(sgroup) {
        const servers = [];
        if (!this.serverGroupMap.has(sgroup))
            await this[_monitor]();
        if (!this.serverGroupMap.has(sgroup))
            return servers;
        let smap = this.serverGroupMap.get(sgroup);
        for (let serverInfo of smap.values())
            servers.push(serverInfo);
        return servers;
    }

    async dispatch(sgroup, frontSession) {
        let servers = this.serverGroupMap.get(sgroup);
        if (!servers || servers.size === 0)
            await this[_monitor]();
        servers = this.serverGroupMap.get(sgroup);
        if (!servers || servers.size === 0)
            return null;
        if (this.dispatchMap.has(sgroup)) {
            return this.dispatchMap.get(sgroup)(servers, frontSession);
        } else {
            let ramIdx = Math.floor(servers.size * Math.random());
            return [...servers.values()][ramIdx];
        }
    }

    async addServer(serverInfo) {
        await this.storage.add(serverInfo);
    }

    async removeServer(serverInfo) {
        let sgroup = serverInfo.group;
        if (this.serverGroupMap.has(sgroup)) {
            let smap = this.serverGroupMap.get(sgroup);
            smap.delete(serverInfo.id);
            if (smap.size === 0)
                this.serverGroupMap.delete(sgroup);
        }
        await this.storage.remove(serverInfo);
        this[_monitor]();

    }

    async dropServer(serverInfo) {
        let sgroup = serverInfo.group;
        if (this.serverGroupMap.has(sgroup)) {
            let smap = this.serverGroupMap.get(sgroup);
            smap.delete(serverInfo.id);
            if (smap.size === 0)
                this.serverGroupMap.delete(sgroup);
        }
        await this.storage.drop(serverInfo);
        this[_monitor]();
    }

    async drop() {
        if (this.monitorId)
            clearTimeout(this.monitorId);
        await this.storage.drop(this.thisServer);
    }

    [_wait]() {
        return new Promise(resolve => {
            if (this.monitoring)
                this.monitorQueue.push({resolve});
            else
                resolve();
        });
    }

    [_next]() {
        if (this.monitorQueue.length > 0)
            this.monitorQueue.shift().resolve();
    }

    async [_monitor]() {
        try {
            await this[_wait]();
            if (Date.now() - this.lastMonitorTime <= this.monitorTtl)
                return this[_next]();

            this.monitoring = true;
            if (this.monitorId)
                clearTimeout(this.monitorId);
            const serverList = await this.storage.get();
            for (let sgroup in serverList) {
                if (!this.serverGroupMap.has(sgroup))
                    this.serverGroupMap.set(sgroup, new Map());
                let sgroupMap = this.serverGroupMap.get(sgroup);
                sgroupMap.clear();
                for (let server of serverList[sgroup])
                    sgroupMap.set(String(server.id), server);
            }

            this.lastMonitorTime = Date.now();
            if (this.autoSync)
                this.monitorId = setTimeout(() => this[_monitor](), this.monitorInterval);
            this.monitoring = false;
            this[_next]();
        } catch (err) {
            console.log('cluster monitor catch error =>', err);
        }
    }

}

module.exports = new Cluster();