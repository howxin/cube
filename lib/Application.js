/**
 * @file Application
 * @desc
 * @author howxin
 * @param opts {object}
 *          * serverInfo    {object}
 *          * cluster       {object}
 *              * storage       {module}    查询模块
 *              * dispatcher    {array}     服务器分配方法
 *              * autoSync      {boolean}   是否自动更新
 *              * syncInterval  {number}    自动更新间隔
 *          * server        {object}
 *              * encode        {string} 信息体编码，默认为无
 *              * maxConn       {number} 最大连接数，默认为1024
 *              * reqSerial     {boolean} 请求序列化，默认是：true
 *          * remainServer  {array}
 *          * isConnector   {boolean} 服务器类型，是否connector
 *          * remoteHandler {object} 远程调用配置
 *              * retryInterval {array} 重试次数与每次的重试时间间隔
 *              * updateTimeout {number}
 *              * client
 *                  * messageLowerCase {boolean} 信息体小写，默认是：false
 *                  * messageDeflate {boolean} 信息体压缩，默认是：false
 *          * handlerServer    {object}
 *              * maxConn       {number} 最大连接数，默认为1024
 *              * client       {object}
 *                  * reqSerial {boolean} 请求序列化，默认是：true
 *                  * messageLowerCase {boolean} 信息体小写，默认是：false
 *                  * messageDeflate {boolean} 信息体压缩，默认是：false
 *          * remoteServer    {object}
 *              * encode        {string} 信息体编码，默认为无
 *              * maxConn       {number} 最大连接数，默认为1024
 *              * reqSerial     {boolean} 请求序列化，默认是：true
 *              * client        {object}
 *                  * messageLowerCase {boolean} 信息体小写，默认是：false
 *                  * messageDeflate {boolean} 信息体压缩，默认是：false
 *
 */
"use strict";
const cluster = require('../cluster');
const Events = require('./Event.js');
const HttpServer = require('./HttpServer.js');
const ClientServer = require('./ClientServer.js');
const RemoteServer = require('./RemoteServer.js');
const RemoteConnector = require('./RemoteConnector.js');
const { APPLICATION_EVENT, APPLICATION_ERROR } = require('../lib/constants.js');
const { Syslog, common } = require('../../utils');

const syslog = Syslog('hypercube.Application');

class Application {

    constructor(opts = {}) {
        if (this.running)
            throw new Error(APPLICATION_ERROR.ER_REPEATED_START);
        if (!opts.hasOwnProperty('serverInfo') || !opts.hasOwnProperty('cluster'))
            throw new Error(APPLICATION_ERROR.ER_INVALID_PARAMS);
        const { serverInfo } = opts;
        if (!serverInfo || !common.isObject(serverInfo))
            throw new Error(APPLICATION_ERROR.ER_INVALID_SERVERINFO);
        if (!serverInfo.id || !serverInfo.group || !serverInfo.host)
            throw new Error(APPLICATION_ERROR.ER_INVALID_SERVERINFO);
        if (!serverInfo.clientPort && !serverInfo.remotePort && !serverInfo.httpPort)
            throw new Error(APPLICATION_ERROR.ER_INVALID_SERVERINFO);

        this.opts = opts;
        this.cluster = cluster;
        this.cluster.configure({ ...opts.cluster, ...{ serverInfo } });
        /** 是否connector **/
        this.isConnector = (!!opts.isConnector);
        /** 对外处理client请求的clientServer **/
        if (serverInfo.clientPort) {
            this.clientServer = new ClientServer(this, opts.handlerServer);
        }
        /** 对内处理远程调用的remoteServer **/
        if (serverInfo.remotePort) {
            this.remoteServer = new RemoteServer(this, opts.remoteServer);
            if (Array.isArray(opts.remainServer))
                this.remainServer = opts.remainServer;
            this.remoteHandler = require('./remoteHandler.js');
        }
        /** 处理http请求的httpServer **/
        if (serverInfo.httpPort) {
            this.httpServer = new HttpServer(this);
        }
        this.serverInfo = serverInfo;
        this.controllers = new Map();
        this.serviceMap = new Map();
        this.emitter = new Events();

        this.running = false;
    }

    /**
     * 添加client请求处理器
     * @param route
     * @param controller
     */
    handlerUse(route, controller) {
        if (this.running)
            throw new Error('Server is running.');
        if (common.empty(this.clientServer))
            throw new Error('The client server is not configured.');
        this.controllers.set('handler', { route, controller });
    }

