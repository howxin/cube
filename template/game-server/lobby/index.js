"use strict";
const hyperCube = require('../../../index.js');
const common = require('../common/utils/common.js');
const config = require('../common/lib/config.js');
config.set(require('../common/config/config.json'));
const serverModel = require('../common/model/serverModel.js');
const serverGroupModel = require('../common/model/serverGroupModel.js');

const SERVERID = 2;

class Index {

    constructor() {

    }

    async start() {
        try {
            let serverInfo = await serverModel.getServerById(null, '*', SERVERID);
            if (!serverInfo || +serverInfo.status !== 0)
                throw new Error('');

            let groupInfo = await serverGroupModel.getById(null, ['name'], serverInfo.groupId);

            const options = {
                serverInfo: {
                    id: serverInfo.id,
                    group: groupInfo.name,
                    host: serverInfo.host,
                    port: serverInfo.port,
                    name: serverInfo.name
                },
                cluster: {
                    storage: require('../common/lib/storage.js'),
                }
            };

            const app = hyperCube.createApp(options);

            app.use('/remote', new (require('./remote/Remote.js'))(app));

            await app.start();

            const processExit = async() => {
                console.log("server will be shutdown, Goodbye!");
                try {
                    await app.exit();
                    process.exit();
                } catch (err) {
                    console.log('err =>', err);
                    process.exit();
                }
            };
            process.on('SIGTERM', processExit).on('SIGBREAK', processExit).on('SIGINT', processExit);
        } catch (err) {
            console.error('lobby server start catch error =>', err);
        }
    }
}

setInterval(function () {
    let mem = process.memoryUsage();
    // let use = Math.round(mem.heapUsed / 1048576);
    // if (use > 100) {
    // console.log('HIGHMEMORY_NOTICS', common.now(), common.getFileSize(mem.heapUsed));
    console.log(`[${common.now()}] Memory Usage Report\n`, {
        rss: common.getFileSize(mem.rss),
        heapTotal: common.getFileSize(mem.heapTotal),
        heapUsed: common.getFileSize(mem.heapUsed)
    });
    // }
}, 60 * 1000);

process.on('uncaughtException', e => {
    console.error(`caught uncaughtException =>  ${e.stack}`);
});
process.on('unhandledRejection', (reason, promise) => {
    promise.catch(e => {
        console.log('err =>', e);
        // console.error(`Unhandled Rejection at =>  Promise error stack =>  ${e.stack}, reason =>  ${JSON.stringify(reason)}`);
    });
});


(new Index()).start();


