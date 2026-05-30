// สุ่มเสียง VIDEOCUT v4
chrome.action.onClicked.addListener(function() {
  chrome.tabs.create({ url: chrome.runtime.getURL('editor.html') });
});
