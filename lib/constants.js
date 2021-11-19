module.exports = {
    ER_CODE: {
        ER_REPEAT_CONNECT: 8,
        ER_HEARTBEAT_TIMEOUT: 9,
    },
    APPLICATION_EVENT: {
        CLIENT_CONNECTION: "client_connection",
        CLIENT_DISCONNECT: "client_disconnect",
        REMOTE_CONNECTION: "remote_connection",
        REMOTE_DISCONNECT: "remote_disconnect",
        REMOTE_DESTROY: "remote_destroy",
        REMOTE_DROP: "remote_drop",
    },
    APPLICATION_ERROR: {
        ER_REPEATED_START: "repeated_start",
        ER_INVALID_PARAMS: "invalid_params",
        ER_NOFOUND_HANDLERFN: "nofound_client_handler",
        ER_NOFOUND_APIFN: "nofound_http_handler",
        ER_NOFOUND_REMOTEFN: "nofound_remote_handler",
        ER_UNKOWN_REMOTEFN: "unkown_remote_handler",
        ER_INVALID_SERVERINFO: "invalid_serverinfo",
    },
    APIERRORS: {
        ERR_METHOD_NOFOUND: 'method_nofound',
    },
    HTTP_SERVER_EVENT: {
        REQUEST: 'request',
        CLOSE: 'close',
        ERROR: 'error',
        CONNECT: 'connect',
        CONNECTION: 'connection',
        LISTENING: 'listening',
    },
    WS_SERVER_EVENT: {
        CONNECTION: "connection",
        DISCONNECT: "disconnect",
    },
    WS_CLIENT_EVENT: {
        OPEN: "open",
        CLOSE: "close",
    },
    WS_ERROR: {
        ER_INVALID_PARAMS: "invalid_params",
        ER_SOCKET_CLOSED: "socket_closed",
        ER_INVALID_ACTION: "invalid_action",
        ER_INVALID_REQUEST: "invalid_request",
        ER_FREQUENT_REQUEST: "frequent_request",
        ER_HEARTBEAT_TIMEOUT: "heartbeat_timeout",
        ER_SERVER_NOT_FOUND: "server_notfound",
    },
    REMOTE_SERVER_STATE: {
        INIT: 0,
        CONNECTING: 1,
        CONNECTED: 2,
    },
    REMOTE_SERVER_EVENT: {
        CONNECTION: "connection",
        DROP: "drop",
        DESTROY: "destroy",
        DISCONNECT: "disconnect",
    },
    REMOTE_SERVER_ERROR: {
        ER_INIT_FAIL: "init_fail",
        ER_SOCKET_CLOSED: "socket_closed",
        ER_REQUEST_TIMEOUT: "remote_request_timeout",
        ER_INVALID_FUNCTION: "invalid_function",
    },
    REMOTE_CLIENT_EVENT: {
        OPEN: "open",
        CLOSE: "close",
        DESTROY: "destroy",
        INIT: "init",
        DROP: "drop"
    },
    REMOTE_CLIENT_ERROR: {
        ER_SOCKET_CLOSED: "socket_closed",
        ER_REQUEST_TIMEOUT: "remote_request_timeout",
        ER_INVALID_FUNCTION: "invalid_function",
    },
    REMOTE_NATIVE_ACTION: {
        CLOSE_SOCKET: "_close",
        SERVER_INFO: "_serverinfo",
        SYNC_SESSION: "_syncsession",
        SAVE_SESSION: "_savesession",
        PUSH_MESSAGE: "_pushmessage",
        CLIENT_DISCONNECT: "_disconnect",
    },
    CLUSTER_ERROR: {
        ER_INVALID_PARAMS: "invalid_configure_params",
        ER_STORAGE_MODULE: "invalid_storage_params",
    },
    FRONTSESSION_ERROR: {
        ER_INVALID_PARAMS: "invalid_params",
        ER_NO_CREATE: "no_create",
    },
    SESSION_SERVICE_ERROR: {
        ER_INVALID_MODE: "invalid_mode",
        ER_INVALID_PARAMS: "invalid_params",
    }
};