/**
 * @class ModelBase 数据库模型原型类
 * @author howxin
 */
"use strict";
const util = require('util');
const Knex = require('knex');
const config = require('./config.js');

const db = Knex(config['db']);

class ModelBase {

    constructor() {
        this.db = db;
        this.tableName = '';
    }

    checkTrx(trx) {
        return (!!trx)
            ? this.db(this.tableName).transacting(trx)
            : this.db(this.tableName);
    }

    async begin() {
        return util.promisify(this.db.transation)();
    }

    async commit(trx) {
        if (!trx) throw new Error('invalid_trx');
        await trx.commit();
    }

    async rollback(trx) {
        if (!trx) throw new Error('invalid_trx');
        await trx.rollback();
    }
}

module.exports = ModelBase;