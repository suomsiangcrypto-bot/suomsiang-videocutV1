var electron = require('electron');
var app = electron.app;
var BrowserWindow = electron.BrowserWindow;
var ipcMain = electron.ipcMain;
var dialog = electron.dialog;
var shell = electron.shell;
var path = require('path');
var fs = require('fs');
var http = require('http');
var os = require('os');

var gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) { app.quit(); }

var mainWindow = null;
var localServer = null;

function getFFmpegPath() {
  try {
    var installer = require('@ffmpeg-installer/ffmpeg');
    var p = installer.path;
    if (app.isPackaged) {
      p = p.split('app.asar').join('app.asar.unpacked');
    }
    return p;
  } catch(e) {
    return null;
  }
}

function startServer() {
  return new Promise(function(resolve) {
    var mime = {
      '.html': 'text/html',
      '.js': 'application/javascript',
      '.wasm': 'application/wasm',
      '.png': 'image/png',
      '.json': 'application/json'
    };
    localServer = http.createServer(function(req, res) {
      res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
      res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
      res.setHeader('Access-Control-Allow-Origin', '*');
      var url = req.url === '/' ? '/editor.html' : req.url;
      var filePath = path.join(__dirname, url);
      if (filePath.indexOf(__dirname) !== 0) {
        res.writeHead(403); res.end(); return;
      }
      fs.readFile(filePath, function(err, data) {
        if (err) { res.writeHead(404); res.end('Not found'); return; }
        var ext = path.extname(filePath).toLowerCase();
        res.setHeader('Content-Type', mime[ext] || 'application/octet-stream');
        res.writeHead(200);
        res.end(data);
      });
    });
    localServer.listen(0, '127.0.0.1', function() {
      resolve(localServer.address().port);
    });
  });
}

function createWindow() {
  startServer().then(function(port) {
    mainWindow = new BrowserWindow({
      width: 1440, height: 900,
      minWidth: 900, minHeight: 600,
      title: 'suomsiang-videocut',
      icon: path.join(__dirname, 'icons', 'icon256.png'),
      backgroundColor: '#111111',
      autoHideMenuBar: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        webSecurity: false,
        preload: path.join(__dirname, 'preload.js')
      }
    });
    mainWindow.loadURL('http://127.0.0.1:' + port + '/editor.html');
    mainWindow.on('closed', function() { mainWindow = null; });
  });
}

function runFFmpeg(ffmpegPath, args) {
  return new Promise(function(resolve, reject) {
    var execFile = require('child_process').execFile;
    execFile(ffmpegPath, args, function(err, stdout, stderr) {
      if (err) { reject(new Error(stderr || err.message)); }
      else { resolve(); }
    });
  });
}

