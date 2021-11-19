/**
 * @class
 * @author howxin
 * @param
 */
"use strict";
const {RemoteConnector} = require('../../../../index.js');

class Remote extends RemoteConnector {
    
    constructor(app) {
        super();
        this.app = app;
        
    }
    
    testremote(req) {
        console.log('test remote', req.params, req.frontSession, req.localSession);
        req.response({status: 'ok', data: 'world'});
    }


    
}

module.exports = Remote;

