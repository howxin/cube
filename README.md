# cube
>`cube`是一个分布式，可伸缩的多进程服务器框架，旨在为了解决业务压力需要拆分服务器来提高服务承载的需求。服务器结构为前端服务器+后端服务器架构组成，主要为`client`-->`connector`-->`backend`，前端服务器`connector`承载所有的客户端连接，如果客户端需要请求后端服务器，可以通过`servername.action`的方式请求，`connector`会远程调用后端服务器`backend`来处理。

## 请求格式
```
{
    id      : 请求序列号
    action  : 请求标识
    payload : 请求参数，为json格式
}
```
> action分为两种：`action`和`servername.action`。
>
> `action`为客户端直接请求`connector`接口所用，这类请求会由`connector`本身自己处理完毕。
>
> `servername.action`为后端远程调用格式，`connector`会通过`servername`找到对应的服务器，然后转发请求给该服务器。
>
> 例如：
> 1. 客户端发一个`test`的请求到前端服务器`connector`，`connector`会处理完毕然后直接返回，过程中不会调用其他后端服务器。
> 2. 客户端做登录请求，客户端发一个`dologin`的请求到前端服务器`connector`，由于登录逻辑在大厅服务器`lobby`处理，所以它会把这个请求转给处理用户登录的后端服务器`lobby`，这时`connector`就会通过远程调用，找到一个`lobby`，发一个`dologin`的远程调用请求，`lobby`接到请求处理完毕后就会返回给`connector`，由`connector`再返回给客户端。
> 3. 客户端做一些大厅操作，客户端发一个`lobby.test`的请求到前端服务器`connector`，由于是远程调用格式，所以`connector`会直接将该请求转为远程请求发给大厅服`lobby`处理，由`lobby`处理完毕之后通过`connector`通知到客户端。
```js
// request
{
    id: 1,
    action: 'dologin',
    payload: {
        username: 'test',
        password: '10086',
    }
}
// remote request
{
    id: 1,
    action: 'lobby.dologin',
    payload: {
        username: 'test',
        password: '10086',
    }
}
```

## 远程调用媒介frontsession
> 前端服务器跟后端服务器会通过一个长连接进行通讯，但是后端服务器如何辨别前端服务器发过来的请求是哪个客户端的，这时候就需要`frontsession`。每个客户端都会有一个`frontsession`，它装载客户端信息。后端服务器可以通过`frontsession`就可以辨别本次请求是来自哪个客户端的，同时可以把处理后的结果准确的返回到客户端。
```
frontsession
{
    sid         : 该请求来自哪个服务器id
    sgroup      : 该服务器所属服务器组，比如connector，lobby
    cid         : 客户端id，用于通知客户端
    [_session]  : 用户暂存资料，包含user，game等信息
}
```

## 前端服务器connector
> connector是前端服务器，用于与客户端通讯，所有用户的连接都会在这里。connector会截断用户的请求，分析用户的请求协议格式，对请求做区分。


## 后端服务器


## 使用hypercube

### 启动
```js
const cube = require('cube');

const app = cube.createApp(options);

app.start();
```

### 配置

```js
 *          * serverInfo    {object}        服务器信息
 *          * cluster       {object}        集群
 *              * storage       {module}        查询模块
 *              * dispatcher    {array}         服务器分配方法
 *              * autoSync      {boolean}       是否自动更新
 *              * syncInterval  {number}        自动更新间隔
 *          * server        {object}
 *              * encode        {string}        信息体编码，默认为无
 *              * maxConn       {number}        最大连接数，默认为1024
 *              * reqSerial     {boolean}       请求序列化，默认是：true
 *          * remainServer  {array}         需要主动连接的服务器
 *          * isConnector   {boolean}       服务器类型，是否connector
 *          * remoteHandler {object}        远程调用配置
 *              * retryInterval {array}         重试次数与每次的重试时间间隔
 *              * updateTimeout {number}
 *              * client
 *                  * messageLowerCase {boolean} 信息体小写，默认是：false
 *                  * messageDeflate {boolean}  信息体压缩，默认是：false
 *          * handlerServer    {object}
 *              * maxConn       {number}        最大连接数，默认为1024
 *              * client       {object}
 *                  * reqSerial {boolean}       请求序列化，默认是：true
 *                  * messageLowerCase {boolean} 信息体小写，默认是：false
 *                  * messageDeflate {boolean}  信息体压缩，默认是：false
 *          * remoteServer    {object}
 *              * encode        {string}        信息体编码，默认为无
 *              * maxConn       {number}        最大连接数，默认为1024
 *              * reqSerial     {boolean}       请求序列化，默认是：true
 *              * client        {object}
 *                  * messageLowerCase {boolean} 信息体小写，默认是：false
 *                  * messageDeflate {boolean}  信息体压缩，默认是：false
```