    /**
     * 添加remote请求处理器
     * @param controller
     */
    remoteUse(controller) {
        if (this.running)
            throw new Error('Server is running.');
        if (common.empty(this.remoteServer))
            throw new Error('The remote server is not configured.');

        this.controllers.set('remote', controller);
    }

    /**
     * 添加http请求处理器
     * @param controller
     */
    httpUse(controller) {
        if (this.running)
            throw new Error('Server is running.');
        if (common.empty(this.httpServer))
            throw new Error('The http server is not configured.');
        if (!this.controllers.has('api'))
            this.controllers.set('api', []);
        this.controllers.get('api').push(controller);
    }

    /**
     * 框架底层事件处理模块绑定方法
     * @param module
     */
    emitterBind(module) {
        this.emitter.use(module);
    }

    /**
     * 绑定服务
     * @param name 服务名
     * @param service 服务逻辑
     */
    addService(name, service) {
        this.serviceMap.set(name, service);
    }

    /**
     * 获取框架默认功能方法
     * @param service
     * @return {V}
     */
    getService(service) {
        if (!this.serviceMap.has(service))
            throw new Error('invalid_service');
        return this.serviceMap.get(service);
    }

    /**
     * 框架启动
     * @return {Promise.<void>}
     */
    async start() {
        try {
            if (this.running)
                throw new Error(APPLICATION_ERROR.ER_REPEATED_START);
            if (!common.empty(this.clientServer) && typeof this.controllers.get('handler') === 'undefined')
                throw new Error(APPLICATION_ERROR.ER_NOFOUND_HANDLERFN);
            if (!common.empty(this.remoteServer) && typeof this.controllers.get('remote') === 'undefined')
                throw new Error(APPLICATION_ERROR.ER_NOFOUND_REMOTEFN);
            if (!common.empty(this.httpServer) && typeof this.controllers.get('api') === 'undefined')
                throw new Error(APPLICATION_ERROR.ER_NOFOUND_APIFN);
            if (this.isConnector && !(this.controllers.get('remote') instanceof RemoteConnector))
                throw new Error(APPLICATION_ERROR.ER_UNKOWN_REMOTEFN);

            /** 启动集群 **/
            await this.cluster.start();
            /** 启动client服务 **/
            if (!common.empty(this.clientServer)) {
                const { id, name, host, clientPort } = this.serverInfo;
                /** 注册client调用方法 **/
                const handlerOpts = this.controllers.get('handler');
                this.clientServer.use(handlerOpts.route, handlerOpts.controller);
                /** 开启client server **/
                await this.clientServer.listen('0.0.0.0', clientPort);
                syslog.log(`client server[${name}] server id => ${id} listen host => ${host}, port => ${clientPort}`);
                /** client连接断开事件 **/
                this.clientServer.on('connection', (client, route) => {
                    this.emitter.emit(APPLICATION_EVENT.CLIENT_CONNECTION, { client, route });
                });
                this.clientServer.on('disconnect', (client, route) => {
                    this.emitter.emit(APPLICATION_EVENT.CLIENT_DISCONNECT, { client, route });
                });
            }
            /** 启动remote服务 **/
            if (!common.empty(this.remoteServer)) {
                const { id, host, remotePort } = this.serverInfo;
                const remoteCtrl = this.controllers.get('remote');
                /** 注册remote处理方法方法 **/
                this.remoteServer.use(remoteCtrl);
                /** 启动remote server **/
                await this.remoteServer.listen('0.0.0.0', remotePort);
                syslog.log(`remote server[${id}] listen host => ${host}, port => ${remotePort}`);
                /** 默认连接的远程服务器 **/
                await this.remoteHandler.init(this, this.remainServer, remoteCtrl, this.opts.remoteHandler);
                /** remote连接断开事件 **/
                this.remoteHandler.on('connection', (client, route) => {
                    this.emitter.emit(APPLICATION_EVENT.REMOTE_CONNECTION, { client, route });
                });
                this.remoteHandler.on('destroy', (client, route) => {
                    this.emitter.emit(APPLICATION_EVENT.REMOTE_DESTROY, { client, route });
                });
                this.remoteHandler.on('drop', (client, route) => {
                    this.emitter.emit(APPLICATION_EVENT.REMOTE_DROP, { client, route });
                });

            }
            /** 启动http服务 **/
            if (!common.empty(this.httpServer)) {
                const { id, host, httpPort } = this.serverInfo;
                /** 注册api处理方法方法 **/
                this.httpServer.use(this.controllers.get('api'));
                /** 启动api server **/
                await this.httpServer.listen('0.0.0.0', httpPort);
                syslog.log(`api server[${id}] listen host => ${host}, port => ${httpPort}`);
            }

            this.running = true;
        } catch (err) {
            throw err;
        }
    }

