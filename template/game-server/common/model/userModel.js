/**
 * @class UserModal
 * @author howxin
 */
"use strict";
const ModalBase = require('../lib/ModalBase.js');
const DbHelper = require('../utils/DbHelper.js');

class UserModel extends ModalBase {
    constructor() {
        super();
        this.tableName = 'user';
        this.dbHelper = new DbHelper({
            id: 'user_id',
            username: 'user_username',
            password: 'user_password',
            nickname: 'user_nickname',
            balance: 'user_balance',
            sessionId: 'user_session_id',
            sessionExpire: 'user_session_expire',
            gameId: 'user_gameid',
            updated: 'user_updated',
            created: 'user_created'
        });
    }

    async getById(trx, fields = '*', id) {
        return this.checkTrx(trx)
            .first(this.dbHelper.getCols(fields))
            .where(this.dbHelper.getCond({id}));
    }

    async getBySession(trx, fields = '*', sessionId) {
        return this.checkTrx(trx)
            .first(this.dbHelper.getCols(fields))
            .where(this.dbHelper.getCond({sessionId}));
    }

    async getByUsernameAndPsw(trx, fields = '*', username, password) {
        return this.checkTrx(trx)
            .first(this.dbHelper.getCols(fields))
            .where(this.dbHelper.getCond({username, password}));
    }

    async updateSessionById(trx, sessionId, id) {
        return this.checkTrx(trx)
            .update(this.dbHelper.objectToDb({sessionId}))
            .where(this.dbHelper.getCond({id}));
    }

}

module.exports = new UserModel();