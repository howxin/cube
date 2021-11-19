/**
 * @file Router
 * @desc
 * @author howxin
 */
"use strict";
const pathToRegexp = require('path-to-regexp');

const _match = Symbol('match');
const _format = Symbol('format');

class Router {

    constructor({ prefix = '' }) {
        this.prefix = (prefix !== '' && prefix !== '/')
            ? (prefix.startsWith('/') ? prefix : `/${prefix}`)
            : '';
        this.getMap = new Map();
        this.postMap = new Map();
        this.putMap = new Map();
        this.deleteMap = new Map();
    }

    all(path, fn) {
        ['get', 'post', 'put', 'del'].forEach(fnName => {
            this[fnName](path, fn);
        });
    }

    get(path, fn) {
        path = `${this.prefix}${path}`;
        this.getMap.set(path, { regExp: pathToRegexp(path, [], { sensitive: false, end: true, strict: false }), fn });
    }

    post(path, fn) {
        path = `${this.prefix}${path}`;
        this.postMap.set(path, { regExp: pathToRegexp(path, [], { sensitive: false, end: true, strict: false }), fn });
    }

    put(path, fn) {
        path = `${this.prefix}${path}`;
        this.putMap.set(path, { regExp: pathToRegexp(path, [], { sensitive: false, end: true, strict: false }), fn });
    }

    del(path, fn) {
        path = `${this.prefix}${path}`;
        this.deleteMap.set(path, {
            regExp: pathToRegexp(path, [], { sensitive: false, end: true, strict: false }),
            fn
        });
    }

    [_format](path) {

        if (this.prefix === '/') {
            if (path.startsWith('/'))
                return path;
            else
                return `${this.prefix}${path}`;
        } else {

        }
    }

    [_match](method, req) {
        let map = this[`${method.toLowerCase()}Map`];
        let fn = false;
        for (let [path, router] of map.entries()) {
            let re = router.regExp.exec(req.pathname);
            if (re !== null) {
                let keys = path.match(/:\w+/g);
                ([...re].slice(1)).forEach((v, index) => {
                    req.addParam(keys[index].replace(':', ''), v);
                });
                fn = router.fn;
                break;
            }
        }
        return fn;
    }

    routes() {
        const self = this;
        return async function exec(req, res) {
            let { method } = req;
            if (['GET', 'POST', 'PUT', 'DELETE'].includes(method)) {
                let fn = self[_match](method, req);
                if (!!fn)
                    return fn(req, res);
            }
        }
    }
}

module.exports = function (opt) {
    return new Router(opt)
};