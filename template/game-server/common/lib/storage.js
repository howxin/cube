/**
 * @class
 * @author howxin
 * @param
 */
"use strict";
const serverModel = require('../model/serverModel.js');
const serverGroupModel = require('../model/serverGroupModel.js');

class Storage {

    constructor() {

    }

    async add(serverInfo) {
        try {
            let srv = await serverModel.getServerById(null, ['status'], serverInfo.id);
            if (!srv || +srv.status !== 0)
                throw new Error();
            await serverModel.updateById(null, {status: 1}, serverInfo.id);
        } catch (err) {
            throw err;
        }
    }

    async get() {
        let data = {};
        try {
            let servers = await serverModel.getServers(null, '*', {status: 1});
            if (servers.length > 0) {
                let groups = await serverGroupModel.getServerGroup(null, '*');
                let gMap = {};
                for (let obj of groups)
                    gMap[obj.id] = obj.name;
                for (let server of servers) {
                    if (!data.hasOwnProperty(gMap[server.groupId]))
                        data[gMap[server.groupId]] = [];

                    data[gMap[server.groupId]].push({
                        id: server.id,
                        group: gMap[server.groupId],
                        name: server.name,
                        host: server.host,
                        port: server.port,
                    });
                }
            }
            return data;
        } catch (err) {
            console.log(err);
            return data;
        }
    }

    async del(serverInfo) {
        try {
            let srv = await serverModel.getServerById(null, ['status'], serverInfo.id);
            if (srv && +srv.status === 1)
                await serverModel.updateById(null, {status: 0}, serverInfo.id);
        } catch (err) {
            throw err;
        }
    }
}

module.exports = new Storage();