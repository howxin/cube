/**
 * @file Storage
 * @desc 服务器集群资料操作
 * @author howxin
 */
"use strict";
const { CLUSTER_ERROR } = require('../lib/constants.js');

class Storage {

    constructor(opts) {
        this.module = opts.module || {};
        ['start', 'get', 'add', 'remove', 'drop'].forEach(method => {
            if (!this.module[method] || typeof this.module[method] !== 'function')
                throw new Error(CLUSTER_ERROR.ER_STORAGE_MODULE);
        });
    }

    async start(cluster, serverInfo) {
        return this.module.start(cluster, serverInfo);
    }

    async add(cluster, serverInfo) {
        return this.module.add(cluster, serverInfo);
    }

    async get() {
        return this.module.get();
    }

    async remove(cluster, serverInfo) {
        return this.module.remove(cluster, serverInfo);
    }

    async drop(cluster, serverInfo) {
        return this.module.drop(cluster, serverInfo);
    }
}

module.exports = Storage;