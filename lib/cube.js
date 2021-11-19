/**
 * @file hypercube
 * @desc 出口文件
 * @author howxin
 */
"use strict";

const cube = module.exports = {};

const constants = require('./constants.js');

cube.createApp = require('./Application.js');
cube.RemoteConnector = require('./RemoteConnector.js');
cube.cluster = require('../cluster');
cube.remote = require('./remote.js');
cube.Router = require('./Router.js');

cube.remoteNativeAction = constants['REMOTE_NATIVE_ACTION'];
cube.applicationEvent = constants['APPLICATION_EVENT'];