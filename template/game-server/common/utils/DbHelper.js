/**
 * @class DbHelper 数据库辅助工具
 * @author howxin
 * @param fieldsMap {object}
 */
"use strict";
const common = require('./common.js');

class DbHelper {

    constructor(fieldsMap) {
        // this.prefix = prefix === null ? '' : `${prefix}_`;
        this.dbMap = new Map();
        for (let key in fieldsMap)
            this.dbMap.set(fieldsMap[key], key);
        this.columnMap = common.objToMap(fieldsMap);
    }

    objectToDb(obj) {
        if (common.typeOf(obj) !== 'object') return obj;
        let result = {};
        for (let field in obj) {
            let key = this.columnMap.has(field) ? this.columnMap.get(field) : field;
            result[key] = obj[field];
        }
        return result;
    }

    dbToObject(obj, stringify) {
        if (common.typeOf(obj) !== 'object') return obj;
        let result = {};
        for (let field in obj) {
            let key = this.dbMap.has(field) ? this.dbMap.get(field) : field;
            let value = obj[field];
            result[key] = stringify && typeof value === 'object' && value !== null ? JSON.stringify(value) : value;
        }
        return result;
    }

    columnToDb(data) {
        switch (common.typeOf(data)) {
            case 'string':
                if (this.columnMap.has(data))
                    return this.columnMap.get(data);
                else
                    return data;
            case 'array':
                let columns = [];
                for (let column of data) {
                    let dbField = this.columnMap.has(column) ? this.columnMap.get(column) : column;
                    columns.push({[column]: dbField});
                }
                return columns;
            default:
                return data;
        }
    }

    getCols(data) {
        switch (common.typeOf(data)) {
            case 'string':
                if (data === '*')
                    return this.columnToDb([...this.columnMap.keys()]);
                else
                    return this.columnToDb([data]);
            case 'array':
                return this.columnToDb(data);
            default:
                return data;
        }
    }

    getCond(data) {
        if (common.typeOf(data) !== 'object')
            throw new Error('invalid_params');
        return this.objectToDb(data);
    }

    getOrder(data) {
        // { column: 'age', order: 'desc' }
        switch (common.typeOf(data)) {
            case 'string':
                return [{column: this.columnToDb(data), order: 'asc'}];
            case 'object': {
                let arr = [];
                for (let column in data)
                    arr.push({column: this.columnToDb(column), order: data[column].toLowerCase()});
                return arr;
            }
            case 'array': {
                let arr = [];
                for (let val of data) {
                    if (typeof val === 'string') {
                        arr.push({column: this.columnToDb(val), order: 'asc'});
                    } else if (common.typeOf(val) === 'object') {
                        for (let column in val)
                            arr.push({column: this.columnToDb(column), order: val[column].toLowerCase()});
                    } else if (common.typeOf(val) === 'array') {
                        arr.push({column: this.columnToDb(val[0]), order: (val[1] || 'asc').toLowerCase()});
                    }
                }
                return arr;
            }
            default:
                throw new Error('invalid_params');
        }
    }

}

module.exports = DbHelper;