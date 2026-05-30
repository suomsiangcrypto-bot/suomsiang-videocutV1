const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');

// ป้องกัน multiple instances
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) { app.quit(); }

let mainWindow;
let localServer;
let serverPort = 0;

// สร้าง local HTTP server พร้อม COOP/COEP headers
// จำเป็นสำหรับ SharedArrayBuffer ที่ FFmpeg WASM ต้องการ
function startLocalServer() {
  return new Promise((resolve) => {
    const mimeTypes = {
      '.html': 'text/html',
      '.js':   'application/javascript',
      '.wasm': 'application/wasm',
      '.png':  'image/png',
      '.ico':  'image/x-icon',
      '.json': 'application/json',
    };

    localServer = http.createServer((req, res) => {
      // COOP/COEP headers — เปิด SharedArrayBuffer
      res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
      res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
      res.setHeader('Access-Control-Allow-Origin', '*');

      let filePath = path.join(__dirname, req.url === '/' ? 'editor.html' : req.url);
      // ป้องกัน path traversal
      if (!filePath.startsWith(__dirname)) {
        res.writeHead(403); res.end(); return;
      }

      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.writeHead(404); res.end('Not found'); return;
        }
        const ext = path.extname(filePath).toLowerCase();
        res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
        res.writeHead(200);
        res.end(data);
      });
    });

    localServer.listen(0, '127.0.0.1', () => {
      serverPort = localServer.address().port;
      console.log('[Server] listening on port', serverPort);
      resolve(serverPort);
    });
  });
}

async function createWindow() {
  const port = await startLocalServer();

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'สุ่มเสียง VIDEOCUT',
    icon: path.join(__dirname, 'icons', 'icon256.png'),
    backgroundColor: '#111111',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
      preload: path.join(__dirname, 'preload.js'),
    },
    autoHideMenuBar: true,
  });

  // โหลดผ่าน localhost แทน file://
  mainWindow.loadURL(`http://127.0.0.1:${port}/editor.html`);

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ── IPC: Save File ──
ipcMain.handle('save-file', async (event, { filename, buffer }) => {
  const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
    defaultPath: filename,
    filters: [
      { name: 'MP4 Video', extensions: ['mp4'] },
      { name: 'WebM Video', extensions: ['webm'] },
      { name: 'MP3 Audio', extensions: ['mp3'] },
      { name: 'All Files', extensions: ['*'] },
    ]
  });
  if (canceled || !filePath) return { ok: false };
  try {
    fs.writeFileSync(filePath, Buffer.from(buffer));
    return { ok: true, filePath };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('show-file', async (event, { filePath }) => {
  shell.showItemInFolder(filePath);
});

// ── App Events ──
app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (localServer) localServer.close();
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) createWindow();
});

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

// ══════════════════════════════════════════════
// NATIVE FFMPEG EXPORT — เร็วกว่า WASM 10-50 เท่า
// ══════════════════════════════════════════════
const os = require('os');

// หา ffmpeg binary path
function getFFmpegPath() {
  try {
    const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
    let p = ffmpegInstaller.path;
    // แก้ path สำหรับ packaged app (asar.unpacked)
    if (app.isPackaged) {
      p = p.replace('app.asar' + require('path').sep, 'app.asar.unpacked' + require('path').sep);
    }
    return p;
  } catch(e) {
    return null;
  }
}

