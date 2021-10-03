import { app } from 'electron';
import * as path from 'path';
import * as fsx from 'fs-extra';
import { ChildProcess, exec, execFileSync, execSync } from 'child_process';
import { EOL } from 'os';
import compareVersions from 'compare-versions';
import { closePythonServer } from './pythonApi';

class PythonServer {
  private log: (message: string) => void = console.log;
  private error: (message: string) => void = console.error;
  settings: {
    pythonCmd: string;
    pythonExists: boolean;
    modulesInstalled: boolean;
    isWindows: boolean;
    hasRequiredExtensions: boolean;
    version: string;
  };
  activeShell?: ChildProcess;
  appPath: string;
  scriptsInternalPath: string;
  tempDir: string;

  constructor(_log: (message: string) => void, _error: (message: string) => void) {
    this.log = _log;
    this.error = _error;

    this.appPath = app.getAppPath();
    this.scriptsInternalPath = path.join(this.appPath, 'build/scripts');
    this.tempDir = path.join(process.env.APPDATA ?? process.cwd(), 'beat-map-synthesizer', 'temp');

    if (fsx.existsSync(path.join(this.tempDir, 'settings.json'))) {
      this.settings = JSON.parse(fsx.readFileSync(path.join(this.tempDir, 'settings.json'), 'utf8'));
    } else {
      this.settings = {
        pythonCmd:
          process.platform === 'win32'
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
      this.settings.version = app.getVersion();
      fsx.writeFileSync(path.join(this.tempDir, 'settings.json'), JSON.stringify(this.settings, null, 2));
    }
  }

  isOutOfDate() {
    return compareVersions.compare(this.settings.version, app.getVersion(), '<');
  }

  copyScriptFile() {
    this.log('initFiles - Updating script file.');
    fsx.copySync(
      path.join(this.scriptsInternalPath, 'beatMapSynthServer.py'),
      path.join(this.tempDir, 'beatMapSynthServer.py')
    );
    this.log('initFiles - Script file updated.');
  }

  updateModelFiles() {
    this.log('initFiles - Updating model files.');
    const files: string[] = [
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
      return !!execSync('python --version').toString();
    } catch (error) {
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
          fsx.copySync(
            path.join(this.scriptsInternalPath, 'VC_redist.x64.exe'),
            path.join(this.tempDir, 'VC_redist.x64.exe')
          );
        }

        this.log('initFiles - Installing VC Redist 2017.');
        try {
          execFileSync(path.join(this.tempDir, 'VC_redist.x64.exe'), ['/install /passive /norestart'], {
            windowsHide: true,
          });
        } catch (error) {
          this.error(error as any);
        }
      }

      if (!fsx.pathExistsSync(path.join(this.tempDir, 'WPy64'))) {
        this.log('initFiles - Installing WinPython.');
        try {
          execFileSync(
            path.join(this.tempDir, 'WinPython.exe'),
            ['-o', `"${path.join(this.tempDir, 'WPy64').normalize().replace(/\\/gi, '/')}"`, '-y'],
            {
              windowsHide: true,
            }
          );
        } catch (error) {
          this.error(error as any);
        }
      }
    }
  }

  installPythonModules() {
    this.log('initFiles - Installing Python packages.');
    try {
      let data = '';
      if (!this.settings.pythonCmd.includes('python.exe')) {
        data = execSync(
          `${this.settings.pythonCmd} -m pip install audioread librosa numpy pandas scipy scikit-learn soundfile pydub markovify Flask gevent`,
          {
            windowsHide: true,
          }
        ).toString();
      } else {
        data = execSync(
          `cd ${path.dirname(
            this.settings.pythonCmd
          )} && python.exe -m pip install audioread librosa numpy pandas scipy scikit-learn soundfile pydub markovify Flask gevent`,
          {
            windowsHide: true,
          }
        ).toString();
      }
      this.log(data);
    } catch (error) {
      this.error(error as any);
    }
    this.log(`initFiles - Installed Python packages.`);
  }

  startPythonServer(): Promise<boolean> {
    const self = this;
    return new Promise((resolve, reject) => {
      let _remaining: string | undefined;

      const failedToStartTimeout = setTimeout(() => {
        this.log('Python process failed to spawn -- timed out!');
        reject(false);
      }, 30000);

      function parseOut(data?: string) {
        data && self.log(data);
      }

      function receiveInternal(this: any, data: string | Buffer, emitType: 'stdout' | 'stderr') {
        let parts = ('' + data).split(EOL);

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

      function receiveStdout(data: string | Buffer) {
        return receiveInternal(data, 'stdout');
      }

      function receiveStderr(data: string | Buffer) {
        return receiveInternal(data, 'stderr');
      }

      if (!this.settings.pythonCmd.includes('python.exe')) {
        this.activeShell = exec(
          `${this.settings.pythonCmd} "${path.normalize(
            path.join(this.tempDir.normalize().replace(/\\/gi, '/'), '/beatMapSynthServer.py')
          )}"`,
          {
            timeout: 300000,
            windowsHide: true,
          }
        );
      } else {
        this.activeShell = exec(
          `cd ${path.dirname(this.settings.pythonCmd)} && python.exe "${path.normalize(
            path.join(this.tempDir.normalize().replace(/\\/gi, '/'), '/beatMapSynthServer.py')
          )}"`,
          {
            timeout: 300000,
            windowsHide: true,
          }
        );
      }

      this.activeShell.on('close', code => {
        this.log('Finished');

        if (code === 0) {
          this.log('Finished successfully!');
        } else {
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
      closePythonServer().finally(() => {
        if (this.activeShell?.connected && !this.activeShell.kill('SIGTERM')) {
          // Kills a PID and all child process
          exec(`taskkill /f /t /pid ${this.activeShell.pid}`, (err, stdout) => {
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

export default PythonServer;
