"use strict";
const zlib = require('zlib');
const crypto = require('crypto');

class Common {

    now() {
        var now = new Date();
        return now.getFullYear() + '-' +
            (now.getMonth() + 1 < 10 ? '0' : '') + (now.getMonth() + 1) + '-' +
            (now.getDate() < 10 ? '0' : '') + now.getDate() + ' ' +
            (now.getHours() < 10 ? '0' : '') + now.getHours() + ':' +
            (now.getMinutes() < 10 ? '0' : '') + now.getMinutes() + ':' +
            (now.getSeconds() < 10 ? '0' : '') + now.getSeconds();
    }

    sha1(str) {
        return crypto.createHash('sha1').update(str, 'utf8').digest('hex');
    }

    count(value) {
        let result = 0;
        for (let i in value)
            result++;
        return result;
    }

    clone(item) {
        if (!item) return item; // null, undefined values check
        const self = this;
        let result = null;
        [Number, String, Boolean].forEach(type => (item instanceof type) && (result = item));
        if (result === null) {
            if (self.typeOf(item) === "array") {
                result = [];
                item.forEach((child, index) => result[index] = self.clone(child));
            } else if (self.typeOf(item) === "object") {
                result = {};
                for (let i in item)
                    result[i] = self.clone(item[i]);
            } else if (self.typeOf(item) === "map") {
                result = new Map();
                item.forEach((val, key) => result.set(key, self.clone(val)));
            } else
                result = item;
        }
        return result;
    }

    typeOf(data) {
        if (typeof (data) === 'object') {
            switch (Object.prototype.toString.call(data)) {
                case '[object Null]':
                    return 'null';
                case '[object Undefined]':
                    return 'undefined';
                case '[object Object]':
                    return 'object';
                case '[object Array]':
                    return 'array';
                case '[object Map]':
                    return 'map';
                case '[object Set]':
                    return 'set';
                case '[object WeakMap]':
                    return 'weakMap';
                case '[object WeakSet]':
                    return 'weakSet';
                case '[object Function]':
                    return 'function';
                case '[object AsyncFunction]':
                case '[object Promise]':
                    return 'asyncFunction'
            }
        } else {
            return typeof (data);
        }
    }

    empty(mixed_var) {
        if ([undefined, null, false, 0, '', '0'].includes(mixed_var))
            return true;
        switch (this.typeOf(mixed_var)) {
            case 'array' :
                return (0 === mixed_var.length);
            case 'object' :
                for (let key in mixed_var)
                    return false;
                return true;
            case 'map' :
            case 'set' :
                return (0 === mixed_var.size);
            default :
                return false;
        }
    }

    toString(value) {
        let strValue = '';
        switch (typeof(value)) {
            case 'object':
                if (value !== null)
                    strValue = (value instanceof Object && value.message) ? value.message : value.toString();
                break;
            case 'undefined':
                break;
            default:
                strValue = value.toString();
        }
        return strValue;
    }


    toNumber(value, decimal, abs) {
        abs = (abs === true);
        decimal = Number(decimal);
        if (Number.isNaN(decimal))
            decimal = 4;
        let number = Number(value);
        number = Number.isNaN(number) ? 0 : Number(decimal < 0 ? number : number.toFixed(decimal));
        return abs === true ? Math.abs(number) : number;
    }

    random(min, max) {
        min = this.toNumber(min, 0);
        max = this.toNumber(max, 0);
        if (max === min)
            return max;
        else if (max > min)
            return Math.floor(Math.random() * (max - min + 1)) + min;
        else if (max < min)
            return false;
    }

    chr(code) {
        code = this.toNumber(code);
        if (code > 0xFFFF) {
            code -= 0x10000;
            return String.fromCharCode(0xD800 + (code >> 10), 0xDC00 + (code & 0x3FF));
        }
        return String.fromCharCode(code);
    }

    gencode(len = 8) {
        len = this.toNumber(len, 0);
        len = (len <= 0) ? 8 : len;
        let result = '';
        for (let i = 0; i < len; i++) {
            switch (this.random(1, 3)) {
                case 1:
                    result += this.chr(this.random(48, 57));
                    break;
                case 2:
                    result += this.chr(this.random(65, 90));
                    break;
                case 3:
                    result += this.chr(this.random(97, 122));
                    break;
            }
        }
        return result;
    }

    objToMap(obj) {
        if (this.typeOf(obj) === 'object') {
            let map = new Map();
            for (let k of Object.keys(obj))
                map.set(k, obj[k]);
            return map;
        } else {
            return obj;
        }
    }


    compress(str, type) {
        switch (type) {
            case 'gzip':
                return zlib.gzipSync(str);
            case 'deflate':
                return zlib.deflateSync(str);
            case 'deflateRaw':
                return zlib.deflateRawSync(str);
            default:
                return str;
        }
    }

    decompress(str, type) {
        switch (type) {
            case 'gzip':
                return zlib.gunzipSync(str).toString();
            case 'deflate':
                return zlib.inflateSync(str).toString();
            case 'deflateRaw':
                return zlib.inflateRawSync(str).toString();
            default:
                return str;
        }
    }

