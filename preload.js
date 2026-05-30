const { contextBridge, ipcRenderer } = require('electron');

// expose API ปลอดภัยให้ renderer ใช้งาน
contextBridge.exposeInMainWorld('electronAPI', {
  // บันทึกไฟล์ผ่าน native dialog
  saveFile: (filename, buffer) =>
    ipcRenderer.invoke('save-file', { filename, buffer }),

  // เปิด folder ใน Explorer/Finder
  showFile: (filePath) =>
    ipcRenderer.invoke('show-file', { filePath }),

  // บอก renderer ว่าอยู่ใน Electron
  isElectron: true,
  platform: process.platform,
});
