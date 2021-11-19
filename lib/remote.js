/**
 * @file Remote
 * @desc 远程模块扩展类
 * @author howxin
 */
"use strict";
const {common} = require('../../utils');

class Remote {

    constructor() {
        this.checkFn = async (req, next) => next();
        this.paramFn = async (req, next) => next();
        this.ignoreMap = new Map([['param', []], ['check', []]]);
        this.methodMap = new Map();
    }

    addHook(type, hookFn, ignore) {
        if (!['function', 'asyncFunction'].includes(common.typeOf(hookFn)))
            throw new Error('invalid_params');
        if (!!ignore && common.typeOf(ignore) !== 'array')
            throw new Error('invalid_params');

        switch (type) {
            case 'param':
            case 'check':
                this[`${type}Fn`] = async (...args) => hookFn(...args);
                (ignore) && this.ignoreMap.set(type, ignore);
                break;
        }
    }

    add(...args) {
        if (args.length < 2)
            throw new Error();
        const method = args.shift();
        if (typeof method !== 'string')
            throw new Error('invalid_params');
        if (this.methodMap.has(method))
            throw new Error('invalid_params');

        for (let fn of args) {
            if (!['function', 'asyncFunction'].includes(common.typeOf(fn)))
                throw new Error('invalid_params');
        }

        this.methodMap.set(method, this.compose(args));

        // this.methodMap.set(method, async (...params) => {
        //     try {
        //         for (let fn of args) {
        //             switch (common.typeOf(fn)) {
        //                 case 'function':
        //                     fn(...params);
        //                     break;
        //                 case 'asyncFunction':
        //                     await fn(...params);
        //                     break;
        //             }
        //         }
        //     } catch (err) {
        //         throw err;
        //     }
        // });
    }

    compose(middlewares) {
        return async (method, ...params) => {

            let _nextParams = params;

            function createNext(middleware, oldNext) {
                return async (err, ...args) => {
                    if (err) return;
                    if (args.length > 0)
                        _nextParams = args;
                    await middleware(..._nextParams, oldNext);
                }
            }

            let len = middlewares.length;
            let next = async (err) => {
                return Promise.resolve();
            };

            for (let i = len - 1; i >= 0; i--) {
                let currentMiddleware = middlewares[i];
                next = createNext(currentMiddleware, next);
            }

            // 检查方法
            if (!(this.ignoreMap.get('check').includes(method))) {
                next = createNext(this.checkFn, next);
            }
            // 参数二次加工
            if (!(this.ignoreMap.get('param').includes(method))) {
                next = createNext(this.paramFn, next);
            }

            await next();
        };
    }

    unfold() {
        let map = {};
        for (let [method, fn] of this.methodMap.entries()) {
            map[method] = async (...args) => {
                try {
                    // let params = args;
                    // 执行注册方法
                    await fn(method, ...args);
                } catch (err) {
                    if (err === 'ignore_request') return;
                    throw err;
                }
            }
        }
        return map;
    }

    onceReq(method, fn) {
        return async (...args) => {
            let _fn = this.compose([fn]);
            await _fn(method, ...args);
        }
    }
}

module.exports = new Remote();