// IPC: Native export — รับ job list จาก renderer แล้วรัน ffmpeg จริง
ipcMain.handle('native-export', async (event, { jobs, outputPath, fps, crf, audioJob, waveDataUrl }) => {
  const ffmpegPath = getFFmpegPath();
  if (!ffmpegPath) return { ok: false, error: 'ไม่พบ ffmpeg binary' };

  const { execFile } = require('child_process');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'suomsiang-'));

  const runFFmpeg = (args) => new Promise((resolve, reject) => {
    execFile(ffmpegPath, args, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message));
      else resolve();
    });
  });

  try {
    const segPaths = [];

    // ── 1. encode แต่ละ clip ──
    for (let i = 0; i < jobs.length; i++) {
      const job = jobs[i];
      const segPath = path.join(tmpDir, `seg_${i}.mp4`);
      const inputPath = path.join(tmpDir, `input_${i}${job.ext}`);
      fs.writeFileSync(inputPath, Buffer.from(job.data));

      event.sender.send('export-progress', {
        step: i, total: jobs.length, pct: Math.round(i/jobs.length*60)
      });

      const args = [];
      if (job.isImage) {
        args.push('-loop', '1', '-i', inputPath, '-t', String(job.dur));
      } else {
        if (job.tIn > 0.05) args.push('-ss', String(job.tIn));
        args.push('-i', inputPath, '-t', String(job.dur));
      }
      const vf = job.vf || `scale=${job.tw}:${job.th}:force_original_aspect_ratio=decrease,pad=${job.tw}:${job.th}:(ow-iw)/2:(oh-ih)/2:black,setsar=1`;
      args.push('-vf', vf, '-c:v', 'libx264', '-crf', String(crf||23), '-preset', 'fast', '-pix_fmt', 'yuv420p');
      if (job.isImage) { args.push('-an'); } else { args.push('-c:a', 'aac', '-b:a', '128k'); }
      args.push('-y', segPath);

      await runFFmpeg(args);
      segPaths.push(segPath);
      fs.unlinkSync(inputPath);
    }

    // ── 2. concat ──
    event.sender.send('export-progress', { pct: 65, msg: 'รวมคลิป...' });
    const concatList = segPaths.map(p => "file '" + p.split('\\').join('/') + "'").join('\n');
    const concatFile = path.join(tmpDir, 'concat.txt');
    fs.writeFileSync(concatFile, concatList);
    const concatOut = path.join(tmpDir, 'concat.mp4');
    await runFFmpeg(['-f','concat','-safe','0','-i',concatFile,'-c','copy','-y',concatOut]);

    let currentFile = concatOut;

    // ── 3. Mix audio (bgAudio track) ──
    if (audioJob && audioJob.data) {
      event.sender.send('export-progress', { pct: 75, msg: 'ใส่เพลง...' });
      const audioPath = path.join(tmpDir, `audio${audioJob.ext}`);
      fs.writeFileSync(audioPath, Buffer.from(audioJob.data));
      const mixOut = path.join(tmpDir, 'mixed.mp4');

      // ตัด audio ตาม tIn และ offset ตาม startSec
      const aArgs = [
        '-i', currentFile,
        '-ss', String(audioJob.tIn || 0),
        '-i', audioPath,
        '-filter_complex',
        `[1:a]adelay=${Math.round((audioJob.startSec||0)*1000)}|${Math.round((audioJob.startSec||0)*1000)}[adelayed];[0:a][adelayed]amix=inputs=2:duration=first[aout]`,
        '-map', '0:v', '-map', '[aout]',
        '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k',
        '-shortest', '-y', mixOut
      ];
      await runFFmpeg(aArgs);
      currentFile = mixOut;
    }

    // ── 4. Overlay waveform PNG ──
    if (waveDataUrl) {
      event.sender.send('export-progress', { pct: 88, msg: 'วาง waveform...' });
      // แปลง dataURL เป็น buffer
      const b64 = waveDataUrl.split(',')[1];
      const wavePng = path.join(tmpDir, 'wave.png');
      fs.writeFileSync(wavePng, Buffer.from(b64, 'base64'));
      const waveOut = path.join(tmpDir, 'waved.mp4');
      await runFFmpeg([
        '-i', currentFile,
        '-i', wavePng,
        '-filter_complex', '[1:v]colorkey=0x000000:0.15:0.1[wfkey];[0:v][wfkey]overlay=0:0:shortest=1[vout]',
        '-map', '[vout]', '-map', '0:a?',
        '-c:v', 'libx264', '-crf', String(crf||23), '-preset', 'fast', '-pix_fmt', 'yuv420p',
        '-c:a', 'copy', '-y', waveOut
      ]);
      currentFile = waveOut;
    }

    event.sender.send('export-progress', { pct: 96, msg: 'บันทึกไฟล์...' });
    fs.copyFileSync(currentFile, outputPath);
    fs.rmSync(tmpDir, { recursive: true, force: true });

    return { ok: true, filePath: outputPath };

  } catch(e) {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch(_) {}
    return { ok: false, error: e.message };
  }
});

// IPC: เลือก output path ก่อน export
ipcMain.handle('choose-export-path', async (event, { filename }) => {
  const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
    defaultPath: filename,
    filters: [{ name: 'MP4 Video', extensions: ['mp4'] }]
  });
  if (canceled || !filePath) return { ok: false };
  return { ok: true, filePath };
});
