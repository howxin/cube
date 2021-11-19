/**
 * @file Cluster
 * @desc 服务器集群管理类
 * @author howxin
 */
"use strict";
const Storage = require('./Storage.js');
const { CLUSTER_ERROR } = require('../lib/constants.js');
const { common } = require('../../utils');

class Cluster {

    constructor() {
        this.storage = null;
        this.serverInfo = {};
        this.serverGroupMap = new Map();
        this.dispatchMap = new Map();

        this.monitorInterval = 30 * 1000;
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
        const { serverInfo, storage, dispatcher = [], autoSync = false, syncInterval } = opts;
        if (!serverInfo || !storage)
            throw new Error(CLUSTER_ERROR.ER_INVALID_PARAMS);
        this.serverInfo = serverInfo;
        this.storage = new Storage({ module: storage });

        for (let sgroup in dispatcher)
            this.dispatchMap.set(sgroup, dispatcher[sgroup]);

        this.autoSync = autoSync;
        if (!!syncInterval && (typeof syncInterval === 'number') && autoSync === true)
            this.monitorInterval = syncInterval;
    }

    async start() {
        await this.storage.start(this, { ...this.serverInfo });
    }

    get thisServer() {
        return { ...this.serverInfo };
    }

    async getServer(sgroup, frontSession, sid) {
        if (!this.serverGroupMap.has(sgroup))
            return null;

        let servers = this.serverGroupMap.get(sgroup);
        if (!!sid)
            return (servers.get(String(sid)) || null);
        else
            return this.dispatch(sgroup, frontSession);
    }

    async getServers(sgroup) {
        if (sgroup === '*') {
            const servers = {};
            for (let [_sgroup, smap] of this.serverGroupMap.entries())
                servers[_sgroup] = [...smap.values()];
            return servers;
        } else {
            const servers = [];
            if (!this.serverGroupMap.has(sgroup))
                return servers;
            let smap = this.serverGroupMap.get(sgroup);
            for (let serverInfo of smap.values())
                servers.push(serverInfo);
            return servers;
        }
    }

    async dispatch(sgroup, frontSession) {
        let servers = this.serverGroupMap.get(sgroup);
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
        await this.storage.add(this, serverInfo);
    }

    async removeServer(serverInfo) {
        let sgroup = serverInfo.group;
        if (this.serverGroupMap.has(sgroup)) {
            let smap = this.serverGroupMap.get(sgroup);
            smap.delete(serverInfo.id);
            if (smap.size === 0)
                this.serverGroupMap.delete(sgroup);
        }
        await this.storage.remove(this, serverInfo);
    }

    async dropServer(serverInfo) {
        let sgroup = serverInfo.group;
        if (this.serverGroupMap.has(sgroup)) {
            let smap = this.serverGroupMap.get(sgroup);
            smap.delete(serverInfo.id);
            if (smap.size === 0)
                this.serverGroupMap.delete(sgroup);
        }
        await this.storage.drop(this, serverInfo);
    }

    async drop() {
        await this.storage.drop(this, this.thisServer);
    }

    async sync(serverList) {
        if (common.isUndefinedOrNull(serverList))
            serverList = await this.storage.get();

        for (let sgroup in serverList) {
            if (!this.serverGroupMap.has(sgroup))
                this.serverGroupMap.set(sgroup, new Map());
            let sgroupMap = this.serverGroupMap.get(sgroup);
            sgroupMap.clear();
            for (let server of serverList[sgroup])
                sgroupMap.set(String(server.id), server);
        }
    }


}

module.exports = new Cluster();