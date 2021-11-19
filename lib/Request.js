/**
 * @file Request
 * @desc
 * @date 2019-08-14
 * @author howxin
 */
"use strict";
const url = require('url');
const qs = require('querystring');

class Request {
    constructor(_req, app) {
        this.app = app;
        this.request = _req;
        this.method = _req.method;
        this.url = _req.url;
        this.headers = _req.headers;
        this.originalHeaders = {};
        for (let i = 0; i < _req.rawHeaders.length;) {
            let key = _req.rawHeaders[i];
            let value = _req.rawHeaders[i + 1];
            this.originalHeaders[key] = value;
            i = i + 2;
        }
        this.pathname = '';
        this.query = {};
        this.params = {};
        this.body = {};
        this.session = {};
    }

    async init() {
        if (this.url === '') return;
        const req = this.request;
        const urlObj = url.parse(this.url);
        this.query = qs.parse(urlObj.query);
        this.pathname = urlObj.pathname;

        const mime = (contentType = '') => contentType.split(';')[0];
        const contentType = req.headers['content-type'];
        switch (mime(contentType)) {
            case 'application/x-www-form-urlencoded':
                return new Promise(resolve => {
                    let data = '';
                    req.setEncoding('utf8');
                    req.on('data', (chunk) => data += chunk);
                    req.on('end', () => {
                        Object.assign(this.body, qs.parse(data));
                        resolve();
                    });
                });
            case 'application/json':
                return new Promise((resolve, reject) => {
                    let data = '';
                    req.setEncoding('utf8');
                    req.on('data', (chunk) => data += chunk);
                    req.on('end', () => {
                        try {
                            this.body = JSON.parse(data);
                            resolve();
                        } catch (err) {
                            reject(new Error('invalid json'));
                        }
                    });
                });
                break;
        }
    }

    addParam(key, val) {
        this.params[key] = val;
    }
}

module.exports = Request;