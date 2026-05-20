const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const os = require('node:os');

let configPath = null;
let mainWindow = null;

function findConfigPath() {
  const exeDir = path.dirname(process.execPath);
  const candidates = [
    path.join(process.cwd(), 'config.json'),
    path.join(exeDir, 'config.json'),
    path.join(exeDir, '..', 'config.json'),
    path.resolve(__dirname, '..', 'config.json'),
    path.resolve(__dirname, '..', '..', 'config.json'),
  ];
  for (const c of candidates) {
    try { if (fs.existsSync(c) && fs.statSync(c).isFile()) return c; } catch {}
  }
  return null;
}

async function pickConfigPath() {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Locate claude-rpc config.json',
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (result.canceled || !result.filePaths.length) return null;
  return result.filePaths[0];
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 920,
    height: 780,
    backgroundColor: '#0a0a0a',
    title: 'Claude RPC',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(() => {
  configPath = findConfigPath();
  createWindow();
});

ipcMain.handle('load-config', async () => {
  if (!configPath) configPath = await pickConfigPath();
  if (!configPath) return { error: 'No config path selected' };
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return { configPath, config };
  } catch (e) {
    return { error: `Failed to read ${configPath}: ${e.message}` };
  }
});

ipcMain.handle('pick-config', async () => {
  const picked = await pickConfigPath();
  if (picked) configPath = picked;
  return { configPath };
});

ipcMain.handle('save-config', async (_, newConfig) => {
  if (!configPath) return { error: 'No config path' };
  try {
    fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 2));
    return { ok: true };
  } catch (e) {
    return { error: e.message };
  }
});

ipcMain.handle('daemon-status', async () => {
  const pidPath = path.join(os.tmpdir(), 'claude-rpc', 'daemon.pid');
  try {
    if (!fs.existsSync(pidPath)) return { running: false };
    const pid = Number(fs.readFileSync(pidPath, 'utf8'));
    if (!pid) return { running: false };
    process.kill(pid, 0);
    return { running: true, pid };
  } catch { return { running: false }; }
});

ipcMain.handle('daemon-restart', async () => {
  if (!configPath) return { ok: false, output: 'No config path' };
  const root = path.dirname(configPath);
  const cliPath = path.join(root, 'src', 'cli.js');
  if (!fs.existsSync(cliPath)) return { ok: false, output: `CLI not found at ${cliPath}` };
  return await new Promise((resolve) => {
    const child = spawn(process.platform === 'win32' ? 'node.exe' : 'node', [cliPath, 'restart'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: root,
      windowsHide: true,
    });
    let out = '';
    child.stdout.on('data', (d) => out += d.toString());
    child.stderr.on('data', (d) => out += d.toString());
    child.on('error', (e) => resolve({ ok: false, output: e.message }));
    child.on('close', (code) => resolve({ ok: code === 0, output: out }));
  });
});

app.on('window-all-closed', () => app.quit());