    /**
     * 通过服务器id获取服务器信息
     * @param sgroup
     * @param frontSession
     * @param sid
     * @returns {Promise}
     */
    async getServerBySid(sgroup, frontSession, sid) {
        return cluster.getServer(sgroup, frontSession, sid);
    }

    /**
     * 获取某组服务器
     * @param sgroup
     * @returns {Promise}
     */
    async getServers(sgroup) {
        return cluster.getServers(sgroup);
    }

    /**
     * 远程请求
     * @param sgroup {string} 远程服务器组名
     * @param action {string}调用方法名
     * @param payload {object} 参数
     * @param frontSession {FrontSession} 客户端信息
     * @param sid {number|null} 远程服务器id
     * @returns {Promise.<*>}
     */
    async remoteRequest(sgroup, action, payload, frontSession, sid) {
        if (common.empty(this.remoteServer))
            throw new Error('The remote server is not configured.');
        let serverInfo = await this.getServerBySid(sgroup, frontSession, sid);
        // syslog.debug(`remote请求: sgaroup => ${sgroup}, action => ${action}, serverInfo => ${JSON.stringify(serverInfo)}`, sid);
        return this.remoteHandler.request(serverInfo, action, payload, frontSession);
    }

    /**
     * 远程推送
     * @param sgroup {string} 远程服务器组名
     * @param action {string}调用方法名
     * @param payload {object} 参数
     * @param frontSession {FrontSession} 客户端信息
     * @param sid {number | null} 远程服务器id
     * @param id {number} 信息id
     * @returns {Promise.<*>}
     */
    async remotePush(sgroup, action, payload, frontSession, sid, id) {
        if (common.empty(this.remoteServer))
            throw new Error('The remote server is not configured.');
        let serverInfo = await this.getServerBySid(sgroup, frontSession, sid);
        // syslog.debug(`远程推送: sgroup => ${sgroup}, action => ${action}, serverInfo => ${JSON.stringify(serverInfo)}`);
        await this.remoteHandler.push(serverInfo, action, payload, frontSession, id);
    }

    /**
     * 指定服务器群，全服请求
     * @param sgroup {string} 远程服务器组名
     * @param action {string}调用方法名
     * @param payload {object} 参数
     * @param frontSession {FrontSession} 客户端信息
     * @returns {Promise.<{result: Array, error: Array}>}
     */
    async remoteRequestAll(sgroup, action, payload, frontSession) {
        try {
            if (common.empty(this.remoteServer))
                throw new Error('The remote server is not configured.');

            let serverGroup = await this.getServers(sgroup);
            let promiseAll = [];
            let error = [];
            let errFlag = Symbol('error');
            for (let serverInfo of serverGroup) {
                promiseAll.push(this.remoteHandler.request(serverInfo, action, payload, frontSession).catch(e => {
                    error.push(e);
                    return errFlag;
                }));
            }
            let allRes = await Promise.all(promiseAll);
            let result = [];
            for (let res of allRes) {
                if (res === errFlag)
                    result.push(res);
            }
            return { result, error };
        } catch (err) {
            throw err;
        }
    }

    /**
     * 指定服务器群，全服请求
     * @param sgroup {string} 远程服务器组名
     * @param action {string}调用方法名
     * @param payload {object} 参数
     * @param frontSession {FrontSession} 客户端信息
     * @param id {number} 信息id
     * @returns {Promise.<*>}
     */
    async remotePushAll(sgroup, action, payload, frontSession, id) {
        try {
            if (common.empty(this.remoteServer))
                throw new Error('The remote server is not configured.');

            let serverInfos = await cluster.getServers(sgroup);
            let promiseAll = [];
            let error = [];
            for (let serverInfo of serverInfos) {
                try {
                    promiseAll.push(this.remoteHandler.push(serverInfo, action, payload, frontSession, id));
                } catch (e) {
                    error.push(e);
                }
            }
            await Promise.all(promiseAll);
            return error;
        } catch (err) {
            throw err;
        }
    }

    async exit() {
        syslog.log('app exit');
        // 退出集群
        await this.cluster.drop();
        // 远程关联关闭
        await this.remoteHandler.drop();
        // 清除事件监听
        this.emitter.clear();
    }

}

module.exports = function (...args) {
    return new Application(...args);
};