"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
exports.__esModule = true;
var is_electron_renderer_1 = __importDefault(require("is-electron-renderer"));
var renderer_1 = __importDefault(require("./renderer"));
var mainProcess_1 = __importDefault(require("./mainProcess"));
var exportedModule = is_electron_renderer_1["default"] ? renderer_1["default"] : mainProcess_1["default"];
module.exports = exportedModule;
exports["default"] = exportedModule;
