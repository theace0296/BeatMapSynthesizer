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
var electron_1 = require("electron");
var base_1 = __importDefault(require("./base"));
var PromiseIpcMain = /** @class */ (function (_super) {
    __extends(PromiseIpcMain, _super);
    function PromiseIpcMain(opts) {
        return _super.call(this, opts, electron_1.ipcMain) || this;
    }
    // Send requires webContents -- see http://electron.atom.io/docs/api/ipc-main/
    PromiseIpcMain.prototype.send = function (route, webContents) {
        var dataArgs = [];
        for (var _i = 2; _i < arguments.length; _i++) {
            dataArgs[_i - 2] = arguments[_i];
        }
        return _super.prototype.send.apply(this, __spreadArrays([route, webContents], dataArgs));
    };
    return PromiseIpcMain;
}(base_1["default"]));
exports.PromiseIpcMain = PromiseIpcMain;
exports.PromiseIpc = PromiseIpcMain;
var mainExport = new PromiseIpcMain();
mainExport.PromiseIpc = PromiseIpcMain;
mainExport.PromiseIpcMain = PromiseIpcMain;
module.exports = mainExport;
exports["default"] = mainExport;
