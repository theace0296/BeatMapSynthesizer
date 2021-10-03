"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path = __importStar(require("path"));
const fsx = __importStar(require("fs-extra"));
const child_process_1 = require("child_process");
const os_1 = require("os");
const compare_versions_1 = __importDefault(require("compare-versions"));
const pythonApi_1 = require("./pythonApi");
class PythonServer {
    log = console.log;
    error = console.error;
    settings;
    activeShell;
    appPath;
    scriptsInternalPath;
    tempDir;
    constructor(_log, _error) {
        this.log = _log;
        this.error = _error;
        this.appPath = electron_1.app.getAppPath();
        this.scriptsInternalPath = path.join(this.appPath, 'build/scripts');
        this.tempDir = path.join(process.env.APPDATA ?? process.cwd(), 'beat-map-synthesizer', 'temp');
        if (fsx.existsSync(path.join(this.tempDir, 'settings.json'))) {
            this.settings = JSON.parse(fsx.readFileSync(path.join(this.tempDir, 'settings.json'), 'utf8'));
        }
        else {
            this.settings = {
                pythonCmd: process.platform === 'win32'
                    ? this.pythonExists()
                        ? 'python'
                        : path.join(this.tempDir, 'WPy64', 'python-3', 'python.exe')
                    : 'python3',
                pythonExists: process.platform === 'win32' ? this.pythonExists() : true,
                modulesInstalled: false,
                isWindows: process.platform === 'win32',
                hasRequiredExtensions: process.platform !== 'win32',
                version: '0.0.0',
            };
        }
        this.copyScriptFile();
        if (this.isOutOfDate()) {
            this.updateModelFiles();
            if (this.settings.isWindows) {
                this.windowsInitFiles();
                this.settings.hasRequiredExtensions = true;
                this.settings.pythonExists = true;
            }
            if (!this.settings.modulesInstalled) {
                this.installPythonModules();
                this.settings.modulesInstalled = true;
            }
            this.settings.version = electron_1.app.getVersion();
            fsx.writeFileSync(path.join(this.tempDir, 'settings.json'), JSON.stringify(this.settings, null, 2));
        }
    }
    isOutOfDate() {
        return compare_versions_1.default.compare(this.settings.version, electron_1.app.getVersion(), '<');
    }
    copyScriptFile() {
        this.log('initFiles - Updating script file.');
        fsx.copySync(path.join(this.scriptsInternalPath, 'beatMapSynthServer.py'), path.join(this.tempDir, 'beatMapSynthServer.py'));
        this.log('initFiles - Script file updated.');
    }
    updateModelFiles() {
        this.log('initFiles - Updating model files.');
        const files = [
            'cover.jpg',
            'models/HMM_easy_v1.pkl',
            'models/HMM_normal_v1.pkl',
            'models/HMM_hard_v1.pkl',
            'models/HMM_expert_v1.pkl',
            'models/HMM_expertplus_v1.pkl',
            'models/HMM_easy_v2.pkl',
            'models/HMM_normal_v2.pkl',
            'models/HMM_hard_v2.pkl',
            'models/HMM_expert_v2.pkl',
            'models/HMM_expertplus_v2.pkl',
            'models/HMM_easy_v3.pkl',
            'models/HMM_normal_v3.pkl',
            'models/HMM_hard_v3.pkl',
            'models/HMM_expert_v3.pkl',
            'models/HMM_expertplus_v3.pkl',
            'models/HMM_easy_v4.pkl',
            'models/HMM_normal_v4.pkl',
            'models/HMM_hard_v4.pkl',
            'models/HMM_expert_v4.pkl',
            'models/HMM_expertplus_v4.pkl',
        ];
        for (const file of files) {
            fsx.copySync(path.join(this.scriptsInternalPath, file), path.join(this.tempDir, file));
        }
        if (this.settings.isWindows) {
            for (const file of ['ffmpeg.exe', 'ffplay.exe', 'ffprobe.exe']) {
                fsx.copySync(path.join(this.scriptsInternalPath, file), path.join(this.tempDir, file));
            }
        }
    }
    pythonExists() {
        try {
            return !!child_process_1.execSync('python --version').toString();
        }
        catch (error) {
            return false;
        }
    }
    windowsInitFiles() {
        if (!this.settings.pythonExists) {
            if (!this.settings.hasRequiredExtensions) {
                if (!fsx.existsSync(path.join(this.tempDir, 'WinPython.exe'))) {
                    fsx.copySync(path.join(this.scriptsInternalPath, 'WinPython.exe'), path.join(this.tempDir, 'WinPython.exe'));
                }
                if (!fsx.existsSync(path.join(this.tempDir, 'VC_redist.x64.exe'))) {
                    fsx.copySync(path.join(this.scriptsInternalPath, 'VC_redist.x64.exe'), path.join(this.tempDir, 'VC_redist.x64.exe'));
                }
                this.log('initFiles - Installing VC Redist 2017.');
                try {
                    child_process_1.execFileSync(path.join(this.tempDir, 'VC_redist.x64.exe'), ['/install /passive /norestart'], {
                        windowsHide: true,
                    });
                }
                catch (error) {
                    this.error(error);
                }
            }
            if (!fsx.pathExistsSync(path.join(this.tempDir, 'WPy64'))) {
                this.log('initFiles - Installing WinPython.');
                try {
                    child_process_1.execFileSync(path.join(this.tempDir, 'WinPython.exe'), ['-o', `"${path.join(this.tempDir, 'WPy64').normalize().replace(/\\/gi, '/')}"`, '-y'], {
                        windowsHide: true,
                    });
                }
                catch (error) {
                    this.error(error);
                }
            }
        }
    }
    installPythonModules() {
        this.log('initFiles - Installing Python packages.');
        try {
            let data = '';
            if (!this.settings.pythonCmd.includes('python.exe')) {
                data = child_process_1.execSync(`${this.settings.pythonCmd} -m pip install audioread librosa numpy pandas scipy scikit-learn soundfile pydub markovify Flask gevent`, {
                    windowsHide: true,
                }).toString();
            }
            else {
                data = child_process_1.execSync(`cd ${path.dirname(this.settings.pythonCmd)} && python.exe -m pip install audioread librosa numpy pandas scipy scikit-learn soundfile pydub markovify Flask gevent`, {
                    windowsHide: true,
                }).toString();
            }
            this.log(data);
        }
        catch (error) {
            this.error(error);
        }
        this.log(`initFiles - Installed Python packages.`);
    }
    startPythonServer() {
        const self = this;
        return new Promise((resolve, reject) => {
            let _remaining;
            const failedToStartTimeout = setTimeout(() => {
                this.log('Python process failed to spawn -- timed out!');
                reject(false);
            }, 30000);
            function parseOut(data) {
                data && self.log(data);
            }
            function receiveInternal(data, emitType) {
                let parts = ('' + data).split(os_1.EOL);
                if (parts.length === 1) {
                    // an incomplete record, keep buffering
                    _remaining = (_remaining || '') + parts[0];
                    return this;
                }
                let lastLine = parts.pop();
                // fix the first line with the remaining from the previous iteration of 'receive'
                parts[0] = (_remaining || '') + parts[0];
                // keep the remaining for the next iteration of 'receive'
                _remaining = lastLine;
                parts.forEach(function (part) {
                    if (part.includes('Running on http://127.0.0.1:5000/')) {
                        clearTimeout(failedToStartTimeout);
                        resolve(true);
                    }
                    parseOut(part);
                });
                return this;
            }
            function receiveStdout(data) {
                return receiveInternal(data, 'stdout');
            }
            function receiveStderr(data) {
                return receiveInternal(data, 'stderr');
            }
            if (!this.settings.pythonCmd.includes('python.exe')) {
                this.activeShell = child_process_1.exec(`${this.settings.pythonCmd} "${path.normalize(path.join(this.tempDir.normalize().replace(/\\/gi, '/'), '/beatMapSynthServer.py'))}"`, {
                    timeout: 300000,
                    windowsHide: true,
                });
            }
            else {
                this.activeShell = child_process_1.exec(`cd ${path.dirname(this.settings.pythonCmd)} && python.exe "${path.normalize(path.join(this.tempDir.normalize().replace(/\\/gi, '/'), '/beatMapSynthServer.py'))}"`, {
                    timeout: 300000,
                    windowsHide: true,
                });
            }
            this.activeShell.on('close', code => {
                this.log('Finished');
                if (code === 0) {
                    this.log('Finished successfully!');
                }
                else {
                    this.error(`Failed with exit code: ${code}`);
                }
            });
            this.activeShell.stdout?.setEncoding('utf8');
            this.activeShell.stderr?.setEncoding('utf8');
            this.activeShell.stdout?.on('data', buffer => receiveStdout(buffer));
            this.activeShell.stderr?.on('data', buffer => receiveStderr(buffer));
            this.activeShell.once('spawn', () => {
                this.log('Python process spawned successfully!');
                clearTimeout(failedToStartTimeout);
                resolve(true);
            });
            this.activeShell.once('error', () => {
                this.log('Python process failed to spawn!');
                clearTimeout(failedToStartTimeout);
                reject(false);
            });
            setTimeout(() => {
                this.activeShell?.kill('SIGTERM');
            }, 450000);
        });
    }
    killShell() {
        if (this.activeShell) {
            pythonApi_1.closePythonServer().finally(() => {
                if (this.activeShell?.connected && !this.activeShell.kill('SIGTERM')) {
                    // Kills a PID and all child process
                    child_process_1.exec(`taskkill /f /t /pid ${this.activeShell.pid}`, (err, stdout) => {
                        console.log('stdout', stdout);
                        console.log('stderr', err);
                    });
                }
                delete this.activeShell;
            });
        }
        return true;
    }
}
exports.default = PythonServer;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHl0aG9uU2VydmVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL3B5dGhvblNlcnZlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSx1Q0FBK0I7QUFDL0IsMkNBQTZCO0FBQzdCLDhDQUFnQztBQUNoQyxpREFBMkU7QUFDM0UsMkJBQXlCO0FBQ3pCLHdFQUErQztBQUMvQywyQ0FBZ0Q7QUFFaEQsTUFBTSxZQUFZO0lBQ1IsR0FBRyxHQUE4QixPQUFPLENBQUMsR0FBRyxDQUFDO0lBQzdDLEtBQUssR0FBOEIsT0FBTyxDQUFDLEtBQUssQ0FBQztJQUN6RCxRQUFRLENBT047SUFDRixXQUFXLENBQWdCO0lBQzNCLE9BQU8sQ0FBUztJQUNoQixtQkFBbUIsQ0FBUztJQUM1QixPQUFPLENBQVM7SUFFaEIsWUFBWSxJQUErQixFQUFFLE1BQWlDO1FBQzVFLElBQUksQ0FBQyxHQUFHLEdBQUcsSUFBSSxDQUFDO1FBQ2hCLElBQUksQ0FBQyxLQUFLLEdBQUcsTUFBTSxDQUFDO1FBRXBCLElBQUksQ0FBQyxPQUFPLEdBQUcsY0FBRyxDQUFDLFVBQVUsRUFBRSxDQUFDO1FBQ2hDLElBQUksQ0FBQyxtQkFBbUIsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLEVBQUUsZUFBZSxDQUFDLENBQUM7UUFDcEUsSUFBSSxDQUFDLE9BQU8sR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsT0FBTyxJQUFJLE9BQU8sQ0FBQyxHQUFHLEVBQUUsRUFBRSxzQkFBc0IsRUFBRSxNQUFNLENBQUMsQ0FBQztRQUUvRixJQUFJLEdBQUcsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLGVBQWUsQ0FBQyxDQUFDLEVBQUU7WUFDNUQsSUFBSSxDQUFDLFFBQVEsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFD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IHsgYXBwIH0gZnJvbSAnZWxlY3Ryb24nO1xyXG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gJ3BhdGgnO1xyXG5pbXBvcnQgKiBhcyBmc3ggZnJvbSAnZnMtZXh0cmEnO1xyXG5pbXBvcnQgeyBDaGlsZFByb2Nlc3MsIGV4ZWMsIGV4ZWNGaWxlU3luYywgZXhlY1N5bmMgfSBmcm9tICdjaGlsZF9wcm9jZXNzJztcclxuaW1wb3J0IHsgRU9MIH0gZnJvbSAnb3MnO1xyXG5pbXBvcnQgY29tcGFyZVZlcnNpb25zIGZyb20gJ2NvbXBhcmUtdmVyc2lvbnMnO1xyXG5pbXBvcnQgeyBjbG9zZVB5dGhvblNlcnZlciB9IGZyb20gJy4vcHl0aG9uQXBpJztcclxuXHJcbmNsYXNzIFB5dGhvblNlcnZlciB7XHJcbiAgcHJpdmF0ZSBsb2c6IChtZXNzYWdlOiBzdHJpbmcpID0+IHZvaWQgPSBjb25zb2xlLmxvZztcclxuICBwcml2YXRlIGVycm9yOiAobWVzc2FnZTogc3RyaW5nKSA9PiB2b2lkID0gY29uc29sZS5lcnJvcjtcclxuICBzZXR0aW5nczoge1xyXG4gICAgcHl0aG9uQ21kOiBzdHJpbmc7XHJcbiAgICBweXRob25FeGlzdHM6IGJvb2xlYW47XHJcbiAgICBtb2R1bGVzSW5zdGFsbGVkOiBib29sZWFuO1xyXG4gICAgaXNXaW5kb3dzOiBib29sZWFuO1xyXG4gICAgaGFzUmVxdWlyZWRFeHRlbnNpb25zOiBib29sZWFuO1xyXG4gICAgdmVyc2lvbjogc3RyaW5nO1xyXG4gIH07XHJcbiAgYWN0aXZlU2hlbGw/OiBDaGlsZFByb2Nlc3M7XHJcbiAgYXBwUGF0aDogc3RyaW5nO1xyXG4gIHNjcmlwdHNJbnRlcm5hbFBhdGg6IHN0cmluZztcclxuICB0ZW1wRGlyOiBzdHJpbmc7XHJcblxyXG4gIGNvbnN0cnVjdG9yKF9sb2c6IChtZXNzYWdlOiBzdHJpbmcpID0+IHZvaWQsIF9lcnJvcjogKG1lc3NhZ2U6IHN0cmluZykgPT4gdm9pZCkge1xyXG4gICAgdGhpcy5sb2cgPSBfbG9nO1xyXG4gICAgdGhpcy5lcnJvciA9IF9lcnJvcjtcclxuXHJcbiAgICB0aGlzLmFwcFBhdGggPSBhcHAuZ2V0QXBwUGF0aCgpO1xyXG4gICAgdGhpcy5zY3JpcHRzSW50ZXJuYWxQYXRoID0gcGF0aC5qb2luKHRoaXMuYXBwUGF0aCwgJ2J1aWxkL3NjcmlwdHMnKTtcclxuICAgIHRoaXMudGVtcERpciA9IHBhdGguam9pbihwcm9jZXNzLmVudi5BUFBEQVRBID8/IHByb2Nlc3MuY3dkKCksICdiZWF0LW1hcC1zeW50aGVzaXplcicsICd0ZW1wJyk7XHJcblxyXG4gICAgaWYgKGZzeC5leGlzdHNTeW5jKHBhdGguam9pbih0aGlzLnRlbXBEaXIsICdzZXR0aW5ncy5qc29uJykpKSB7XHJcbiAgICAgIHRoaXMuc2V0dGluZ3MgPSBKU09OLnBhcnNlKGZzeC5yZWFkRmlsZVN5bmMocGF0aC5qb2luKHRoaXMudGVtcERpciwgJ3NldHRpbmdzLmpzb24nKSwgJ3V0ZjgnKSk7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICB0aGlzLnNldHRpbmdzID0ge1xyXG4gICAgICAgIHB5dGhvbkNtZDpcclxuICAgICAgICAgIHByb2Nlc3MucGxhdGZvcm0gPT09ICd3aW4zMidcclxuICAgICAgICAgICAgPyB0aGlzLnB5dGhvbkV4aXN0cygpXHJcbiAgICAgICAgICAgICAgPyAncHl0aG9uJ1xyXG4gICAgICAgICAgICAgIDogcGF0aC5qb2luKHRoaXMudGVtcERpciwgJ1dQeTY0JywgJ3B5dGhvbi0zJywgJ3B5dGhvbi5leGUnKVxyXG4gICAgICAgICAgICA6ICdweXRob24zJyxcclxuICAgICAgICBweXRob25FeGlzdHM6IHByb2Nlc3MucGxhdGZvcm0gPT09ICd3aW4zMicgPyB0aGlzLnB5dGhvbkV4aXN0cygpIDogdHJ1ZSxcclxuICAgICAgICBtb2R1bGVzSW5zdGFsbGVkOiBmYWxzZSxcclxuICAgICAgICBpc1dpbmRvd3M6IHByb2Nlc3MucGxhdGZvcm0gPT09ICd3aW4zMicsXHJcbiAgICAgICAgaGFzUmVxdWlyZWRFeHRlbnNpb25zOiBwcm9jZXNzLnBsYXRmb3JtICE9PSAnd2luMzInLFxyXG4gICAgICAgIHZlcnNpb246ICcwLjAuMCcsXHJcbiAgICAgIH07XHJcbiAgICB9XHJcbiAgICB0aGlzLmNvcHlTY3JpcHRGaWxlKCk7XHJcbiAgICBpZiAodGhpcy5pc091dE9mRGF0ZSgpKSB7XHJcbiAgICAgIHRoaXMudXBkYXRlTW9kZWxGaWxlcygpO1xyXG4gICAgICBpZiAodGhpcy5zZXR0aW5ncy5pc1dpbmRvd3MpIHtcclxuICAgICAgICB0aGlzLndpbmRvd3NJbml0RmlsZXMoKTtcclxuICAgICAgICB0aGlzLnNldHRpbmdzLmhhc1JlcXVpcmVkRXh0ZW5zaW9ucyA9IHRydWU7XHJcbiAgICAgICAgdGhpcy5zZXR0aW5ncy5weXRob25FeGlzdHMgPSB0cnVlO1xyXG4gICAgICB9XHJcbiAgICAgIGlmICghdGhpcy5zZXR0aW5ncy5tb2R1bGVzSW5zdGFsbGVkKSB7XHJcbiAgICAgICAgdGhpcy5pbnN0YWxsUHl0aG9uTW9kdWxlcygpO1xyXG4gICAgICAgIHRoaXMuc2V0dGluZ3MubW9kdWxlc0luc3RhbGxlZCA9IHRydWU7XHJcbiAgICAgIH1cclxuICAgICAgdGhpcy5zZXR0aW5ncy52ZXJzaW9uID0gYXBwLmdldFZlcnNpb24oKTtcclxuICAgICAgZnN4LndyaXRlRmlsZVN5bmMocGF0aC5qb2luKHRoaXMudGVtcERpciwgJ3NldHRpbmdzLmpzb24nKSwgSlNPTi5zdHJpbmdpZnkodGhpcy5zZXR0aW5ncywgbnVsbCwgMikpO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgaXNPdXRPZkRhdGUoKSB7XHJcbiAgICByZXR1cm4gY29tcGFyZVZlcnNpb25zLmNvbXBhcmUodGhpcy5zZXR0aW5ncy52ZXJzaW9uLCBhcHAuZ2V0VmVyc2lvbigpLCAnPCcpO1xyXG4gIH1cclxuXHJcbiAgY29weVNjcmlwdEZpbGUoKSB7XHJcbiAgICB0aGlzLmxvZygnaW5pdEZpbGVzIC0gVXBkYXRpbmcgc2NyaXB0IGZpbGUuJyk7XHJcbiAgICBmc3guY29weVN5bmMoXHJcbiAgICAgIHBhdGguam9pbih0aGlzLnNjcmlwdHNJbnRlcm5hbFBhdGgsICdiZWF0TWFwU3ludGhTZXJ2ZXIucHknKSxcclxuICAgICAgcGF0aC5qb2luKHRoaXMudGVtcERpciwgJ2JlYXRNYXBTeW50aFNlcnZlci5weScpXHJcbiAgICApO1xyXG4gICAgdGhpcy5sb2coJ2luaXRGaWxlcyAtIFNjcmlwdCBmaWxlIHVwZGF0ZWQuJyk7XHJcbiAgfVxyXG5cclxuICB1cGRhdGVNb2RlbEZpbGVzKCkge1xyXG4gICAgdGhpcy5sb2coJ2luaXRGaWxlcyAtIFVwZGF0aW5nIG1vZGVsIGZpbGVzLicpO1xyXG4gICAgY29uc3QgZmlsZXM6IHN0cmluZ1tdID0gW1xyXG4gICAgICAnY292ZXIuanBnJyxcclxuICAgICAgJ21vZGVscy9ITU1fZWFzeV92MS5wa2wnLFxyXG4gICAgICAnbW9kZWxzL0hNTV9ub3JtYWxfdjEucGtsJyxcclxuICAgICAgJ21vZGVscy9ITU1faGFyZF92MS5wa2wnLFxyXG4gICAgICAnbW9kZWxzL0hNTV9leHBlcnRfdjEucGtsJyxcclxuICAgICAgJ21vZGVscy9ITU1fZXhwZXJ0cGx1c192MS5wa2wnLFxyXG4gICAgICAnbW9kZWxzL0hNTV9lYXN5X3YyLnBrbCcsXHJcbiAgICAgICdtb2RlbHMvSE1NX25vcm1hbF92Mi5wa2wnLFxyXG4gICAgICAnbW9kZWxzL0hNTV9oYXJkX3YyLnBrbCcsXHJcbiAgICAgICdtb2RlbHMvSE1NX2V4cGVydF92Mi5wa2wnLFxyXG4gICAgICAnbW9kZWxzL0hNTV9leHBlcnRwbHVzX3YyLnBrbCcsXHJcbiAgICAgICdtb2RlbHMvSE1NX2Vhc3lfdjMucGtsJyxcclxuICAgICAgJ21vZGVscy9ITU1fbm9ybWFsX3YzLnBrbCcsXHJcbiAgICAgICdtb2RlbHMvSE1NX2hhcmRfdjMucGtsJyxcclxuICAgICAgJ21vZGVscy9ITU1fZXhwZXJ0X3YzLnBrbCcsXHJcbiAgICAgICdtb2RlbHMvSE1NX2V4cGVydHBsdXNfdjMucGtsJyxcclxuICAgICAgJ21vZGVscy9ITU1fZWFzeV92NC5wa2wnLFxyXG4gICAgICAnbW9kZWxzL0hNTV9ub3JtYWxfdjQucGtsJyxcclxuICAgICAgJ21vZGVscy9ITU1faGFyZF92NC5wa2wnLFxyXG4gICAgICAnbW9kZWxzL0hNTV9leHBlcnRfdjQucGtsJyxcclxuICAgICAgJ21vZGVscy9ITU1fZXhwZXJ0cGx1c192NC5wa2wnLFxyXG4gICAgXTtcclxuXHJcbiAgICBmb3IgKGNvbnN0IGZpbGUgb2YgZmlsZXMpIHtcclxuICAgICAgZnN4LmNvcHlTeW5jKHBhdGguam9pbih0aGlzLnNjcmlwdHNJbnRlcm5hbFBhdGgsIGZpbGUpLCBwYXRoLmpvaW4odGhpcy50ZW1wRGlyLCBmaWxlKSk7XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKHRoaXMuc2V0dGluZ3MuaXNXaW5kb3dzKSB7XHJcbiAgICAgIGZvciAoY29uc3QgZmlsZSBvZiBbJ2ZmbXBlZy5leGUnLCAnZmZwbGF5LmV4ZScsICdmZnByb2JlLmV4ZSddKSB7XHJcbiAgICAgICAgZnN4LmNvcHlTeW5jKHBhdGguam9pbih0aGlzLnNjcmlwdHNJbnRlcm5hbFBhdGgsIGZpbGUpLCBwYXRoLmpvaW4odGhpcy50ZW1wRGlyLCBmaWxlKSk7XHJcbiAgICAgIH1cclxuICAgIH1cclxuICB9XHJcblxyXG4gIHB5dGhvbkV4aXN0cygpIHtcclxuICAgIHRyeSB7XHJcbiAgICAgIHJldHVybiAhIWV4ZWNTeW5jKCdweXRob24gLS12ZXJzaW9uJykudG9TdHJpbmcoKTtcclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgIHJldHVybiBmYWxzZTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIHdpbmRvd3NJbml0RmlsZXMoKSB7XHJcbiAgICBpZiAoIXRoaXMuc2V0dGluZ3MucHl0aG9uRXhpc3RzKSB7XHJcbiAgICAgIGlmICghdGhpcy5zZXR0aW5ncy5oYXNSZXF1aXJlZEV4dGVuc2lvbnMpIHtcclxuICAgICAgICBpZiAoIWZzeC5leGlzdHNTeW5jKHBhdGguam9pbih0aGlzLnRlbXBEaXIsICdXaW5QeXRob24uZXhlJykpKSB7XHJcbiAgICAgICAgICBmc3guY29weVN5bmMocGF0aC5qb2luKHRoaXMuc2NyaXB0c0ludGVybmFsUGF0aCwgJ1dpblB5dGhvbi5leGUnKSwgcGF0aC5qb2luKHRoaXMudGVtcERpciwgJ1dpblB5dGhvbi5leGUnKSk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBpZiAoIWZzeC5leGlzdHNTeW5jKHBhdGguam9pbih0aGlzLnRlbXBEaXIsICdWQ19yZWRpc3QueDY0LmV4ZScpKSkge1xyXG4gICAgICAgICAgZnN4LmNvcHlTeW5jKFxyXG4gICAgICAgICAgICBwYXRoLmpvaW4odGhpcy5zY3JpcHRzSW50ZXJuYWxQYXRoLCAnVkNfcmVkaXN0Lng2NC5leGUnKSxcclxuICAgICAgICAgICAgcGF0aC5qb2luKHRoaXMudGVtcERpciwgJ1ZDX3JlZGlzdC54NjQuZXhlJylcclxuICAgICAgICAgICk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB0aGlzLmxvZygnaW5pdEZpbGVzIC0gSW5zdGFsbGluZyBWQyBSZWRpc3QgMjAxNy4nKTtcclxuICAgICAgICB0cnkge1xyXG4gICAgICAgICAgZXhlY0ZpbGVTeW5jKHBhdGguam9pbih0aGlzLnRlbXBEaXIsICdWQ19yZWRpc3QueDY0LmV4ZScpLCBbJy9pbnN0YWxsIC9wYXNzaXZlIC9ub3Jlc3RhcnQnXSwge1xyXG4gICAgICAgICAgICB3aW5kb3dzSGlkZTogdHJ1ZSxcclxuICAgICAgICAgIH0pO1xyXG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgICAgICB0aGlzLmVycm9yKGVycm9yIGFzIGFueSk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcblxyXG4gICAgICBpZiAoIWZzeC5wYXRoRXhpc3RzU3luYyhwYXRoLmpvaW4odGhpcy50ZW1wRGlyLCAnV1B5NjQnKSkpIHtcclxuICAgICAgICB0aGlzLmxvZygnaW5pdEZpbGVzIC0gSW5zdGFsbGluZyBXaW5QeXRob24uJyk7XHJcbiAgICAgICAgdHJ5IHtcclxuICAgICAgICAgIGV4ZWNGaWxlU3luYyhcclxuICAgICAgICAgICAgcGF0aC5qb2luKHRoaXMudGVtcERpciwgJ1dpblB5dGhvbi5leGUnKSxcclxuICAgICAgICAgICAgWyctbycsIGBcIiR7cGF0aC5qb2luKHRoaXMudGVtcERpciwgJ1dQeTY0Jykubm9ybWFsaXplKCkucmVwbGFjZSgvXFxcXC9naSwgJy8nKX1cImAsICcteSddLFxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgd2luZG93c0hpZGU6IHRydWUsXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICk7XHJcbiAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICAgIHRoaXMuZXJyb3IoZXJyb3IgYXMgYW55KTtcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuICAgIH1cclxuICB9XHJcblxyXG4gIGluc3RhbGxQeXRob25Nb2R1bGVzKCkge1xyXG4gICAgdGhpcy5sb2coJ2luaXRGaWxlcyAtIEluc3RhbGxpbmcgUHl0aG9uIHBhY2thZ2VzLicpO1xyXG4gICAgdHJ5IHtcclxuICAgICAgbGV0IGRhdGEgPSAnJztcclxuICAgICAgaWYgKCF0aGlzLnNldHRpbmdzLnB5dGhvbkNtZC5pbmNsdWRlcygncHl0aG9uLmV4ZScpKSB7XHJcbiAgICAgICAgZGF0YSA9IGV4ZWNTeW5jKFxyXG4gICAgICAgICAgYCR7dGhpcy5zZXR0aW5ncy5weXRob25DbWR9IC1tIHBpcCBpbnN0YWxsIGF1ZGlvcmVhZCBsaWJyb3NhIG51bXB5IHBhbmRhcyBzY2lweSBzY2lraXQtbGVhcm4gc291bmRmaWxlIHB5ZHViIG1hcmtvdmlmeSBGbGFzayBnZXZlbnRgLFxyXG4gICAgICAgICAge1xyXG4gICAgICAgICAgICB3aW5kb3dzSGlkZTogdHJ1ZSxcclxuICAgICAgICAgIH1cclxuICAgICAgICApLnRvU3RyaW5nKCk7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgZGF0YSA9IGV4ZWNTeW5jKFxyXG4gICAgICAgICAgYGNkICR7cGF0aC5kaXJuYW1lKFxyXG4gICAgICAgICAgICB0aGlzLnNldHRpbmdzLnB5dGhvbkNtZFxyXG4gICAgICAgICAgKX0gJiYgcHl0aG9uLmV4ZSAtbSBwaXAgaW5zdGFsbCBhdWRpb3JlYWQgbGlicm9zYSBudW1weSBwYW5kYXMgc2NpcHkgc2Npa2l0LWxlYXJuIHNvdW5kZmlsZSBweWR1YiBtYXJrb3ZpZnkgRmxhc2sgZ2V2ZW50YCxcclxuICAgICAgICAgIHtcclxuICAgICAgICAgICAgd2luZG93c0hpZGU6IHRydWUsXHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgKS50b1N0cmluZygpO1xyXG4gICAgICB9XHJcbiAgICAgIHRoaXMubG9nKGRhdGEpO1xyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgdGhpcy5lcnJvcihlcnJvciBhcyBhbnkpO1xyXG4gICAgfVxyXG4gICAgdGhpcy5sb2coYGluaXRGaWxlcyAtIEluc3RhbGxlZCBQeXRob24gcGFja2FnZXMuYCk7XHJcbiAgfVxyXG5cclxuICBzdGFydFB5dGhvblNlcnZlcigpOiBQcm9taXNlPGJvb2xlYW4+IHtcclxuICAgIGNvbnN0IHNlbGYgPSB0aGlzO1xyXG4gICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcclxuICAgICAgbGV0IF9yZW1haW5pbmc6IHN0cmluZyB8IHVuZGVmaW5lZDtcclxuXHJcbiAgICAgIGNvbnN0IGZhaWxlZFRvU3RhcnRUaW1lb3V0ID0gc2V0VGltZW91dCgoKSA9PiB7XHJcbiAgICAgICAgdGhpcy5sb2coJ1B5dGhvbiBwcm9jZXNzIGZhaWxlZCB0byBzcGF3biAtLSB0aW1lZCBvdXQhJyk7XHJcbiAgICAgICAgcmVqZWN0KGZhbHNlKTtcclxuICAgICAgfSwgMzAwMDApO1xyXG5cclxuICAgICAgZnVuY3Rpb24gcGFyc2VPdXQoZGF0YT86IHN0cmluZykge1xyXG4gICAgICAgIGRhdGEgJiYgc2VsZi5sb2coZGF0YSk7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGZ1bmN0aW9uIHJlY2VpdmVJbnRlcm5hbCh0aGlzOiBhbnksIGRhdGE6IHN0cmluZyB8IEJ1ZmZlciwgZW1pdFR5cGU6ICdzdGRvdXQnIHwgJ3N0ZGVycicpIHtcclxuICAgICAgICBsZXQgcGFydHMgPSAoJycgKyBkYXRhKS5zcGxpdChFT0wpO1xyXG5cclxuICAgICAgICBpZiAocGFydHMubGVuZ3RoID09PSAxKSB7XHJcbiAgICAgICAgICAvLyBhbiBpbmNvbXBsZXRlIHJlY29yZCwga2VlcCBidWZmZXJpbmdcclxuICAgICAgICAgIF9yZW1haW5pbmcgPSAoX3JlbWFpbmluZyB8fCAnJykgKyBwYXJ0c1swXTtcclxuICAgICAgICAgIHJldHVybiB0aGlzO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgbGV0IGxhc3RMaW5lID0gcGFydHMucG9wKCk7XHJcbiAgICAgICAgLy8gZml4IHRoZSBmaXJzdCBsaW5lIHdpdGggdGhlIHJlbWFpbmluZyBmcm9tIHRoZSBwcmV2aW91cyBpdGVyYXRpb24gb2YgJ3JlY2VpdmUnXHJcbiAgICAgICAgcGFydHNbMF0gPSAoX3JlbWFpbmluZyB8fCAnJykgKyBwYXJ0c1swXTtcclxuICAgICAgICAvLyBrZWVwIHRoZSByZW1haW5pbmcgZm9yIHRoZSBuZXh0IGl0ZXJhdGlvbiBvZiAncmVjZWl2ZSdcclxuICAgICAgICBfcmVtYWluaW5nID0gbGFzdExpbmU7XHJcblxyXG4gICAgICAgIHBhcnRzLmZvckVhY2goZnVuY3Rpb24gKHBhcnQpIHtcclxuICAgICAgICAgIGlmIChwYXJ0LmluY2x1ZGVzKCdSdW5uaW5nIG9uIGh0dHA6Ly8xMjcuMC4wLjE6NTAwMC8nKSkge1xyXG4gICAgICAgICAgICBjbGVhclRpbWVvdXQoZmFpbGVkVG9TdGFydFRpbWVvdXQpO1xyXG4gICAgICAgICAgICByZXNvbHZlKHRydWUpO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgICAgcGFyc2VPdXQocGFydCk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIHJldHVybiB0aGlzO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBmdW5jdGlvbiByZWNlaXZlU3Rkb3V0KGRhdGE6IHN0cmluZyB8IEJ1ZmZlcikge1xyXG4gICAgICAgIHJldHVybiByZWNlaXZlSW50ZXJuYWwoZGF0YSwgJ3N0ZG91dCcpO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBmdW5jdGlvbiByZWNlaXZlU3RkZXJyKGRhdGE6IHN0cmluZyB8IEJ1ZmZlcikge1xyXG4gICAgICAgIHJldHVybiByZWNlaXZlSW50ZXJuYWwoZGF0YSwgJ3N0ZGVycicpO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBpZiAoIXRoaXMuc2V0dGluZ3MucHl0aG9uQ21kLmluY2x1ZGVzKCdweXRob24uZXhlJykpIHtcclxuICAgICAgICB0aGlzLmFjdGl2ZVNoZWxsID0gZXhlYyhcclxuICAgICAgICAgIGAke3RoaXMuc2V0dGluZ3MucHl0aG9uQ21kfSBcIiR7cGF0aC5ub3JtYWxpemUoXHJcbiAgICAgICAgICAgIHBhdGguam9pbih0aGlzLnRlbXBEaXIubm9ybWFsaXplKCkucmVwbGFjZSgvXFxcXC9naSwgJy8nKSwgJy9iZWF0TWFwU3ludGhTZXJ2ZXIucHknKVxyXG4gICAgICAgICAgKX1cImAsXHJcbiAgICAgICAgICB7XHJcbiAgICAgICAgICAgIHRpbWVvdXQ6IDMwMDAwMCxcclxuICAgICAgICAgICAgd2luZG93c0hpZGU6IHRydWUsXHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgKTtcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICB0aGlzLmFjdGl2ZVNoZWxsID0gZXhlYyhcclxuICAgICAgICAgIGBjZCAke3BhdGguZGlybmFtZSh0aGlzLnNldHRpbmdzLnB5dGhvbkNtZCl9ICYmIHB5dGhvbi5leGUgXCIke3BhdGgubm9ybWFsaXplKFxyXG4gICAgICAgICAgICBwYXRoLmpvaW4odGhpcy50ZW1wRGlyLm5vcm1hbGl6ZSgpLnJlcGxhY2UoL1xcXFwvZ2ksICcvJyksICcvYmVhdE1hcFN5bnRoU2VydmVyLnB5JylcclxuICAgICAgICAgICl9XCJgLFxyXG4gICAgICAgICAge1xyXG4gICAgICAgICAgICB0aW1lb3V0OiAzMDAwMDAsXHJcbiAgICAgICAgICAgIHdpbmRvd3NIaWRlOiB0cnVlLFxyXG4gICAgICAgICAgfVxyXG4gICAgICAgICk7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIHRoaXMuYWN0aXZlU2hlbGwub24oJ2Nsb3NlJywgY29kZSA9PiB7XHJcbiAgICAgICAgdGhpcy5sb2coJ0ZpbmlzaGVkJyk7XHJcblxyXG4gICAgICAgIGlmIChjb2RlID09PSAwKSB7XHJcbiAgICAgICAgICB0aGlzLmxvZygnRmluaXNoZWQgc3VjY2Vzc2Z1bGx5IScpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICB0aGlzLmVycm9yKGBGYWlsZWQgd2l0aCBleGl0IGNvZGU6ICR7Y29kZX1gKTtcclxuICAgICAgICB9XHJcbiAgICAgIH0pO1xyXG5cclxuICAgICAgdGhpcy5hY3RpdmVTaGVsbC5zdGRvdXQ/LnNldEVuY29kaW5nKCd1dGY4Jyk7XHJcbiAgICAgIHRoaXMuYWN0aXZlU2hlbGwuc3RkZXJyPy5zZXRFbmNvZGluZygndXRmOCcpO1xyXG5cclxuICAgICAgdGhpcy5hY3RpdmVTaGVsbC5zdGRvdXQ/Lm9uKCdkYXRhJywgYnVmZmVyID0+IHJlY2VpdmVTdGRvdXQoYnVmZmVyKSk7XHJcblxyXG4gICAgICB0aGlzLmFjdGl2ZVNoZWxsLnN0ZGVycj8ub24oJ2RhdGEnLCBidWZmZXIgPT4gcmVjZWl2ZVN0ZGVycihidWZmZXIpKTtcclxuXHJcbiAgICAgIHRoaXMuYWN0aXZlU2hlbGwub25jZSgnc3Bhd24nLCAoKSA9PiB7XHJcbiAgICAgICAgdGhpcy5sb2coJ1B5dGhvbiBwcm9jZXNzIHNwYXduZWQgc3VjY2Vzc2Z1bGx5IScpO1xyXG4gICAgICAgIGNsZWFyVGltZW91dChmYWlsZWRUb1N0YXJ0VGltZW91dCk7XHJcbiAgICAgICAgcmVzb2x2ZSh0cnVlKTtcclxuICAgICAgfSk7XHJcblxyXG4gICAgICB0aGlzLmFjdGl2ZVNoZWxsLm9uY2UoJ2Vycm9yJywgKCkgPT4ge1xyXG4gICAgICAgIHRoaXMubG9nKCdQeXRob24gcHJvY2VzcyBmYWlsZWQgdG8gc3Bhd24hJyk7XHJcbiAgICAgICAgY2xlYXJUaW1lb3V0KGZhaWxlZFRvU3RhcnRUaW1lb3V0KTtcclxuICAgICAgICByZWplY3QoZmFsc2UpO1xyXG4gICAgICB9KTtcclxuXHJcbiAgICAgIHNldFRpbWVvdXQoKCkgPT4ge1xyXG4gICAgICAgIHRoaXMuYWN0aXZlU2hlbGw/LmtpbGwoJ1NJR1RFUk0nKTtcclxuICAgICAgfSwgNDUwMDAwKTtcclxuICAgIH0pO1xyXG4gIH1cclxuXHJcbiAga2lsbFNoZWxsKCkge1xyXG4gICAgaWYgKHRoaXMuYWN0aXZlU2hlbGwpIHtcclxuICAgICAgY2xvc2VQeXRob25TZXJ2ZXIoKS5maW5hbGx5KCgpID0+IHtcclxuICAgICAgICBpZiAodGhpcy5hY3RpdmVTaGVsbD8uY29ubmVjdGVkICYmICF0aGlzLmFjdGl2ZVNoZWxsLmtpbGwoJ1NJR1RFUk0nKSkge1xyXG4gICAgICAgICAgLy8gS2lsbHMgYSBQSUQgYW5kIGFsbCBjaGlsZCBwcm9jZXNzXHJcbiAgICAgICAgICBleGVjKGB0YXNra2lsbCAvZiAvdCAvcGlkICR7dGhpcy5hY3RpdmVTaGVsbC5waWR9YCwgKGVyciwgc3Rkb3V0KSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKCdzdGRvdXQnLCBzdGRvdXQpO1xyXG4gICAgICAgICAgICBjb25zb2xlLmxvZygnc3RkZXJyJywgZXJyKTtcclxuICAgICAgICAgIH0pO1xyXG4gICAgICAgIH1cclxuICAgICAgICBkZWxldGUgdGhpcy5hY3RpdmVTaGVsbDtcclxuICAgICAgfSk7XHJcbiAgICB9XHJcbiAgICByZXR1cm4gdHJ1ZTtcclxuICB9XHJcbn1cclxuXHJcbmV4cG9ydCBkZWZhdWx0IFB5dGhvblNlcnZlcjtcclxuIl19