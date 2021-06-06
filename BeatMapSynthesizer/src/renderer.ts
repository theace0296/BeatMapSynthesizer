// All of the Node.js APIs are available in the preload process.
// It has the same sandbox as a Chrome extension.
import { ipcRenderer, remote } from 'electron';
import __beatMapArgs from './__beatMapArgs';

let args: __beatMapArgs = new __beatMapArgs();

let selectedDirs: string[] = [];

class operationType {
  static directory: number = 0;
  static files: number = 1;
}

var currentOperationType: number = operationType.files;

function parseFileList() {
  selectedDirs.length = 0;
  const fileListElement = document.getElementById('filelist') as HTMLTextAreaElement;
  let matches = fileListElement.value.match(/^(\b|")(.+)(\b|")$/gm);
  if (matches) {
    for (let match of matches) {
      // Remove any quotation marks
      let normalizedMatch = match.replace(/"/g, '');
      // Append filename to varaible
      selectedDirs.push(normalizedMatch);
      // Create the list item:
      let item = document.createElement('li');
      // Set its contents:
      item.appendChild(document.createTextNode(normalizedMatch));
      // Add it to the list:
      document.getElementById('dirsfilesList')?.appendChild(item);
    }
  }
}

function resetTaskLog() {
  const taskLogDiv = document.getElementById('taskLogDiv');
  if (taskLogDiv && taskLogDiv.innerHTML !== '') {
    taskLogDiv.innerHTML = '';
  }
  let element = document.createElement('pre');
  element.classList.add('prettyprint');
  element.classList.add('mvl');
  element.id = 'taskLog_MAIN';
  taskLogDiv?.appendChild(element);
}

remote.getCurrentWindow().webContents.once('dom-ready', () => {
  document.getElementById('selectFilesButton')?.addEventListener('click', () => {
    if (document.getElementById('dirsfilesList')?.innerHTML !== '') {
      document.getElementById('dirsfilesList')!.innerHTML = '';
    }
    currentOperationType = operationType.files;
    ipcRenderer.send('__selectFiles__');
  });

  document.getElementById('selectDirectoryButton')?.addEventListener('click', () => {
    if (document.getElementById('dirsfilesList')?.innerHTML !== '') {
      document.getElementById('dirsfilesList')!.innerHTML = '';
    }
    currentOperationType = operationType.directory;
    ipcRenderer.send('__selectDirectory__');
  });

  document.getElementById('selectFileListButton')?.addEventListener('click', () => {
    if (document.getElementById('dirsfilesList')?.innerHTML !== '') {
      document.getElementById('dirsfilesList')!.innerHTML = '';
    }
    currentOperationType = operationType.directory;
    document.getElementById('filelist')?.classList.remove('hidden');
    parseFileList();
  });

  document.getElementById('filelist')?.addEventListener('change', parseFileList);

  document.getElementById('chooseOutputDirButton')?.addEventListener('click', () => {
    if (document.getElementById('outputDirList')?.innerHTML !== '') {
      document.getElementById('outputDirList')!.innerHTML = '';
    }
    ipcRenderer.send('__selectOutDirectory__');
  });

  document.getElementById('difficultylist')?.addEventListener('change', () => {
    args.difficulty = (document.getElementById('difficultylist') as HTMLSelectElement).value.toString();
  });

  document.getElementById('modellist')?.addEventListener('change', () => {
    args.model = (document.getElementById('modellist') as HTMLSelectElement).value.toString();
    if (args.model.includes('HMM')) document.getElementById('dataSource')?.classList.remove('hidden');
    else document.getElementById('dataSource')?.classList.add('hidden');
  });

  document.getElementById('environmentlist')?.addEventListener('change', () => {
    args.environment = (document.getElementById('environmentlist') as HTMLSelectElement).value.toString();
  });

  document.getElementById('generateBeatMapButton')?.addEventListener('click', () => {
    resetTaskLog();
    args.version = parseInt((document.getElementById('datalist') as HTMLSelectElement).value, 10);
    args.lightsIntensity = parseInt((document.getElementById('lightsIntensityInput') as HTMLInputElement).value, 10);
    args.zipFiles = document.getElementById('zipFilesLabel')?.classList.contains('checked') ? 1 : 0;
    ipcRenderer.send('__generateBeatMap__', currentOperationType, selectedDirs, args);
  });

  document.getElementById('cancelButton')?.addEventListener('click', () => {
    resetTaskLog();
    ipcRenderer.send('__cancelOperation__');
  });

  ipcRenderer.send('__ready__');
});

ipcRenderer.on('console-log', (_event, message: string) => console.log(message));

ipcRenderer.on('console-error', (_event, message: string) => console.error(message));

ipcRenderer.on('task-progress', (_event, value: number, maxValue: number) => {
  if (value === 0) {
    document.getElementById('taskProgressBar')!.innerHTML = `0%`;
    document.getElementById('taskProgressBar')!.setAttribute('style', `width: 0%;`);
  } else if (value === -1) {
    document.getElementById('taskProgressBar')!.innerHTML = `100%`;
    document.getElementById('taskProgressBar')!.setAttribute('style', `width: 100%;`);
  } else if (value / maxValue <= 0.1) {
    document.getElementById('taskProgressBar')!.innerHTML = `${((value / maxValue) * 100).toFixed(0)}%`;
    document.getElementById('taskProgressBar')!.setAttribute('style', `width: 10%;`);
  } else {
    document.getElementById('taskProgressBar')!.innerHTML = `${((value / maxValue) * 100).toFixed(0)}%`;
    document.getElementById('taskProgressBar')!.setAttribute('style', `width: ${(value / maxValue) * 100}%;`);
  }
});

ipcRenderer.on('task-log-append-message', (_event, message: string, group: string = 'MAIN') => {
  const id = `taskLog_${group}`;
  let element = document.getElementById(id);
  if (!element) {
    element = document.createElement('pre');
    element.classList.add('prettyprint');
    element.classList.add('mvl');
    element.id = id;
    element.appendChild(document.createTextNode(message + '\n'));
    document.getElementById('taskLogDiv')?.appendChild(element);
  } else {
    element.appendChild(document.createTextNode(message + '\n'));
  }
});

ipcRenderer.on('selectFilesDirs-finished', (_event, param: string[]) => {
  selectedDirs.length = 0;
  for (let value of param) {
    // Append filename to varaible
    selectedDirs.push(value);
    // Create the list item and set its contents
    let item = document.createElement('li');
    item.appendChild(document.createTextNode(value));
    // Add it to the list:
    document.getElementById('dirsfilesList')?.appendChild(item);
  }
});

ipcRenderer.on('selectOutDirectory-finished', (_event, param: string) => {
  // Append filename to varaible
  args.outDir = param;
  // Create the list item and set its contents
  let item = document.createElement('li').appendChild(document.createTextNode(param));
  // Add it to the list:
  document.getElementById('outputDirList')?.appendChild(item);
});
