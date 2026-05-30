document.getElementById('btn-open').addEventListener('click', function(){
  chrome.tabs.create({ url: chrome.runtime.getURL('editor.html') });
  window.close();
});
