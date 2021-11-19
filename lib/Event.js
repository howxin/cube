/**
 * @file Event
 * @desc 事件处理类
 * @author howxin
 */
"use strict";
const EventEmitter = require('events');
const { APPLICATION_EVENT } = require('./constants.js');
const { Syslog } = require('../../utils');

const syslog = Syslog('hypercube.Event');

const _init = Symbol('INIT');

class Event {

    constructor() {
        this.emitter = new EventEmitter();
        this.module = {};

        this[_init]();
    }

    [_init]() {
        this.emitter.removeAllListeners();
        for (let eventName in APPLICATION_EVENT) {
            this.emitter.on(APPLICATION_EVENT[eventName], ({ action, payload }) => {
                if (this.module[action]) {
                    let fn = (this.module[action]).bind(this.module);
                    if (!!fn && typeof fn === 'function')
                        fn(payload);
                }
            });
        }
    }

    emit(action, payload) {
        this.emitter.emit(action, { action, payload });
    }

    use(module = {}) {
        this.module = module;
        this[_init]();
    }

    clear() {
        this.emitter.removeAllListeners();
        this.module = null;
    }
}

module.exports = Event;