"use strict";
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
var __spreadArrays = (this && this.__spreadArrays) || function () {
    for (var s = 0, i = 0, il = arguments.length; i < il; i++) s += arguments[i].length;
    for (var r = Array(s), k = 0, i = 0; i < il; i++)
        for (var a = arguments[i], j = 0, jl = a.length; j < jl; j++, k++)
            r[k] = a[j];
    return r;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
exports.__esModule = true;
var electron_1 = require("electron"); // eslint-disable-line
var base_1 = __importDefault(require("./base"));
var PromiseIpcRenderer = /** @class */ (function (_super) {
    __extends(PromiseIpcRenderer, _super);
    function PromiseIpcRenderer(opts) {
        return _super.call(this, opts, electron_1.ipcRenderer) || this;
    }
    PromiseIpcRenderer.prototype.send = function (route) {
        var dataArgs = [];
        for (var _i = 1; _i < arguments.length; _i++) {
            dataArgs[_i - 1] = arguments[_i];
        }
        return _super.prototype.send.apply(this, __spreadArrays([route, electron_1.ipcRenderer], dataArgs));
    };
    return PromiseIpcRenderer;
}(base_1["default"]));
exports.PromiseIpcRenderer = PromiseIpcRenderer;
exports.PromiseIpc = PromiseIpcRenderer;
var rendererExport = new PromiseIpcRenderer();
rendererExport.PromiseIpc = PromiseIpcRenderer;
rendererExport.PromiseIpcRenderer = PromiseIpcRenderer;
module.exports = rendererExport;
exports["default"] = rendererExport;