    validate(pattern, data) {
        if (this.empty(pattern) || this.typeOf(pattern) !== 'object')
            throw new Error('pattern must be an object');

        for (let key in pattern) {
            let rule = pattern[key];
            if (this.typeOf(rule) !== 'object')
                throw new Error();
            if (this.count(rule) === 0)
                return true;
            for (let ruleFields in rule) {
                if (!this._validate(ruleFields, rule, data[key]))
                    return false;
            }

            if (rule.hasOwnProperty('fields')) {
                if (!this.validate(rule.fields, data[key]))
                    return false;
            }
        }

        return true;
    }

    async asyncValidate(pattern, data) {
        if (this.empty(pattern) || this.typeOf(pattern) !== 'object')
            throw new Error('pattern must be an object');

        let error = null;

        for (let key in pattern) {
            let rule = pattern[key];
            if (this.typeOf(rule) !== 'object')
                throw new Error();
            if (this.count(rule) === 0)
                return true;
            for (let ruleFields in rule) {
                if (!this._validate(ruleFields, rule, data[key])) {
                    error = rule.hasOwnProperty('message') ? rule[message] : `invalid_${key}`;
                    throw error;
                }
            }

            if (rule.hasOwnProperty('fields')) {
                if (!this.validate(rule.fields, data[key])) {
                    error = rule.hasOwnProperty('message') ? rule.fields[message] : `invalid ${key}.fields`;
                    throw error;
                }
            }
        }

        return true;
    }

    _validate(ruleFields, rule, value) {
        let needed = true;
        if (rule.hasOwnProperty('required') && rule['required'] === false)
            needed = false;
        if (needed === false && typeof value === 'undefined')
            return true;

        let ruleVal = rule[ruleFields];
        switch (ruleFields) {
            case 'required':
                if (typeof ruleVal !== 'boolean')
                    return false;
                else if (ruleVal)
                    return !this.empty(value);
                else
                    return true;
            case 'type':
                if (ruleVal === 'enum')
                    return this._validateType(ruleVal, value, (rule['enum'] || []));
                return this._validateType(ruleVal, value);
            case 'len': {
                let extend = parseInt(ruleVal, 10);
                if (!this.empty(extend)) {
                    if (typeof (value) === 'object')
                        return (this.count(value) === extend);
                    else
                        return (this.toString(value).length === extend);
                } else {
                    return false;
                }
            }
            case 'min': {
                let extend = parseInt(ruleVal, 10);
                if (!this.empty(extend)) {
                    if (typeof value === 'object')
                        return this.count(value) >= extend;
                    else if (typeof value === 'number')
                        return value >= extend;
                    else
                        return this.toString(value).length >= extend;
                } else {
                    return false;
                }
            }
            case 'max': {
                let extend = parseInt(ruleVal, 10);
                if (!this.empty(extend)) {
                    if (typeof (value) === 'object')
                        return this.count(value) <= extend;
                    else if (typeof value === 'number')
                        return value <= extend;
                    else
                        return this.toString(value).length <= extend;
                } else {
                    return false;
                }
            }
            case 'enum':
                return this.typeOf(ruleVal) === 'array';
            case 'fields':
                return this.typeOf(ruleVal) === 'object';
            default:
                return false;

        }
    }

    _validateType(type, value, extra) {
        switch (type) {
            case 'boolean':
                return typeof value === 'boolean';
            // if (typeof value === 'boolean')
            //     return true;
            // else
            //     return ['true', 'false'].includes(value);
            case 'number':
                return !Number.isNaN(parseFloat(value));
            case 'number+': {
                let tmp = parseFloat(value);
                return !Number.isNaN(tmp) && tmp !== 0;
            }
            case 'int': {
                let tmp = parseInt(value, 10);
                return !Number.isNaN(tmp) && value === tmp;
            }
            case 'int+': {
                let tmp = parseInt(value, 10);
                return !Number.isNaN(tmp) && value === tmp && tmp !== 0;
            }
            case 'string':
            case 'array':
            case 'object':
                return this.typeOf(value) === type;
            case 'array+':
                return this.typeOf(value) === 'array' && value.length > 0;
            case 'enum':
                return extra.includes(value);
            case 'email':
            case 'url':
            case 'regexp':
            case 'date':
            case 'ip':
                // TODO: 未写完
                return;
            default:
                return false;
        }
    }

    getFileSize(bytes, iec) {
        iec = !!iec;
        bytes = this.toNumber(bytes, -1);
        let thresh = iec ? 1024 : 1000;
        if (Math.abs(bytes) < thresh)
            return bytes + ' B';
        let units = iec
            ? ['KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB']
            : ['KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
        let u = -1;
        do {
            bytes /= thresh;
            ++u;
        } while (Math.abs(bytes) >= thresh && u < units.length - 1);
        return bytes.toFixed(1) + ' ' + units[u];
    }
}

module.exports = new Common();