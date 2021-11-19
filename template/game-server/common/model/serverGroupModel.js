/**
 * @class ServerGroupModal
 * @author howxin
 */
"use strict";
const ModalBase = require('../lib/ModalBase.js');
const DbHelper = require('../utils/DbHelper.js');


class ServerGroupModel extends ModalBase {
    constructor() {
        super();
        this.tableName = 'server_group';
        this.dbHelper = new DbHelper({
            id: 'server_group_id',
            name: 'server_group_name',
            updated: 'server_group_updated',
            created: 'server_group_created',
        });
    }

    getServerGroup(trx, fields = '*', cond = {}) {
        return this.checkTrx(trx)
            .select(this.dbHelper.getCols(fields))
            .where(this.dbHelper.objectToDb(cond));
    }

    getById(trx, fields = '*', id) {
        return this.checkTrx(trx)
            .first(this.dbHelper.getCols(fields))
            .where(this.dbHelper.objectToDb({id}));
    }

}

module.exports = new ServerGroupModel();