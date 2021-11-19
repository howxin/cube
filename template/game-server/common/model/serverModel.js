/**
 * @class ServerModal
 * @author howxin
 */
"use strict";
const ModalBase = require('../lib/ModalBase.js');
const DbHelper = require('../utils/DbHelper.js');

class ServerModel extends ModalBase {
    constructor() {
        super();
        this.tableName = 'server';
        this.dbHelper = new DbHelper({
            id: 'server_id',
            groupId: 'server_groupid',
            name: 'server_name',
            host: 'server_host',
            clientPort: 'server_client_port',
            remotePort: 'server_remote_port',
            httpPort: 'server_http_port',
            status: 'server_status',
            updated: 'server_updated',
            created: 'server_created',
        });
    }

    async getServers(trx, fields = '*', cond = {}) {
        return this.checkTrx(trx)
            .select(this.dbHelper.getCols(fields))
            .where(this.dbHelper.objectToDb(cond));
    }

    async getServerById(trx, fields = '*', id) {
        return this.checkTrx(trx)
            .first(this.dbHelper.getCols(fields))
            .where(this.dbHelper.objectToDb({id}));
    }

    async updateById(trx, params, id) {
        let data = Object.assign({updated: Date.now()}, params);
        return this.checkTrx(trx)
            .update(this.dbHelper.objectToDb(data))
            .where(this.dbHelper.objectToDb({id}));
    }
}

module.exports = new ServerModel();