ipcMain.handle('save-file', function(event, data) {
  return dialog.showSaveDialog(mainWindow, {
    defaultPath: data.filename,
    filters: [
      { name: 'MP4 Video', extensions: ['mp4'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  }).then(function(result) {
    if (result.canceled || !result.filePath) return { ok: false };
    try {
      fs.writeFileSync(result.filePath, Buffer.from(data.buffer));
      return { ok: true, filePath: result.filePath };
    } catch(e) {
      return { ok: false, error: e.message };
    }
  });
});

ipcMain.handle('show-file', function(event, data) {
  shell.showItemInFolder(data.filePath);
});

ipcMain.handle('choose-export-path', function(event, data) {
  return dialog.showSaveDialog(mainWindow, {
    defaultPath: data.filename,
    filters: [{ name: 'MP4 Video', extensions: ['mp4'] }]
  }).then(function(result) {
    if (result.canceled || !result.filePath) return { ok: false };
    return { ok: true, filePath: result.filePath };
  });
});

ipcMain.handle('native-export', function(event, data) {
  var jobs = data.jobs;
  var outputPath = data.outputPath;
  var fps = data.fps || 30;
  var crf = data.crf || 23;
  var audioJob = data.audioJob;
  var overlayData = data.overlayData;

  var ffmpegPath = getFFmpegPath();
  if (!ffmpegPath) return Promise.resolve({ ok: false, error: 'ไม่พบ ffmpeg binary' });

  var tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'suom-'));

  function sendProgress(pct, msg) {
    try { event.sender.send('export-progress', { pct: pct, msg: msg || '' }); } catch(e) {}
  }

  // encode ทีละ segment แบบ sequential
  var segPaths = [];
  var i = 0;
  // คำนวณความยาวรวมทั้งหมด (สำหรับ waveform overlay duration)
  var totalDur = 0;
  for (var dj = 0; dj < jobs.length; dj++) { totalDur += (jobs[dj].dur || 0); }

  // ตรวจว่าไฟล์ video มี audio track ไหม
  function hasAudioStream(filePath) {
    return new Promise(function(resolve) {
      var execFile = require('child_process').execFile;
      var ffprobePath = ffmpegPath.replace('ffmpeg', 'ffprobe');
      execFile(ffprobePath, ['-v','error','-select_streams','a','-show_entries','stream=codec_type','-of','csv=p=0', filePath], function(err, stdout) {
        if (err) { resolve(false); return; }
        resolve((stdout||'').indexOf('audio') !== -1);
      });
    });
  }

  function encodeNext() {
    if (i >= jobs.length) return Promise.resolve();
    var job = jobs[i];
    var segPath = path.join(tmpDir, 'seg' + i + '.mp4');
    var inputPath = path.join(tmpDir, 'inp' + i + job.ext);
    fs.writeFileSync(inputPath, Buffer.from(job.data));
    sendProgress(Math.round(i / jobs.length * 60), 'encode ' + (i+1) + '/' + jobs.length);

    var vf = job.vf || ('scale=' + job.tw + ':' + job.th + ':force_original_aspect_ratio=decrease,pad=' + job.tw + ':' + job.th + ':(ow-iw)/2:(oh-ih)/2:black,setsar=1');

    // ตรวจ audio ก่อน (เฉพาะ video ที่ไม่ muted)
    var checkAudio = (job.isImage || job.muted) ? Promise.resolve(false) : hasAudioStream(inputPath);

    return checkAudio.then(function(videoHasAudio) {
      // ใช้เสียงต้นฉบับเฉพาะเมื่อ: ไม่ใช่ image, ไม่ muted, และ video มี audio จริง
      var useOrigAudio = (!job.isImage && !job.muted && videoHasAudio);
      var args = [];

      // INPUT 0 = video/image
      if (job.isImage) {
        args.push('-loop', '1', '-i', inputPath, '-t', String(job.dur));
      } else {
        if (job.tIn > 0.05) args.push('-ss', String(job.tIn));
        args.push('-i', inputPath, '-t', String(job.dur));
      }

      // INPUT 1 = silent audio (fallback) ใส่เสมอเมื่อไม่ใช้เสียงต้นฉบับ
      if (!useOrigAudio) {
        args.push('-f', 'lavfi', '-t', String(job.dur), '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100');
      }

      args.push('-vf', vf, '-r', '30');
      args.push('-c:v', 'libx264', '-crf', String(crf), '-preset', 'fast', '-pix_fmt', 'yuv420p');
      args.push('-c:a', 'aac', '-b:a', '128k', '-ar', '44100');

      // mapping
      args.push('-map', '0:v:0');
      if (useOrigAudio) {
        args.push('-map', '0:a:0');
      } else {
        args.push('-map', '1:a:0');
      }
      args.push('-shortest', '-y', segPath);

      return runFFmpeg(ffmpegPath, args);
    }).then(function() {
      segPaths.push(segPath);
      try { fs.unlinkSync(inputPath); } catch(e) {}
      i++;
      return encodeNext();
    });
  }

  return encodeNext().then(function() {
    sendProgress(65, 'รวมคลิป...');
    var concatLines = [];
    for (var j = 0; j < segPaths.length; j++) {
      concatLines.push("file '" + segPaths[j].split('\\').join('/') + "'");
    }
    var concatTxt = concatLines.join('\n');
    var concatFile = path.join(tmpDir, 'concat.txt');
    fs.writeFileSync(concatFile, concatTxt);
    var concatOut = path.join(tmpDir, 'concat.mp4');
    // re-encode แทน copy เพื่อกันจอมืด/ภาพเสียเมื่อ segment มี property ต่างกัน
    return runFFmpeg(ffmpegPath, [
      '-f','concat','-safe','0','-i',concatFile,
      '-c:v','libx264','-crf',String(crf),'-preset','fast','-pix_fmt','yuv420p',
      '-c:a','aac','-b:a','128k','-y',concatOut
    ]).then(function() { return concatOut; });

  }).then(function(currentFile) {
    if (!audioJob || !audioJob.data) return currentFile;
    sendProgress(75, 'ใส่เพลง...');
    var audioPath = path.join(tmpDir, 'audio' + audioJob.ext);
    fs.writeFileSync(audioPath, Buffer.from(audioJob.data));
    var mixOut = path.join(tmpDir, 'mixed.mp4');
    var delayMs = Math.round((audioJob.startSec || 0) * 1000);
    var filterStr = '[1:a]adelay=' + delayMs + '|' + delayMs + '[ad];[0:a][ad]amix=inputs=2:duration=first[aout]';
    return runFFmpeg(ffmpegPath, [
      '-i', currentFile,
      '-ss', String(audioJob.tIn || 0), '-i', audioPath,
      '-filter_complex', filterStr,
      '-map', '0:v', '-map', '[aout]',
      '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-y', mixOut
    ]).then(function() { return mixOut; });

  }).then(function(currentFile) {
    if (!overlayData || !overlayData.frames || overlayData.frames.length === 0) return currentFile;
    sendProgress(88, 'วาง waveform + โลโก้...');

    // เขียน PNG sequence ลง temp
    var ovFps = overlayData.fps || 12;
    var frameDir = path.join(tmpDir, 'ovframes');
    fs.mkdirSync(frameDir);
    for (var fidx = 0; fidx < overlayData.frames.length; fidx++) {
      var fb64 = overlayData.frames[fidx].split(',')[1];
      var fnum = String(fidx);
      while (fnum.length < 5) fnum = '0' + fnum;
      fs.writeFileSync(path.join(frameDir, 'f' + fnum + '.png'), Buffer.from(fb64, 'base64'));
    }

    // encode PNG sequence → overlay video
    var ovVideo = path.join(tmpDir, 'overlay.mp4');
    var framePattern = path.join(frameDir, 'f%05d.png');

    return runFFmpeg(ffmpegPath, [
      '-framerate', String(ovFps),
      '-i', framePattern,
      '-c:v', 'libx264', '-preset', 'fast', '-pix_fmt', 'yuv420p',
      '-r', '30',
      '-y', ovVideo
    ]).then(function() {
      // overlay video (animated) ทับ main video ด้วย colorkey
      var waveOut = path.join(tmpDir, 'waved.mp4');
      return runFFmpeg(ffmpegPath, [
        '-i', currentFile,
        '-i', ovVideo,
        '-filter_complex', '[1:v]colorkey=0x000000:0.15:0.1[wk];[0:v][wk]overlay=0:0[vout]',
        '-map', '[vout]', '-map', '0:a?',
        '-c:v', 'libx264', '-crf', String(crf), '-preset', 'fast', '-pix_fmt', 'yuv420p',
        '-c:a', 'copy',
        '-t', String(totalDur),
        '-y', waveOut
      ]).then(function() { return waveOut; });
    });

  }).then(function(currentFile) {
    sendProgress(96, 'บันทึก...');
    fs.copyFileSync(currentFile, outputPath);
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch(e) {}
    return { ok: true, filePath: outputPath };

  }).catch(function(e) {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch(_) {}
    return { ok: false, error: e.message };
  });
});

app.whenReady().then(createWindow);
app.on('window-all-closed', function() {
  if (localServer) localServer.close();
  if (process.platform !== 'darwin') app.quit();
});
app.on('activate', function() {
  if (mainWindow === null) createWindow();
});
app.on('second-instance', function() {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});
