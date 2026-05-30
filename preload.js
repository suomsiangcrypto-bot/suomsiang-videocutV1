const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  platform: process.platform,
  saveFile: function(filename, buffer) {
    return ipcRenderer.invoke('save-file', { filename: filename, buffer: buffer });
  },
  showFile: function(filePath) {
    return ipcRenderer.invoke('show-file', { filePath: filePath });
  },
  chooseExportPath: function(filename) {
    return ipcRenderer.invoke('choose-export-path', { filename: filename });
  },
  nativeExport: function(jobs, outputPath, fps, crf, audioJob, overlayData) {
    return ipcRenderer.invoke('native-export', {
      jobs: jobs,
      outputPath: outputPath,
      fps: fps,
      crf: crf,
      audioJob: audioJob,
      overlayData: overlayData
    });
  },
  onExportProgress: function(callback) {
    ipcRenderer.on('export-progress', function(event, data) { callback(data); });
  },
  removeExportProgress: function() {
    ipcRenderer.removeAllListeners('export-progress');
  }
});
