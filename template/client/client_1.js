"use strict";
const Ws = require('./lib/Ws.js');

const chatInfo = {};
const userInfo = {};
const client = new Ws(`ws://0.0.0.0:3101/`);

client.on('open', async () => {
    client.on('message', msg => {
        switch (msg.action) {
            case 'onadd':
                console.log(`用户${msg.payload.username}加入聊天室`);
                break;
            case 'onchat': {
                let _username = msg.payload.from;
                if (_username === userInfo.username)
                    console.log(`用户${msg.payload.from}: ${msg.payload.msg}`);
                else
                    console.log(`                   ${msg.payload.msg}  :用户${msg.payload.from}`);
            }
                break;
            default:
                console.log(`其他消息：`, msg);
        }
    });
    let res = await client.request('dologin', {
        username: 'test_102',
        password: '123456',
    });
    if (res.status === 'ok') {
        console.log(`用户登录成功。userInfo => ${res.userinfo}, chatInfo => ${res.chatinfo}`);
        Object.assign(userInfo, res.userinfo);
        Object.assign(chatInfo, res.chatinfo);
        setInterval(() => {
            client.send(`chat.send.${chatInfo.id}`, {msg: Date.now()});
        }, 10000);
    }

});

client.on('disconnect', () => {
    console.log('ws disconnect');
});

client.on('drop', () => {
    console.log('ws drop');
});

