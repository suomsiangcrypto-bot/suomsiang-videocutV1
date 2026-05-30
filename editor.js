// ═══════════════════════════════════════
// STATE
// ═══════════════════════════════════════
var S={
  files:[],clips:{},nid:1,
  activeId:null,ar:'16:9',
  vol:1,spd:1,mute:false,
  trimIn:0,trimOut:0,trimOutSet:false,trimVisible:false,
  zoom:100,pxSec:10,
  expRes:'1280x720',
  cropActive:false,cropAR:'free',
  cropX:0,cropY:0,cropW:0,cropH:0,
};
var vid=document.getElementById('prev-vid');
var ffmpeg=null;

// ─── BACKGROUND AUDIO PLAYER ───
// เล่น audio track ซิงค์กับ vid
var bgAudio = new Audio();
bgAudio.preload = 'auto';
var bgAudioCid = null; // cid ของ audio clip ที่โหลดอยู่

function getBgAudioClip(overrideGT){
  // หา audio clip ที่ควรเล่นตาม globalTime
  var ps = pxSec();
  var globalTime = (overrideGT !== undefined) ? overrideGT : ((window.playQueueOffset||0) + (vid.currentTime||0));
  var keys = Object.keys(S.clips);
  for(var i=0;i<keys.length;i++){
    var c = S.clips[keys[i]];
    if(c.type !== 'audio') continue;
    var startSec = (c.startSec !== undefined) ? c.startSec : (c.left/ps);
    var endSec   = startSec + c.dur;
    if(globalTime >= startSec - 0.1 && globalTime < endSec){
      return {c:c, cid:keys[i], startSec:startSec};
    }
  }
  return null;
}

// _vidTransitioning: flag กันเสียงสะดุดตอนโหลด vid.src ใหม่
var _vidTransitioning = false;

function syncBgAudio(overrideGT){
  // ถ้า vid กำลังเปลี่ยน src อยู่ — ใช้ globalTime จาก override เท่านั้น ไม่อ่าน vid.currentTime
  var ps = pxSec();
  var globalTime;
  if(overrideGT !== undefined){
    globalTime = overrideGT;
  } else if(_vidTransitioning){
    // vid กำลัง load — ใช้ _waveGlobalTime ซึ่งอัปเดตต่อเนื่องจาก RAF
    globalTime = window._waveGlobalTime !== undefined ? window._waveGlobalTime : (window.playQueueOffset||0);
  } else {
    globalTime = (window.playQueueOffset||0) + (vid.currentTime||0);
  }
  var found = getBgAudioClip(overrideGT !== undefined ? overrideGT : globalTime);

  if(!found){
    if(!bgAudio.paused){ bgAudio.pause(); }
    bgAudioCid = null;
    return;
  }

  var c = found.c;
  var entry = S.files && S.files.find(function(f){ return f.id === c.fid; });
  if(!entry){ return; }

  // โหลด audio ใหม่เมื่อเปลี่ยน clip
  if(bgAudioCid !== found.cid){
    bgAudio.src = entry.url;
    bgAudioCid = found.cid;
    var lt0 = Math.max(0, Math.min(entry.dur-0.05, globalTime - found.startSec));
    bgAudio.currentTime = lt0;
    // ให้ Web Audio Analyser เชื่อม bgAudio ใหม่ทุกครั้งที่ src เปลี่ยน
    if(typeof ensureWaveConnections === 'function') ensureWaveConnections();
  }

  var localTime = globalTime - found.startSec;
  localTime = Math.max(0, Math.min(entry.dur - 0.05, localTime));

  // re-seek เฉพาะเมื่อ drift เกิน 1.5 วินาที และ bgAudio ไม่ได้กำลังโหลด
  if(!bgAudio.seeking && Math.abs(bgAudio.currentTime - localTime) > 1.5){
    bgAudio.currentTime = localTime;
  }

  bgAudio.volume = S.vol !== undefined ? S.vol : 1;

  if(isPlaying && bgAudio.paused && !_vidTransitioning){
    var pb = bgAudio.play();
    if(pb) pb.catch(function(){});
  } else if(!isPlaying && !bgAudio.paused){
    bgAudio.pause();
  }
}

// ═══════════════════════════════════════
// ICON BAR
// ═══════════════════════════════════════
document.querySelectorAll('.ib').forEach(function(b){
  b.addEventListener('click',function(){
    var p=b.dataset.p;
    if(p==='exp-modal'){openExp();return;}
    document.querySelectorAll('.ib').forEach(function(x){x.classList.remove('on');});
    b.classList.add('on');
    ['p-media','p-cut','p-text','p-fx','p-sticker'].forEach(function(id){
      var _el=document.getElementById(id);
      if(_el) _el.style.display=(id==='p-'+p)?'flex':'none';
    });
  });
});

// ═══════════════════════════════════════
// LEFT PANEL SUB-PANELS
// ═══════════════════════════════════════
var tools=['crop','trim','speed','vol'];
tools.forEach(function(t){
  var row=document.getElementById('t-'+t);
  var sub=document.getElementById('s-'+t);
  var close=document.getElementById('sc-'+t);
  if(!row||!sub) return;
  row.addEventListener('click',function(){
    tools.forEach(function(x){var s=document.getElementById('s-'+x);if(s)s.style.display='none';});
    sub.style.display='block';
  });
  if(close) close.addEventListener('click',function(){sub.style.display='none';});
});

// Crop AR in left panel
document.querySelectorAll('.ar-card').forEach(function(c){
  c.addEventListener('click',function(){
    document.querySelectorAll('.ar-card').forEach(function(x){x.classList.remove('on');});
    c.classList.add('on');
    S.cropAR=c.dataset.ar;
    if(S.cropActive) applyCropAR(c.dataset.ar);
  });
});
document.getElementById('btn-apply-crop').addEventListener('click',function(){
  if(!document.getElementById('prev-wrap').style.display||document.getElementById('prev-wrap').style.display==='none'){
    showToast('⚠️ นำเข้าวิดีโอก่อน');return;
  }
  S.cropActive=!S.cropActive;
  document.getElementById('crop-ov').classList.toggle('active',S.cropActive);
  if(S.cropActive){
    initCropBox();
    showToast('🔲 ลากกรอบเพื่อครอบตัด');
    this.textContent='✅ ปิดการครอบตัด';
  } else {
    this.textContent='✅ ใช้การครอบตัดนี้';
    showToast('✂ บันทึกการครอบตัดแล้ว');
    // reset vid style
    vid.style.position='';
    vid.style.left=''; vid.style.top='';
    vid.style.width=''; vid.style.height='';
    applyARToPreview();
  }
});

// Trim sliders left
document.getElementById('sl-in').addEventListener('input',function(){
  S.trimIn=Math.min(parseFloat(this.value),S.trimOut-0.3);
  this.value=S.trimIn;
  document.getElementById('in-v').textContent=S.trimIn.toFixed(1)+'s';
  syncTrimRP();updateTrimMarkers();
  vid.currentTime=S.trimIn;
});
document.getElementById('sl-out').addEventListener('input',function(){
  S.trimOut=Math.max(parseFloat(this.value),S.trimIn+0.3);
  S.trimOutSet=true;
  this.value=S.trimOut;
  document.getElementById('out-v').textContent=S.trimOut.toFixed(1)+'s';
  syncTrimRP();updateTrimMarkers();
  vid.currentTime=S.trimOut;
});
document.getElementById('btn-set-in').addEventListener('click',function(){
  S.trimIn=vid.currentTime;
  setTrimUI();updateTrimMarkers();
  showToast('⬅ IN='+S.trimIn.toFixed(1)+'s');
});
document.getElementById('btn-set-out').addEventListener('click',function(){
  S.trimOut=vid.currentTime; S.trimOutSet=true;
  setTrimUI();updateTrimMarkers();
  showToast('➡ OUT='+S.trimOut.toFixed(1)+'s');
});
document.getElementById('btn-clear-trim').addEventListener('click',function(){
  S.trimIn=0;S.trimOut=vid.duration||0; S.trimOutSet=false;
  setTrimUI();updateTrimMarkers();
  showToast('🔄 รีเซ็ต Trim แล้ว');
});

// Speed
document.getElementById('sl-spd').addEventListener('input',function(){
  S.spd=parseInt(this.value)/100;vid.playbackRate=S.spd;
  document.getElementById('spd-v').textContent=S.spd.toFixed(2)+'×';
  document.getElementById('rp-spd').value=this.value;
  document.getElementById('rp-spd-v').textContent=S.spd.toFixed(2)+'×';
});
document.querySelectorAll('[data-spd]').forEach(function(b){
  b.addEventListener('click',function(){
    var v=parseInt(b.dataset.spd);
    document.getElementById('sl-spd').value=v;
    S.spd=v/100;vid.playbackRate=S.spd;
    document.getElementById('spd-v').textContent=S.spd.toFixed(2)+'×';
    showToast('⚡ ความเร็ว '+S.spd.toFixed(2)+'×');
  });
});
// Vol
document.getElementById('sl-vol').addEventListener('input',function(){
  S.vol=parseInt(this.value)/100;
  vid.volume=Math.min(1,S.vol);
  if(typeof bgAudio!=='undefined') bgAudio.volume=Math.min(1,S.vol);
  document.getElementById('vol-v').textContent=this.value+'%';
  document.getElementById('rp-vol').value=this.value;
  document.getElementById('rp-vol-v').textContent=this.value+'%';
  // sync pb-vol slider
  var pbv=document.getElementById('pb-vol');
  if(pbv) pbv.value=Math.min(1,S.vol);
});
document.getElementById('cb-mute').addEventListener('change',function(){
  S.mute=this.checked;
  vid.muted=S.mute;
  if(typeof bgAudio!=='undefined') bgAudio.muted=S.mute;
});

// ═══════════════════════════════════════
// RIGHT PANEL
// ═══════════════════════════════════════
// AR
document.querySelectorAll('.ar-opt').forEach(function(el){
  el.addEventListener('click',function(){
    document.querySelectorAll('.ar-opt').forEach(function(o){o.classList.remove('on');});
    el.classList.add('on');
    S.ar=el.dataset.ar;
    applyARToPreview();
    showToast('📐 '+S.ar+' – '+el.dataset.lbl);
  });
});
// Res
document.querySelectorAll('.res-btn').forEach(function(b){
  b.addEventListener('click',function(){
    document.querySelectorAll('.res-btn').forEach(function(x){x.classList.remove('on');});
    b.classList.add('on');S.expRes=b.dataset.res;
    showToast('📐 '+b.textContent);
  });
});
// Trim RP
document.getElementById('rp-in').addEventListener('input',function(){
  S.trimIn=Math.min(parseFloat(this.value),S.trimOut-0.3);
  this.value=S.trimIn;
  document.getElementById('rp-in-v').textContent=S.trimIn.toFixed(1)+'s';
  syncTrimLeft();updateTrimMarkers();vid.currentTime=S.trimIn;
});
document.getElementById('rp-out').addEventListener('input',function(){
  S.trimOut=Math.max(parseFloat(this.value),S.trimIn+0.3);
  S.trimOutSet=true;
  this.value=S.trimOut;
  document.getElementById('rp-out-v').textContent=S.trimOut.toFixed(1)+'s';
  syncTrimLeft();updateTrimMarkers();vid.currentTime=S.trimOut;
});
document.getElementById('rp-set-in').addEventListener('click',function(){
  S.trimIn=vid.currentTime;setTrimUI();updateTrimMarkers();showToast('⬅ IN='+S.trimIn.toFixed(1)+'s');
});
document.getElementById('rp-set-out').addEventListener('click',function(){
  S.trimOut=vid.currentTime; S.trimOutSet=true;
  setTrimUI();updateTrimMarkers();showToast('➡ OUT='+S.trimOut.toFixed(1)+'s');
});
document.getElementById('rp-vol').addEventListener('input',function(){
  S.vol=parseInt(this.value)/100;
  vid.volume=Math.min(1,S.vol);
  if(typeof bgAudio!=='undefined') bgAudio.volume=Math.min(1,S.vol);
  document.getElementById('rp-vol-v').textContent=this.value+'%';
  var slv=document.getElementById('sl-vol');
  if(slv) slv.value=this.value;
  document.getElementById('vol-v').textContent=this.value+'%';
  var pbv=document.getElementById('pb-vol');
  if(pbv) pbv.value=Math.min(1,S.vol);
});
document.getElementById('rp-spd').addEventListener('input',function(){
  S.spd=parseInt(this.value)/100;vid.playbackRate=S.spd;document.getElementById('rp-spd-v').textContent=S.spd.toFixed(2)+'×';
});
document.getElementById('rp-mute').addEventListener('change',function(){S.mute=this.checked;});

function syncTrimRP(){
  document.getElementById('rp-in').value=S.trimIn;
  document.getElementById('rp-out').value=S.trimOut;
  document.getElementById('rp-in-v').textContent=S.trimIn.toFixed(1)+'s';
  document.getElementById('rp-out-v').textContent=S.trimOut.toFixed(1)+'s';
}
function syncTrimLeft(){
  document.getElementById('sl-in').value=S.trimIn;
  document.getElementById('sl-out').value=S.trimOut;
  document.getElementById('in-v').textContent=S.trimIn.toFixed(1)+'s';
  document.getElementById('out-v').textContent=S.trimOut.toFixed(1)+'s';
}
function setTrimUI(){
  syncTrimLeft();syncTrimRP();
}

// ═══════════════════════════════════════
// AR → PREVIEW
// ═══════════════════════════════════════
var AR_R={'16:9':16/9,'9:16':9/16,'1:1':1,'4:3':4/3,'4:5':4/5,'21:9':21/9};
// applyARToPreview — resize preview ตาม AR ปกติ
function applyARToPreview(){
  var r = AR_R[S.ar]||16/9;
  var a = document.getElementById('prev-area');
  var aW = a.offsetWidth - 20, aH = a.offsetHeight - 20;
  var w, h;
  if(aW/aH > r){ h = aH; w = h * r; } else { w = aW; h = w / r; }
  w = Math.floor(w); h = Math.floor(h);
  var wr = document.getElementById('prev-wrap');
  wr.style.width  = w + 'px'; wr.style.height = h + 'px';
  vid.style.width  = w + 'px'; vid.style.height = h + 'px';
}
window.addEventListener('resize', applyARToPreview);
// CROP BOX (draggable + handles)
// ═══════════════════════════════════════
function initCropBox(){
  var wr=document.getElementById('prev-wrap');
  var w=wr.offsetWidth,h=wr.offsetHeight;
  var pad=20;
  S.cropX=pad;S.cropY=pad;S.cropW=w-pad*2;S.cropH=h-pad*2;
  updateCropBox();
  if(S.cropAR!=='free') applyCropAR(S.cropAR);
}
function updateCropBox(){
  var box=document.getElementById('crop-box');
  box.style.left=S.cropX+'px';box.style.top=S.cropY+'px';
  box.style.width=S.cropW+'px';box.style.height=S.cropH+'px';
}
function applyCropAR(ar){
  var wr=document.getElementById('prev-wrap');
  var vw=wr.offsetWidth,vh=wr.offsetHeight;
  var r=AR_R[ar];
  if(!r) return;
  var w,h;
  if(vw/vh>r){h=vh;w=h*r;}else{w=vw;h=w/r;}
  S.cropX=Math.floor((vw-w)/2);S.cropY=Math.floor((vh-h)/2);
  S.cropW=Math.floor(w);S.cropH=Math.floor(h);
  updateCropBox();
}
// Drag crop box
(function(){
  var box=document.getElementById('crop-box');
  // Move
  box.addEventListener('mousedown',function(e){
    if(e.target.classList.contains('ch')) return;
    var sx=e.clientX,sy=e.clientY,ox=S.cropX,oy=S.cropY;
    var mm=function(e2){
      var wr=document.getElementById('prev-wrap');
      S.cropX=Math.max(0,Math.min(wr.offsetWidth-S.cropW,ox+e2.clientX-sx));
      S.cropY=Math.max(0,Math.min(wr.offsetHeight-S.cropH,oy+e2.clientY-sy));
      updateCropBox();
    };
    var mu=function(){document.removeEventListener('mousemove',mm);document.removeEventListener('mouseup',mu);};
    document.addEventListener('mousemove',mm);document.addEventListener('mouseup',mu);
    e.stopPropagation();
  });
  // Handles
  var handles=[
    {cls:'tl',dx:-1,dy:-1,dw:1,dh:1},
    {cls:'tc',dx:0,dy:-1,dw:0,dh:1},
    {cls:'tr',dx:0,dy:-1,dw:1,dh:1},
    {cls:'ml',dx:-1,dy:0,dw:1,dh:0},
    {cls:'mr',dx:0,dy:0,dw:1,dh:0},
    {cls:'bl',dx:-1,dy:0,dw:1,dh:-1},
    {cls:'bc',dx:0,dy:0,dw:0,dh:1},  // fixed: bc should grow down
    {cls:'br',dx:0,dy:0,dw:1,dh:1},
  ];
  // simpler resize via mousedown on each handle
  box.querySelectorAll('.ch').forEach(function(h){
    h.addEventListener('mousedown',function(e){
      e.stopPropagation();
      var sx=e.clientX,sy=e.clientY;
      var ox=S.cropX,oy=S.cropY,ow=S.cropW,oh=S.cropH;
      var cls=h.className.split(' ')[1];
      var mm=function(e2){
        var dx=e2.clientX-sx,dy=e2.clientY-sy;
        var wr=document.getElementById('prev-wrap');
        var vw=wr.offsetWidth,vh=wr.offsetHeight;
        if(cls==='tl'){S.cropX=Math.max(0,ox+dx);S.cropY=Math.max(0,oy+dy);S.cropW=Math.max(40,ow-dx);S.cropH=Math.max(30,oh-dy);}
        else if(cls==='tc'){S.cropY=Math.max(0,oy+dy);S.cropH=Math.max(30,oh-dy);}
        else if(cls==='tr'){S.cropY=Math.max(0,oy+dy);S.cropW=Math.max(40,ow+dx);S.cropH=Math.max(30,oh-dy);}
        else if(cls==='ml'){S.cropX=Math.max(0,ox+dx);S.cropW=Math.max(40,ow-dx);}
        else if(cls==='mr'){S.cropW=Math.max(40,ow+dx);}
        else if(cls==='bl'){S.cropX=Math.max(0,ox+dx);S.cropW=Math.max(40,ow-dx);S.cropH=Math.max(30,oh+dy);}
        else if(cls==='bc'){S.cropH=Math.max(30,oh+dy);}
        else if(cls==='br'){S.cropW=Math.max(40,ow+dx);S.cropH=Math.max(30,oh+dy);}
        updateCropBox();
      };
      var mu=function(){document.removeEventListener('mousemove',mm);document.removeEventListener('mouseup',mu);};
      document.addEventListener('mousemove',mm);document.addEventListener('mouseup',mu);
    });
  });
})();

// ═══════════════════════════════════════
// FILE INPUT
// ═══════════════════════════════════════
var dz=document.getElementById('dz');
var fi=document.getElementById('fi');
dz.addEventListener('click',function(){fi.click();});
dz.addEventListener('dragover',function(e){e.preventDefault();dz.classList.add('ov');});
dz.addEventListener('dragleave',function(){dz.classList.remove('ov');});
dz.addEventListener('drop',function(e){
  e.preventDefault();dz.classList.remove('ov');
  addFiles(Array.from(e.dataTransfer.files).filter(function(f){return f.type.startsWith('video/')||f.type.startsWith('audio/')||f.type.startsWith('image/');}));
});
fi.addEventListener('change',function(){addFiles(Array.from(this.files));this.value='';});

function addFiles(files){
  if(!files.length) return;
  var done=0;
  files.forEach(function(f){
    var isAudio=f.type.startsWith('audio/');
    var isImage=f.type.startsWith('image/');
    var url=URL.createObjectURL(f);

    if(isImage){
      var imgEl=new Image();
      imgEl.onload=function(){
        var e={id:'f'+(S.nid++),file:f,url:url,dur:5,name:f.name,type:'image'};
        S.files.push(e);
        var _naf=S.files.filter(function(x){return x.type!=='audio';});
        addClipTL(e); // ต้องสร้าง clip ก่อน เพื่อให้ loadImagePreview เช็ก range ได้
        if(_naf.length===1) loadImagePreview(e);
        done++;
        if(done===files.length){renderML();showToast('✅ นำเข้า '+files.length+' ไฟล์');drawRuler();}
      };
      imgEl.onerror=function(){done++;showToast('❌ โหลดไม่ได้: '+f.name);};
      imgEl.src=url;
      return;
    }

    var tmp=isAudio ? new Audio(url) : document.createElement('video');
    if(!isAudio){tmp.src=url;}
    tmp.preload='metadata';
    tmp.onloadedmetadata=function(){
      var e={id:'f'+(S.nid++),file:f,url:url,dur:tmp.duration,name:f.name,type:isAudio?'audio':'video'};
      S.files.push(e);
      if(!isAudio && S.files.filter(function(x){return x.type!=='audio';}).length===1) loadPreview(e);
      if(isAudio) addAudioClipTL(e);
      else addClipTL(e);
      done++;
      if(done===files.length){renderML();showToast('✅ นำเข้า '+files.length+' ไฟล์');drawRuler();}
    };
    tmp.onerror=function(){done++;showToast('❌ โหลดไม่ได้: '+f.name);};
    if(isAudio) tmp.load();
  });
}

// เพิ่มคลิปเสียงในแทร็ก audio
function addAudioClipTL(entry){
  var track=document.getElementById('tr-a');
  var maxRight=0;
  track.querySelectorAll('.clip').forEach(function(c){
    var r=parseFloat(c.style.left||0)+parseFloat(c.style.width||0);
    if(r>maxRight) maxRight=r;
  });
  var cid='c'+(S.nid++);
  var ps=pxSec();
  var w=entry.dur*ps;
  S.clips[cid]={id:cid,fid:entry.id,dur:entry.dur,w:w,left:maxRight,type:'audio'};
  buildClip(cid,track,entry);
  drawRuler();
}

// อัปเดต dropzone ของ fi ให้รับทั้งวิดีโอและเสียง
document.getElementById('fi').accept='video/*,audio/*,image/*';

// ═══════════════════════════════════════
// MEDIA LIST
// ═══════════════════════════════════════

// ── MEDIA TAB: วิดีโอ / เสียง ──
(function(){
  var tabs = document.querySelectorAll('.lp-tab');
  if(!tabs.length) return;
  tabs.forEach(function(tab, idx){
    tab.addEventListener('click', function(){
      tabs.forEach(function(t){ t.classList.remove('on'); });
      tab.classList.add('on');
      // filter ml-items
      var items = document.querySelectorAll('.ml-item');
      items.forEach(function(item){
        var fid = item.dataset.fid;
        var entry = S.files.find(function(f){ return f.id===fid; });
        if(!entry){ item.style.display=''; return; }
        if(idx===0){
          // วิดีโอ tab
          item.style.display = (entry.type==='audio') ? 'none' : '';
        } else {
          // เสียง tab
          item.style.display = (entry.type==='audio') ? '' : 'none';
        }
      });
    });
  });
})();
function renderML(){
  var ml=document.getElementById('ml');
  ml.innerHTML='';
  document.getElementById('ml-cnt').textContent=S.files.length;
  S.files.forEach(function(e){
    var d=document.createElement('div');
    d.className='ml-item'+(S.activeId&&S.clips[S.activeId]&&S.clips[S.activeId].fid===e.id?' active':'');
    d.dataset.fid=e.id;
    // draggable=true สำหรับลากไปวางในไทม์ไลน์
    d.draggable=true;
    d.dataset.fid=e.id;
    d.innerHTML=
      '<div class="ml-thumb" title="ลากมาวางในไทม์ไลน์ได้">'+(e.type==='image'?'<img src="'+e.url+'" style="width:100%;height:100%;object-fit:cover;"/>':(e.type==='audio'?'<div style="font-size:22px;line-height:32px;text-align:center;">🎵</div>':'<video src="'+e.url+'" muted preload="metadata" style="width:100%;height:100%;object-fit:cover;"></video>'))+'</div>'+
      '<div class="ml-info"><div class="ml-name">'+e.name+'</div><div class="ml-dur">'+fmt(e.dur)+'</div></div>'+
      '<div class="ml-acts">'+
        '<button class="ml-act" data-a="add" title="เพิ่มในไทม์ไลน์">+</button>'+
        '<button class="ml-act del" data-a="del" title="ลบ">✕</button>'+
      '</div>';

    // คลิกเพื่อ preview
    d.addEventListener('click',function(ev){
      if(ev.target.dataset.a) return;
      document.querySelectorAll('.ml-item').forEach(function(x){x.classList.remove('active');});
      d.classList.add('active'); if(e.type==='image') loadImagePreview(e); else loadPreview(e);
    });
    // ปุ่ม + และ ✕
    d.addEventListener('click',function(ev){
      if(ev.target.dataset.a==='add'){ addClipTL(e); showToast('➕ เพิ่ม '+e.name+' ในไทม์ไลน์'); }
      if(ev.target.dataset.a==='del') removeFile(e.id);
    });

    // ลากเพื่อสลับลำดับใน media list
    d.addEventListener('dragstart',function(ev){
      ev.dataTransfer.setData('fid',e.id);
      ev.dataTransfer.setData('type','media-reorder');
      d.style.opacity='0.5';
    });
    d.addEventListener('dragend',function(){ d.style.opacity=''; });
    d.addEventListener('dragover',function(ev){ ev.preventDefault(); d.style.outline='1px solid var(--acc)'; });
    d.addEventListener('dragleave',function(){ d.style.outline=''; });
    d.addEventListener('drop',function(ev){
      ev.preventDefault(); d.style.outline='';
      var fid=ev.dataTransfer.getData('fid');
      var type=ev.dataTransfer.getData('type');
      if(type!=='media-reorder'||fid===e.id) return;
      var fi2=S.files.findIndex(function(x){return x.id===fid;});
      var ti=S.files.findIndex(function(x){return x.id===e.id;});
      var tmp=S.files.splice(fi2,1)[0]; S.files.splice(ti,0,tmp); renderML();
    });
    ml.appendChild(d);
  });
}

// ═══════════════════════════════════════
// DROP FROM MEDIA LIST → TIMELINE TRACKS
// ═══════════════════════════════════════
function setupTrackDrop(trackEl){
  trackEl.addEventListener('dragover',function(e){
    e.preventDefault();
    trackEl.classList.add('drag-over');
  });
  trackEl.addEventListener('dragleave',function(){
    trackEl.classList.remove('drag-over');
  });
  trackEl.addEventListener('drop',function(e){
    e.preventDefault();
    trackEl.classList.remove('drag-over');
    var fid=e.dataTransfer.getData('fid');
    if(!fid) return;
    var entry=S.files.find(function(f){return f.id===fid;});
    if(!entry) return;
    var r=trackEl.getBoundingClientRect();
    var sc=document.getElementById('tl-scroll');
    var xInTrack=Math.max(0, e.clientX-r.left+sc.scrollLeft);
    var ps=pxSec();
    var cid='c'+(S.nid++);
    var w=entry.dur*ps;
    var startSec=xInTrack/ps;
    S.clips[cid]={id:cid,fid:entry.id,dur:entry.dur,w:w,left:xInTrack,startSec:startSec,type:entry.type||'video'};
    buildClip(cid,trackEl,entry);
    drawRuler();
    showToast('🎬 วาง '+entry.name);
    if(entry.type==='image') loadImagePreview(entry);
    else if(entry.type!=='audio') loadPreview(entry);
  });
}
function removeFile(fid){
  S.files=S.files.filter(function(f){return f.id!==fid;});
  Object.keys(S.clips).forEach(function(cid){
    if(S.clips[cid]&&S.clips[cid].fid===fid){
      var el=document.querySelector('[data-cid="'+cid+'"]');
      if(el) el.remove();
      delete S.clips[cid];
    }
  });
  renderML();drawRuler();
  if(!S.files.length){
    document.getElementById('prev-wrap').style.display='none';
    document.getElementById('prev-empty').style.display='block';
  } else {
    var _f0=S.files[0];
    if(_f0.type==='image') loadImagePreview(_f0);
    else loadPreview(_f0);
  }
  showToast('🗑 ลบแล้ว');
}

// ═══════════════════════════════════════
// PREVIEW LOAD
// ═══════════════════════════════════════
function loadPreview(e){
  vid.src=e.url;
  vid.onloadedmetadata=function(){
    var d=vid.duration; // actual duration from video
    document.getElementById('prev-empty').style.display='none';
    document.getElementById('prev-wrap').style.display='flex';
    document.getElementById('proj-name').textContent=e.name.replace(/\.[^.]+$/,'');
    S.trimIn=0;
    S.trimOut=d;   // always use real duration, never hardcoded
    initTrimSliders(d);
    applyARToPreview();
    showTrimMarkers();
    // Show real duration in playbar
    document.getElementById('pb-tc').textContent=fmt(0)+' / '+fmt(d);
  };
}
function loadImagePreview(e){
  // อัปเดตชื่อโปรเจกต์และ duration เสมอ
  document.getElementById('proj-name').textContent=e.name.replace(/\.[^.]+$/,'');
  document.getElementById('pb-tc').textContent=fmt(0)+' / '+fmt(e.dur||5);

  // เช็กว่าเข็มแดงอยู่ในช่วง clip ของภาพนี้ไหม
  // ถ้าไม่อยู่ → แสดงแค่ prev-wrap จอดำ ไม่แสดงภาพ
  var ps = pxSec();
  var ph = document.getElementById('tl-ph');
  var gt = ph ? (parseFloat(ph.style.left)||0) / ps : 0;

  // หา clip ของ entry นี้
  var inFrame = false;
  Object.keys(S.clips).forEach(function(cid){
    var c = S.clips[cid];
    if(c.fid !== e.id) return;
    var clipStart = (c.startSec !== undefined) ? c.startSec : (c.left/ps);
    var clipEnd   = clipStart + (c.w/ps);
    if(gt >= clipStart && gt < clipEnd) inFrame = true;
  });

  document.getElementById('prev-empty').style.display='none';
  document.getElementById('prev-wrap').style.display='flex';
  var vidEl=document.getElementById('prev-vid');
  if(vidEl) vidEl.style.display='none';

  var wr=document.getElementById('prev-wrap');
  var io=document.getElementById('prev-img-overlay');
  if(!io){
    io=document.createElement('img');
    io.id='prev-img-overlay';
    io.style.cssText='position:absolute;inset:0;width:100%;height:100%;object-fit:contain;z-index:1;pointer-events:all;cursor:pointer;';
    wr.appendChild(io);
    // คลิก img → เปิด/ปิด PIF เหมือน video
    io.addEventListener('click', function(e){
      e.stopPropagation();
      if(typeof window._pifIsOn === 'function'){
        if(window._pifIsOn()){ window._hidePIF && window._hidePIF(); }
        else { window._openPIF && window._openPIF(); }
      }
    });
    io.addEventListener('dblclick', function(e){
      e.stopPropagation();
      window._resetPIF && window._resetPIF();
    });
  } else {
    // restore pointer-events ถ้าเคยถูก disable
    io.style.pointerEvents = 'all';
    io.style.cursor = 'pointer';
  }
  if(inFrame){
    io.src=e.url; io.style.display='block';
  } else {
    io.style.display='none';
  }
  applyARToPreview();
}

function initTrimSliders(d){
  // d = actual video duration in seconds — set as max so slider reaches full length
  ['sl-in','sl-out','rp-in','rp-out'].forEach(function(id){
    var el=document.getElementById(id);
    el.min=0; el.max=d; el.step=0.1;
  });
  document.getElementById('sl-in').value=0;
  document.getElementById('sl-out').value=d;
  document.getElementById('rp-in').value=0;
  document.getElementById('rp-out').value=d;
  document.getElementById('in-v').textContent='0.0s';
  document.getElementById('out-v').textContent=d.toFixed(1)+'s';
  document.getElementById('rp-in-v').textContent='0.0s';
  document.getElementById('rp-out-v').textContent=d.toFixed(1)+'s';
}

// ═══════════════════════════════════════
// TRIM MARKERS (draggable IN/OUT lines)
// ═══════════════════════════════════════
var trimVisible=false;
// IN/OUT toggle (button ถูกเอาออกแล้ว แต่เก็บ logic ไว้ใช้ผ่าน right panel)
var _trimToggleBtn = document.getElementById('tl-trim-toggle');
if(_trimToggleBtn) _trimToggleBtn.addEventListener('click',function(){
  trimVisible=!trimVisible;
  showTrimMarkers();
  this.classList.toggle('on',trimVisible);
  showToast(trimVisible?'🔴 แสดง IN/OUT markers — ลากเส้นได้':'🔴 ซ่อน IN/OUT markers');
});
function showTrimMarkers(){
  var disp=trimVisible?'block':'none';
  document.getElementById('tl-trim-in').style.display=disp;
  document.getElementById('tl-trim-out').style.display=disp;
  document.getElementById('tl-trim-zone').style.display=disp;
  if(trimVisible) updateTrimMarkers();
}
function updateTrimMarkers(){
  if(!vid.duration) return;
  var ps=pxSec();
  var xi=S.trimIn*ps, xo=S.trimOut*ps;
  document.getElementById('tl-trim-in').style.left=xi+'px';
  document.getElementById('tl-trim-out').style.left=xo+'px';
  document.getElementById('tl-trim-zone').style.left=xi+'px';
  document.getElementById('tl-trim-zone').style.width=(xo-xi)+'px';
}
// Drag trim markers — ใช้ pointer capture เพื่อให้ลากนอก element ได้
(function(){
  function dragMarker(el, cb){
    el.style.pointerEvents = 'all';
    el.style.touchAction = 'none';
    el.addEventListener('mousedown', function(e){
      e.preventDefault();
      e.stopPropagation();
      el.style.cursor = 'grabbing';
      var sc = document.getElementById('tl-scroll');
      function onMove(e2){
        var r = sc.getBoundingClientRect();
        var x = Math.max(0, e2.clientX - r.left + sc.scrollLeft);
        var t = x / pxSec();
        cb(Math.max(0, Math.min(vid.duration||999, t)));
      }
      function onUp(){
        el.style.cursor = 'ew-resize';
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }
  dragMarker(document.getElementById('tl-trim-in'), function(t){
    S.trimIn = Math.min(t, S.trimOut - 0.3);
    setTrimUI(); updateTrimMarkers(); vid.currentTime = S.trimIn;
    document.getElementById('ep-stat').textContent = '';
    showToast('🔴 IN → ' + S.trimIn.toFixed(2) + 's');
  });
  dragMarker(document.getElementById('tl-trim-out'), function(t){
    S.trimOut = Math.max(t, S.trimIn + 0.3);
    S.trimOutSet = true;
    setTrimUI(); updateTrimMarkers(); vid.currentTime = S.trimOut;
    showToast('🟠 OUT → ' + S.trimOut.toFixed(2) + 's');
  });
})();

// ═══════════════════════════════════════
// TIMELINE CLIPS
// ═══════════════════════════════════════
function pxSec(){return S.pxSec*S.zoom/100;}

function addClipTL(entry){
  var track=document.getElementById('tr-v1');
  // หาตำแหน่งสิ้นสุดของคลิปสุดท้ายใน video track เท่านั้น (ไม่นับ audio)
  var maxSec=0;
  var trackClipIds = new Set(Array.from(track.querySelectorAll('.clip')).map(function(el){ return el.dataset.cid; }));
  Object.keys(S.clips).forEach(function(cid){
    var c=S.clips[cid];
    if(!trackClipIds.has(cid) && c.type === 'audio') return; // ข้าม audio clip
    if(c.type === 'audio') return; // ข้าม audio ที่ไม่ได้อยู่ใน tr-v1
    var sec=(c.startSec!==undefined)?c.startSec:(c.left/pxSec());
    var end=sec+(c.w/pxSec());
    if(end>maxSec) maxSec=end;
  });
  var cid='c'+(S.nid++);
  var ps=pxSec();
  var w=entry.dur*ps;
  S.clips[cid]={id:cid,fid:entry.id,dur:entry.dur,w:w,left:maxSec*ps,startSec:maxSec,type:entry.type||'video'};
  buildClip(cid,track,entry);
  drawRuler();
  scheduleSnapUpdate();
}
function buildClip(cid, track, entry){
  var c = S.clips[cid];
  var isAudio = entry.type === 'audio';
  var isImage = entry.type === 'image';
  var el = document.createElement('div');
  el.className = 'clip ' + (isAudio ? 'ac' : 'vc');
  el.dataset.cid = cid;
  el.style.left  = c.left + 'px';
  el.style.width = c.w   + 'px';

  // สร้าง innerHTML
  var inner =
    '<div class="clip-frames" id="cf-'+cid+'"></div>'+
    '<div class="clip-name">'+entry.name+'</div>'+
    '<div class="clip-dur">'+fmt(entry.dur)+'</div>';

  if(isAudio){
    var bars='<div class="clip-wave">';
    for(var b=0;b<40;b++){
      var h=Math.max(2,Math.floor(Math.random()*9)+1);
      bars+='<div style="width:2px;height:'+h+'px;background:#4ade80;border-radius:1px;flex-shrink:0;"></div>';
    }
    bars+='</div>';
    inner += bars;
  } else if(!isImage){
    // Mute button เฉพาะวิดีโอ ไม่ใช่ภาพนิ่ง
    inner += '<div class="clip-mute" title="ปิด/เปิดเสียงต้นฉบับ">🔊</div>';
  }

  inner += '<div class="clip-hdl l"></div><div class="clip-hdl r"></div>';
  el.innerHTML = inner;

  // Mute toggle เฉพาะวิดีโอ (ไม่ใช่ audio หรือ image)
  if(!isAudio && !isImage){
    var muteBtn = el.querySelector('.clip-mute');
    c.muted = false;
    muteBtn.addEventListener('click', function(e){
      e.stopPropagation();
      c.muted = !c.muted;
      muteBtn.classList.toggle('muted', c.muted);
      muteBtn.textContent = c.muted ? '🔇' : '🔊';
      muteBtn.title = c.muted ? 'คลิกเพื่อเปิดเสียง' : 'คลิกเพื่อปิดเสียง';
      // ถ้าคลิปนี้กำลังเล่นอยู่ → ปิด/เปิดเสียง vid ทันที
      if(S.activeId === cid || (playQueueClips[playIdx]&&playQueueClips[playIdx].c&&playQueueClips[playIdx].c.id === cid)){
        vid.muted = c.muted;
      }
      showToast(c.muted ? '🔇 ปิดเสียงต้นฉบับ' : '🔊 เปิดเสียงต้นฉบับ');
    });
  }

  // Thumbnail frames
  if(!isAudio && entry.type==='image'){
    var fr = el.querySelector('.clip-frames');
    var nf = Math.max(1, Math.floor(c.w/50));
    for(var ii=0;ii<nf;ii++){
      var fd=document.createElement('div');
      fd.className='clip-frm'; fd.style.width='50px';
      fd.style.backgroundImage='url('+entry.url+')';
      fd.style.backgroundSize='cover'; fd.style.backgroundPosition='center';
      fr.appendChild(fd);
    }
  } else if(!isAudio){
    var fr = el.querySelector('.clip-frames');
    var nf = Math.max(1, Math.floor(c.w/50));
    var tv = document.createElement('video');
    tv.src=entry.url; tv.muted=true; tv.preload='metadata';
    tv.onloadedmetadata=function(){
      var drawn=0;
      for(var i=0;i<nf;i++){
        (function(idx){
          var cv=document.createElement('canvas'); cv.width=50; cv.height=36;
          var cx2=cv.getContext('2d');
          var t=(entry.dur/nf)*(idx+0.5);
          tv.currentTime=t;
          tv.onseeked=function(){
            cx2.drawImage(tv,0,0,50,36);
            var fd=document.createElement('div');
            fd.className='clip-frm'; fd.style.width='50px';
            fd.style.backgroundImage='url('+cv.toDataURL()+')';
            fr.appendChild(fd);
            drawn++; if(drawn===nf) tv.src='';
          };
        })(i);
      }
    };
  }

  // Hide audio-drop-hint when clip added
  var hint = track.querySelector('.audio-drop-hint');
  if(hint) hint.style.display='none';

  // Select clip → preview
  el.addEventListener('click', function(e){
    if(e.target.classList.contains('clip-hdl')) return;
    if(e.target.classList.contains('clip-mute')) return;
    document.querySelectorAll('.clip').forEach(function(x){x.classList.remove('sel');});
    el.classList.add('sel'); S.activeId = cid;
    if(!isAudio){
      if(entry.type==='image') loadImagePreview(entry);
      else loadPreview(entry);
    }
  });

  // Apply mute state when this clip plays
  el.addEventListener('click', function(){
    if(S.activeId===cid && !isAudio) vid.muted = c.muted||false;
  });

  // Drag move
  el.addEventListener('mousedown', function(e){
    if(e.target.classList.contains('clip-hdl')) return;
    if(e.target.classList.contains('clip-mute')) return;
    var sx=e.clientX, sl=parseFloat(el.style.left);
    saveUndo();
    var mm=function(e2){
      c.left=Math.max(0,sl+e2.clientX-sx);
      c.startSec=c.left/pxSec(); // sync startSec
      el.style.left=c.left+'px';
      snapUpdateNow(); // อัปเดต marker ทันที ไม่ delay
    };
    var mu=function(){
      document.removeEventListener('mousemove',mm);
      document.removeEventListener('mouseup',mu);
      c.startSec=c.left/pxSec();
      snapUpdateNow();
    };
    document.addEventListener('mousemove',mm); document.addEventListener('mouseup',mu);
  });

  // Trim handles
  (function(){
    var initLeft = c.left;
    var initW    = c.w;
    var initTIn  = c.tIn || 0;
    el.querySelector('.clip-hdl.l').addEventListener('mousedown', function(e){
      e.stopPropagation(); e.preventDefault();
      saveUndo();
      var startX = e.clientX;
      function onMove(e2){
        var ps = pxSec();
        var totalDrag = e2.clientX - startX;
        var nr = initLeft + initW; // ขอบขวาคงที่เสมอ
        var nl = Math.max(0, Math.min(nr - 28, initLeft + totalDrag));
        var nw = Math.max(28, nr - nl);
        var newTIn = Math.max(0, Math.min((entry.dur||999)-0.1, initTIn + (nl-initLeft)/ps));
        // อัปเดต S.clips โดยตรง
        S.clips[cid].tIn = newTIn;
        S.clips[cid].w   = nw;
        S.clips[cid].left = nl;
        S.clips[cid].startSec = nl/ps;
        S.clips[cid].dur = nw/ps;
        // อัปเดต c reference ด้วย (กัน stale)
        c.tIn = newTIn; c.w = nw; c.left = nl;
        c.startSec = nl/ps; c.dur = nw/ps;
        el.style.left = nl+'px'; el.style.width = nw+'px';
      }
      function onUp(){
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        // อัปเดต initials สำหรับ drag ครั้งต่อไป
        initLeft = c.left; initW = c.w; initTIn = c.tIn||0;
        snapUpdateNow();
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  })();
  mkHdl(el.querySelector('.clip-hdl.r'), function(dx){
    c.w=Math.max(28,c.w+dx); el.style.width=c.w+'px';
  });

  // Right-click context menu บน clip
  el.addEventListener('contextmenu', function(e){
    e.preventDefault();
    e.stopPropagation();
    showClipContextMenu(e.clientX, e.clientY, cid, entry, track, el, isAudio);
  });

  track.appendChild(el);
}

function showClipContextMenu(x, y, cid, entry, track, el, isAudio){
  // ลบ menu เก่า
  var old = document.getElementById('clip-ctx-menu');
  if(old) old.remove();

  var menu = document.createElement('div');
  menu.id = 'clip-ctx-menu';
  menu.style.cssText = [
    'position:fixed','left:'+x+'px','top:'+y+'px',
    'background:#1a1a1a','border:1px solid #444',
    'border-radius:8px','padding:4px 0',
    'z-index:9999','min-width:160px',
    'box-shadow:0 4px 20px rgba(0,0,0,.6)',
    'font-size:13px','color:#fff',
  ].join(';');

  function menuItem(ico, label, fn){
    var item = document.createElement('div');
    item.style.cssText = 'padding:8px 14px;cursor:pointer;display:flex;gap:8px;align-items:center;';
    item.innerHTML = '<span>'+ico+'</span><span>'+label+'</span>';
    item.addEventListener('mouseenter', function(){ item.style.background='rgba(245,197,24,.15)'; });
    item.addEventListener('mouseleave', function(){ item.style.background=''; });
    item.addEventListener('mousedown', function(e){ e.stopPropagation(); fn(); menu.remove(); });
    return item;
  }

  // Duplicate
  menu.appendChild(menuItem('📋', 'สร้างซ้ำ (Duplicate)', function(){
    var c = S.clips[cid];
    var newCid = 'c'+(S.nid++);
    var newC = Object.assign({}, c, {
      id: newCid,
      left: c.left + c.w + 4,
      startSec: (c.startSec !== undefined ? c.startSec : c.left/pxSec()) + c.dur + (4/pxSec()),
    });
    S.clips[newCid] = newC;
    buildClip(newCid, track, entry);
    scheduleSnapUpdate();
    showToast('📋 สร้างซ้ำแล้ว');
  }));

  // Split at playhead
  menu.appendChild(menuItem('✂️', 'ตัด ณ ตำแหน่งนี้', function(){
    document.getElementById('tl-spl').click();
  }));

  // Rename
  menu.appendChild(menuItem('✏️', 'เปลี่ยนชื่อ', function(){
    var newName = prompt('ชื่อใหม่:', entry.name);
    if(newName){ entry.name = newName; }
  }));

  // Separator
  var sep = document.createElement('div');
  sep.style.cssText = 'height:1px;background:#333;margin:4px 0;';
  menu.appendChild(sep);

  // Delete
  menu.appendChild(menuItem('🗑', 'ลบออก', function(){
    el.remove();
    delete S.clips[cid];
    scheduleSnapUpdate();
    showToast('🗑 ลบคลิปแล้ว');
  }));

  document.body.appendChild(menu);

  // ปิด menu เมื่อคลิกที่อื่น
  setTimeout(function(){
    document.addEventListener('mousedown', function close(e){
      if(!menu.contains(e.target)) { menu.remove(); document.removeEventListener('mousedown', close); }
    });
  }, 10);
}

function mkHdl(h, fn){
  h.addEventListener('mousedown', function(e){
    e.stopPropagation(); e.preventDefault();
    var sx = e.clientX;
    saveUndo(); // บันทึก state ก่อนลาก
    var mm = function(e2){ fn(e2.clientX - sx); sx = e2.clientX; snapUpdateNow(); };
    var mu = function(){
      document.removeEventListener('mousemove', mm);
      document.removeEventListener('mouseup', mu);
      scheduleSnapUpdate();
    };
    document.addEventListener('mousemove', mm);
    document.addEventListener('mouseup', mu);
  });
}

// ═══════════════════════════════════════
// UNDO / REDO — Ctrl+Z / Ctrl+Shift+Z
// ═══════════════════════════════════════
var undoStack = [];
var redoStack = [];

function getState(){
  // snapshot S.clips (position + size)
  var snap = {};
  Object.keys(S.clips).forEach(function(cid){
    var c = S.clips[cid];
    snap[cid] = { left: c.left, w: c.w, dur: c.dur, fid: c.fid, type: c.type, muted: c.muted };
  });
  return JSON.stringify(snap);
}

function saveUndo(){
  var st = getState();
  if(undoStack.length && undoStack[undoStack.length-1] === st) return; // ไม่บันทึกซ้ำ
  undoStack.push(st);
  if(undoStack.length > 50) undoStack.shift(); // จำกัด 50 ขั้น
  redoStack = []; // เคลียร์ redo เมื่อมี action ใหม่
}

function applyState(st){
  var snap = JSON.parse(st);
  // ลบ DOM clips ทั้งหมดก่อน
  document.querySelectorAll('.clip').forEach(function(el){ el.remove(); });
  S.clips = {};
  Object.keys(snap).forEach(function(cid){
    var s = snap[cid];
    var entry = S.files.find(function(f){ return f.id === s.fid; });
    if(!entry) return;
    S.clips[cid] = { id:cid, fid:s.fid, dur:s.dur, w:s.w, left:s.left, type:s.type||'video', muted:s.muted||false };
    var track = (s.type==='audio') ? document.getElementById('tr-a') : document.getElementById('tr-v1');
    buildClip(cid, track, entry);
  });
  drawRuler(); scheduleSnapUpdate();
}

function doUndo(){
  if(!undoStack.length){ showToast('↩ ไม่มีอะไรให้ย้อนกลับ'); return; }
  redoStack.push(getState());
  var prev = undoStack.pop();
  applyState(prev);
  showToast('↩ ย้อนกลับแล้ว (เหลือ '+undoStack.length+' ขั้น)');
}
function doRedo(){
  if(!redoStack.length){ showToast('↪ ไม่มีอะไรให้ทำซ้ำ'); return; }
  undoStack.push(getState());
  var next = redoStack.pop();
  applyState(next);
  showToast('↪ ทำซ้ำแล้ว');
}

document.getElementById('btn-undo').addEventListener('click', doUndo);
document.getElementById('btn-redo').addEventListener('click', doRedo);

// ═══════════════════════════════════════
// KEYBOARD SHORTCUTS
// ═══════════════════════════════════════
document.addEventListener('keydown', function(e){
  var tag = document.activeElement.tagName;
  if(tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT') return;
  var ctrl = e.ctrlKey || e.metaKey;

  // Space — เล่น/หยุด
  if(e.code==='Space'){ e.preventDefault(); togglePlay(); return; }

  // ← → — เดินเฟรม
  if(e.code==='ArrowLeft'){ e.preventDefault(); vid.currentTime=Math.max(0,vid.currentTime-1/30); return; }
  if(e.code==='ArrowRight'){ e.preventDefault(); vid.currentTime=Math.min(vid.duration||0,vid.currentTime+1/30); return; }

  // Ctrl+Z — Undo
  if(ctrl && !e.shiftKey && e.code==='KeyZ'){ e.preventDefault(); doUndo(); return; }

  // Ctrl+Shift+Z หรือ Ctrl+Y — Redo
  if((ctrl && e.shiftKey && e.code==='KeyZ') || (ctrl && e.code==='KeyY')){ e.preventDefault(); doRedo(); return; }

  // Delete / Backspace — ลบคลิปที่เลือก
  if(e.code==='Delete'||e.code==='Backspace'){
    if(S.activeId){
      e.preventDefault();
      saveUndo();
      var el=document.querySelector('[data-cid="'+S.activeId+'"]');
      if(el) el.remove();
      delete S.clips[S.activeId]; S.activeId=null;
      drawRuler(); scheduleSnapUpdate();
      showToast('🗑 ลบคลิปแล้ว (Ctrl+Z เพื่อยกเลิก)');
    }
    return;
  }

  // S — Split ที่ playhead
  if(e.code==='KeyS' && !ctrl){
    e.preventDefault();
    document.getElementById('tl-spl').click();
    return;
  }

  // I — ตั้ง IN
  if(e.code==='KeyI'){ document.getElementById('rp-set-in').click(); return; }
  // O — ตั้ง OUT
  if(e.code==='KeyO'){ document.getElementById('rp-set-out').click(); return; }

  // Ctrl+D — ลบคลิปที่เลือก (alternative)
  if(ctrl && e.code==='KeyD'){
    e.preventDefault();
    if(S.activeId) document.getElementById('tl-del').click();
    return;
  }

  // + / = — ซูมเข้า
  if(e.code==='Equal'||e.code==='NumpadAdd'){ setZoom(S.zoom+25); return; }
  // - — ซูมออก
  if(e.code==='Minus'||e.code==='NumpadSubtract'){ setZoom(S.zoom-25); return; }
});

// ลบคลิปที่เลือก (ปุ่ม 🗑 ใน toolbar)
document.getElementById('tl-del').addEventListener('click', function(){
  if(!S.activeId){ showToast('⚠️ เลือกคลิปก่อน'); return; }
  saveUndo();
  var el = document.querySelector('[data-cid="'+S.activeId+'"]');
  if(el) el.remove();
  delete S.clips[S.activeId]; S.activeId = null;
  drawRuler(); scheduleSnapUpdate();
  showToast('🗑 ลบแล้ว (Ctrl+Z คืนได้)');
});
// ═══════════════════════════════════════
(function(){
  var ph = document.getElementById('tl-ph');
  var sc = document.getElementById('tl-scroll');
  var ruler = document.getElementById('ruler-c');
  var isDragging = false;

  // คำนวณ globalTime จากตำแหน่ง x ใน tl-scroll
  function xToGlobalTime(clientX){
    var r = sc.getBoundingClientRect();
    var x = Math.max(0, clientX - r.left + sc.scrollLeft);
    return x / pxSec();
  }

  // seek วิดีโอ + อัปเดต playhead จาก globalTime
  function seekToGlobal(gt){
    gt = Math.max(0, gt);
    var ps = pxSec();
    ph.style.left = (gt * ps) + 'px';
    // sync audio เมื่อ seek
    window.playQueueOffset = window.playQueueOffset || 0;
    setTimeout(syncBgAudio, 50);

    buildQueue();
    for(var i=0;i<playQueue.length;i++){
      var qc = playQueueClips[i];
      if(!qc) continue;
      var clipStart = (qc.c.startSec!==undefined) ? qc.c.startSec : (qc.c.left/ps);
      var clipEnd   = clipStart + qc.c.dur;
      if(gt >= clipStart && gt < clipEnd){
        var localT = gt - clipStart;
        playQueueOffset = clipStart;
        playIdx = i;
        var qItem = playQueue[i];
        var entry = qItem.entry;

        // เปรียบเทียบ entry ที่โหลดอยู่ด้วย ID (ไม่ใช่ URL string)
        // ── IMAGE CLIP ──
        if(entry.type === 'image'){
          // ซ่อน vid แสดงภาพ
          vid.pause();
          vid.style.visibility = '';
          vid.style.display = 'none';
          currentEntryId = entry.id;
          var _io = document.getElementById('prev-img-overlay');
          if(!_io){
            _io = document.createElement('img');
            _io.id = 'prev-img-overlay';
            _io.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:contain;z-index:1;pointer-events:none;';
            document.getElementById('prev-wrap').appendChild(_io);
          }
          _io.src = entry.url; _io.style.display = 'block';
          document.getElementById('prev-empty').style.display='none';
          document.getElementById('prev-wrap').style.display='flex';
          highlightCurrentClip();
          return;
        }

        // ── VIDEO CLIP ── ซ่อน img overlay ก่อน
        var _io2 = document.getElementById('prev-img-overlay');
        if(_io2) _io2.style.display = 'none';
        vid.style.display = '';
        vid.style.visibility = '';

        var isSameClip = (currentEntryId === entry.id) && vid.readyState >= 1;

        if(isSameClip && vid.readyState >= 1){
          // คลิปเดิม seek ตรงๆ ไม่ restart
          vid.currentTime = localT;
        } else {
          // คลิปอื่น โหลดใหม่แล้ว seek ไปตำแหน่งนั้น
          var wasPlaying = isPlaying;
          vid.pause();
          currentEntryId = entry.id;
          _vidTransitioning = true;
          vid.src = entry.url;
          (function(lt, wp){
            vid.onloadedmetadata = function(){
              _vidTransitioning = false;
              vid.currentTime = lt;
              var d=vid.duration;
              S.trimIn=0; S.trimOut=d; S.trimOutSet=false;
              initTrimSliders(d); updateTrimMarkers();
              if(wp){ var pb=vid.play(); if(pb) pb.catch(function(){}); }
            };
          })(localT, wasPlaying);
          vid.load();
        }
        highlightCurrentClip();
        return;
      }
    }
    // นอกช่วงคลิป — จอดำ
    var _io3 = document.getElementById('prev-img-overlay');
    if(_io3){
      // reset PIF state ของ img ก่อนซ่อน
      _io3.style.position=''; _io3.style.left=''; _io3.style.top='';
      _io3.style.width=''; _io3.style.height=''; _io3.style.objectFit='';
      _io3.style.inset=''; _io3.style.display='none';
    }
    if(typeof window._hidePIF==='function' && typeof window._pifIsOn==='function' && window._pifIsOn()){
      window._hidePIF();
    }
    vid.pause();
    vid.style.visibility = 'hidden';
    currentEntryId = null;
    // แสดง prev-wrap เป็นกรอบดำ
    document.getElementById('prev-empty').style.display = 'none';
    document.getElementById('prev-wrap').style.display = 'flex';
    // อัปเดต playQueueOffset ให้ตรงกับ gt เพื่อให้ play เริ่มถูกจุด
    window.playQueueOffset = 0;
  }

  // ── DRAG PLAYHEAD ──
  ph.addEventListener('mousedown', function(e){
    e.preventDefault();
    e.stopPropagation();
    isDragging = true;
    ph.style.opacity = '0.85';
    ph.style.cursor = 'grabbing';
    function onMove(e2){
      seekToGlobal(xToGlobalTime(e2.clientX));
    }
    function onUp(){
      isDragging = false;
      ph.style.opacity = '';
      ph.style.cursor = 'ew-resize';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });

  // ── CLICK/DRAG RULER ──
  ruler.addEventListener('mousedown', function(e){
    e.preventDefault();
    seekToGlobal(xToGlobalTime(e.clientX));
    if(typeof syncTextToPlayhead==='function') syncTextToPlayhead();
    function onMove(e2){ seekToGlobal(xToGlobalTime(e2.clientX)); }
    function onUp(){ document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });

  // ── CLICK/DRAG TRACK AREA → seek ──
  // reset isDragging เสมอเมื่อ mouseup
  document.addEventListener('mouseup', function(){ isDragging = false; });

  // bind seek บน tl-tracks และ ruler (ทั้งหมด)
  var tlInner = document.getElementById('tl-inner');
  if(tlInner){
    tlInner.addEventListener('mousedown', function(e){
      // ข้าม clip, handle, trim marker
      if(e.target.closest && (
        e.target.closest('.clip') ||
        e.target.closest('#tl-trim-in') ||
        e.target.closest('#tl-trim-out') ||
        e.target.closest('#tl-ph')
      )) return;
      // ต้องมีไฟล์
      if(!S.files || S.files.length === 0) return;
      isDragging = false;
      seekToGlobal(xToGlobalTime(e.clientX));
      function onMove(e2){ isDragging=true; seekToGlobal(xToGlobalTime(e2.clientX)); }
      function onUp(){ setTimeout(function(){isDragging=false;},50);
        document.removeEventListener('mousemove',onMove);
        document.removeEventListener('mouseup',onUp); }
      document.addEventListener('mousemove',onMove);
      document.addEventListener('mouseup',onUp);
    });
  }
})();

// TL toolbar tools
['tl-sel','tl-cut'].forEach(function(id){
  var el=document.getElementById(id);
  if(!el) return;
  el.addEventListener('click',function(){
    document.querySelectorAll('#tl-bar .tlb').forEach(function(b){b.classList.remove('on');});
    el.classList.add('on');
  });
});

// ช่องพิมพ์ข้อความด่วนใน toolbar
function addQuickText(){
  var inp=document.getElementById('tl-txt-quick');
  var txt=(inp&&inp.value.trim())||'';
  if(!txt){showToast('⚠️ พิมพ์ข้อความก่อน');return;}
  var wr=document.getElementById('prev-wrap');
  if(!wr||wr.style.display==='none'){showToast('⚠️ เปิดวิดีโอก่อน');return;}
  addTextLayer({text:txt,x:50,y:50,align:'center'});
  inp.value='';
  // สลับไปแผง text
  document.querySelector('.ib[data-p="text"]').click();
}
var _tlTxtQ=document.getElementById('tl-txt-quick');
var _tlTxtBtn=document.getElementById('tl-txt-add');
if(_tlTxtQ){ _tlTxtQ.addEventListener('keydown',function(e){ if(e.key==='Enter'){e.preventDefault();addQuickText();} }); }
if(_tlTxtBtn){ _tlTxtBtn.addEventListener('click',addQuickText); }

// ✂ กรรไกร — ตัดคลิปที่ playhead จริง
document.getElementById('tl-spl').addEventListener('click', function(){
  // ใช้ตำแหน่งเข็มแดงจริง ไม่ใช้ vid.currentTime (ใช้ได้ทั้ง video และ audio-only mode)
  var ps  = pxSec();
  var ph  = document.getElementById('tl-ph');
  var phX = ph ? (parseFloat(ph.style.left)||0) : 0;
  var currentGT = phX / ps; // globalTime ณ ตำแหน่งเข็ม
  if(currentGT <= 0.05){ showToast('⚠️ เลื่อน playhead ไปที่จุดที่ต้องการตัดก่อน'); return; }
  saveUndo();

  // ตัดได้ทั้ง video และ audio track
  var allTracks = ['tr-v1','tr-v2','tr-a'].map(function(id){
    return document.getElementById(id);
  }).filter(Boolean);

  var splitDone = false;
  allTracks.forEach(function(track){
   var clips = Array.from(track.querySelectorAll('.clip'));
   clips.forEach(function(clipEl){
    if(splitDone) return;
    var cid    = clipEl.dataset.cid;
    var c      = S.clips[cid];
    if(!c) return;
    var cLeft  = c.left;
    var cRight = c.left + c.w;

    // playhead อยู่ภายในคลิปนี้?
    if(phX > cLeft + 4 && phX < cRight - 4){
      splitDone = true;
      var entry = S.files.find(function(f){ return f.id === c.fid; });
      if(!entry) return;

      // คำนวณเวลาแบ่ง
      var clipStartT = cLeft / ps;
      var splitLocalT= currentGT - clipStartT;

      // คลิปซ้าย — ตัดท้ายที่ splitPoint
      var leftW = phX - cLeft;
      var leftDur = leftW / ps;
      c.w = leftW;
      clipEl.style.width = leftW + 'px';

      // คลิปขวา — ใหม่ เริ่มที่ splitPoint
      var rightCid = 'c' + S.nid++;
      var rightW   = cRight - phX;
      var rightDur = rightW / ps;
      // tIn ของ right clip = tIn ของ left clip + leftDur
      var rightTIn = (c.tIn || 0) + leftDur;
      S.clips[rightCid] = {
        id: rightCid, fid: c.fid,
        dur: rightDur, w: rightW, left: phX,
        tIn: rightTIn,
        startSec: phX / ps,
        type: c.type || 'video', muted: c.muted || false
      };
      // อัปเดต left clip tIn/dur ด้วย
      c.tIn = c.tIn || 0;
      c.dur = leftDur;
      c.startSec = cLeft / ps;
      buildClip(rightCid, track, entry); // track มาจาก allTracks loop

      // highlight flash แสดงว่าตัดแล้ว
      clipEl.style.boxShadow = '0 0 0 2px #22c55e';
      var rightEl = document.querySelector('[data-cid="'+rightCid+'"]');
      if(rightEl) rightEl.style.boxShadow = '0 0 0 2px #22c55e';
      setTimeout(function(){
        clipEl.style.boxShadow='';
        if(rightEl) rightEl.style.boxShadow='';
      }, 800);

      drawRuler();
      scheduleSnapUpdate();
      showToast('✂ ตัดคลิปที่ '+fmt(currentGT)+' สำเร็จ!');
    }
   }); // clips.forEach
  }); // allTracks.forEach

  if(!splitDone){
    showToast('⚠️ playhead ไม่ได้อยู่บนคลิปใด — เลื่อนเส้นแดงไปบนคลิปก่อน');
  }
});

// ═══════════════════════════════════════
// RULER
// ═══════════════════════════════════════
function drawRuler(){
  var c=document.getElementById('ruler-c');
  var ps=pxSec();
  // คำนวณความยาวรวม inline (calcTotalDur อาจยังไม่ถูก define)
  var td=0;
  Object.values(S.clips).forEach(function(cl){var r=(cl.left/ps)+cl.dur;if(r>td)td=r;});
  td=Math.max(60,td+30);
  var w=td*ps+100;
  c.width=w;c.height=20;
  var cx=c.getContext('2d');
  cx.fillStyle='#1a1a1a';cx.fillRect(0,0,w,20);
  cx.strokeStyle='#3a3a3a';cx.lineWidth=1;
  cx.fillStyle='#666';cx.font='9px monospace';cx.textAlign='left';
  for(var t=0;t*ps<=w;t++){
    var x=t*ps;
    if(t%10===0){cx.beginPath();cx.moveTo(x,0);cx.lineTo(x,20);cx.stroke();cx.fillText(fmt(t),x+2,13);}
    else if(t%5===0){cx.beginPath();cx.moveTo(x,8);cx.lineTo(x,20);cx.stroke();}
    else{cx.beginPath();cx.moveTo(x,14);cx.lineTo(x,20);cx.stroke();}
  }
  document.querySelectorAll('.tl-track').forEach(function(t){t.style.minWidth=w+'px';});
  document.getElementById('tl-inner').style.minWidth=w+'px';
}

// ═══════════════════════════════════════
// PLAYBACK — เล่นต่อเนื่อง + Playhead ซิงค์กับไทม์ไลน์จริง
// ═══════════════════════════════════════
var playQueue=[];var playQueueClips=[];var playIdx=0;var isPlaying=false;
var playQueueOffset=0;
var transEffect='fade';
var currentEntryId=null; // track which entry is loaded in vid

// Transition canvas overlay
var transCanvas=document.createElement('canvas');
transCanvas.style.cssText='position:absolute;inset:0;pointer-events:none;z-index:10;border-radius:4px;';
document.getElementById('prev-wrap').appendChild(transCanvas);
var tctx=transCanvas.getContext('2d');
var transAnim=null;

function resizeTransCanvas(){
  var w=document.getElementById('prev-wrap');
  transCanvas.width=w.offsetWidth||480;
  transCanvas.height=w.offsetHeight||270;
}

function playTransition(cb){
  resizeTransCanvas();
  var W=transCanvas.width,H=transCanvas.height;
  var start=null,dur=500;
  if(transEffect==='none'){cb();return;}
  cancelAnimationFrame(transAnim);
  var called=false;
  function step(ts){
    if(!start)start=ts;
    var p=Math.min(1,(ts-start)/dur);
    tctx.clearRect(0,0,W,H);
    if(transEffect==='fade'){
      if(p<0.5){tctx.fillStyle='rgba(0,0,0,'+(p*2)+')';tctx.fillRect(0,0,W,H);}
      else{
        if(!called){called=true;cb();}
        tctx.fillStyle='rgba(0,0,0,'+(2-p*2)+')';tctx.fillRect(0,0,W,H);
      }
    }else if(transEffect==='wipe'){
      if(p<0.5){var x=(p*2)*W;tctx.fillStyle='#000';tctx.fillRect(0,0,x,H);}
      else{
        if(!called){called=true;cb();}
        var x2=((p-0.5)*2)*W;tctx.fillStyle='#000';tctx.fillRect(x2,0,W-x2,H);
      }
    }
    if(p<1){transAnim=requestAnimationFrame(step);}
    else{tctx.clearRect(0,0,W,H);}
  }
  transAnim=requestAnimationFrame(step);
}

// buildQueue — ใช้คลิปในไทม์ไลน์เท่านั้น ไม่ fallback ไป S.files
function buildQueue(){
  playQueue=[];
  playQueueClips=[];
  var clips=Array.from(document.getElementById('tr-v1').querySelectorAll('.clip'));
  clips.sort(function(a,b){return parseFloat(a.style.left)-parseFloat(b.style.left);});
  clips.forEach(function(el){
    var cid=el.dataset.cid;
    var c=S.clips[cid];if(!c)return;
    var entry=S.files.find(function(f){return f.id===c.fid;});
    if(entry){
      playQueue.push({entry:entry, c:c, el:el});
      playQueueClips.push({el:el,c:c});
    }
  });
  // ถ้าไม่มีคลิปใน timeline เลย ไม่เล่นอะไรทั้งนั้น
}

// คำนวณ left position ของคลิปใน timeline (pixel) → เวลาสะสม (วินาที)
function clipStartTime(idx){
  if(!playQueueClips[idx]) return 0;
  var c=playQueueClips[idx].c;
  return c.left/pxSec();
}

function togglePlay(){
  var btn=document.getElementById('pb-p');
  if(isPlaying){ vid.pause();isPlaying=false;btn.textContent='▶';btn.classList.remove('on');bgAudio.pause();window._audioOnlyActive=false;window.dispatchEvent(new Event('wave-stop'));return;}
  buildQueue();
  if(!playQueue.length){
    // ไม่มีวิดีโอ — เล่น audio track อย่างเดียว
    var audioClips=Array.from(document.getElementById('tr-a').querySelectorAll('.clip'));
    if(!audioClips.length){showToast('⚠️ ลากวิดีโอหรือเสียงมาวางในไทม์ไลน์ก่อน');return;}
    var ps0=pxSec();
    var ph0=document.getElementById('tl-ph');
    // startGT = ตำแหน่งเข็มแดงจริง
    var startGT=ph0?Math.max(0,(parseFloat(ph0.style.left)||0)/ps0):0;
    var totalDur0=calcTotalDur();

    // หา audio clip ที่ครอบ startGT — ถ้าไม่ครอบหาอันถัดไป ถ้าไม่มีเริ่มจากต้น
    var foundAudio=null;
    for(var ai=0;ai<audioClips.length;ai++){
      var aEl2=audioClips[ai], cid2=aEl2.dataset.cid, c2=S.clips[cid2];
      if(!c2) continue;
      var cs2=(c2.startSec!==undefined)?c2.startSec:(c2.left/ps0);
      var ce2=cs2+(c2.w/ps0);
      if(startGT>=cs2 && startGT<ce2){ foundAudio={c:c2,startSec:cs2,endSec:ce2}; break; }
      if(startGT<cs2 && !foundAudio){ foundAudio={c:c2,startSec:cs2,endSec:ce2}; }
    }
    if(!foundAudio){
      // เริ่มจาก clip แรก
      var aEl0=audioClips[0], cid00=aEl0.dataset.cid, c00=S.clips[cid00];
      var cs00=(c00.startSec!==undefined)?c00.startSec:(c00.left/ps0);
      foundAudio={c:c00,startSec:cs00,endSec:cs00+(c00.w/ps0)};
      startGT=cs00;
    }
    var fa=foundAudio, fa_c=fa.c;
    var entry0=S.files.find(function(f){return f.id===fa_c.fid;});
    if(!entry0){showToast('❌ หาไฟล์ไม่เจอ');return;}

    // คำนวณ localTime ภายใน audio file
    var localT0=Math.max(0, startGT - fa.startSec + (fa_c.tIn||0));
    localT0=Math.min(entry0.dur-0.05, localT0);

    bgAudio.src=entry0.url;
    bgAudio.currentTime=localT0;
    bgAudio.volume=(S.vol!==undefined)?S.vol:1;
    bgAudio.muted=S.mute||false;
    bgAudio.play().catch(function(){});
    isPlaying=true; btn.textContent='⏸'; btn.classList.add('on');
    window._audioOnlyActive=true;
    window.dispatchEvent(new Event('wave-play'));

    function aoRAF(){
      if(!isPlaying||!window._audioOnlyActive)return;
      // globalTime = clipStart + (bgAudio position ภายใน file - tIn offset)
      var gt2=fa.startSec+(bgAudio.currentTime-(fa_c.tIn||0));
      window._waveGlobalTime=gt2;
      var ps2=pxSec();
      document.getElementById('tl-ph').style.left=(gt2*ps2)+'px';
      var totalDur2=calcTotalDur();
      document.getElementById('pb-tc').textContent=fmt(gt2)+' / '+fmt(totalDur2||fa.endSec);
      document.getElementById('tc-badge').textContent=fmt(gt2);
      var sc2=document.getElementById('tl-scroll'),vw2=sc2.clientWidth,phPx=gt2*ps2;
      if(phPx>sc2.scrollLeft+vw2*0.8)sc2.scrollLeft=phPx-vw2*0.3;
      if(bgAudio.paused||gt2>=(totalDur2||fa.endSec)){
        isPlaying=false;window._audioOnlyActive=false;bgAudio.pause();
        btn.textContent='▶';btn.classList.remove('on');
        window.dispatchEvent(new Event('wave-stop'));
        showToast('⏹ เล่นจบแล้ว');return;
      }
      requestAnimationFrame(aoRAF);
    }
    requestAnimationFrame(aoRAF);
    return;
  }

  // หาตำแหน่ง playhead ปัจจุบัน (globalTime)
  var ph = document.getElementById('tl-ph');
  var ps = pxSec();
  var currentGT = ph ? (parseFloat(ph.style.left)||0) / ps : 0;

  // หา clip ที่ playhead อยู่
  var startIdx = 0;
  for(var i=0;i<playQueue.length;i++){
    var qc = playQueueClips[i];
    if(!qc) continue;
    var clipStart = (qc.c.startSec!==undefined) ? qc.c.startSec : (qc.c.left/ps);
    var clipEnd   = clipStart + qc.c.dur;
    if(currentGT >= clipStart && currentGT < clipEnd){
      startIdx = i;
      break;
    }
    // ถ้า playhead อยู่ก่อน clip แรก
    if(currentGT < clipStart && i===0){ startIdx=0; break; }
    // ถ้าผ่าน clip นี้แล้ว ลองต่อไป
    startIdx = i;
  }

  playIdx = startIdx;
  playQueueOffset = clipStartTime(startIdx);

  // seek วิดีโอไปตำแหน่งที่ถูกต้องภายใน clip
  var qc2 = playQueueClips[startIdx];
  var seekOffset = 0;
  if(qc2){
    var cs = (qc2.c.startSec!==undefined) ? qc2.c.startSec : (qc2.c.left/ps);
    seekOffset = Math.max(0, currentGT - cs);
  }

  // โหลด clip และ seek ไปตำแหน่งที่ต้องการ
  var qItem = playQueue[startIdx];
  var entry = qItem.entry; var c = qItem.c;

  // ภาพนิ่ง — แสดงภาพแล้วนับเวลาด้วย RAF
  if(entry.type === 'image'){
    playIdx = startIdx;
    playQueueOffset = currentGT;
    var _imgPS = pxSec();
    var _clipEnd = ((c.startSec!==undefined)?c.startSec:(c.left/_imgPS)) + (c.w/_imgPS);
    var _remaining = Math.max(0.1, _clipEnd - currentGT);
    // แสดงภาพบน preview
    document.getElementById('prev-empty').style.display='none';
    document.getElementById('prev-wrap').style.display='flex';
    var _io = document.getElementById('prev-img-overlay');
    if(!_io){
      _io = document.createElement('img');
      _io.id = 'prev-img-overlay';
      _io.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:contain;z-index:1;pointer-events:none;';
      document.getElementById('prev-wrap').appendChild(_io);
    }
    _io.src = entry.url; _io.style.display='block';
    vid.style.display='none';
    isPlaying=true;
    btn.textContent='⏸'; btn.classList.add('on');
    highlightCurrentClip();
    var _t0=Date.now(), _startGT=currentGT;
    // เริ่ม bgAudio + wave animation ทันทีที่เริ่มเล่น image clip
    syncBgAudio();
    window.dispatchEvent(new Event('wave-play'));
    function _imgRAF(){
      if(!isPlaying)return;
      var _gt=_startGT+(Date.now()-_t0)/1000;
      // อัปเดต global wave time ให้ waveform preview อ่านได้
      window._waveGlobalTime = _gt;
      var _ps2=pxSec();
      document.getElementById('tl-ph').style.left=(_gt*_ps2)+'px';
      var _td=calcTotalDur();
      document.getElementById('pb-tc').textContent=fmt(_gt)+' / '+fmt(_td);
      document.getElementById('tc-badge').textContent=fmt(_gt);
      var _sc=document.getElementById('tl-scroll'),_vw=_sc.clientWidth,_px=_gt*_ps2;
      if(_px>_sc.scrollLeft+_vw*0.8)_sc.scrollLeft=_px-_vw*0.3;
      syncBgAudio(_gt);
      if((Date.now()-_t0)/1000 >= _remaining){ advanceClip(); return; }
      requestAnimationFrame(_imgRAF);
    }
    requestAnimationFrame(_imgRAF);
    return;
  }

  // ซ่อน img overlay ถ้ามี
  var _io2=document.getElementById('prev-img-overlay');
  if(_io2)_io2.style.display='none';
  vid.style.display='';
  vid.style.visibility='';

  _vidTransitioning = true;
  vid.src = entry.url;
  currentEntryId = entry.id;
  vid.onloadedmetadata = function(){
    _vidTransitioning = false;
    var d = vid.duration;
    var filePs = pxSec();
    var clipTIn = (c.tIn !== undefined) ? c.tIn : 0;
    var tIn = clipTIn + seekOffset;
    var clipDurSec = c.w / filePs;
    var tOut = Math.min(d, clipTIn + clipDurSec);
    tIn=Math.max(0,tIn); tOut=Math.min(d,tOut);
    S.trimIn=tIn; S.trimOut=tOut; S.trimOutSet=(tOut<d-0.3);
    initTrimSliders(d); updateTrimMarkers();
    vid.currentTime = tIn;
    vid.muted = c.muted||false;
    // resume AudioContext ก่อน play (ป้องกัน DOMException autoplay policy)
    if(window.AudioContext || window.webkitAudioContext){
      try{
        var _actx = window._waveAudioCtxRef;
        if(_actx && _actx.state === 'suspended') _actx.resume();
      }catch(_e){}
    }
    var pb=vid.play();
    if(pb) pb.catch(function(e){ console.warn('[play]', e.name||e); });
    isPlaying=true;
    document.getElementById('pb-p').textContent='⏸';
    document.getElementById('pb-p').classList.add('on');
    highlightCurrentClip();
  };
  vid.onerror=function(){showToast('❌ โหลดวิดีโอไม่ได้: '+entry.name);};
}

// loadAndPlay — เล่นคลิปตามขนาด pixel ที่ตัดไว้จริง
function loadAndPlay(qItem,immediate){
  var entry=qItem.entry, c=qItem.c;

  if(entry.type === 'image'){
    var doImg=function(){
      document.getElementById('prev-empty').style.display='none';
      document.getElementById('prev-wrap').style.display='flex';
      var _io=document.getElementById('prev-img-overlay');
      if(!_io){
        _io=document.createElement('img');
        _io.id='prev-img-overlay';
        _io.style.cssText='position:absolute;inset:0;width:100%;height:100%;object-fit:contain;z-index:1;pointer-events:none;';
        document.getElementById('prev-wrap').appendChild(_io);
      }
      _io.src=entry.url; _io.style.display='block';
      vid.style.display='none';
      var _ps=pxSec();
      var _cs=(c.startSec!==undefined)?c.startSec:(c.left/_ps);
      var _dur=c.w/_ps;
      isPlaying=true;
      document.getElementById('pb-p').textContent='⏸';
      document.getElementById('pb-p').classList.add('on');
      highlightCurrentClip();
      playQueueOffset=_cs;
      var _t0=Date.now();
      // เริ่ม bgAudio + wave animation ทันทีที่เริ่มเล่น image clip ใน loadAndPlay
      syncBgAudio();
      window.dispatchEvent(new Event('wave-play'));
      function _lRAF(){
        if(!isPlaying)return;
        var _gt=_cs+(Date.now()-_t0)/1000;
        // อัปเดต global wave time
        window._waveGlobalTime = _gt;
        var _ps2=pxSec();
        document.getElementById('tl-ph').style.left=(_gt*_ps2)+'px';
        var _td=calcTotalDur();
        document.getElementById('pb-tc').textContent=fmt(_gt)+' / '+fmt(_td);
        document.getElementById('tc-badge').textContent=fmt(_gt);
        var _sc=document.getElementById('tl-scroll'),_vw=_sc.clientWidth,_px=_gt*_ps2;
        if(_px>_sc.scrollLeft+_vw*0.8)_sc.scrollLeft=_px-_vw*0.3;
        syncBgAudio(_gt);
        if((Date.now()-_t0)/1000 >= _dur){ advanceClip(); return; }
        requestAnimationFrame(_lRAF);
      }
      requestAnimationFrame(_lRAF);
    };
    if(immediate)doImg(); else playTransition(doImg);
    return;
  }

  var doPlay=function(){
    var _io2=document.getElementById('prev-img-overlay');
    if(_io2)_io2.style.display='none';
    vid.style.display='';
    _vidTransitioning = true;
    vid.src = entry.url;
    currentEntryId = entry.id; // track loaded entry
    vid.onloadedmetadata=function(){
      _vidTransitioning = false;
      var d=vid.duration;
      var ps=pxSec();
      // คำนวณ tIn, tOut จากสัดส่วน pixel ของคลิปเทียบกับไฟล์จริง
      var filePxW=entry.dur*ps;
      var clipLeft=c.left; // left ของคลิปในไทม์ไลน์
      var clipW=c.w;
      // offset ของคลิปจาก start ของไฟล์ (ถ้าลากขอบซ้าย)
      var fileOffset=0; // TODO: track per-clip trimIn separately
      var tIn=(c.tIn!==undefined) ? c.tIn : fileOffset;
      // tOut = tIn + duration ของ clip (clipW = pixel width)
      var tOut=Math.min(d, tIn+(clipW/ps));
      // clamp
      tIn=Math.max(0,tIn); tOut=Math.min(d,tOut);
      S.trimIn=tIn; S.trimOut=tOut; S.trimOutSet=(tOut<d-0.3);
      initTrimSliders(d);
      updateTrimMarkers();
      vid.currentTime=tIn;
      vid.muted=c.muted||false;
      try{ var _ac=window._waveAudioCtxRef; if(_ac&&_ac.state==='suspended') _ac.resume(); }catch(_e){}
      var pb=vid.play();
      if(pb) pb.catch(function(e){ console.warn('[play]', e.name||e); });
      isPlaying=true;
      document.getElementById('pb-p').textContent='⏸';
      document.getElementById('pb-p').classList.add('on');
      highlightCurrentClip();
    };
    vid.onerror=function(){showToast('❌ โหลดวิดีโอไม่ได้: '+entry.name);};
  };
  if(immediate)doPlay(); else playTransition(doPlay);
}

function highlightCurrentClip(){
  document.querySelectorAll('.clip').forEach(function(el){el.classList.remove('playing');});
  if(playQueueClips[playIdx]) playQueueClips[playIdx].el.classList.add('playing');
}

vid.addEventListener('timeupdate',function(){
  var dur=vid.duration||0, t=vid.currentTime;
  if(S.trimOutSet&&S.trimOut>0&&S.trimOut<(dur-0.3)&&t>=S.trimOut){advanceClip();return;}
  var globalTime=playQueueOffset+t, ps=pxSec();
  // อัปเดต global wave time สำหรับ video clip
  window._waveGlobalTime = globalTime;
  document.getElementById('tl-ph').style.left=(globalTime*ps)+'px';
  var totalDur=calcTotalDur();
  document.getElementById('pb-tc').textContent=fmt(globalTime)+' / '+fmt(totalDur);
  document.getElementById('tc-badge').textContent=fmt(globalTime);
  var sc=document.getElementById('tl-scroll'),ph=globalTime*ps,vw=sc.clientWidth;
  if(ph>sc.scrollLeft+vw*0.8) sc.scrollLeft=ph-vw*0.3;
  else if(ph<sc.scrollLeft) sc.scrollLeft=Math.max(0,ph-50);
  updateTextVisibility(globalTime);
  syncBgAudio();
});
vid.addEventListener('ended',function(){advanceClip();});


// แสดง/ซ่อน text overlay ตาม globalTime
function updateTextVisibility(globalTime){
  if(typeof TXT === 'undefined') return;
  TXT.layers.forEach(function(layer){
    var el = document.getElementById('tl-'+layer.id);
    if(!el) return;
    var tIn  = (layer.tIn  !== undefined) ? layer.tIn  : 0;
    var tOut = (layer.tOut !== undefined) ? layer.tOut : 9999;
    var visible = (globalTime >= tIn && globalTime < tOut);
    el.style.display = visible ? '' : 'none';
  });
}

// เรียก updateTextVisibility ตอน seek ด้วย (ไม่ใช่แค่ตอนเล่น)
function syncTextToPlayhead(){
  var ph = document.getElementById('tl-ph');
  var ps = pxSec();
  var gt = ph ? (parseFloat(ph.style.left)||0)/ps : 0;
  updateTextVisibility(gt);
}
function calcTotalDur(){
  var max=0, ps=pxSec();
  Object.values(S.clips).forEach(function(c){
    var start=(c.startSec!==undefined)?c.startSec:(c.left/ps);
    var dur=c.w/ps; // ขนาด clip จริงหลัง trim ไม่ใช่ความยาวไฟล์
    var r=start+dur;
    if(r>max)max=r;
  });
  return max||0;
}

function advanceClip(){
  if(!isPlaying)return;
  buildQueue();
  if(playQueue.length>1&&playIdx<playQueue.length-1){
    playIdx++; playQueueOffset=clipStartTime(playIdx);
    loadAndPlay(playQueue[playIdx],false); return;
  }
  // วิดีโอจบ — เช็คว่าเสียงยังเล่นอยู่ไหม
  if(!bgAudio.paused && bgAudio.currentTime<(bgAudio.duration||0)-0.2){
    // แช่ vid ไว้ที่ frame สุดท้าย รอเสียงจบ
    vid.pause();
    cancelAnimationFrame(transAnim);
    tctx.clearRect(0,0,transCanvas.width,transCanvas.height);
    var vidEndGT=playQueueOffset+(vid.duration||0);
    var ps2=pxSec();
    // หา startSec ของ audio clip
    var aFound=null;
    Object.values(S.clips).forEach(function(c){
      if(c.type!=='audio')return;
      var cs=(c.startSec!==undefined)?c.startSec:(c.left/ps2);
      if(!aFound||cs<aFound.startSec) aFound={c:c,startSec:cs};
    });
    // ซ่อน image overlay ทันทีที่ content จบ รอแค่เสียง
    var _ioWait = document.getElementById('prev-img-overlay');
    if(_ioWait) _ioWait.style.display = 'none';
    vid.style.display = '';
    vid.style.visibility = '';
    function waitAudio(){
      if(!isPlaying)return;
      var gt=vidEndGT;
      if(aFound){
        gt=aFound.startSec+(bgAudio.currentTime-(aFound.c.tIn||0));
      }
      document.getElementById('tl-ph').style.left=(gt*ps2)+'px';
      var totalDur=calcTotalDur();
      document.getElementById('pb-tc').textContent=fmt(gt)+' / '+fmt(totalDur);
      document.getElementById('tc-badge').textContent=fmt(gt);
      var sc2=document.getElementById('tl-scroll'),vw2=sc2.clientWidth,phPx=gt*ps2;
      if(phPx>sc2.scrollLeft+vw2*0.8)sc2.scrollLeft=phPx-vw2*0.3;
      if(bgAudio.paused||bgAudio.currentTime>=(bgAudio.duration||0)-0.1||gt>=totalDur){
        stopAll();return;
      }
      requestAnimationFrame(waitAudio);
    }
    requestAnimationFrame(waitAudio);
    return;
  }
  stopAll();
}
function stopAll(){
  cancelAnimationFrame(transAnim);
  tctx.clearRect(0,0,transCanvas.width,transCanvas.height);
  vid.pause();isPlaying=false;
  bgAudio.pause();
  window._audioOnlyActive=false;
  window._waveGlobalTime = 0;
  // หยุด waveform animation ทุกตัว
  window.dispatchEvent(new Event('wave-stop'));
  document.getElementById('pb-p').textContent='▶';
  document.getElementById('pb-p').classList.remove('on');
  document.querySelectorAll('.clip').forEach(function(el){el.classList.remove('playing');});
  var _ioStop = document.getElementById('prev-img-overlay');
  if(_ioStop) _ioStop.style.display = 'none';
  vid.style.display = '';
  vid.style.visibility = '';
  showToast('⏹ เล่นจบแล้ว');
}

document.getElementById('pb-p').addEventListener('click',togglePlay);
document.getElementById('pb-s').addEventListener('click',function(){ vid.currentTime=S.trimIn; updateTrimMarkers(); });
document.getElementById('pb-e').addEventListener('click',function(){ vid.currentTime=S.trimOut||vid.duration; });
document.getElementById('pb-b').addEventListener('click',function(){ vid.currentTime=Math.max(0,vid.currentTime-5); });
document.getElementById('pb-f').addEventListener('click',function(){ vid.currentTime=Math.min(vid.duration||0,vid.currentTime+5); });
document.getElementById('pb-vol').addEventListener('input',function(){
  var v=parseFloat(this.value);
  vid.volume=v;
  if(typeof bgAudio!=='undefined') bgAudio.volume=v;
  S.vol=v;
  // sync sliders
  var pct=Math.round(v*100);
  var slv=document.getElementById('sl-vol'); if(slv) slv.value=pct;
  var rpv=document.getElementById('rp-vol'); if(rpv) rpv.value=pct;
  var vv=document.getElementById('vol-v');   if(vv)  vv.textContent=pct+'%';
  var rpvv=document.getElementById('rp-vol-v'); if(rpvv) rpvv.textContent=pct+'%';
});
document.getElementById('trans-sel').addEventListener('change',function(){ transEffect=this.value; showToast('🎞 Transition: '+this.options[this.selectedIndex].text); });

// ═══════════════════════════════════════
// ZOOM — ซูมไทม์ไลน์ คลิปดันกันไม่ซ้อน
// ตำแหน่งคลิปเก็บเป็น "วินาที" (startSec)
// แปลงเป็น pixel ทุกครั้งที่ zoom เปลี่ยน
// ═══════════════════════════════════════

// migrate clip.left → clip.startSec ครั้งแรกที่โหลด
function ensureClipStartSec(){
  Object.keys(S.clips).forEach(function(cid){
    var c=S.clips[cid];
    if(c.startSec===undefined){
      c.startSec = c.left / pxSec(); // แปลง pixel → วินาที
    }
  });
}

// จัดเรียงคลิปใน track ตาม startSec แล้วดันกันไม่ซ้อน
function packClips(trackId){
  var track=document.getElementById(trackId||'tr-v1');
  if(!track) return;
  // รวบรวม cid จาก track
  var cids=[];
  track.querySelectorAll('.clip').forEach(function(el){
    var cid=el.dataset.cid;
    if(S.clips[cid]) cids.push(cid);
  });
  if(!cids.length) return;
  // เรียงตาม startSec
  cids.sort(function(a,b){ return (S.clips[a].startSec||0)-(S.clips[b].startSec||0); });
  // ดัน — ห้ามซ้อนกัน
  var cursor=0;
  cids.forEach(function(cid){
    var c=S.clips[cid];
    if(c.startSec<cursor) c.startSec=cursor;
    cursor=c.startSec+c.dur;
  });
}

function setZoom(v){
  v=Math.max(20,Math.min(800,v));
  S.zoom=v;
  ['z-lbl','tl-z-lbl'].forEach(function(id){
    var el=document.getElementById(id);if(el) el.textContent=v+'%';
  });
  var zsl=document.getElementById('z-sl'); if(zsl) zsl.value=v;
  var tlz=document.getElementById('tl-z'); if(tlz) tlz.value=v;

  // migrate ก่อน
  ensureClipStartSec();

  // อัปเดต pixel ทุกคลิป จาก startSec × pxSec
  var ps=pxSec();
  Object.keys(S.clips).forEach(function(cid){
    var c=S.clips[cid];
    if(c.startSec===undefined) c.startSec=c.left/ps;
    c.left  = c.startSec * ps;
    c.w     = c.dur * ps;
    var el=document.querySelector('[data-cid="'+cid+'"]');
    if(el){ el.style.left=c.left+'px'; el.style.width=c.w+'px'; }
  });

  drawRuler();
  updateTrimMarkers();
  if(typeof renderTextTrack==='function') renderTextTrack();
  var gt=(playQueueOffset||0)+(vid.currentTime||0);
  var ph=document.getElementById('tl-ph');
  if(ph) ph.style.left=(gt*ps)+'px';
  // อัปเดต snap markers และ thumbnail frames
  snapUpdateNow();
  refreshAllClipFrames();
  if(typeof refreshWaveClips==='function') refreshWaveClips();
}

document.getElementById('z-in').addEventListener('click',    function(){ setZoom(S.zoom+25); });
document.getElementById('z-out').addEventListener('click',   function(){ setZoom(S.zoom-25); });
document.getElementById('z-sl').addEventListener('input',    function(){ setZoom(parseInt(this.value)); });
document.getElementById('tl-z-in').addEventListener('click', function(){ setZoom(S.zoom+25); });
document.getElementById('tl-z-out').addEventListener('click',function(){ setZoom(S.zoom-25); });
document.getElementById('tl-z').addEventListener('input',    function(){ setZoom(parseInt(this.value)); });


// Redraw thumbnail frames เมื่อ zoom เปลี่ยน
function refreshAllClipFrames(){
  var ps = pxSec();
  Object.keys(S.clips).forEach(function(cid){
    var c = S.clips[cid];
    var el = document.querySelector('[data-cid="'+cid+'"]');
    if(!el) return;
    var fr = document.getElementById('cf-'+cid);
    if(!fr) return;
    // คำนวณจำนวน frame ที่ต้องการตาม width ใหม่
    var nf = Math.max(1, Math.floor(c.w / 50));
    var existing = fr.querySelectorAll('.clip-frm').length;
    if(existing === nf) return; // ไม่ต้อง redraw
    // ลบเก่า
    fr.innerHTML = '';
    // หา entry
    var entry = S.files && S.files.find(function(f){ return f.id === c.fid; });
    if(!entry || entry.type === 'audio') return;
    // วาดใหม่
    var tv = document.createElement('video');
    tv.src = entry.url; tv.muted = true; tv.preload = 'metadata';
    tv.onloadedmetadata = function(){
      var drawn = 0;
      for(var i = 0; i < nf; i++){
        (function(idx){
          var cv = document.createElement('canvas');
          cv.width = 50; cv.height = 36;
          var cx2 = cv.getContext('2d');
          var t = (entry.dur / nf) * (idx + 0.5);
          tv.currentTime = t;
          tv.onseeked = function(){
            cx2.drawImage(tv, 0, 0, 50, 36);
            var fd = document.createElement('div');
            fd.className = 'clip-frm';
            fd.style.width = '50px';
            fd.style.backgroundImage = 'url(' + cv.toDataURL() + ')';
            fr.appendChild(fd);
            drawn++;
            if(drawn === nf) tv.src = '';
          };
        })(i);
      }
    };
  });
}
// ═══════════════════════════════════════
// INNER FRAME RESIZE — คลิกภาพ → กรอบ 8 จุด ยืดหดภาพ ในเฟรม 9:16
// เฟรมไม่เปลี่ยน แต่ภาพ video ยืดหด/ขยับภายใน
// ═══════════════════════════════════════
(function(){
  var pifOn = false;
  var pifOverlay = document.getElementById('pif-overlay');
  var pifFrame   = document.getElementById('pif-frame');

  // state ตำแหน่ง/ขนาดภาพในเฟรม
  var F = { x:0, y:0, w:0, h:0 };

  // return element ที่กำลังแสดงอยู่ (vid หรือ img overlay)
  function getActiveMediaEl(){
    var io = document.getElementById('prev-img-overlay');
    if(io && io.style.display !== 'none' && io.src) return io;
    return vid;
  }

  function initFrame(){
    var wr = document.getElementById('prev-wrap');
    F.w = wr.offsetWidth; F.h = wr.offsetHeight;
    F.x = 0; F.y = 0;
    applyFrame();
  }

  function applyFrame(){
    pifFrame.style.left   = F.x+'px';
    pifFrame.style.top    = F.y+'px';
    pifFrame.style.width  = F.w+'px';
    pifFrame.style.height = F.h+'px';
    window._pifF = {x:F.x, y:F.y, w:F.w, h:F.h};
    // apply กับ element ที่แสดงอยู่ (vid หรือ img)
    var me = getActiveMediaEl();
    me.style.position  = 'absolute';
    me.style.left      = F.x+'px';
    me.style.top       = F.y+'px';
    me.style.width     = F.w+'px';
    me.style.height    = F.h+'px';
    me.style.objectFit = 'fill';
    me.style.inset     = '';   // ล้าง inset:0 ของ img overlay ออก
  }

  function openPIF(){
    pifOn = true;
    initFrame();
    pifOverlay.classList.add('on');
  }
  function hideFrame(){
    pifOn = false;
    pifOverlay.classList.remove('on');
    // ภาพยังอยู่ตำแหน่งเดิม
  }
  function resetPIF(){
    pifOn = false;
    pifOverlay.classList.remove('on');
    // reset ทั้ง vid และ img overlay
    [vid, document.getElementById('prev-img-overlay')].forEach(function(me){
      if(!me) return;
      me.style.position  = '';
      me.style.left = me.style.top = '';
      me.style.width = me.style.height = '';
      me.style.objectFit = '';
      me.style.inset = '';
    });
    // restore img overlay inset
    var io = document.getElementById('prev-img-overlay');
    if(io) io.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:contain;z-index:1;pointer-events:none;display:'+(io.style.display||'block')+';';
    applyARToPreview();
  }
  function closePIF(){ hideFrame(); }

  // expose openPIF/resetPIF globally สำหรับ image click handler
  window._openPIF  = openPIF;
  window._resetPIF = resetPIF;
  window._hidePIF  = hideFrame;
  window._pifIsOn  = function(){ return pifOn; };

  // คลิก video → PIF
  document.getElementById('prev-vid').style.cursor = 'pointer';
  document.getElementById('prev-vid').addEventListener('click', function(e){
    e.stopPropagation();
    if(pifOn){ hideFrame(); } else { openPIF(); }
  });
  document.getElementById('prev-vid').addEventListener('dblclick', function(e){
    e.stopPropagation();
    resetPIF();
  });

  // Escape → ซ่อนกรอบ (ภาพค้างไว้)
  document.addEventListener('keydown', function(e){
    if(e.code==='Escape' && pifOn) hideFrame();
  });

  // คลิกที่ไหนก็ได้ที่ไม่ใช่ pif-frame → ซ่อนกรอบ (ภาพค้างไว้)
  document.addEventListener('mousedown', function(e){
    if(!pifOn) return;
    if(pifFrame.contains(e.target)) return;
    hideFrame();
  }, true);

  // Drag pif-frame body → move
  pifFrame.addEventListener('mousedown', function(e){
    if(e.target !== pifFrame) return;
    e.preventDefault();
    var sx=e.clientX, sy=e.clientY, ox=F.x, oy=F.y;
    var wr = document.getElementById('prev-wrap');
    function mm(e2){
      F.x = Math.max(-F.w/2, Math.min(wr.offsetWidth-F.w/2, ox+e2.clientX-sx));
      F.y = Math.max(-F.h/2, Math.min(wr.offsetHeight-F.h/2, oy+e2.clientY-sy));
      applyFrame();
    }
    function mu(){ document.removeEventListener('mousemove',mm); document.removeEventListener('mouseup',mu); }
    document.addEventListener('mousemove',mm); document.addEventListener('mouseup',mu);
  });

  // Drag handles → resize (stretch ภาพในเฟรม)
  var hdlDefs = [
    {cls:'tl', onDrag: function(dx,dy){ F.x+=dx; F.y+=dy; F.w-=dx; F.h-=dy; }},
    {cls:'tc', onDrag: function(dx,dy){ F.y+=dy; F.h-=dy; }},
    {cls:'tr', onDrag: function(dx,dy){ F.y+=dy; F.w+=dx; F.h-=dy; }},
    {cls:'ml', onDrag: function(dx,dy){ F.x+=dx; F.w-=dx; }},
    {cls:'mr', onDrag: function(dx,dy){ F.w+=dx; }},
    {cls:'bl', onDrag: function(dx,dy){ F.x+=dx; F.w-=dx; F.h+=dy; }},
    {cls:'bc', onDrag: function(dx,dy){ F.h+=dy; }},
    {cls:'br', onDrag: function(dx,dy){ F.w+=dx; F.h+=dy; }},
  ];
  var MIN_SZ = 80;
  pifFrame.querySelectorAll('.pif-hdl').forEach(function(hdl){
    var cls = hdl.className.replace('pif-hdl ','').trim();
    var def = hdlDefs.find(function(d){ return d.cls===cls; });
    if(!def) return;
    hdl.addEventListener('mousedown', function(e){
      e.preventDefault(); e.stopPropagation();
      var sx=e.clientX, sy=e.clientY;
      var ox=F.x, oy=F.y, ow=F.w, oh=F.h;
      function mm(e2){
        F.x=ox; F.y=oy; F.w=ow; F.h=oh;
        def.onDrag(e2.clientX-sx, e2.clientY-sy);
        F.w=Math.max(MIN_SZ,F.w); F.h=Math.max(MIN_SZ,F.h);
        applyFrame();
      }
      function mu(){ document.removeEventListener('mousemove',mm); document.removeEventListener('mouseup',mu); }
      document.addEventListener('mousemove',mm); document.addEventListener('mouseup',mu);
    });
  });
})();

// ═══════════════════════════════════════
// SNAP MARKERS (+) ระหว่างคลิปชนกัน
// ═══════════════════════════════════════
// S.transitions = {clipId: effectName}  เก็บ transition ที่ใส่แต่ละรอยต่อ
S.transitions = {};

function updateSnapMarkers(){
  var track = document.getElementById('tr-v1');
  // ลบ markers เก่า
  document.querySelectorAll('.snap-marker').forEach(function(m){ m.remove(); });

  var clips = Array.from(track.querySelectorAll('.clip'));
  if(clips.length < 2) return;
  clips.sort(function(a,b){ return parseFloat(a.style.left)-parseFloat(b.style.left); });

  var ps = pxSec();

  for(var i=0;i<clips.length-1;i++){
    var a = clips[i], b = clips[i+1];
    var aRight = parseFloat(a.style.left) + parseFloat(a.style.width);
    var bLeft  = parseFloat(b.style.left);
    var gapSec = Math.abs(bLeft - aRight) / ps;

    if(gapSec < 0.15){
      // วาง marker ตรงรอยต่อ — ใช้ position ใน track โดยตรง
      var m = document.createElement('div');
      m.className = 'snap-marker';
      // left ตรงกับ aRight ซึ่งเป็น pixel ใน track
      m.style.left = aRight + 'px';
      m.dataset.atcid = a.dataset.cid;
      m.dataset.trans = S.transitions[a.dataset.cid] || '';
      if(S.transitions[a.dataset.cid]) m.classList.add('has-trans');

      var dot = document.createElement('div');
      dot.className = 'snap-dot';
      dot.textContent = S.transitions[a.dataset.cid] ? '✦' : '+';
      dot.title = S.transitions[a.dataset.cid]
        ? 'Transition: '+S.transitions[a.dataset.cid]+' (คลิกเพื่อลบ)'
        : 'คลิกเพื่อเพิ่ม Transition หรือลาก Effect มาวาง';
      m.appendChild(dot);

      // Drop
      m.addEventListener('dragover', function(e){ e.preventDefault(); m.classList.add('drop-hover'); });
      m.addEventListener('dragleave', function(){ m.classList.remove('drop-hover'); });
      m.addEventListener('drop', function(e){
        e.preventDefault(); m.classList.remove('drop-hover');
        var fx = e.dataTransfer.getData('fx-trans');
        if(!fx) return;
        S.transitions[m.dataset.atcid] = fx;
        transEffect = fx;
        document.getElementById('trans-sel').value = fx.replace('dissolve','fade');
        m.classList.add('has-trans');
        dot.textContent='✦'; dot.title='Transition: '+fx+' (คลิกเพื่อลบ)';
        showToast('✨ ใส่ '+fx+' ที่รอยต่อแล้ว');
        updateSnapMarkers();
      });

      // Click toggle
      dot.addEventListener('click', function(e){
        e.stopPropagation();
        var cid = m.dataset.atcid;
        if(S.transitions[cid]){
          delete S.transitions[cid];
          m.classList.remove('has-trans');
          dot.textContent='+';
          dot.title='คลิกเพื่อเพิ่ม Transition';
          showToast('🗑 ลบ Transition แล้ว');
        } else {
          var fx = transEffect || 'fade';
          S.transitions[cid] = fx;
          m.classList.add('has-trans');
          dot.textContent='✦';
          dot.title='Transition: '+fx+' (คลิกเพื่อลบ)';
          showToast('✨ ใส่ '+fx+' — คลิกอีกทีเพื่อลบ');
        }
        updateSnapMarkers();
      });

      // วาง marker ใน track โดยตรง
      track.appendChild(m);
    }
  }
}

// อัปเดต snap markers ทุกครั้งที่ clip ขยับ (ลด delay เหลือ 30ms)
var _snapTimer=null;
function scheduleSnapUpdate(){
  clearTimeout(_snapTimer);
  _snapTimer=setTimeout(updateSnapMarkers, 30);
}
// เรียกทันทีตอนปล่อยเมาส์
function snapUpdateNow(){ clearTimeout(_snapTimer); updateSnapMarkers(); }

// ═══════════════════════════════════════
// FX TRANSITION LIBRARY — แผงซ้าย
// ═══════════════════════════════════════
var FX_LIST = [
  {id:'fade',      name:'Fade',       desc:'ค่อยๆ เข้า/ออก', ico:'🌅'},
  {id:'wipe',      name:'Wipe',       desc:'ปัดซ้ายขวา',      ico:'➡'},
  {id:'dissolve',  name:'Dissolve',   desc:'ละลายเข้ากัน',    ico:'💧'},
  {id:'zoom',      name:'Zoom In',    desc:'ซูมเข้า',          ico:'🔍'},
  {id:'slide-up',  name:'Slide Up',   desc:'เลื่อนขึ้น',       ico:'⬆'},
  {id:'slide-dn',  name:'Slide Down', desc:'เลื่อนลง',         ico:'⬇'},
  {id:'flash',     name:'Flash',      desc:'กะพริบขาว',        ico:'⚡'},
  {id:'blur',      name:'Blur',       desc:'เบลอเปลี่ยน',      ico:'🌫'},
  {id:'spin',      name:'Spin',       desc:'หมุน',              ico:'🌀'},
  {id:'none',      name:'ตัดตรง',     desc:'ไม่มี effect',      ico:'⬛'},
];
(function(){
  var grid = document.getElementById('fx-trans-grid');
  if(!grid) return;
  FX_LIST.forEach(function(fx){
    var card = document.createElement('div');
    card.className = 'fx-trans-card';
    card.draggable = true;
    card.dataset.fx = fx.id;
    card.innerHTML =
      '<span class="fx-trans-ico">'+fx.ico+'</span>'+
      '<div class="fx-trans-name">'+fx.name+'</div>'+
      '<div class="fx-trans-desc">'+fx.desc+'</div>';
    // Drag start → set fx-trans data
    card.addEventListener('dragstart', function(e){
      e.dataTransfer.setData('fx-trans', fx.id);
      e.dataTransfer.setData('type','fx-trans');
      card.classList.add('dragging');
    });
    card.addEventListener('dragend', function(){ card.classList.remove('dragging'); });
    // Double click → apply to all joints
    card.addEventListener('dblclick', function(){
      transEffect = fx.id;
      var sel = document.getElementById('trans-sel');
      if(sel) sel.value = fx.id==='dissolve'?'fade':fx.id;
      // apply to all existing joints
      var track = document.getElementById('tr-v1');
      var clips = Array.from(track.querySelectorAll('.clip'));
      clips.sort(function(a,b){return parseFloat(a.style.left)-parseFloat(b.style.left);});
      for(var i=0;i<clips.length-1;i++){
        var aRight=parseFloat(clips[i].style.left)+parseFloat(clips[i].style.width);
        var bLeft=parseFloat(clips[i+1].style.left);
        if(Math.abs(bLeft-aRight)<8){
          if(fx.id==='none') delete S.transitions[clips[i].dataset.cid];
          else S.transitions[clips[i].dataset.cid]=fx.id;
        }
      }
      showToast('✨ ใส่ '+fx.name+' ทุกรอยต่อ');
      updateSnapMarkers();
    });
    grid.appendChild(card);
  });
})();

// ═══════════════════════════════════════
// TEXT EDITOR — เพิ่มข้อความบน preview
// ═══════════════════════════════════════
var TXT = { layers:[], nid:1, selId:null, styles:{bold:false,italic:false,bg:false,stroke:false,shadow:false}, align:'left' };

// TEXT PRESETS
var TXT_PRESETS = {
  title:   { text:'Title ใหญ่', size:52, color:'#ffffff', bold:true,  italic:false, bg:false, stroke:true,  shadow:true,  x:50, y:30, align:'center' },
  subtitle:{ text:'Subtitle', size:28, color:'#eeeeee', bold:false, italic:false, bg:false, stroke:false, shadow:true,  x:50, y:55, align:'center' },
  lower3:  { text:'ชื่อ — ตำแหน่ง', size:22, color:'#ffffff', bold:true,  italic:false, bg:true,  stroke:false, shadow:false, x:5,  y:80, align:'left'   },
  caption: { text:'คำบรรยาย', size:18, color:'#ffffff', bold:false, italic:true,  bg:false, stroke:false, shadow:true,  x:50, y:90, align:'center' },
};

document.querySelectorAll('.txt-preset-btn').forEach(function(btn){
  // คลิก → เพิ่มที่ playhead ทันที
  btn.addEventListener('click', function(){
    var p = TXT_PRESETS[btn.dataset.preset];
    if(!p) return;
    applyPresetUI(p);
    addTextLayer(p);
  });

  // ทำให้ drag ได้
  btn.setAttribute('draggable', 'true');
  btn.style.cursor = 'grab';

  btn.addEventListener('dragstart', function(e){
    e.dataTransfer.setData('text/plain', btn.dataset.preset);
    e.dataTransfer.effectAllowed = 'copy';
    btn.style.opacity = '0.5';
  });
  btn.addEventListener('dragend', function(){
    btn.style.opacity = '1';
  });
});

function applyPresetUI(p){
  document.getElementById('txt-input').value = p.text;
  document.getElementById('txt-size').value  = p.size;
  document.getElementById('txt-size-v').textContent = p.size;
  document.getElementById('txt-color').value = p.color;
  TXT.styles.bold   = p.bold;   TXT.styles.italic = p.italic;
  TXT.styles.bg     = p.bg;     TXT.styles.stroke = p.stroke;
  TXT.styles.shadow = p.shadow; TXT.align = p.align;
  updateStyleBtns(); updateAlignBtns();
}

// Drop preset บน timeline → เพิ่ม text layer ที่เวลาที่ drop
(function(){
  var tlInner = document.getElementById('tl-inner');
  if(!tlInner) return;

  tlInner.addEventListener('dragover', function(e){
    if(!e.dataTransfer.types.includes('text/plain')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    // แสดง ghost line
    var sc = document.getElementById('tl-scroll');
    var r = sc.getBoundingClientRect();
    var x = e.clientX - r.left + sc.scrollLeft;
    var ghost = document.getElementById('txt-drop-ghost');
    if(!ghost){
      ghost = document.createElement('div');
      ghost.id = 'txt-drop-ghost';
      ghost.style.cssText = 'position:absolute;top:0;width:2px;height:100%;background:var(--acc);pointer-events:none;z-index:99;opacity:.7;';
      tlInner.appendChild(ghost);
    }
    ghost.style.left = x + 'px';
  });

  tlInner.addEventListener('dragleave', function(e){
    var ghost = document.getElementById('txt-drop-ghost');
    if(ghost) ghost.remove();
  });

  tlInner.addEventListener('drop', function(e){
    e.preventDefault();
    var presetKey = e.dataTransfer.getData('text/plain');
    var p = TXT_PRESETS[presetKey];
    if(!p) return;

    // คำนวณเวลาจากตำแหน่ง drop
    var sc = document.getElementById('tl-scroll');
    var r = sc.getBoundingClientRect();
    var x = e.clientX - r.left + sc.scrollLeft;
    var dropTime = Math.max(0, x / pxSec());

    // ลบ ghost
    var ghost = document.getElementById('txt-drop-ghost');
    if(ghost) ghost.remove();

    // apply UI settings
    applyPresetUI(p);

    // เพิ่ม layer ที่เวลา dropTime — seek playhead ไปด้วย
    var ph = document.getElementById('tl-ph');
    if(ph) ph.style.left = (dropTime * pxSec()) + 'px';
    var pClone = Object.assign({}, p, { tIn: dropTime, tOut: dropTime + 3 });
    addTextLayer(pClone);
    showToast('✅ วางข้อความที่ ' + dropTime.toFixed(1) + 's — ลากขอบขวาเพื่อยืดระยะ');
  });
})();

// Style toggle buttons
document.querySelectorAll('.txt-style-btn').forEach(function(btn){
  btn.addEventListener('click', function(){
    var s = btn.dataset.style;
    TXT.styles[s] = !TXT.styles[s];
    btn.classList.toggle('on', TXT.styles[s]);
    if(TXT.selId) updateSelectedLayer();
  });
});
function updateStyleBtns(){
  ['bold','italic','bg','stroke','shadow'].forEach(function(s){
    var btn = document.getElementById('ts-'+s);
    if(btn) btn.classList.toggle('on', TXT.styles[s]);
  });
}

// Align buttons
document.querySelectorAll('.txt-align-btn').forEach(function(btn){
  btn.addEventListener('click', function(){
    document.querySelectorAll('.txt-align-btn').forEach(function(b){b.classList.remove('on');});
    btn.classList.add('on'); TXT.align = btn.dataset.align;
    if(TXT.selId) updateSelectedLayer();
  });
});
function updateAlignBtns(){
  document.querySelectorAll('.txt-align-btn').forEach(function(b){
    b.classList.toggle('on', b.dataset.align === TXT.align);
  });
}

// Size / Alpha live update
document.getElementById('txt-size').addEventListener('input', function(){
  document.getElementById('txt-size-v').textContent = this.value;
  if(TXT.selId) updateSelectedLayer();
});
document.getElementById('txt-alpha').addEventListener('input', function(){
  document.getElementById('txt-alpha-v').textContent = this.value+'%';
  if(TXT.selId) updateSelectedLayer();
});
['txt-color','txt-bg','txt-stroke'].forEach(function(id){
  document.getElementById(id).addEventListener('input', function(){
    if(TXT.selId) updateSelectedLayer();
  });
});
document.getElementById('txt-input').addEventListener('input', function(){
  if(TXT.selId) updateSelectedLayer();
});
document.getElementById('txt-font').addEventListener('change', function(){
  if(TXT.selId) updateSelectedLayer();
});

// Load font from device
document.getElementById('btn-load-font').addEventListener('click', function(){
  document.getElementById('fi-font').click();
});
document.getElementById('fi-font').addEventListener('change', function(){
  Array.from(this.files).forEach(function(f){
    var url = URL.createObjectURL(f);
    var name = f.name.replace(/\.[^.]+$/,'').replace(/[-_]/g,' ');
    var face = new FontFace(name, 'url('+url+')');
    face.load().then(function(loaded){
      document.fonts.add(loaded);
      // Add to select
      var opt = document.createElement('option');
      opt.value = name+',sans-serif'; opt.textContent = '📂 '+name;
      document.getElementById('txt-font').appendChild(opt);
      document.getElementById('txt-font').value = name+',sans-serif';
      // Show badge
      var badge = document.createElement('div');
      badge.className = 'font-badge on'; badge.textContent = name;
      document.getElementById('loaded-fonts').appendChild(badge);
      showToast('✅ โหลดฟอนต์ '+name+' แล้ว!');
    }).catch(function(){ showToast('❌ โหลดฟอนต์ไม่ได้: '+f.name); });
  });
});

// ADD TEXT
document.getElementById('btn-add-text').addEventListener('click', function(){
  var txt = document.getElementById('txt-input').value.trim();
  if(!txt){ showToast('⚠️ กรุณาพิมพ์ข้อความก่อน'); return; }
  var wr = document.getElementById('prev-wrap');
  if(!wr || wr.style.display==='none'){ showToast('⚠️ เปิดวิดีโอก่อน'); return; }
  addTextLayer({ text:txt, x:50, y:50, align:TXT.align });
});

function addTextLayer(preset){
  var wr = document.getElementById('prev-wrap');
  var W = wr.offsetWidth, H = wr.offsetHeight;
  var id = 'txt'+TXT.nid++;
  var txt = preset.text || document.getElementById('txt-input').value || 'ข้อความ';
  var size = preset.size || parseInt(document.getElementById('txt-size').value);
  var color = preset.color || document.getElementById('txt-color').value;
  var fontFam = document.getElementById('txt-font').value;
  var alpha = parseInt(document.getElementById('txt-alpha').value)/100;
  var bold   = (preset.bold!==undefined)   ? preset.bold   : TXT.styles.bold;
  var italic = (preset.italic!==undefined) ? preset.italic : TXT.styles.italic;
  var useBg  = (preset.bg!==undefined)     ? preset.bg     : TXT.styles.bg;
  var stroke = (preset.stroke!==undefined) ? preset.stroke : TXT.styles.stroke;
  var shadow = (preset.shadow!==undefined) ? preset.shadow : TXT.styles.shadow;
  var bgColor = document.getElementById('txt-bg').value;
  var strokeColor = document.getElementById('txt-stroke').value;
  var align  = preset.align || TXT.align;
  // position %
  var xp = (preset.x!==undefined) ? preset.x : 50;
  var yp = (preset.y!==undefined) ? preset.y : 50;
  var x = Math.floor((xp/100)*W);
  var y = Math.floor((yp/100)*H);

  // tIn/tOut = เวลา global ที่ text จะปรากฏ (default = playhead ถึง +3 วินาที)
  var ph = document.getElementById('tl-ph');
  var ps0 = pxSec();
  var gtNow = ph ? (parseFloat(ph.style.left)||0)/ps0 : 0;
  var layerTIn  = preset.tIn  !== undefined ? preset.tIn  : gtNow;
  var layerTOut = preset.tOut !== undefined ? preset.tOut : gtNow + 3;

  var layer = { id:id, text:txt, x:x, y:y, size:size, color:color, fontFam:fontFam,
                alpha:alpha, bold:bold, italic:italic, bg:useBg, bgColor:bgColor,
                stroke:stroke, strokeColor:strokeColor, shadow:shadow, align:align,
                w:0, h:0, tIn:layerTIn, tOut:layerTOut };
  TXT.layers.push(layer);
  renderTextLayer(layer);
  renderTextLayerList();
  renderTextTrack();
  selectTextLayer(id);
  showToast('✅ เพิ่มข้อความแล้ว ลากเพื่อย้ายตำแหน่ง');
}

function renderTextLayer(layer){
  var container = document.getElementById('txt-overlay-container');
  // remove old
  var old = document.getElementById('tl-'+layer.id);
  if(old) old.remove();

  var el = document.createElement('div');
  el.id = 'tl-'+layer.id;
  el.className = 'txt-overlay';
  el.dataset.tid = layer.id;
  el.contentEditable = false;
  el.textContent = layer.text;

  applyLayerStyle(el, layer);
  container.style.pointerEvents = 'all';

  // Drag to move
  el.addEventListener('mousedown', function(e){
    if(e.target.classList.contains('txt-hdl')) return;
    e.preventDefault(); e.stopPropagation();
    selectTextLayer(layer.id);
    var sx=e.clientX, sy=e.clientY, ox=layer.x, oy=layer.y;
    var wr=document.getElementById('prev-wrap');
    function mm(e2){
      layer.x=Math.max(0,Math.min(wr.offsetWidth-30,ox+e2.clientX-sx));
      layer.y=Math.max(0,Math.min(wr.offsetHeight-10,oy+e2.clientY-sy));
      el.style.left=layer.x+'px'; el.style.top=layer.y+'px';
    }
    function mu(){document.removeEventListener('mousemove',mm);document.removeEventListener('mouseup',mu);}
    document.addEventListener('mousemove',mm); document.addEventListener('mouseup',mu);
  });

  // Double click = edit text
  el.addEventListener('dblclick', function(e){
    e.stopPropagation();
    el.contentEditable = true;
    el.focus();
    el.style.cursor='text';
  });
  el.addEventListener('blur', function(){
    el.contentEditable=false; el.style.cursor='move';
    layer.text = el.textContent;
    renderTextLayerList();
  });

  container.appendChild(el);
}

function applyLayerStyle(el, layer){
  var alpha = layer.alpha||1;
  el.style.cssText = [
    'position:absolute',
    'left:'+layer.x+'px',
    'top:'+layer.y+'px',
    'font-size:'+layer.size+'px',
    'font-family:'+layer.fontFam,
    'color:'+hexToRgba(layer.color,alpha),
    'font-weight:'+(layer.bold?'bold':'normal'),
    'font-style:'+(layer.italic?'italic':'normal'),
    'text-align:'+layer.align,
    'background:'+(layer.bg?hexToRgba(layer.bgColor,0.7):'transparent'),
    'padding:'+(layer.bg?'3px 8px':'0'),
    'border-radius:'+(layer.bg?'4px':'0'),
    'text-shadow:'+(layer.shadow?'2px 2px 4px rgba(0,0,0,0.8),0 0 8px rgba(0,0,0,0.5)':'none'),
    '-webkit-text-stroke:'+(layer.stroke?'1px '+layer.strokeColor:'0'),
    'cursor:move',
    'z-index:18',
    'min-width:30px',
    'line-height:1.3',
    'user-select:none',
  ].join(';');
  // border for selection
  if(TXT.selId===layer.id) el.style.border='1.5px solid #f5c518';
  else el.style.border='1.5px solid transparent';
}

function selectTextLayer(id){
  TXT.selId = id;
  var layer = TXT.layers.find(function(l){return l.id===id;});
  if(!layer) return;
  // Update UI to match layer
  document.getElementById('txt-input').value = layer.text;
  document.getElementById('txt-size').value  = layer.size;
  document.getElementById('txt-size-v').textContent = layer.size;
  document.getElementById('txt-color').value = layer.color;
  document.getElementById('txt-font').value  = layer.fontFam;
  document.getElementById('txt-alpha').value = Math.round((layer.alpha||1)*100);
  document.getElementById('txt-alpha-v').textContent = Math.round((layer.alpha||1)*100)+'%';
  document.getElementById('txt-bg').value    = layer.bgColor||'#000000';
  document.getElementById('txt-stroke').value= layer.strokeColor||'#000000';
  TXT.styles.bold=layer.bold; TXT.styles.italic=layer.italic;
  TXT.styles.bg=layer.bg; TXT.styles.stroke=layer.stroke; TXT.styles.shadow=layer.shadow;
  TXT.align=layer.align;
  updateStyleBtns(); updateAlignBtns();
  // highlight
  TXT.layers.forEach(function(l){
    var el=document.getElementById('tl-'+l.id);
    if(el) applyLayerStyle(el,l);
  });
  renderTextLayerList();
}

// === TEXT LAYER: คลิก preview เพิ่ม / Delete ลบ / deselect ===
(function(){
  function isTextPanelActive(){
    // เช็กว่า panel ข้อความเปิดอยู่
    var p = document.getElementById('p-text');
    return p && (p.style.display === 'flex' || p.style.display === 'block');
  }

  function bindTextActions(){
    var wrap = document.getElementById('prev-wrap');
    if(!wrap){ setTimeout(bindTextActions, 500); return; }

    wrap.addEventListener('mousedown', function(e){
      // ถ้าคลิกบน text overlay → select (จัดการโดย renderTextLayer แล้ว)
      if(e.target.closest && e.target.closest('.txt-overlay')) return;
      // ถ้า pif หรือ crop active → skip
      if(typeof S !== 'undefined' && S.cropActive) return;
      var pifOv = document.getElementById('pif-overlay');
      if(pifOv && pifOv.classList.contains('on')) return;

      if(isTextPanelActive()){
        // อยู่ใน text mode → คลิก preview = เพิ่ม text layer ที่ตำแหน่งนั้น
        var rect = wrap.getBoundingClientRect();
        var xPx = e.clientX - rect.left;
        var yPx = e.clientY - rect.top;
        var xPct = (xPx / wrap.offsetWidth) * 100;
        var yPct = (yPx / wrap.offsetHeight) * 100;
        if(typeof addTextLayer === 'function'){
          addTextLayer({ x: xPct, y: yPct });
        }
      } else {
        // ไม่ใช่ text mode → deselect text
        if(typeof TXT !== 'undefined' && TXT.selId){
          TXT.selId = null;
          document.querySelectorAll('.txt-overlay').forEach(function(el){
            el.style.border = '1.5px solid transparent';
          });
          if(typeof renderTextLayerList === 'function') renderTextLayerList();
        }
      }

      // deselect sticker ถ้าคลิกพื้นที่ว่าง (ไม่ใช่ sticker element)
      if(!e.target.closest || !e.target.closest('.stk-el')){
        if(typeof STK !== 'undefined' && STK.selId){
          STK.selId = null;
          document.querySelectorAll('.stk-el').forEach(function(el){
            el.classList.remove('sel');
          });
          if(typeof renderStickerList === 'function') renderStickerList();
        }
      }
    });
  }
  bindTextActions();

  // Delete / Backspace → ลบ text layer ที่เลือกอยู่
  document.addEventListener('keydown', function(e){
    if(e.key !== 'Delete' && e.key !== 'Backspace') return;
    // ถ้า focus อยู่ใน input/textarea → ไม่ลบ
    var tag = document.activeElement && document.activeElement.tagName;
    if(tag === 'INPUT' || tag === 'TEXTAREA') return;
    if(typeof TXT !== 'undefined' && TXT.selId){
      e.preventDefault();
      if(typeof deleteTextLayer === 'function') deleteTextLayer(TXT.selId);
    }
  });
})();


function updateSelectedLayer(){
  if(!TXT.selId) return;
  var layer = TXT.layers.find(function(l){return l.id===TXT.selId;});
  if(!layer) return;
  layer.text        = document.getElementById('txt-input').value;
  layer.size        = parseInt(document.getElementById('txt-size').value);
  layer.color       = document.getElementById('txt-color').value;
  layer.fontFam     = document.getElementById('txt-font').value;
  layer.alpha       = parseInt(document.getElementById('txt-alpha').value)/100;
  layer.bgColor     = document.getElementById('txt-bg').value;
  layer.strokeColor = document.getElementById('txt-stroke').value;
  layer.bold=TXT.styles.bold; layer.italic=TXT.styles.italic;
  layer.bg=TXT.styles.bg; layer.stroke=TXT.styles.stroke; layer.shadow=TXT.styles.shadow;
  layer.align=TXT.align;
  var el = document.getElementById('tl-'+layer.id);
  if(el){ el.textContent=layer.text; applyLayerStyle(el,layer); }
}

function renderTextLayerList(){
  var list = document.getElementById('txt-layers');
  list.innerHTML='';
  TXT.layers.forEach(function(layer){
    var item = document.createElement('div');
    item.className = 'txt-layer-item'+(TXT.selId===layer.id?' on':'');
    item.innerHTML =
      '<span style="font-size:13px;">T</span>'+
      '<span class="txt-layer-preview" style="font-size:11px;color:var(--tx);">'+layer.text.substring(0,28)+'</span>'+
      '<button class="txt-layer-del" data-tid="'+layer.id+'">✕</button>';
    item.addEventListener('click', function(e){
      if(e.target.dataset.tid) return;
      selectTextLayer(layer.id);
    });
    item.querySelector('.txt-layer-del').addEventListener('click', function(e){
      e.stopPropagation();
      deleteTextLayer(layer.id);
    });
    list.appendChild(item);
  });
}

function deleteTextLayer(id){
  var el = document.getElementById('tl-'+id);
  if(el) el.remove();
  TXT.layers = TXT.layers.filter(function(l){return l.id!==id;});
  if(TXT.selId===id) TXT.selId=null;
  renderTextLayerList();
  renderTextTrack();
  showToast('🗑 ลบข้อความแล้ว');
}


// ─── TEXT TRACK — แสดง text layers บน timeline ───
function renderTextTrack(){
  var track = document.getElementById('tr-t') || document.getElementById('tr-f');
  if(!track) return;
  // ลบ text clip เก่าออก
  track.querySelectorAll('.txt-tl-clip').forEach(function(el){ el.remove(); });
  var ps = pxSec();
  TXT.layers.forEach(function(layer){
    var tIn  = layer.tIn  || 0;
    var tOut = layer.tOut || (tIn + 3);
    var el = document.createElement('div');
    el.className = 'txt-tl-clip';
    el.dataset.lid = layer.id;
    el.style.cssText = [
      'position:absolute',
      'left:'+(tIn*ps)+'px',
      'width:'+Math.max(20,(tOut-tIn)*ps)+'px',
      'top:3px','height:calc(100% - 6px)',
      'background:rgba(245,197,24,0.35)',
      'border:1.5px solid var(--acc)',
      'border-radius:4px',
      'cursor:pointer',
      'display:flex','align-items:center',
      'padding:0 6px',
      'font-size:10px','color:#fff',
      'overflow:hidden','white-space:nowrap',
      'user-select:none','box-sizing:border-box',
    ].join(';');
    el.textContent = '✏ '+layer.text.substring(0,20);

    // คลิก → select layer
    el.addEventListener('mousedown', function(e){
      e.stopPropagation();
      if(typeof selectTextLayer === 'function') selectTextLayer(layer.id);
    });

    // ลาก clip ซ้าย-ขวา เพื่อย้ายเวลา
    el.addEventListener('mousedown', function(e){
      if(e.target.classList.contains('txt-tl-resize')) return;
      var startX = e.clientX;
      var startTIn = layer.tIn || 0;
      var dur = (layer.tOut||0) - startTIn;
      function onMove(e2){
        var dx = e2.clientX - startX;
        var dt = dx / pxSec();
        layer.tIn  = Math.max(0, startTIn + dt);
        layer.tOut = layer.tIn + dur;
        el.style.left = (layer.tIn * pxSec()) + 'px';
      }
      function onUp(){
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        renderTextTrack();
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });

    // handle ขวา = resize tOut
    var rhdl = document.createElement('div');
    rhdl.className = 'txt-tl-resize';
    rhdl.style.cssText = 'position:absolute;right:0;top:0;width:8px;height:100%;cursor:ew-resize;background:rgba(255,255,255,0.2);';
    rhdl.addEventListener('mousedown', function(e){
      e.stopPropagation();
      var startX = e.clientX;
      var startTOut = layer.tOut || (layer.tIn + 3);
      function onMove(e2){
        var dx = e2.clientX - startX;
        var dt = dx / pxSec();
        layer.tOut = Math.max(layer.tIn + 0.2, startTOut + dt);
        el.style.width = Math.max(20,(layer.tOut - layer.tIn)*pxSec())+'px';
      }
      function onUp(){
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        renderTextTrack();
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
    el.appendChild(rhdl);

    // ลาก clip ข้าม track (vertical) — track เปลี่ยน tIn offset
    el.addEventListener('mousedown', function(e){
      if(e.target === rhdl) return;
      e.stopPropagation();
      selectTextLayer(layer.id);
      var startX = e.clientX;
      var startTIn = layer.tIn || 0;
      var dur = (layer.tOut || startTIn+3) - startTIn;
      var moved = false;
      function onMove(e2){
        moved = true;
        var dx = e2.clientX - startX;
        var dt = dx / pxSec();
        layer.tIn  = Math.max(0, startTIn + dt);
        layer.tOut = layer.tIn + dur;
        el.style.left = (layer.tIn * pxSec()) + 'px';
      }
      function onUp(){
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        if(moved) renderTextTrack();
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });

    track.appendChild(el);
  });
}
function hexToRgba(hex,alpha){
  try{
    var r=parseInt(hex.slice(1,3),16);
    var g=parseInt(hex.slice(3,5),16);
    var b=parseInt(hex.slice(5,7),16);
    return 'rgba('+r+','+g+','+b+','+(alpha||1)+')';
  }catch(e){return hex;}
}
function openExp(){document.getElementById('exp-bg').classList.add('show');}
document.getElementById('btn-exp').addEventListener('click',openExp);
document.getElementById('exp-cancel').addEventListener('click',function(){document.getElementById('exp-bg').classList.remove('show');});
document.getElementById('exp-bg').addEventListener('click',function(e){if(e.target===this)this.classList.remove('show');});
document.querySelectorAll('.em-ar').forEach(function(el){
  el.addEventListener('click',function(){
    document.querySelectorAll('.em-ar').forEach(function(o){o.classList.remove('on');});
    el.classList.add('on');
  });
});
document.querySelectorAll('.em-res').forEach(function(b){
  b.addEventListener('click',function(){
    document.querySelectorAll('.em-res').forEach(function(x){x.classList.remove('on');});
    b.classList.add('on');S.expRes=b.dataset.eres;
  });
});
document.getElementById('btn-share').addEventListener('click',function(){
  var url=window.location.href.split('?')[0];
  if(navigator.clipboard){navigator.clipboard.writeText(url).then(function(){showToast('🔗 คัดลอกลิ้งแล้ว!');});}
  else{prompt('คัดลอกลิ้ง:',url);}
});
document.getElementById('btn-undo').addEventListener('click',function(){showToast('↩ ย้อนกลับ');});
document.getElementById('btn-redo').addEventListener('click',function(){showToast('↪ ทำซ้ำ');});

// ═══════════════════════════════════════
// EXPORT — รวมทุกคลิปในไทม์ไลน์แล้วดาวน์โหลด
// ═══════════════════════════════════════
document.getElementById('exp-go').addEventListener('click', async function(){
  buildQueue();
  if(!playQueue.length){ showToast('⚠️ ลากวิดีโอมาใส่ไทม์ไลน์ก่อน'); return; }
  var btn=this; btn.disabled=true; btn.textContent='⏳ กำลังโหลด FFmpeg...';
  var ok=await loadFFmpeg();
  if(!ok){ btn.disabled=false; btn.textContent='🚀 เริ่มรวมและส่งออก'; return; }

  var epw=document.getElementById('ep-wrap'); epw.style.display='block';
  var epf=document.getElementById('ep-fill'); epf.style.width='0';
  var eps=document.getElementById('ep-stat');
  var dl=document.getElementById('exp-dl');
  dl.style.display='none';
  btn.textContent='⏳ กำลังรวมวิดีโอ...';

  var steps=document.getElementById('exp-steps');
  var stepList=document.getElementById('exp-step-list');
  steps.style.display='block'; stepList.innerHTML='';
  playQueue.forEach(function(qItem,i){
    var div=document.createElement('div');
    div.id='exp-step-'+i;
    div.style.cssText='padding:4px 8px;background:var(--p2);border-radius:5px;font-size:11px;color:var(--tx2);border:1px solid var(--bd2);';
    div.textContent='⏳ ('+(i+1)+') '+qItem.entry.name;
    stepList.appendChild(div);
  });

  var fmtV=document.getElementById('exp-fmt').value;
  var isAudioOnly=(fmtV==='mp3'||fmtV==='aac');
  var outExt=fmtV==='webm'?'webm':fmtV==='mp3'?'mp3':fmtV==='aac'?'aac':'mp4';
  var crf=document.getElementById('exp-q').value;
  var resEl=document.querySelector('.em-res.on');
  var res=resEl?resEl.dataset.eres:'1280x720';
  var earEl=document.querySelector('.em-ar.on');
  var ear=earEl?earEl.dataset.ear:'16:9';
  var cropMap={'9:16':'scale=ih*9/16:ih,crop=ih*9/16:ih','1:1':'crop=min(iw\\,ih):min(iw\\,ih)','4:3':'scale=iw:iw*3/4,crop=iw:iw*3/4','4:5':'scale=iw:iw*5/4,crop=iw:iw*5/4'};

  var allSegData = []; // เก็บ ArrayBuffer ของแต่ละ seg

  // คำนวณ output resolution สำหรับใช้ทั่วทั้ง export
  var _expResParts = (res||'1280x720').split('x');
  var _expResW = parseInt(_expResParts[0])||1280;
  var _expResH = parseInt(_expResParts[1])||720;
  var tw, th; // declare ที่ outer scope เพื่อให้ waveform burn ใช้ได้
  if(ear==='9:16'||ear==='4:5'){ tw=_expResH; th=_expResW; }
  else { tw=_expResW; th=_expResH; }
  if(tw%2!==0) tw--; if(th%2!==0) th--;

  try{
    for(var i=0;i<playQueue.length;i++){
      var qItem=playQueue[i];
      var entry=qItem.entry; var c=qItem.c;
      var stepEl=document.getElementById('exp-step-'+i);
      if(stepEl){ stepEl.style.color='var(--acc)'; stepEl.textContent='⚙️ ('+(i+1)+'/'+playQueue.length+') '+entry.name; }

      epf.style.width=Math.round((i/playQueue.length)*80)+'%';
      eps.textContent='⚙️ encode ('+(i+1)+'/'+playQueue.length+'): '+entry.name;

      var srcExt=entry.file.name.split('.').pop().toLowerCase()||'mp4';
      var inN='cin_'+i+'.'+srcExt;
      var segN='seg_'+i+'.mp4';

      var ps=pxSec();
      var totalFilePx = entry.dur * ps;
      var tIn  = (c.tIn  !== undefined) ? c.tIn  : 0;
      var tOut = (c.tOut !== undefined) ? c.tOut : entry.dur;
      if(tIn === 0 && tOut === entry.dur && c.w < totalFilePx - 1){
        var ratio = c.w / totalFilePx;
        tOut = Math.min(entry.dur, tIn + entry.dur * ratio);
      }
      var clipDurSec = Math.max(0.1, tOut - tIn);

      // tw, th คำนวณที่ outer scope แล้ว ใช้ได้เลย

      var isImageClip = (entry.type === 'image');
      var args = [];

      if(isImageClip){
        // ── IMAGE CLIP: สร้าง video จากภาพนิ่ง ──
        args.push('-loop','1');
        args.push('-i', inN);
        args.push('-t', clipDurSec.toFixed(3));
        if(!isAudioOnly){
          // scale แล้ว pad ให้เต็มเฟรม (letterbox style ไม่ crop)
          var wr2 = document.getElementById('prev-wrap');
          var wrW2 = wr2 ? wr2.offsetWidth : tw;
          var wrH2 = wr2 ? wr2.offsetHeight : th;
          var pifF2 = window._pifF;
          var imgVf;
          if(pifF2 && pifF2.w>0 && wrW2>0 && (Math.abs(pifF2.x)>2||Math.abs(pifF2.y)>2||Math.abs(pifF2.w-wrW2)>2||Math.abs(pifF2.h-wrH2)>2)){
            var iX=Math.round(pifF2.x/wrW2*tw), iY=Math.round(pifF2.y/wrH2*th);
            var iW=Math.round(pifF2.w/wrW2*tw), iH=Math.round(pifF2.h/wrH2*th);
            if(iW%2!==0)iW--; if(iH%2!==0)iH--;
            imgVf='scale='+iW+':'+iH+',pad='+tw+':'+th+':'+Math.max(0,iX)+':'+Math.max(0,iY)+':black,setsar=1';
          } else {
            // scale ภาพให้พอดีกับ AR แล้ว pad สีดำ
            imgVf='scale='+tw+':'+th+':force_original_aspect_ratio=decrease,pad='+tw+':'+th+':(ow-iw)/2:(oh-ih)/2:black,setsar=1';
          }
          args.push('-vf', imgVf);
          args.push('-c:v','libx264','-crf',String(crf),'-preset','ultrafast','-pix_fmt','yuv420p');
          args.push('-an'); // ภาพนิ่งไม่มีเสียงต้นฉบับ
        }
        args.push(segN);
        await ffWrite(inN, entry.file);
      } else {
        // ── VIDEO CLIP ──
        if(tIn > 0.05) args.push('-ss', tIn.toFixed(3));
        args.push('-i', inN);
        args.push('-t', clipDurSec.toFixed(3));

        if(!isAudioOnly){
          var vf = 'scale='+tw+':'+th+':force_original_aspect_ratio=decrease,pad='+tw+':'+th+':(ow-iw)/2:(oh-ih)/2:black,setsar=1';

          // AR crop ถ้าเลือกไม่ใช่ 16:9
          if(ear==='1:1'){
            vf='scale='+tw+':'+th+':force_original_aspect_ratio=increase,crop='+tw+':'+th+',setsar=1';
          } else if(ear==='9:16'){
            vf='scale='+tw+':'+th+':force_original_aspect_ratio=increase,crop='+tw+':'+th+',setsar=1';
          } else if(ear==='4:3'){
            vf='scale='+tw+':'+th+':force_original_aspect_ratio=increase,crop='+tw+':'+th+',setsar=1';
          }

          // PiP (Picture-in-Frame)
          var wr = document.getElementById('prev-wrap');
          var wrW = wr ? wr.offsetWidth : tw;
          var wrH = wr ? wr.offsetHeight : th;
          var pifF = window._pifF;
          if(pifF && pifF.w>0 && wrW>0 && (Math.abs(pifF.x)>2||Math.abs(pifF.y)>2||Math.abs(pifF.w-wrW)>2||Math.abs(pifF.h-wrH)>2)){
            var pifX=Math.round(pifF.x/wrW*tw), pifY=Math.round(pifF.y/wrH*th);
            var pifW=Math.round(pifF.w/wrW*tw), pifH=Math.round(pifF.h/wrH*th);
            if(pifW%2!==0)pifW--; if(pifH%2!==0)pifH--;
            if(pifX<0||pifY<0){
              vf='scale='+pifW+':'+pifH+',crop='+tw+':'+th+':'+Math.max(0,-pifX)+':'+Math.max(0,-pifY)+',setsar=1';
            } else if(pifW<tw||pifH<th){
              vf='scale='+pifW+':'+pifH+',pad='+tw+':'+th+':'+Math.max(0,pifX)+':'+Math.max(0,pifY)+':black,setsar=1';
            } else {
              vf='scale='+pifW+':'+pifH+',crop='+tw+':'+th+':0:0,setsar=1';
            }
          }

          args.push('-vf', vf);
          args.push('-c:v','libx264','-crf',String(crf),'-preset','ultrafast','-pix_fmt','yuv420p');
          if(c.muted){ args.push('-an'); } else { args.push('-c:a','aac','-b:a','128k'); }
        } else {
          if(fmtV==='mp3') args.push('-vn','-acodec','libmp3lame','-q:a','2');
          else args.push('-vn','-acodec','aac','-b:a','192k');
        }
        args.push(segN);
        await ffWrite(inN, entry.file);
      }
      eps.textContent='⚙️ กำลัง encode ('+(i+1)+'/'+playQueue.length+'): '+entry.name+' ...';
      epf.style.width=Math.round((i/playQueue.length)*80)+'%';

      _ffmpegLib.setProgress(function(p){
        var pct = Math.round((p.ratio||0)*100);
        epf.style.width = Math.round((i/playQueue.length)*80 + pct*0.8/playQueue.length)+'%';
        eps.textContent = '⚙️ encode ('+(i+1)+'/'+playQueue.length+') '+pct+'%: '+entry.name;
      });

      await ffExec(args);
      _ffmpegLib.setProgress(function(){});

      var segData;
      try{ segData = _ffmpegLib.FS('readFile', segN); }
      catch(fsErr){ throw new Error('FS readFile ล้มเหลว ('+segN+'): '+fsErr.message); }
      if(!segData || segData.length===0){
        // ลองดูว่า ffmpeg log มีอะไร
        throw new Error('encode ได้ไฟล์ว่าง — ตรวจสอบว่าวิดีโอไม่เสียหาย หรือลองเปลี่ยน format เป็น MP4');
      }
      allSegData.push(segData.buffer);
      // cleanup waveform overlay file
      try{ _ffmpegLib.FS('unlink', 'wave_'+i+'.png'); }catch(e){}
      ffDel(inN); ffDel(segN);

      if(stepEl){ stepEl.style.color='#22c55e'; stepEl.textContent='✅ ('+(i+1)+') '+entry.name; }
      epf.style.width=Math.round(((i+1)/playQueue.length)*80)+'%';
    }

    // concat ถ้ามีหลายคลิป
    var finalN='final.'+outExt;
    eps.textContent='🔗 รวม '+allSegData.length+' คลิป...';
    epf.style.width='85%';

    var finalBuf;
    if(allSegData.length===1){
      finalBuf = allSegData[0];
    } else {
      // concat หลายคลิปด้วย v0.11 FS API
      var concatList = allSegData.map(function(_,i){ return "file 'seg_c_"+i+".mp4'"; }).join('\n');
      _ffmpegLib.FS('writeFile','concat.txt', new TextEncoder().encode(concatList));
      for(var ci=0;ci<allSegData.length;ci++){
        _ffmpegLib.FS('writeFile','seg_c_'+ci+'.mp4', new Uint8Array(allSegData[ci]));
      }
      await ffExec(['-f','concat','-safe','0','-i','concat.txt','-c','copy',finalN]);
      var concatResult = _ffmpegLib.FS('readFile', finalN);
      finalBuf = concatResult.buffer;
      ffDel('concat.txt'); ffDel(finalN);
      for(var ci2=0;ci2<allSegData.length;ci2++) ffDel('seg_c_'+ci2+'.mp4');
    }

    eps.textContent='📦 เตรียมไฟล์ดาวน์โหลด...';
    epf.style.width='95%';
    // Mix bgAudio (เพลงใน tr-a) ลงวิดีโอถ้ามี
    var audioClips = Object.values(S.clips).filter(function(c){ return c.type==='audio'; });
    if(audioClips.length > 0 && finalBuf){
      try{
        eps.textContent='🎵 Mix เสียงเพลง...'; epf.style.width='92%';
        // หา audio entry ตัวแรก
        var aClip = audioClips[0];
        var aEntry = S.files.find(function(f){ return f.id===aClip.fid; });
        if(aEntry){
          var aFileName = 'bgaudio_mix.'+aEntry.name.split('.').pop();
          var mixFinal = 'mix_final.mp4';
          // เขียน video final ลง FS
          _ffmpegLib.FS('writeFile', 'vid_premix.mp4', new Uint8Array(finalBuf));
          // เขียน audio file ลง FS
          await ffWrite(aFileName, aEntry.file);
          // calc audio offset (startSec ของ audio clip)
          var ps0 = pxSec();
          var aStart = (aClip.startSec!==undefined) ? aClip.startSec : (aClip.left/ps0);
          // mix: -itsoffset ทำให้เสียงเริ่มตรงตำแหน่ง
          var mixArgs = [
            '-i','vid_premix.mp4',
            '-itsoffset', aStart.toFixed(3),
            '-i', aFileName,
            '-c:v','copy',
            '-c:a','aac','-b:a','128k',
            '-shortest',
            mixFinal
          ];
          await ffExec(mixArgs);
          var mixResult = _ffmpegLib.FS('readFile', mixFinal);
          if(mixResult && mixResult.length > 1000){
            finalBuf = mixResult.buffer;
            console.log('[mix] bgAudio mixed OK, size:', mixResult.length);
          }
          try{ _ffmpegLib.FS('unlink','vid_premix.mp4'); }catch(e){}
          try{ _ffmpegLib.FS('unlink', aFileName); }catch(e){}
          try{ _ffmpegLib.FS('unlink', mixFinal); }catch(e){}
        }
      } catch(mixErr){
        console.warn('[mix] bgAudio mix failed, using original:', mixErr.message);
      }
    }

    // ══ WAVEFORM BURN-IN (Animated) ══
    // สร้าง PNG sequence แล้ว encode เป็น video ก่อน overlay — waveform จะเต้นได้จริง
    var waves = window.S_WAVES || [];
    if(waves.length > 0 && finalBuf){
      try{
        eps.textContent='〰️ Render waveform frames...'; epf.style.width='92%';
        var totalDurSec = calcTotalDur() || 30;
        var wFPS = 15; // 15fps สมดุลระหว่างความลื่นและขนาดไฟล์
        var totalFrames = Math.ceil(totalDurSec * wFPS);
        // จำกัดไม่เกิน 600 เฟรม (40วิ@15fps) ป้องกันหน่วย
        totalFrames = Math.min(totalFrames, 600);

        // เตรียม wave data สำหรับทุก clip
        var waveInfos = (window.S_WAVES||[]).map(function(clip){
          var style = WAVE_STYLES.find(function(s){return s.id===clip.styleId;})||WAVE_STYLES[0];
          var px=clip.pvX!==undefined?clip.pvX:5, py=clip.pvY!==undefined?clip.pvY:75;
          var pw=clip.pvW!==undefined?clip.pvW:90, ph2=clip.pvH!==undefined?clip.pvH:15;
          var x=Math.floor(px/100*tw), y=Math.floor(py/100*th);
          var w=Math.max(10,Math.floor(pw/100*tw)), h=Math.max(4,Math.floor(ph2/100*th));
          var nBars=Math.max(20,Math.floor(w/5));
          var data=genWaveData(nBars, clip.seed||1);
          var sens=clip.sensitivity!==undefined?clip.sensitivity:1.0;
          var shape=clip.shapeMode||'natural';
          return {style:style, x:x, y:y, w:w, h:h, nBars:nBars, data:data, sens:sens, shape:shape,
                  startSec:clip.startSec||0, dur:clip.dur||totalDurSec};
        });

        // render เฟรมทีละเฟรม ใช้ canvas ที่มีขนาดเท่า output
        var wCv = document.createElement('canvas');
        wCv.width = tw; wCv.height = th;
        var wCtx = wCv.getContext('2d');

        // build shape envelope helper
        function shapeEnv(shape, pos){
          if(shape==='natural')    return Math.pow(1-pos*0.55,0.7)+0.15;
          if(shape==='rise')       return 0.3+pos*0.7;
          if(shape==='fall')       return 1-pos*0.7;
          if(shape==='mountain')   return 0.3+Math.sin(pos*Math.PI)*0.7;
          if(shape==='valley')     return 0.3+(1-Math.sin(pos*Math.PI))*0.7;
          return 1;
        }

        var concatTxt = '';
        for(var fi=0; fi<totalFrames; fi++){
          var tSec = fi / wFPS; // เวลา ณ เฟรมนี้
          // ต้องเป็นสีดำล้วน (ไม่ใช่ transparent) เพราะใช้ blend=screen
          wCtx.fillStyle = '#000000';
          wCtx.fillRect(0,0,tw,th);

          waveInfos.forEach(function(wi){
            // เฟรมนี้อยู่ในช่วง wave clip ไหม
            if(tSec < wi.startSec || tSec > wi.startSec+wi.dur) return;

            // สร้าง animated bars โดยใช้ sine wave ตาม time (simulate การเต้น)
            var phase = tSec * 8; // ความถี่การเต้น
            var bars = wi.data.map(function(base, idx){
              var pos = idx / Math.max(1, wi.nBars-1);
              var env = shapeEnv(wi.shape, pos);
              // sine wave ต่างเฟสต่างแท่ง สร้าง organic movement
              var wave = Math.sin(phase + idx * 0.42) * 0.35
                       + Math.sin(phase * 1.7 + idx * 0.18) * 0.2
                       + Math.sin(phase * 0.6 + idx * 0.73) * 0.15;
              var val = Math.max(0.04, Math.min(1, (base * 0.4 + wave * 0.6 + 0.1) * wi.sens * env));
              return val;
            });

            var sub = document.createElement('canvas');
            sub.width = wi.w; sub.height = wi.h;
            drawWaveAnimated(sub, wi.style, wi.data, 0, bars);
            wCtx.drawImage(sub, wi.x, wi.y, wi.w, wi.h);
          });

          // บันทึก PNG ลง FFmpeg FS
          var fname = 'wf_'+String(fi).padStart(5,'0')+'.png';
          var pngData = dataURLtoUint8Array(wCv.toDataURL('image/png'));
          _ffmpegLib.FS('writeFile', fname, pngData);
          concatTxt += "file '" + fname + "'\nduration " + (1/wFPS).toFixed(6) + "\n";

          // อัปเดต progress ทุก 30 เฟรม
          if(fi % 30 === 0){
            epf.style.width = Math.round(92 + fi/totalFrames * 3) + '%';
            eps.textContent = '〰️ Render frame '+fi+'/'+totalFrames+'...';
          }
        }

        eps.textContent='〰️ Encode waveform video...'; epf.style.width='95%';

        // encode PNG sequence → waveform video ขนาดเล็ก (transparent bg)
        _ffmpegLib.FS('writeFile', 'wf_list.txt', new TextEncoder().encode(concatTxt));
        await ffExec([
          '-f','concat','-safe','0','-i','wf_list.txt',
          '-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p',
          '-r', String(wFPS),
          'wwave.mp4'
        ]);

        eps.textContent='〰️ Overlay waveform...'; epf.style.width='97%';

        // overlay waveform video ทับ final video
        // ใช้ colorkey เพื่อ remove สีดำออก แล้ว overlay บน video
        // colorkey=0x000000:similarity:blend — ลบสีดำออก เหลือเฉพาะ waveform
        _ffmpegLib.FS('writeFile', 'vpw.mp4', new Uint8Array(finalBuf));
        await ffExec([
          '-i','vpw.mp4',
          '-i','wwave.mp4',
          '-filter_complex',
          '[1:v]colorkey=0x000000:0.15:0.1[wfkey];[0:v][wfkey]overlay=0:0:shortest=1[vout]',
          '-map','[vout]','-map','0:a?',
          '-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p',
          '-c:a','copy',
          'vwaved.mp4'
        ]);
        var r=_ffmpegLib.FS('readFile','vwaved.mp4');
        if(r&&r.length>10000){ finalBuf=r.buffer; console.log('[wave-anim] burned OK, frames:',totalFrames); }

        // cleanup
        for(var ci=0;ci<totalFrames;ci++){
          try{_ffmpegLib.FS('unlink','wf_'+String(ci).padStart(5,'0')+'.png');}catch(e){}
        }
        try{_ffmpegLib.FS('unlink','wf_list.txt');}catch(e){}
        try{_ffmpegLib.FS('unlink','wwave.mp4');}catch(e){}
        try{_ffmpegLib.FS('unlink','vpw.mp4');}catch(e){}
        try{_ffmpegLib.FS('unlink','vwaved.mp4');}catch(e){}
      }catch(we){ console.warn('[wave-anim] skip:',we.message||we); }
    }
    var mimeMap={'mp4':'video/mp4','webm':'video/webm','mp3':'audio/mpeg','aac':'audio/aac'};
    var blob=new Blob([finalBuf],{type:mimeMap[outExt]||'video/mp4'});
    var fname=(document.getElementById('exp-name').value||'suomsiang')+'.'+outExt;

    // วิธีดาวน์โหลด: Electron ใช้ native dialog / Browser ใช้ <a> click
    var _isElectron = (typeof window.electronAPI !== 'undefined' && window.electronAPI.isElectron);

    function triggerDownload(){
      if(_isElectron){
        // Electron: แปลง blob → ArrayBuffer แล้วส่ง main process บันทึกผ่าน dialog
        blob.arrayBuffer().then(function(ab){
          window.electronAPI.saveFile(fname, ab).then(function(res){
            if(res.ok){
              eps.textContent = '✅ บันทึกแล้วที่: ' + res.filePath;
              showToast('💾 บันทึกสำเร็จ!');
              window.electronAPI.showFile(res.filePath);
            } else {
              if(res.error) showToast('❌ ' + res.error);
            }
          });
        });
        return;
      }
      // Browser / Chrome Extension: ใช้ <a> click
      var dlUrl = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = dlUrl; a.download = fname;
      a.style.display = 'none';
      document.body.appendChild(a); a.click();
      setTimeout(function(){ document.body.removeChild(a); URL.revokeObjectURL(dlUrl); }, 5000);
    }

    // อัปเดต dl button ให้ใช้ blob ใหม่ทุกครั้งที่กด
    var _lastBlob = blob;
    var _lastFname = fname;
    dl.href = '#';
    dl.onclick = function(e){
      e.preventDefault();
      if(_isElectron){ triggerDownload(); return; }
      var freshUrl = URL.createObjectURL(_lastBlob);
      var a2 = document.createElement('a');
      a2.href = freshUrl; a2.download = _lastFname;
      a2.style.display = 'none';
      document.body.appendChild(a2); a2.click();
      setTimeout(function(){ document.body.removeChild(a2); URL.revokeObjectURL(freshUrl); }, 5000);
    };
    dl.download = fname;
    dl.textContent='⬇ ดาวน์โหลด '+fname+' ('+(blob.size/1024/1024).toFixed(1)+' MB)';
    dl.style.display='block';
    epf.style.width='100%';
    eps.textContent='✅ รวม '+playQueue.length+' คลิปสำเร็จ! ขนาด: '+(blob.size/1024/1024).toFixed(1)+' MB';
    showToast('🎉 รวมวิดีโอสำเร็จ! กดดาวน์โหลดได้เลย');

    // ดาวน์โหลดอัตโนมัติทันที
    triggerDownload();

  }catch(err){
    eps.textContent='❌ '+err.message;
    showToast('❌ Export ไม่สำเร็จ: '+err.message.substring(0,50));
    console.error('[Export]',err);
  }
  btn.disabled=false; btn.textContent='🚀 เริ่มรวมและส่งออก';
});


// ═══════════════════════════════════════
// FFMPEG v0.12 — โหลดตรงใน Extension tab
// Extension pages ได้รับ crossOriginIsolated อัตโนมัติ
// ทำให้ SharedArrayBuffer และ Worker ทำงานได้
// ═══════════════════════════════════════
var _ffmpegLib = null;  // FFmpeg instance จาก @ffmpeg/ffmpeg v0.12

async function loadFFmpeg(){
  if(_ffmpegLib) return true;
  var ov     = document.getElementById('ff-ov');
  var msg    = document.getElementById('ff-msg');
  var bar    = document.getElementById('ff-pct-bar');
  var pctTxt = document.getElementById('ff-pct-txt');
  ov.classList.add('show');

  function setMsg(m){ if(msg) msg.textContent=m; }
  function setPct(p){
    p=Math.max(0,Math.min(100,Math.round(p)));
    if(bar) bar.style.width=p+'%';
    if(pctTxt) pctTxt.textContent=p+'%';
  }

  try{
    var FFLib = window.FFmpeg;
    if(!FFLib || !FFLib.createFFmpeg)
      throw new Error('window.FFmpeg ไม่พบ');

    // detect environment: Electron, Chrome Extension, or Browser
    var _isElectronEnv = (typeof window.electronAPI !== 'undefined' && window.electronAPI.isElectron);
    var base;
    if(_isElectronEnv){
      // Electron: ไฟล์อยู่ใน app directory เดียวกับ editor.html
      base = './';
    } else if(typeof chrome!=='undefined' && chrome.runtime && chrome.runtime.getURL){
      base = chrome.runtime.getURL('');
    } else {
      base = location.origin + location.pathname.replace(/[^/]*$/, '');
    }

    // URL ของไฟล์ใน extension — chrome.runtime.getURL ทำให้ worker importScripts ได้
    var coreUrl   = base + 'ffmpeg-core.js';
    var workerUrl = base + 'ffmpeg-core.worker.js';
    var wasmUrl   = base + 'ffmpeg-core.wasm';

    // โหลด wasm พร้อม progress bar (fetch ก่อนเพื่อแสดง progress)
    setMsg('กำลังโหลด ffmpeg-core.wasm (24MB)...'); setPct(5);
    var wasmResp = await fetch(wasmUrl);
    var total = parseInt(wasmResp.headers.get('content-length') || '24000000');
    var loaded = 0; var chunks = [];
    var rdr = wasmResp.body.getReader();
    while(true){
      var chunk = await rdr.read(); if(chunk.done) break;
      chunks.push(chunk.value); loaded += chunk.value.length;
      var pct = 5 + Math.round((loaded/total)*78);
      setPct(pct);
      setMsg('โหลด wasm ' + Math.round((loaded/total)*100) + '% (' +
             Math.round(loaded/1048576) + '/' + Math.round(total/1048576) + ' MB)');
    }
    var wasmArr = new Uint8Array(loaded); var woff = 0;
    chunks.forEach(function(c){ wasmArr.set(c, woff); woff += c.length; });
    var wasmBlob  = new Blob([wasmArr], {type:'application/wasm'});
    var wasmBlobUrl = URL.createObjectURL(wasmBlob);

    setMsg('กำลัง initialize FFmpeg...'); setPct(85);

    var ff = FFLib.createFFmpeg({
      log: true,
      // corePath = chrome-extension:// URL — worker จะ importScripts(corePath) ได้
      corePath:            coreUrl,
      // workerPath = URL ของ worker script
      workerPath:          workerUrl,
      // mainScriptUrlOrBlob = URL ที่ส่งไปให้ worker ผ่าน postMessage
      // ต้องเป็น chrome-extension:// ไม่ใช่ blob: เพราะ CSP บล็อก blob: ใน worker
      mainScriptUrlOrBlob: coreUrl,
      // locateFile — ให้ wasm ใช้ blob URL ที่โหลดมาแล้ว
      locateFile: function(path, scriptDir){
        if(path.endsWith('.wasm')) return wasmBlobUrl;
        if(path.endsWith('.worker.js')) return workerUrl;
        return scriptDir + path;
      },
    });

    setMsg('กำลัง ff.load()...'); setPct(90);
    await ff.load();

    // revoke wasm blob หลัง load เสร็จ (ffmpeg copy wasm ไปแล้ว)
    setTimeout(function(){ try{ URL.revokeObjectURL(wasmBlobUrl); }catch(e){} }, 10000);

    _ffmpegLib = ff;
    ffmpeg = {_v11:true};
    setMsg('✅ พร้อมแล้ว!'); setPct(100);
    setTimeout(function(){ ov.classList.remove('show'); }, 600);
    showToast('✅ FFmpeg พร้อมส่งออกแล้ว!');
    return true;

  }catch(e){
    console.error('[loadFFmpeg]', e);
    setMsg('❌ ' + e.message); setPct(0);
    setTimeout(function(){ ov.classList.remove('show'); }, 5000);
    showToast('❌ โหลด FFmpeg ไม่สำเร็จ: ' + e.message.substring(0,50));
    return false;
  }
}
// v0.11 FS helpers
async function ffWrite(name, fileObj){
  var buf=await fileObj.arrayBuffer();
  _ffmpegLib.FS('writeFile',name,new Uint8Array(buf));
}
function ffRead(name){
  var data=_ffmpegLib.FS('readFile',name);
  return data; // Uint8Array
}
function ffDel(name){ try{_ffmpegLib.FS('unlink',name);}catch(e){} }
async function ffExec(args){
  console.log('[ffExec] running:', args.join(' '));
  var timeoutId;
  var timeoutP = new Promise(function(_,rej){
    timeoutId = setTimeout(function(){ rej(new Error('FFmpeg timeout (5 นาที) — วิดีโออาจใหญ่เกินไป')); }, 300000);
  });
  try{
    await Promise.race([ _ffmpegLib.run.apply(_ffmpegLib, args), timeoutP ]);
    clearTimeout(timeoutId);
    console.log('[ffExec] completed ok');
  }catch(e){
    clearTimeout(timeoutId);
    console.error('[ffExec] error:', e);
    throw e;
  }
}
// ส่ง run command ไปยัง sandbox และรอผล
async function sbRun(args, inputFiles, outName){
  // แปลงแต่ละไฟล์เป็น ArrayBuffer
  var filesData = await Promise.all(inputFiles.map(async function(f){
    return {name:f.name, data: await f.file.arrayBuffer()};
  }));
  var transfers = filesData.map(function(f){return f.data;});

  return new Promise(function(resolve,reject){
    var id = 'r'+(++_sbMsgId);
    _sbCallbacks[id] = {resolve:resolve, reject:reject};
    setTimeout(function(){
      if(_sbCallbacks[id]){
        delete _sbCallbacks[id];
        reject(new Error('FFmpeg timeout'));
      }
    }, 600000); // 10 นาที
    sbSend({type:'RUN', _id:id, args:args, files:filesData, outName:outName}, transfers);
  });
}


// แสดงคำแนะนำวิธีเปิดผ่าน localhost
function showFFmpegHelp(){
  var ov=document.getElementById('ff-ov');
  ov.classList.add('show');
  ov.innerHTML='<div style="background:#1e1e1e;border:1px solid #f5c518;border-radius:16px;padding:28px;max-width:480px;margin:20px;text-align:center;">'+
    '<div style="font-size:28px;margin-bottom:12px;">⚠️</div>'+
    '<div style="font-size:16px;font-weight:700;color:#f5c518;margin-bottom:10px;">FFmpeg ต้องเปิดผ่าน localhost</div>'+
    '<div style="font-size:13px;color:#888;margin-bottom:16px;line-height:1.6;">Chrome บล็อก FFmpeg เมื่อเปิดจาก <code>file://</code><br>ต้องเปิดผ่าน local server แทน</div>'+
    '<div style="background:#111;border-radius:8px;padding:12px;margin-bottom:16px;text-align:left;">'+
      '<div style="font-size:11px;color:#888;margin-bottom:6px;font-weight:600;">วิธีที่ 1 — VS Code (ง่ายที่สุด)</div>'+
      '<div style="font-size:12px;color:#e8e8e8;">1. เปิด VS Code<br>2. ติดตั้ง Extension "Live Server"<br>3. คลิกขวาที่ไฟล์ → Open with Live Server</div>'+
    '</div>'+
    '<div style="background:#111;border-radius:8px;padding:12px;margin-bottom:16px;text-align:left;">'+
      '<div style="font-size:11px;color:#888;margin-bottom:6px;font-weight:600;">วิธีที่ 2 — Command Line</div>'+
      '<div style="font-size:12px;color:#e8e8e8;font-family:monospace;">npx serve .<br>แล้วเปิด http://localhost:3000</div>'+
    '</div>'+
    '<div style="background:#111;border-radius:8px;padding:12px;margin-bottom:16px;text-align:left;">'+
      '<div style="font-size:11px;color:#888;margin-bottom:6px;font-weight:600;">วิธีที่ 3 — Python</div>'+
      '<div style="font-size:12px;color:#e8e8e8;font-family:monospace;">python -m http.server 8080<br>แล้วเปิด http://localhost:8080</div>'+
    '</div>'+
    '<button onclick="document.getElementById(\'ff-ov\').classList.remove(\'show\')" style="background:#f5c518;color:#000;border:none;padding:10px 24px;border-radius:8px;font-weight:700;cursor:pointer;font-size:14px;">✕ ปิด</button>'+
  '</div>';
}

// ═══════════════════════════════════════
// UTILS
// ═══════════════════════════════════════
function fmt(s){if(!s||isNaN(s))return'0:00.0';var m=Math.floor(s/60),sc=(s%60).toFixed(1);return m+':'+(sc<10?'0':'')+sc;}
function showToast(msg){var t=document.getElementById('toast');t.textContent=msg;t.classList.add('show');setTimeout(function(){t.classList.remove('show');},3000);}

// INIT
drawRuler();
// ตรวจว่าเปิดจาก file:// หรือไม่
// Electron ใช้ file:// แต่ทำงานได้ปกติ — ไม่แสดง warning
var _isElectronApp = (typeof window.electronAPI !== 'undefined' && window.electronAPI.isElectron);
if(window.location.protocol==='file:' && !_isElectronApp){
  var lw=document.getElementById('localhost-warn');
  if(lw){
    lw.style.display='flex';
    lw.addEventListener('click',function(){
      if(typeof chrome === 'undefined' || !chrome.runtime) showFFmpegHelp();
    });
  }
}
// ซ่อน trim markers
['tl-trim-in','tl-trim-out','tl-trim-zone'].forEach(function(id){
  var el=document.getElementById(id);
  if(el) el.style.display='none';
});
// drag-drop จาก media list ไปยัง timeline tracks
['tr-v1','tr-v2','tr-a','tr-f','tr-t'].forEach(function(id){
  var el=document.getElementById(id);
  if(el) setupTrackDrop(el);
});
// ปุ่ม "+ เพิ่มเสียง" ใน label
var lblAudio=document.getElementById('lbl-add-audio');
if(lblAudio){
  lblAudio.addEventListener('click',function(){
    var fi2=document.createElement('input');
    fi2.type='file'; fi2.accept='audio/*'; fi2.multiple=true;
    fi2.onchange=function(){addFiles(Array.from(fi2.files));};
    fi2.click();
  });
}
// fi ให้รับทั้งวิดีโอและเสียง
document.getElementById('fi').accept='video/*,audio/*';
document.getElementById('dz').querySelector('.dz-s').innerHTML=
  'คลิกหรือลากหลายไฟล์มาวาง<br><b style="color:var(--acc)">วิดีโอ MP4/MOV/AVI และเสียง MP3/WAV</b>';

// ═══════════════════════════════════════════════════════
// WAVEFORM STICKER SYSTEM — v2
// ═══════════════════════════════════════════════════════
var WAVE_STYLES = [
  { id:'bars',   name:'Bars',   ico:'📊', color:'#f5c518', bg:'transparent', desc:'แท่งกราฟ' },
  { id:'line',   name:'Line',   ico:'〰️', color:'#00e5ff', bg:'transparent', desc:'เส้นโค้ง' },
  { id:'mirror', name:'Mirror', ico:'🪞', color:'#ff4fc8', bg:'transparent', desc:'สะท้อนกลาง' },
  { id:'dots',   name:'Dots',   ico:'⠿',  color:'#7fff00', bg:'transparent', desc:'จุดกระจาย' },
  { id:'neon',   name:'Neon',   ico:'💡', color:'#ff6f00', bg:'transparent', desc:'นีออน glow' },
  { id:'circle', name:'Circle', ico:'🔵', color:'#b388ff', bg:'transparent', desc:'วงกลม' },
];
if(!window.S_WAVES) window.S_WAVES = [];

// ═══════════════════════════════════════
// WEB AUDIO ANALYSER — วิเคราะห์เสียงจริงสำหรับ waveform
// ═══════════════════════════════════════
(function(){
  var audioCtx = null;
  var analyser = null;
  var freqData = null;
  var vidSource = null;
  var bgSource  = null;
  var gainNode  = null;

  function getAudioCtx(){
    if(!audioCtx || audioCtx.state === 'closed'){
      audioCtx = new (window.AudioContext||window.webkitAudioContext)();
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.75;
      freqData = new Uint8Array(analyser.frequencyBinCount);
      gainNode = audioCtx.createGain();
      gainNode.gain.value = 0;
      analyser.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      // expose globally เพื่อให้ play() resume และ syncBgAudio เชื่อม bgAudio ได้
      window._waveAudioCtxRef = audioCtx;
      audioCtx._analyserRef = analyser; // expose analyser ด้วย
    }
    return audioCtx;
  }

  // ป้องกัน createMediaElementSource ซ้ำ (browser โยน DOMException ถ้า connect ซ้ำ)
  var _connectedElements = [];
  function isConnected(el){ return _connectedElements.indexOf(el) !== -1; }

  function connectSource(mediaEl, slotRef){
    if(isConnected(mediaEl)) return; // connect แล้ว ข้ามไป
    try{
      var ctx = getAudioCtx();
      if(ctx.state === 'suspended') ctx.resume();
      var src = ctx.createMediaElementSource(mediaEl);
      src.connect(analyser);
      // ต่อเข้า destination ด้วยเพื่อให้เสียงออก speaker ปกติ
      src.connect(ctx.destination);
      window[slotRef] = src;
      _connectedElements.push(mediaEl);
    }catch(e){
      // InvalidStateError = already connected — mark as connected and ignore
      if(e.name === 'InvalidStateError' || String(e).indexOf('already') !== -1){
        _connectedElements.push(mediaEl);
      }
      console.warn('[WaveAudio]', e.name || e);
    }
  }

  // เชื่อม vid และ bgAudio เข้า analyser (ทำครั้งเดียวต่อ element)
  var vidConnected = false;
  var bgConnected  = false;

  function ensureConnections(){
    var vidEl = document.getElementById('prev-vid');
    if(vidEl && !vidConnected && vidEl.src){
      connectSource(vidEl, '_waveVidSrc');
      vidConnected = true;
    }
    // bgAudio: ตรวจทุกครั้งว่ามี src แล้วหรือยัง (src อาจเปลี่ยนหลัง wave-play)
    if(typeof bgAudio !== 'undefined' && bgAudio.src && !bgConnected){
      connectSource(bgAudio, '_waveBgSrc');
      bgConnected = true;
    }
  }
  // expose ให้ syncBgAudio เรียกได้
  window.ensureWaveConnections = ensureConnections;

  // ฟัง play event เพื่อเชื่อม
  var vidEl2 = document.getElementById('prev-vid');
  if(vidEl2){
    vidEl2.addEventListener('play', function(){
      if(!vidConnected) ensureConnections();
    });
  }
  window.addEventListener('wave-play', function(){
    ensureConnections(); // retry ทุกครั้ง wave-play ถูก dispatch
  });

  // ฟัง canplay บน bgAudio — ตอน src พร้อมแล้วค่อย connect
  // bgAudio ถูก declare ใน outer scope ก่อน IIFE นี้
  (function retryBgConnect(){
    if(typeof bgAudio === 'undefined'){ setTimeout(retryBgConnect, 200); return; }
    bgAudio.addEventListener('canplay', function(){
      if(!bgConnected){
        connectSource(bgAudio, '_waveBgSrc');
        bgConnected = true;
      }
    });
    // ถ้า bgAudio มี src อยู่แล้ว connect เลย
    if(bgAudio.src && !bgConnected){
      connectSource(bgAudio, '_waveBgSrc');
      bgConnected = true;
    }
  })();

  // ฟังก์ชัน public: ดึง frequency bar heights (0-1) จำนวน n bars
  // sensitivity: 0.5-3.0, shapeMode: 'natural'|'flat'|'rise'|'fall'|'mountain'|'valley'
  window.getWaveFreqBars = function(n, sensitivity, shapeMode){
    if(!analyser || !freqData) return null;
    // resume AudioContext ถ้า suspended (กันกรณี autoplay policy)
    if(analyser.context && analyser.context.state === 'suspended'){
      analyser.context.resume();
    }
    analyser.getByteFrequencyData(freqData);

    // ถ้า freqData ว่างทั้งหมด (analyser ไม่ได้รับ audio) → ลอง reconnect bgAudio
    var _hasData = false;
    for(var _k=0; _k<freqData.length; _k++){ if(freqData[_k]>0){ _hasData=true; break; } }
    if(!_hasData && typeof bgAudio !== 'undefined' && bgAudio.src && !bgAudio.paused){
      // bgAudio กำลังเล่นแต่ analyser ไม่รับ — try connect
      if(!bgConnected){
        connectSource(bgAudio, '_waveBgSrc');
        bgConnected = true;
      }
    }

    var sens   = sensitivity !== undefined ? sensitivity : 1.0;
    var shape  = shapeMode || 'natural';
    var out    = [];
    var bins   = freqData.length;
    // ใช้ 70% แรก (bass + mid) — treble สุดท้ายมักเงียบและทำให้ flat
    var useBins = Math.floor(bins * 0.7);
    var step = useBins / n;

    for(var i=0;i<n;i++){
      // เฉลี่ย bin ในช่วงนี้
      var sum=0, count=0;
      for(var j=Math.floor(i*step); j<Math.floor((i+1)*step) && j<useBins; j++){
        sum += freqData[j]; count++;
      }
      // absolute normalize (255 = max possible) + sensitivity
      var raw = count>0 ? (sum/count/255) * sens : 0;

      // apply natural frequency taper: bass ดัง mid กลาง treble เบา
      // คูณ envelope ตาม position (i/n)
      var pos = i / Math.max(1, n-1);
      var env = 1;
      if(shape === 'natural'){
        // bass สูง → mid กลาง → treble ต่ำ (logarithmic feel)
        env = Math.pow(1 - pos * 0.55, 0.7) + 0.15;
      } else if(shape === 'flat'){
        env = 1;
      } else if(shape === 'rise'){
        env = 0.3 + pos * 0.7;
      } else if(shape === 'fall'){
        env = 1 - pos * 0.7;
      } else if(shape === 'mountain'){
        // peak กลาง
        env = 0.3 + Math.sin(pos * Math.PI) * 0.7;
      } else if(shape === 'valley'){
        // peak ข้างสอง ต่ำกลาง
        env = 0.3 + (1 - Math.sin(pos * Math.PI)) * 0.7;
      }

      var val = Math.min(1, Math.max(0.02, raw * env));
      out.push(val);
    }
    return out;
  };
})();


function genWaveData(n, seed){
  var d = []; var s = seed || 1;
  for(var i=0;i<n;i++){
    s = (s*9301+49297)%233280;
    d.push(0.15 + (s/233280)*0.85);
  }
  return d;
}

// วาด waveform ที่เคลื่อนไหวตาม audioTime หรือ real frequency bars
function drawWaveAnimated(canvas, style, baseData, audioTime, realBars){
  var W=canvas.width, H=canvas.height, n=baseData.length;
  var ctx=canvas.getContext('2d');
  ctx.clearRect(0,0,W,H);
  if(style.bg && style.bg !== 'transparent'){
    ctx.fillStyle=style.bg; ctx.fillRect(0,0,W,H);
  } else {
    ctx.clearRect(0,0,W,H);
  }

  var data;
  if(realBars && realBars.length > 0){
    var rb = realBars;
    // blend realBars กับ baseData เพื่อให้ยังมี natural variance
    data = baseData.map(function(base, i){
      var idx = Math.floor(i/n * rb.length);
      var real = rb[idx] || 0;
      if(real > 0.03){
        // มีเสียง: ใช้ real แต่ blend กับ base variance เล็กน้อย
        return Math.max(0.03, Math.min(1, real * 0.85 + base * real * 0.15));
      } else {
        // เงียบ: แค่ idle เล็กน้อย
        var t2 = Date.now()/1000;
        return Math.max(0.02, Math.sin(t2*1.2 + i*0.6)*0.02 + 0.03);
      }
    });
  } else {
    // ไม่มี analyser: ใช้ baseData เป็น static shape
    data = baseData.map(function(v){ return Math.max(0.03, v * 0.4); });
  }

  var c=style.color;
  if(style.id==='bars'){
    var bw=Math.max(1,W/n-1);
    for(var i=0;i<n;i++){
      var h=data[i]*H*0.9;
      var grd=ctx.createLinearGradient(0,H-h,0,H);
      grd.addColorStop(0,c); grd.addColorStop(1,c+'33');
      ctx.fillStyle=grd;
      ctx.fillRect(i*(W/n),H-h,bw,h);
    }
  } else if(style.id==='line'){
    ctx.beginPath(); ctx.strokeStyle=c; ctx.lineWidth=2.5;
    ctx.shadowBlur=4; ctx.shadowColor=c;
    for(var i=0;i<n;i++){
      var x=i*(W/n), y=H-data[i]*H*0.85;
      i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);
    }
    ctx.stroke();
    ctx.shadowBlur=0;
    ctx.lineTo(W,H); ctx.lineTo(0,H); ctx.closePath();
    ctx.fillStyle=c+'22'; ctx.fill();
  } else if(style.id==='mirror'){
    for(var i=0;i<n;i++){
      var h2=data[i]*H*0.43, x2=i*(W/n), bw2=Math.max(1,W/n-1);
      var grd2=ctx.createLinearGradient(0,H/2-h2,0,H/2);
      grd2.addColorStop(0,c); grd2.addColorStop(1,c+'44');
      ctx.fillStyle=grd2;
      ctx.fillRect(x2,H/2-h2,bw2,h2);
      ctx.fillRect(x2,H/2,bw2,h2);
    }
  } else if(style.id==='dots'){
    for(var i=0;i<n;i++){
      var steps=Math.floor(data[i]*6)+1;
      for(var j=0;j<steps;j++){
        var dotY=H-(j/steps)*H*0.85-4;
        ctx.fillStyle=c+Math.floor((j/steps)*255).toString(16).padStart(2,'0');
        ctx.beginPath();
        ctx.arc(i*(W/n)+3,dotY,2.5,0,Math.PI*2);
        ctx.fill();
      }
    }
  } else if(style.id==='neon'){
    ctx.shadowBlur=10; ctx.shadowColor=c;
    [2, 1.5, 0.8].forEach(function(lw, li){
      ctx.beginPath(); ctx.strokeStyle=li===0?c:c+'88'; ctx.lineWidth=lw;
      for(var i=0;i<n;i++){
        var x=i*(W/n), y=H/2-data[i]*(H*0.4);
        i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);
      }
      ctx.stroke();
      ctx.beginPath();
      for(var i=0;i<n;i++){
        var x=i*(W/n), y=H/2+data[i]*(H*0.4);
        i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);
      }
      ctx.stroke();
    });
    ctx.shadowBlur=0;
  } else if(style.id==='circle'){
    var cx=W/2, cy=H/2, r=Math.min(W,H)*0.32;
    ctx.shadowBlur=6; ctx.shadowColor=c;
    for(var i=0;i<n;i++){
      var angle=(i/n)*Math.PI*2;
      var len=data[i]*r*0.7;
      ctx.beginPath();
      ctx.moveTo(cx+Math.cos(angle)*r, cy+Math.sin(angle)*r);
      ctx.lineTo(cx+Math.cos(angle)*(r+len), cy+Math.sin(angle)*(r+len));
      ctx.strokeStyle=c; ctx.lineWidth=2; ctx.stroke();
    }
    ctx.shadowBlur=0;
  }
}

// สร้าง card preview ใน panel
function buildWaveCards(){
  var grid = document.getElementById('fx-wave-grid');
  if(!grid) return;
  grid.innerHTML = '';
  WAVE_STYLES.forEach(function(style){
    var seed = style.id.charCodeAt(0)*7+1;
    var data = genWaveData(40, seed);
    var card = document.createElement('div');
    card.className = 'fx-wave-card';
    card.setAttribute('draggable','true');
    card.title = style.name+' — คลิกเพิ่มที่ playhead หรือลากมาวางบน timeline';

    var cv = document.createElement('canvas');
    cv.width = 200; cv.height = 72;
    drawWaveAnimated(cv, style, data, 0);
    card.appendChild(cv);

    // animate preview
    var animT = 0;
    var animId = null;
    card.addEventListener('mouseenter',function(){
      animId = setInterval(function(){
        animT += 0.08;
        drawWaveAnimated(cv, style, data, animT);
      }, 50);
    });
    card.addEventListener('mouseleave',function(){
      clearInterval(animId);
      drawWaveAnimated(cv, style, data, 0);
    });

    var lbl = document.createElement('div');
    lbl.style.cssText = 'font-size:10px;color:'+style.color+';font-weight:600;margin-top:3px;';
    lbl.textContent = style.ico+' '+style.name+' — '+style.desc;
    card.appendChild(lbl);

    // color picker
    var colorRow = document.createElement('div');
    colorRow.style.cssText = 'display:flex;align-items:center;gap:4px;margin-top:4px;';
    var colorLbl = document.createElement('span');
    colorLbl.style.cssText = 'font-size:9px;color:var(--tx2);';
    colorLbl.textContent = 'สี:';
    var colorPick = document.createElement('input');
    colorPick.type = 'color'; colorPick.value = style.color;
    colorPick.style.cssText = 'width:20px;height:16px;border:none;cursor:pointer;background:none;';
    colorPick.addEventListener('input',function(e){
      style.color = e.target.value;
      lbl.style.color = style.color;
      drawWaveAnimated(cv, style, data, animT);
      // อัปเดต clip ที่ใช้ style นี้
      (window.S_WAVES||[]).forEach(function(c){
        if(c.styleId===style.id) renderWaveClip(c);
      });
    });
    colorRow.appendChild(colorLbl); colorRow.appendChild(colorPick);
    card.appendChild(colorRow);

    // drag
    card.addEventListener('dragstart',function(e){
      e.dataTransfer.setData('wave-style', style.id);
      e.dataTransfer.effectAllowed = 'copy';
      card.style.opacity = '0.5';
    });
    card.addEventListener('dragend',function(){ card.style.opacity='1'; });

    // click
    card.addEventListener('click',function(e){
      if(e.target===colorPick) return;
      var ph = document.getElementById('tl-ph');
      var ps = pxSec();
      var dropTime = ph ? (parseFloat(ph.style.left)||0)/ps : 0;
      addWaveClip(style.id, dropTime, 5);
      showToast('〰️ เพิ่ม '+style.name+' ที่ '+dropTime.toFixed(1)+'s');
    });

    grid.appendChild(card);
  });
}

function addWaveClip(styleId, startSec, durSec){
  durSec = durSec || 5;
  var id = 'wv'+Date.now();
  var clip = {id:id, styleId:styleId, startSec:startSec, dur:durSec, seed:Math.floor(Math.random()*999), sensitivity: window._waveSensDefault||1.0, shapeMode: window._waveShapeDefault||'natural'};
  window.S_WAVES.push(clip);
  renderWaveClip(clip);
  return clip;
}

function renderWaveClip(clip){
  var old = document.getElementById('wc-'+clip.id);
  if(old) old.remove();

  var track = document.getElementById('tr-f');
  if(!track) return;

  var style = WAVE_STYLES.find(function(s){return s.id===clip.styleId;}) || WAVE_STYLES[0];
  var ps = pxSec();
  var w = Math.max(40, clip.dur*ps);
  var n = Math.max(20, Math.floor(w/5));
  var data = genWaveData(n, clip.seed||1);

  var el = document.createElement('div');
  el.id = 'wc-'+clip.id;
  el.className = 'wave-clip';
  el.style.left = (clip.startSec*ps)+'px';
  el.style.width = w+'px';
  el.style.border = '1.5px solid '+style.color+'66';
  el.style.background = 'transparent';
  el.title = style.name+' — ลากย้าย | ลาก handle ขวาเพื่อยืด';

  var cv = document.createElement('canvas');
  cv.width = w; cv.height = 54;
  drawWaveAnimated(cv, style, data, 0);
  el.appendChild(cv);

  // live animation — RAF loop + real Web Audio frequency data
  var animRunning = false;
  var animRAFId = null;
  function startAnim(){
    if(animRunning) return;
    animRunning = true;
    function loop(){
      if(!animRunning){ drawWaveAnimated(cv, style, data, 0, null); return; }
      var sens  = clip.sensitivity !== undefined ? clip.sensitivity : 1.0;
      var shape = clip.shapeMode || 'natural';
      var bars  = (typeof window.getWaveFreqBars === 'function') ? window.getWaveFreqBars(data.length, sens, shape) : null;
      drawWaveAnimated(cv, style, data, 0, bars);
      animRAFId = requestAnimationFrame(loop);
    }
    animRAFId = requestAnimationFrame(loop);
  }
  function stopAnim(){
    animRunning = false;
    cancelAnimationFrame(animRAFId);
    drawWaveAnimated(cv, style, data, 0, null);
  }

  window.addEventListener('wave-play',  startAnim);
  window.addEventListener('wave-stop',  stopAnim);
  var vidEl = document.getElementById('prev-vid');
  if(vidEl){
    vidEl.addEventListener('play', startAnim);
    vidEl.addEventListener('pause', stopAnim);
    vidEl.addEventListener('ended', stopAnim);
  }

  // delete
  var del = document.createElement('div');
  del.className = 'wc-del'; del.textContent = '✕';
  del.addEventListener('mousedown',function(e){
    e.stopPropagation();
    stopAnim();
    if(vidEl){ vidEl.removeEventListener('play',startAnim); vidEl.removeEventListener('pause',stopAnim); }
    el.remove();
    // ลบ preview overlay ด้วย
    var pvEl = document.getElementById('wcp-'+clip.id);
    if(pvEl) pvEl.remove();
    window.S_WAVES = (window.S_WAVES||[]).filter(function(c){return c.id!==clip.id;});
    showToast('🗑 ลบ waveform แล้ว');
  });
  el.appendChild(del);

  // คลิกเพื่อเลือก wave clip → sync sensitivity slider
  el.addEventListener('click', function(e){
    if(e.target===del || e.target.classList.contains('wc-hdl')) return;
    window._selectedWaveId = clip.id;
    // sync slider ใน panel
    var sl = document.getElementById('wave-sens');
    var sv = document.getElementById('wave-sens-v');
    var sens = clip.sensitivity !== undefined ? clip.sensitivity : 1.0;
    if(sl) sl.value = Math.round(sens*100);
    if(sv) sv.textContent = sens.toFixed(1)+'×';
    // sync shape buttons
    if(typeof window._applyWaveShape === 'function'){
      window._applyWaveShape(clip.shapeMode || 'natural');
    }
    // highlight
    document.querySelectorAll('.wave-clip').forEach(function(e){ e.style.borderColor=''; });
    el.style.borderColor = 'var(--acc)';
    showToast('〰️ เลือก waveform — ปรับความไว/รูปทรงได้ที่แผง เอฟเฟกต์');
  });

  // resize right handle
  var hdl = document.createElement('div');
  hdl.className = 'wc-hdl';
  hdl.addEventListener('mousedown',function(e){
    e.stopPropagation(); e.preventDefault();
    var sx=e.clientX, sw=clip.dur;
    function onMove(e2){
      clip.dur = Math.max(0.5, sw+(e2.clientX-sx)/pxSec());
      var nw = Math.max(40, clip.dur*pxSec());
      el.style.width = nw+'px';
      cv.width = nw;
      var nd = genWaveData(Math.max(20,Math.floor(nw/5)), clip.seed||1);
      drawWaveAnimated(cv, style, nd, 0);
    }
    function onUp(){ document.removeEventListener('mousemove',onMove); document.removeEventListener('mouseup',onUp); }
    document.addEventListener('mousemove',onMove);
    document.addEventListener('mouseup',onUp);
  });
  el.appendChild(hdl);

  // drag move (left/right ซิงค์เวลา)
  el.addEventListener('mousedown',function(e){
    if(e.target===hdl||e.target===del) return;
    e.preventDefault(); e.stopPropagation();
    var sx=e.clientX, ss=clip.startSec;
    function onMove(e2){
      clip.startSec = Math.max(0, ss+(e2.clientX-sx)/pxSec());
      el.style.left = (clip.startSec*pxSec())+'px';
    }
    function onUp(){ document.removeEventListener('mousemove',onMove); document.removeEventListener('mouseup',onUp); }
    document.addEventListener('mousemove',onMove);
    document.addEventListener('mouseup',onUp);
  });

  // คลิกขวา → context menu
  el.addEventListener('contextmenu', function(e){
    e.preventDefault(); e.stopPropagation();
    // ลบ menu เก่า
    var om = document.getElementById('wave-ctx-menu');
    if(om) om.remove();
    var menu = document.createElement('div');
    menu.id = 'wave-ctx-menu';
    menu.style.cssText = 'position:fixed;left:'+e.clientX+'px;top:'+e.clientY+'px;background:#1a1a1a;border:1px solid #444;border-radius:8px;padding:4px 0;z-index:9999;min-width:150px;box-shadow:0 4px 20px rgba(0,0,0,.7);font-size:13px;color:#fff;';
    function mi(ico,lbl,fn){
      var item=document.createElement('div');
      item.style.cssText='padding:8px 14px;cursor:pointer;display:flex;gap:8px;';
      item.innerHTML='<span>'+ico+'</span><span>'+lbl+'</span>';
      item.onmouseenter=function(){item.style.background='rgba(245,197,24,.15)';};
      item.onmouseleave=function(){item.style.background='';};
      item.addEventListener('mousedown',function(ev){ev.stopPropagation();fn();menu.remove();});
      return item;
    }
    menu.appendChild(mi('📋','ทำซ้ำ (ต่อท้าย)',function(){
      var nc={id:'wv'+Date.now(),styleId:clip.styleId,startSec:clip.startSec+clip.dur,dur:clip.dur,seed:Math.floor(Math.random()*9999)};
      window.S_WAVES.push(nc);
      renderWaveClip(nc);
      renderWavePreview(nc);
      showToast('📋 ทำซ้ำต่อท้ายแล้ว');
    }));
    menu.appendChild(mi('📋','ทำซ้ำ (ที่เดิม)',function(){
      var nc={id:'wv'+Date.now(),styleId:clip.styleId,startSec:clip.startSec,dur:clip.dur,seed:Math.floor(Math.random()*9999)};
      window.S_WAVES.push(nc);
      renderWaveClip(nc);
      renderWavePreview(nc);
      showToast('📋 ทำซ้ำแล้ว');
    }));
    var sep=document.createElement('div');
    sep.style.cssText='height:1px;background:#333;margin:4px 0;';
    menu.appendChild(sep);
    menu.appendChild(mi('🗑','ลบ',function(){
      stopAnim();
      el.remove();
      var pv=document.getElementById('wcp-'+clip.id);
      if(pv) pv.remove();
      window.S_WAVES=(window.S_WAVES||[]).filter(function(c){return c.id!==clip.id;});
      showToast('🗑 ลบ waveform แล้ว');
    }));
    document.body.appendChild(menu);
    setTimeout(function(){
      document.addEventListener('mousedown',function cls(ev){
        if(!menu.contains(ev.target)){menu.remove();document.removeEventListener('mousedown',cls);}
      });
    },10);
  });

  track.appendChild(el);

  // แสดง overlay บน preview ด้วย
  renderWavePreview(clip, style, data, startAnim, stopAnim);

  return el;
}

// วาด waveform overlay บน preview — คลิกได้ ลากย้าย ยืดหด
function renderWavePreview(clip, style, data, _sa, _so){
  var oldPv = document.getElementById('wcp-'+clip.id);
  if(oldPv) oldPv.remove();

  var wrap = document.getElementById('prev-wrap');
  if(!wrap) return;

  style = style || WAVE_STYLES.find(function(s){return s.id===clip.styleId;})||WAVE_STYLES[0];
  data  = data  || genWaveData(60, clip.seed||1);

  // state ตำแหน่งและขนาดบน preview (% ของ wrap)
  if(clip.pvX  === undefined) clip.pvX  = 5;   // %
  if(clip.pvY  === undefined) clip.pvY  = 75;  // %
  if(clip.pvW  === undefined) clip.pvW  = 90;  // %
  if(clip.pvH  === undefined) clip.pvH  = 15;  // %

  var pvEl = document.createElement('div');
  pvEl.id = 'wcp-'+clip.id;
  pvEl.style.cssText = [
    'position:absolute',
    'left:'+clip.pvX+'%',
    'top:'+clip.pvY+'%',
    'width:'+clip.pvW+'%',
    'height:'+clip.pvH+'%',
    'pointer-events:all',
    'z-index:14',
    'cursor:move',
    'border-radius:6px',
    'box-shadow:none',
    'overflow:hidden',
    'display:none',
  ].join(';');

  var cv = document.createElement('canvas');
  cv.style.cssText = 'width:100%;height:100%;display:block;';
  pvEl.appendChild(cv);

  // resize handle (มุมขวาล่าง)
  var rsz = document.createElement('div');
  rsz.style.cssText = 'position:absolute;right:0;bottom:0;width:14px;height:14px;cursor:se-resize;background:rgba(255,255,255,.25);border-radius:3px 0 4px 0;z-index:2;';
  rsz.innerHTML = '<svg width="10" height="10" viewBox="0 0 10 10" style="display:block;margin:2px auto;"><path d="M2 8 L8 8 L8 2" stroke="white" stroke-width="1.5" fill="none"/></svg>';
  pvEl.appendChild(rsz);

  // delete X
  var delPv = document.createElement('div');
  delPv.style.cssText = 'position:absolute;top:3px;right:3px;width:18px;height:18px;background:rgba(0,0,0,.7);color:#fff;border-radius:50%;display:none;align-items:center;justify-content:center;font-size:11px;cursor:pointer;z-index:3;';
  delPv.textContent = '✕';
  pvEl.appendChild(delPv);
  pvEl.addEventListener('mouseenter',function(){ delPv.style.display='flex'; });
  pvEl.addEventListener('mouseleave',function(){ delPv.style.display='none'; });

  // ลบทั้ง preview และ track clip
  delPv.addEventListener('mousedown',function(e){
    e.stopPropagation();
    pvEl.remove();
    var trackEl = document.getElementById('wc-'+clip.id);
    if(trackEl) trackEl.remove();
    window.S_WAVES = (window.S_WAVES||[]).filter(function(c){return c.id!==clip.id;});
    showToast('🗑 ลบ waveform แล้ว');
  });

  // ลาก preview ย้ายตำแหน่ง
  pvEl.addEventListener('mousedown',function(e){
    if(e.target===rsz||e.target.parentNode===rsz||e.target===delPv) return;
    e.preventDefault(); e.stopPropagation();
    var wr = wrap.getBoundingClientRect();
    var sx=e.clientX, sy=e.clientY;
    var ox=clip.pvX, oy=clip.pvY;
    function onMove(e2){
      clip.pvX = Math.max(0, Math.min(100-clip.pvW, ox+(e2.clientX-sx)/wr.width*100));
      clip.pvY = Math.max(0, Math.min(100-clip.pvH, oy+(e2.clientY-sy)/wr.height*100));
      pvEl.style.left = clip.pvX+'%';
      pvEl.style.top  = clip.pvY+'%';
    }
    function onUp(){ document.removeEventListener('mousemove',onMove); document.removeEventListener('mouseup',onUp); }
    document.addEventListener('mousemove',onMove);
    document.addEventListener('mouseup',onUp);
  });

  // resize handle ยืดหด
  rsz.addEventListener('mousedown',function(e){
    e.preventDefault(); e.stopPropagation();
    var wr = wrap.getBoundingClientRect();
    var sx=e.clientX, sy=e.clientY;
    var ow=clip.pvW, oh=clip.pvH;
    function onMove(e2){
      clip.pvW = Math.max(10, Math.min(100, ow+(e2.clientX-sx)/wr.width*100));
      clip.pvH = Math.max(5,  Math.min(50,  oh+(e2.clientY-sy)/wr.height*100));
      pvEl.style.width  = clip.pvW+'%';
      pvEl.style.height = clip.pvH+'%';
      // redraw canvas
      cv.width = pvEl.offsetWidth; cv.height = pvEl.offsetHeight;
      var d2 = genWaveData(Math.max(20,Math.floor(cv.width/6)), clip.seed||1);
      drawWaveAnimated(cv, style, d2, 0);
    }
    function onUp(){ document.removeEventListener('mousemove',onMove); document.removeEventListener('mouseup',onUp); }
    document.addEventListener('mousemove',onMove);
    document.addEventListener('mouseup',onUp);
  });

  wrap.appendChild(pvEl);

  // sync ตาม globalTime
  var vidEl = document.getElementById('prev-vid');
  var pvAnimId = null;

  function pvDraw(){
    if(pvEl.style.display==='none') return;
    var w = pvEl.offsetWidth  || 200;
    var h = pvEl.offsetHeight || 50;
    if(cv.width !== w) cv.width = w;
    if(cv.height !== h) cv.height = h;
    var d2 = genWaveData(Math.max(20,Math.floor(w/5)), clip.seed||1);
    var sens  = clip.sensitivity !== undefined ? clip.sensitivity : 1.0;
    var shape = clip.shapeMode || 'natural';
    var bars  = (typeof window.getWaveFreqBars === 'function') ? window.getWaveFreqBars(d2.length, sens, shape) : null;
    drawWaveAnimated(cv, style, d2, 0, bars);
  }

  var pvAnimRunning = false;
  var pvRAFId = null;

  function pvLoop(){
    if(!pvAnimRunning) return;
    // เช็ก visibility ตาม globalTime
    var gt = window._waveGlobalTime !== undefined
      ? window._waveGlobalTime
      : (window.playQueueOffset||0)+(vidEl?vidEl.currentTime||0:0);
    var visible = gt>=clip.startSec && gt<(clip.startSec+clip.dur);
    pvEl.style.display = visible ? 'block' : 'none';
    if(visible) pvDraw();
    pvRAFId = requestAnimationFrame(pvLoop);
  }

  function startPv(){
    if(pvAnimRunning) return;
    pvAnimRunning = true;
    pvRAFId = requestAnimationFrame(pvLoop);
  }
  function stopPv(){
    pvAnimRunning = false;
    cancelAnimationFrame(pvRAFId);
    // เช็ก visibility สุดท้ายครั้งหนึ่ง
    var gt2 = window._waveGlobalTime || 0;
    pvEl.style.display = (gt2>=clip.startSec && gt2<(clip.startSec+clip.dur)) ? 'block' : 'none';
    if(pvEl.style.display === 'block') pvDraw();
  }

  if(vidEl){
    vidEl.addEventListener('play', startPv);
    vidEl.addEventListener('pause', stopPv);
    vidEl.addEventListener('ended', function(){ pvAnimRunning=false; cancelAnimationFrame(pvRAFId); pvEl.style.display='none'; });
    vidEl.addEventListener('timeupdate', function(){
      if(!pvAnimRunning){
        var gt3 = (window.playQueueOffset||0)+(vidEl.currentTime||0);
        window._waveGlobalTime = gt3;
        var vis = gt3>=clip.startSec && gt3<(clip.startSec+clip.dur);
        pvEl.style.display = vis ? 'block' : 'none';
        if(vis) pvDraw();
      }
    });
  }
  window.addEventListener('wave-play', startPv);
  window.addEventListener('wave-stop', stopPv);

  // syncPv — เช็ก visibility ตาม playhead (ใช้ตอน seek/static)
  function syncPv(){
    var gt = window._waveGlobalTime !== undefined
      ? window._waveGlobalTime
      : (window.playQueueOffset||0)+((vidEl?vidEl.currentTime:0)||0);
    var visible = gt>=clip.startSec && gt<(clip.startSec+clip.dur);
    pvEl.style.display = visible ? 'block' : 'none';
    if(visible && !pvAnimRunning) pvDraw();
  }

  // sync playhead seek
  var ph = document.getElementById('tl-ph');
  if(ph){
    var phObs = new MutationObserver(syncPv);
    phObs.observe(ph, {attributes:true, attributeFilter:['style']});
  }

  setTimeout(function(){ pvDraw(); syncPv(); }, 150);
}

function refreshWaveClips(){
  // ลบ preview overlays เก่าก่อน
  document.querySelectorAll('[id^="wcp-"]').forEach(function(el){ el.remove(); });
  (window.S_WAVES||[]).forEach(function(clip){ renderWaveClip(clip); });
}

// Drop zone สำหรับ waveform — ผูกกับ tl-content ทั้งก้อน
(function setupWaveDrop(){
  function trySetup(){
    var sc = document.getElementById('tl-scroll');
    var trf = document.getElementById('tr-f');
    if(!sc || !trf){ setTimeout(trySetup,300); return; }
    trf.style.minHeight = '54px';

    // ให้ tr-f รับ drop โดยตรง
    trf.addEventListener('dragover', function(e){
      if(e.dataTransfer.types.indexOf('wave-style')<0) return;
      e.preventDefault(); e.dataTransfer.dropEffect='copy';
      trf.style.outline = '2px dashed var(--acc)';
    });
    trf.addEventListener('dragleave', function(){
      trf.style.outline = '';
    });
    trf.addEventListener('drop', function(e){
      var styleId = e.dataTransfer.getData('wave-style');
      if(!styleId) return;
      e.preventDefault();
      trf.style.outline = '';
      var r = sc.getBoundingClientRect();
      var x = e.clientX - r.left + sc.scrollLeft;
      var dropTime = Math.max(0, x/pxSec());
      addWaveClip(styleId, dropTime, 5);
      showToast('〰️ วาง waveform ที่ '+dropTime.toFixed(1)+'s');
    });

    // fallback: sc ก็รับได้
    sc.addEventListener('dragover', function(e){
      if(e.dataTransfer.types.indexOf('wave-style')<0) return;
      e.preventDefault(); e.dataTransfer.dropEffect='copy';
    });
    sc.addEventListener('drop', function(e){
      var styleId = e.dataTransfer.getData('wave-style');
      if(!styleId) return;
      e.preventDefault();
      var r = sc.getBoundingClientRect();
      var x = e.clientX - r.left + sc.scrollLeft;
      var dropTime = Math.max(0, x/pxSec());
      addWaveClip(styleId, dropTime, 5);
      showToast('〰️ วาง waveform ที่ '+dropTime.toFixed(1)+'s');
    });
  }
  trySetup();
})();

// Init panel เมื่อคลิก fx
(function(){
  function tryBind(){
    var btns = document.querySelectorAll('.ib[data-p]');
    if(!btns.length){ setTimeout(tryBind,300); return; }
    btns.forEach(function(btn){
      btn.addEventListener('click',function(){
        if(btn.dataset.p==='fx') setTimeout(buildWaveCards,50);
      });
    });
    buildWaveCards();

    // ── sensitivity slider handler ──
    var sensSl = document.getElementById('wave-sens');
    var sensVl = document.getElementById('wave-sens-v');
    function applySens(val){
      var sens = val/100;
      if(sensVl) sensVl.textContent = sens.toFixed(1)+'×';
      // apply ให้ wave clip ที่กำลัง selected (ถ้ามี)
      if(window._selectedWaveId){
        var wc = (window.S_WAVES||[]).find(function(c){ return c.id===window._selectedWaveId; });
        if(wc){ wc.sensitivity = sens; }
      }
      // เก็บเป็น default สำหรับ clip ถัดไป
      window._waveSensDefault = sens;
    }
    if(sensSl){
      sensSl.addEventListener('input', function(){ applySens(parseInt(this.value)); });
    }
    document.querySelectorAll('.wave-sens-btn').forEach(function(btn){
      btn.addEventListener('click', function(){
        var v = parseInt(btn.dataset.v);
        if(sensSl) sensSl.value = v;
        applySens(v);
      });
    });

    // ── shape buttons ──
    function applyShape(shapeId){
      window._waveShapeDefault = shapeId;
      // apply ให้ clip ที่ selected
      if(window._selectedWaveId){
        var wc = (window.S_WAVES||[]).find(function(c){ return c.id===window._selectedWaveId; });
        if(wc){ wc.shapeMode = shapeId; }
      }
      // update button highlight
      document.querySelectorAll('.wave-shape-btn').forEach(function(b){
        b.classList.toggle('on', b.dataset.shape === shapeId);
      });
    }
    document.querySelectorAll('.wave-shape-btn').forEach(function(btn){
      btn.addEventListener('click', function(){ applyShape(btn.dataset.shape); });
    });
    // expose applyShape globally for sync on select
    window._applyWaveShape = applyShape;
  }
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded', tryBind);
  } else {
    tryBind();
  }
})();
// สร้าง waveform overlay PNG สำหรับ export
// คืนค่า base64 PNG ที่มีขนาด tw x th โดย waveform อยู่ที่ตำแหน่ง pvX,pvY
function buildWaveOverlayPNG(tw, th, clipStartSec, clipDurSec){
  var waves = window.S_WAVES || [];
  if(!waves.length) return null;

  // กรอง wave ที่ overlap กับ clip นี้
  var active = waves.filter(function(w){
    return w.startSec < (clipStartSec+clipDurSec) && (w.startSec+w.dur) > clipStartSec;
  });
  if(!active.length) return null;

  var cv = document.createElement('canvas');
  cv.width = tw; cv.height = th;
  var ctx = cv.getContext('2d');

  active.forEach(function(clip){
    var style = WAVE_STYLES.find(function(s){return s.id===clip.styleId;})||WAVE_STYLES[0];
    // ตำแหน่งบน frame
    var px = clip.pvX  !== undefined ? clip.pvX  : 5;   // %
    var py = clip.pvY  !== undefined ? clip.pvY  : 75;  // %
    var pw = clip.pvW  !== undefined ? clip.pvW  : 90;  // %
    var ph = clip.pvH  !== undefined ? clip.pvH  : 15;  // %

    var x = Math.floor(px/100*tw);
    var y = Math.floor(py/100*th);
    var w = Math.floor(pw/100*tw);
    var h = Math.floor(ph/100*th);

    // วาดลงใน subcanvas ด้วย sensitivity ของ clip
    var sub = document.createElement('canvas');
    sub.width = w; sub.height = h;
    var nBars = Math.max(20, Math.floor(w/5));
    var data = genWaveData(nBars, clip.seed||1);
    var sens  = clip.sensitivity !== undefined ? clip.sensitivity : 1.0;
    var shape = clip.shapeMode || 'natural';
    var pos_n = nBars;
    // สร้าง simulated bars ตาม sensitivity + shape สำหรับ export
    var exportBars = data.map(function(v, i){
      var pos = i / Math.max(1, pos_n-1);
      var env = 1;
      if(shape === 'natural')    env = Math.pow(1 - pos*0.55, 0.7) + 0.15;
      else if(shape === 'rise')  env = 0.3 + pos * 0.7;
      else if(shape === 'fall')  env = 1 - pos * 0.7;
      else if(shape === 'mountain') env = 0.3 + Math.sin(pos*Math.PI)*0.7;
      else if(shape === 'valley')   env = 0.3 + (1-Math.sin(pos*Math.PI))*0.7;
      return Math.min(1, Math.max(0.04, v * sens * env));
    });
    drawWaveAnimated(sub, style, data, 0, exportBars);
    ctx.drawImage(sub, x, y, w, h);
  });

  return cv.toDataURL('image/png');
}

// แปลง dataURL เป็น Uint8Array
function dataURLtoUint8Array(dataURL){
  var b64 = dataURL.split(',')[1];
  var bin = atob(b64);
  var arr = new Uint8Array(bin.length);
  for(var i=0;i<bin.length;i++) arr[i]=bin.charCodeAt(i);
  return arr;
}


// ═══════════════════════════════════════════════════════
// STICKER / LOGO OVERLAY SYSTEM
// ═══════════════════════════════════════════════════════
var STK = { items: [], nid: 1, selId: null };

// ── ibar: เพิ่ม p-sticker เข้า panel list ──
(function(){
  var orig = document.querySelectorAll('.ib');
  orig.forEach(function(b){
    b.addEventListener('click', function(){
      var p = b.dataset.p;
      if(p === 'sticker'){
        document.querySelectorAll('.ib').forEach(function(x){ x.classList.remove('on'); });
        b.classList.add('on');
        ['p-media','p-cut','p-text','p-fx','p-sticker'].forEach(function(id){
          var el = document.getElementById(id);
          if(el) el.style.display = (id === 'p-sticker') ? 'flex' : 'none';
        });
      }
    });
  });
  // patch existing ibar handler to hide p-sticker
  var origIbarPanels = ['p-media','p-cut','p-text','p-fx'];
  document.querySelectorAll('.ib').forEach(function(b){
    b.addEventListener('click', function(){
      var p = b.dataset.p;
      if(p !== 'sticker' && p !== 'exp-modal'){
        var ps = document.getElementById('p-sticker');
        if(ps) ps.style.display = 'none';
      }
    });
  });
})();

// ── Upload zone ──
(function(){
  var dz = document.getElementById('stk-dz');
  var fi = document.getElementById('stk-fi');
  if(!dz || !fi) return;
  dz.addEventListener('click', function(){ fi.click(); });
  dz.addEventListener('dragover', function(e){ e.preventDefault(); dz.style.borderColor='var(--acc)'; });
  dz.addEventListener('dragleave', function(){ dz.style.borderColor=''; });
  dz.addEventListener('drop', function(e){
    e.preventDefault(); dz.style.borderColor='';
    addStickerFiles(Array.from(e.dataTransfer.files));
  });
  fi.addEventListener('change', function(){ addStickerFiles(Array.from(this.files)); this.value=''; });

  // Opacity slider
  var opSlider = document.getElementById('stk-opacity');
  var opVal = document.getElementById('stk-opacity-v');
  if(opSlider) opSlider.addEventListener('input', function(){
    if(opVal) opVal.textContent = this.value + '%';
    // apply to selected sticker
    if(STK.selId){
      var item = STK.items.find(function(s){ return s.id === STK.selId; });
      if(item){
        item.opacity = parseInt(this.value)/100;
        var el = document.getElementById('stk-el-'+item.id);
        if(el) el.style.opacity = item.opacity;
      }
    }
  });
})();

function addStickerFiles(files){
  files.forEach(function(f){
    if(!f.type.startsWith('image/') && !f.type.startsWith('video/')) return;
    var url = URL.createObjectURL(f);
    var item = {
      id: 'stk'+STK.nid++,
      name: f.name,
      url: url,
      type: f.type.startsWith('video/') ? 'video' : 'image',
      isGif: f.type === 'image/gif',
      // position/size ใน % ของ prev-wrap
      x: 5, y: 5, w: 25, h: 25,
      opacity: 1,
      // timeline: แสดงตลอดโดย default
      tIn: 0, tOut: 9999,
    };
    STK.items.push(item);
    renderStickerOnPreview(item);
    renderStickerList();
    showToast('✅ เพิ่ม '+f.name);
  });
  document.getElementById('stk-cnt').textContent = STK.items.length;
}

function renderStickerList(){
  var list = document.getElementById('stk-list');
  if(!list) return;
  list.innerHTML = '';
  STK.items.forEach(function(item){
    var d = document.createElement('div');
    d.className = 'stk-item' + (STK.selId === item.id ? ' on' : '');
    d.innerHTML =
      '<div class="stk-thumb">' +
        (item.type === 'video'
          ? '<video src="'+item.url+'" muted></video>'
          : '<img src="'+item.url+'"/>') +
      '</div>' +
      '<div class="stk-info">' +
        '<div class="stk-name">'+item.name+'</div>' +
        '<div class="stk-sz">'+item.w.toFixed(0)+'% × '+item.h.toFixed(0)+'%</div>' +
      '</div>' +
      '<div class="stk-acts">' +
        '<button class="stk-act" data-a="vis" title="แสดง/ซ่อน">👁</button>' +
        '<button class="stk-act del" data-a="del" title="ลบ">✕</button>' +
      '</div>';

    d.addEventListener('click', function(e){
      if(e.target.dataset.a === 'del'){ removeStickerItem(item.id); return; }
      if(e.target.dataset.a === 'vis'){ toggleStickerVisibility(item.id); return; }
      selectSticker(item.id);
    });
    list.appendChild(d);
  });
  document.getElementById('stk-cnt').textContent = STK.items.length;
}

function renderStickerOnPreview(item){
  // ลบของเก่า
  var old = document.getElementById('stk-el-'+item.id);
  if(old) old.remove();

  var wrap = document.getElementById('prev-wrap');
  if(!wrap || wrap.style.display === 'none') return;

  var container = document.getElementById('sticker-overlay-container');
  if(!container) return;

  var wW = wrap.offsetWidth || 640;
  var wH = wrap.offsetHeight || 360;

  var el = document.createElement('div');
  el.id = 'stk-el-' + item.id;
  el.className = 'stk-el';
  el.style.left   = (item.x/100*wW) + 'px';
  el.style.top    = (item.y/100*wH) + 'px';
  el.style.width  = (item.w/100*wW) + 'px';
  el.style.height = (item.h/100*wH) + 'px';
  el.style.opacity = item.opacity || 1;
  if(item.hidden) el.style.display = 'none';

  // media element
  var media;
  if(item.type === 'video'){
    media = document.createElement('video');
    media.src = item.url;
    media.loop = true;
    media.muted = false;
    media.autoplay = false;
    media.playsInline = true;
  } else {
    media = document.createElement('img');
    media.src = item.url;
  }
  el.appendChild(media);

  // resize handles (4 corners)
  ['tl','tr','bl','br'].forEach(function(pos){
    var h = document.createElement('div');
    h.className = 'stk-hdl ' + pos;
    h.addEventListener('mousedown', function(e){
      e.stopPropagation(); e.preventDefault();
      var sx=e.clientX, sy=e.clientY;
      var ox=item.x, oy=item.y, ow=item.w, oh=item.h;
      function onMove(e2){
        var dx=(e2.clientX-sx)/wW*100;
        var dy=(e2.clientY-sy)/wH*100;
        if(pos==='br'){
          item.w=Math.max(3,ow+dx); item.h=Math.max(3,oh+dy);
        } else if(pos==='bl'){
          item.x=Math.min(ox+ow-3,ox+dx); item.w=Math.max(3,ow-dx);
          item.h=Math.max(3,oh+dy);
        } else if(pos==='tr'){
          item.y=Math.min(oy+oh-3,oy+dy); item.h=Math.max(3,oh-dy);
          item.w=Math.max(3,ow+dx);
        } else { // tl
          item.x=Math.min(ox+ow-3,ox+dx); item.y=Math.min(oy+oh-3,oy+dy);
          item.w=Math.max(3,ow-dx); item.h=Math.max(3,oh-dy);
        }
        updateStickerElPos(el, item, wW, wH);
        renderStickerList();
      }
      function onUp(){ document.removeEventListener('mousemove',onMove); document.removeEventListener('mouseup',onUp); }
      document.addEventListener('mousemove',onMove);
      document.addEventListener('mouseup',onUp);
    });
    el.appendChild(h);
  });

  // delete button
  var del = document.createElement('div');
  del.className = 'stk-del'; del.textContent = '✕';
  del.addEventListener('mousedown', function(e){
    e.stopPropagation();
    removeStickerItem(item.id);
  });
  el.appendChild(del);

  // drag move
  el.addEventListener('mousedown', function(e){
    if(e.target.classList.contains('stk-hdl') || e.target.classList.contains('stk-del')) return;
    e.preventDefault(); e.stopPropagation();
    selectSticker(item.id);
    var sx=e.clientX, sy=e.clientY, ox=item.x, oy=item.y;
    function onMove(e2){
      item.x = Math.max(0, Math.min(100-item.w, ox+(e2.clientX-sx)/wW*100));
      item.y = Math.max(0, Math.min(100-item.h, oy+(e2.clientY-sy)/wH*100));
      updateStickerElPos(el, item, wW, wH);
    }
    function onUp(){ document.removeEventListener('mousemove',onMove); document.removeEventListener('mouseup',onUp); }
    document.addEventListener('mousemove',onMove);
    document.addEventListener('mouseup',onUp);
  });

  // click to select
  el.addEventListener('click', function(e){
    e.stopPropagation();
    selectSticker(item.id);
  });

  container.appendChild(el);

  // ถ้าเป็น video sticker — sync เล่น/หยุดกับ preview
  if(item.type === 'video'){
    var vidMain = document.getElementById('prev-vid');
    if(vidMain){
      vidMain.addEventListener('play', function(){ media.play().catch(function(){}); });
      vidMain.addEventListener('pause', function(){ media.pause(); });
    }
    window.addEventListener('wave-play', function(){ media.play().catch(function(){}); });
    window.addEventListener('wave-stop', function(){ media.pause(); media.currentTime=0; });
  }
}

function updateStickerElPos(el, item, wW, wH){
  el.style.left   = (item.x/100*wW) + 'px';
  el.style.top    = (item.y/100*wH) + 'px';
  el.style.width  = (item.w/100*wW) + 'px';
  el.style.height = (item.h/100*wH) + 'px';
}

function selectSticker(id){
  STK.selId = id;
  document.querySelectorAll('.stk-el').forEach(function(e){ e.classList.remove('sel'); });
  var el = document.getElementById('stk-el-'+id);
  if(el) el.classList.add('sel');
  renderStickerList();
  // sync opacity slider
  var item = STK.items.find(function(s){ return s.id === id; });
  if(item){
    var sl = document.getElementById('stk-opacity');
    var sv = document.getElementById('stk-opacity-v');
    if(sl){ sl.value = Math.round((item.opacity||1)*100); }
    if(sv){ sv.textContent = Math.round((item.opacity||1)*100)+'%'; }
  }
}

function removeStickerItem(id){
  var el = document.getElementById('stk-el-'+id);
  if(el) el.remove();
  STK.items = STK.items.filter(function(s){ return s.id !== id; });
  if(STK.selId === id) STK.selId = null;
  renderStickerList();
  showToast('🗑 ลบสติกเกอร์แล้ว');
}

function toggleStickerVisibility(id){
  var item = STK.items.find(function(s){ return s.id === id; });
  if(!item) return;
  item.hidden = !item.hidden;
  var el = document.getElementById('stk-el-'+id);
  if(el) el.style.display = item.hidden ? 'none' : '';
  showToast(item.hidden ? '🙈 ซ่อน' : '👁 แสดง');
}

// re-render stickers เมื่อ prev-wrap เปิดขึ้น (เช่นหลัง loadImagePreview)
(function(){
  var observer = new MutationObserver(function(){
    var wrap = document.getElementById('prev-wrap');
    if(wrap && wrap.style.display !== 'none'){
      STK.items.forEach(function(item){ renderStickerOnPreview(item); });
    }
  });
  var wrap = document.getElementById('prev-wrap');
  if(wrap) observer.observe(wrap, {attributes:true, attributeFilter:['style']});
})();

// Del key ลบ sticker ที่เลือกอยู่
(function(){
  var origKeydown = document.onkeydown;
  document.addEventListener('keydown', function(e){
    if((e.key==='Delete'||e.key==='Backspace') && STK.selId){
      var tag = document.activeElement ? document.activeElement.tagName : '';
      if(tag==='INPUT'||tag==='TEXTAREA') return;
      removeStickerItem(STK.selId);
    }
  });
})();

// resize ใหม่เมื่อ AR เปลี่ยน
(function(){
  var origAR = applyARToPreview;
  applyARToPreview = function(){
    origAR();
    STK.items.forEach(function(item){ renderStickerOnPreview(item); });
  };
})();


// ═══════════════════════════════════════════════════════
// BADGE / FRAME SYSTEM
// ═══════════════════════════════════════════════════════
(function(){

  // ── Badge style presets ──
  var BADGE_STYLES = [
    { id:'solid',    name:'ทึบ',      draw: function(ctx,W,H,color,alpha){ ctx.globalAlpha=alpha; ctx.fillStyle=color; roundRect(ctx,0,0,W,H,H*0.18); ctx.fill(); ctx.globalAlpha=1; } },
    { id:'outline',  name:'เส้นขอบ', draw: function(ctx,W,H,color,alpha){ ctx.globalAlpha=alpha; ctx.strokeStyle=color; ctx.lineWidth=Math.max(3,H*0.08); roundRect(ctx,ctx.lineWidth/2,ctx.lineWidth/2,W-ctx.lineWidth,H-ctx.lineWidth,H*0.18); ctx.stroke(); ctx.globalAlpha=1; } },
    { id:'ribbon',   name:'ริบบิ้น', draw: function(ctx,W,H,color,alpha){ ctx.globalAlpha=alpha; ctx.fillStyle=color; ctx.beginPath(); ctx.moveTo(0,H*0.18); ctx.lineTo(W,H*0.18); ctx.lineTo(W,H*0.82); ctx.lineTo(0,H*0.82); ctx.closePath(); ctx.fill(); ctx.globalAlpha=1; } },
    { id:'circle',   name:'วงกลม',   draw: function(ctx,W,H,color,alpha){ ctx.globalAlpha=alpha; ctx.fillStyle=color; var r=Math.min(W,H)/2; ctx.beginPath(); ctx.arc(W/2,H/2,r*0.9,0,Math.PI*2); ctx.fill(); ctx.globalAlpha=1; } },
    { id:'diamond',  name:'เพชร',    draw: function(ctx,W,H,color,alpha){ ctx.globalAlpha=alpha; ctx.fillStyle=color; ctx.beginPath(); ctx.moveTo(W/2,0); ctx.lineTo(W,H/2); ctx.lineTo(W/2,H); ctx.lineTo(0,H/2); ctx.closePath(); ctx.fill(); ctx.globalAlpha=1; } },
    { id:'burst',    name:'ดาวระเบิด', draw: function(ctx,W,H,color,alpha){ ctx.globalAlpha=alpha; ctx.fillStyle=color; star(ctx,W/2,H/2,Math.min(W,H)*0.48,Math.min(W,H)*0.3,12); ctx.fill(); ctx.globalAlpha=1; } },
    { id:'tag',      name:'แท็ก',    draw: function(ctx,W,H,color,alpha){ ctx.globalAlpha=alpha; ctx.fillStyle=color; var r=H*0.18; ctx.beginPath(); ctx.moveTo(r,0); ctx.lineTo(W-H*0.35,0); ctx.lineTo(W,H/2); ctx.lineTo(W-H*0.35,H); ctx.lineTo(r,H); ctx.arcTo(0,H,0,H/2,r); ctx.arcTo(0,0,r,0,r); ctx.closePath(); ctx.fill(); ctx.globalAlpha=1; } },
    { id:'neon',     name:'นีออน',   draw: function(ctx,W,H,color,alpha){ ctx.globalAlpha=alpha; ctx.shadowColor=color; ctx.shadowBlur=18; ctx.strokeStyle=color; ctx.lineWidth=Math.max(2,H*0.07); roundRect(ctx,ctx.lineWidth,ctx.lineWidth,W-ctx.lineWidth*2,H-ctx.lineWidth*2,H*0.18); ctx.stroke(); ctx.shadowBlur=0; ctx.globalAlpha=1; } },
    { id:'double',   name:'กรอบซ้อน', draw: function(ctx,W,H,color,alpha){ ctx.globalAlpha=alpha; ctx.strokeStyle=color; ctx.lineWidth=Math.max(2,H*0.05); var lw=ctx.lineWidth; roundRect(ctx,lw,lw,W-lw*2,H-lw*2,H*0.15); ctx.stroke(); roundRect(ctx,lw*3,lw*3,W-lw*6,H-lw*6,H*0.12); ctx.stroke(); ctx.globalAlpha=1; } },
  ];

  function roundRect(ctx,x,y,w,h,r){ ctx.beginPath(); ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y); ctx.arcTo(x+w,y,x+w,y+r,r); ctx.lineTo(x+w,y+h-r); ctx.arcTo(x+w,y+h,x+w-r,y+h,r); ctx.lineTo(x+r,y+h); ctx.arcTo(x,y+h,x,y+h-r,r); ctx.lineTo(x,y+r); ctx.arcTo(x,y,x+r,y,r); ctx.closePath(); }
  function star(ctx,cx,cy,r1,r2,n){ ctx.beginPath(); for(var i=0;i<n*2;i++){ var a=i*Math.PI/n - Math.PI/2; var r=i%2===0?r1:r2; ctx.lineTo(cx+Math.cos(a)*r, cy+Math.sin(a)*r); } ctx.closePath(); }

  // state
  var _badgeColor   = '#f5c518';
  var _badgeTxtColor= '#000000';
  var _badgeStyle   = 'solid';

  // ── build preset thumbnails ──
  function buildBadgePreviews(){
    var grid = document.getElementById('badge-presets');
    if(!grid) return;
    grid.innerHTML = '';
    BADGE_STYLES.forEach(function(bs){
      var card = document.createElement('div');
      card.className = 'badge-preset' + (bs.id===_badgeStyle?' on':'');
      card.style.borderColor = bs.id===_badgeStyle ? 'var(--acc)' : '';
      card.dataset.bstyle = bs.id;

      var cv = document.createElement('canvas');
      cv.className = 'badge-preview';
      cv.width = 120; cv.height = 52;
      drawBadgeFrame(cv, bs.id, _badgeColor, 1, '');
      card.appendChild(cv);

      var nm = document.createElement('div');
      nm.className = 'badge-name'; nm.textContent = bs.name;
      card.appendChild(nm);

      card.addEventListener('click', function(){
        _badgeStyle = bs.id;
        document.querySelectorAll('.badge-preset').forEach(function(c){ c.classList.remove('on'); c.style.borderColor=''; });
        card.classList.add('on'); card.style.borderColor='var(--acc)';
      });
      grid.appendChild(card);
    });
  }

  // ── draw badge frame on canvas ──
  function drawBadgeFrame(canvas, styleId, color, alpha, text, txtColor, fontSize){
    var ctx = canvas.getContext('2d');
    var W = canvas.width, H = canvas.height;
    ctx.clearRect(0,0,W,H);
    var bs = BADGE_STYLES.find(function(s){ return s.id===styleId; }) || BADGE_STYLES[0];
    bs.draw(ctx, W, H, color, alpha);
    if(text){
      var fs = Math.min(fontSize||22, H*0.55);
      ctx.font = 'bold '+fs+'px "Segoe UI",sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = txtColor || '#000';
      // text shadow for readability
      ctx.shadowColor = (txtColor==='#ffffff'||txtColor==='#fff') ? 'rgba(0,0,0,.6)' : 'rgba(255,255,255,.4)';
      ctx.shadowBlur = 4;
      // wrap text if too wide
      var maxW = W * 0.88;
      var words = text.split(' ');
      var lines = []; var line = '';
      words.forEach(function(w){
        var test = line ? line+' '+w : w;
        if(ctx.measureText(test).width > maxW && line){ lines.push(line); line=w; }
        else line = test;
      });
      if(line) lines.push(line);
      var lineH = fs * 1.2;
      var startY = H/2 - (lines.length-1)*lineH/2;
      lines.forEach(function(l,i){ ctx.fillText(l, W/2, startY+i*lineH); });
      ctx.shadowBlur = 0;
    }
  }

  // ── create badge item (type='badge') ──
  function addBadgeToPreview(){
    var text   = (document.getElementById('badge-text-inp').value || 'ข้อความ').trim();
    var color  = _badgeColor;
    var txtCol = _badgeTxtColor;
    var blink  = parseInt(document.getElementById('badge-blink').value)||0;
    var fsize  = parseInt(document.getElementById('badge-fsize').value)||22;
    var styleId= _badgeStyle;

    var item = {
      id: 'stk'+STK.nid++,
      name: text.substring(0,20) || 'Badge',
      type: 'badge',
      badgeStyle: styleId,
      badgeColor: color,
      badgeTxtColor: txtCol,
      badgeBlink: blink,
      badgeFontSize: fsize,
      badgeText: text,
      x: 10, y: 10, w: 28, h: 18,
      opacity: 1,
      tIn: 0, tOut: 9999,
    };
    STK.items.push(item);
    renderStickerOnPreview(item);
    renderStickerList();
    selectSticker(item.id);
    showToast('✨ เพิ่มกรอบ "'+text+'"');
    document.getElementById('stk-cnt').textContent = STK.items.length;
  }

  // ── patch renderStickerOnPreview to handle badge type ──
  var _origRender = renderStickerOnPreview;
  renderStickerOnPreview = function(item){
    if(item.type !== 'badge'){ _origRender(item); return; }

    var old = document.getElementById('stk-el-'+item.id);
    if(old) old.remove();

    var wrap = document.getElementById('prev-wrap');
    if(!wrap || wrap.style.display === 'none') return;
    var container = document.getElementById('sticker-overlay-container');
    if(!container) return;

    var wW = wrap.offsetWidth || 640;
    var wH = wrap.offsetHeight || 360;

    var el = document.createElement('div');
    el.id = 'stk-el-'+item.id;
    el.className = 'stk-el';
    el.style.left   = (item.x/100*wW)+'px';
    el.style.top    = (item.y/100*wH)+'px';
    el.style.width  = (item.w/100*wW)+'px';
    el.style.height = (item.h/100*wH)+'px';
    el.style.opacity = item.opacity || 1;
    if(item.hidden) el.style.display = 'none';

    // canvas สำหรับวาด badge
    var cv = document.createElement('canvas');
    cv.style.cssText = 'width:100%;height:100%;display:block;border-radius:4px;pointer-events:none;';
    el.appendChild(cv);

    // draw ครั้งแรก
    function redraw(alpha){
      cv.width  = el.offsetWidth  || Math.floor(item.w/100*wW);
      cv.height = el.offsetHeight || Math.floor(item.h/100*wH);
      if(cv.width<2||cv.height<2) return;
      drawBadgeFrame(cv, item.badgeStyle, item.badgeColor, alpha!==undefined?alpha:1, item.badgeText, item.badgeTxtColor, item.badgeFontSize);
    }
    setTimeout(redraw, 30);

    // blink animation
    var blinkTimer = null;
    var _blinkOn = true;
    function startBlink(){
      if(!item.badgeBlink || item.badgeBlink===0) return;
      blinkTimer = setInterval(function(){
        _blinkOn = !_blinkOn;
        redraw(_blinkOn ? 1 : 0.1);
      }, item.badgeBlink);
    }
    function stopBlink(){ clearInterval(blinkTimer); blinkTimer=null; redraw(1); }
    startBlink();
    window.addEventListener('wave-play', startBlink);
    window.addEventListener('wave-stop', stopBlink);

    // resize handles
    ['tl','tr','bl','br'].forEach(function(pos){
      var h = document.createElement('div');
      h.className = 'stk-hdl '+pos;
      h.addEventListener('mousedown', function(e){
        e.stopPropagation(); e.preventDefault();
        var sx=e.clientX, sy=e.clientY;
        var ox=item.x, oy=item.y, ow=item.w, oh=item.h;
        function onMove(e2){
          var dx=(e2.clientX-sx)/wW*100, dy=(e2.clientY-sy)/wH*100;
          if(pos==='br'){ item.w=Math.max(5,ow+dx); item.h=Math.max(5,oh+dy); }
          else if(pos==='bl'){ item.x=Math.min(ox+ow-5,ox+dx); item.w=Math.max(5,ow-dx); item.h=Math.max(5,oh+dy); }
          else if(pos==='tr'){ item.y=Math.min(oy+oh-5,oy+dy); item.h=Math.max(5,oh-dy); item.w=Math.max(5,ow+dx); }
          else { item.x=Math.min(ox+ow-5,ox+dx); item.y=Math.min(oy+oh-5,oy+dy); item.w=Math.max(5,ow-dx); item.h=Math.max(5,oh-dy); }
          el.style.left=(item.x/100*wW)+'px'; el.style.top=(item.y/100*wH)+'px';
          el.style.width=(item.w/100*wW)+'px'; el.style.height=(item.h/100*wH)+'px';
          setTimeout(redraw,10);
          renderStickerList();
        }
        function onUp(){ document.removeEventListener('mousemove',onMove); document.removeEventListener('mouseup',onUp); }
        document.addEventListener('mousemove',onMove); document.addEventListener('mouseup',onUp);
      });
      el.appendChild(h);
    });

    // delete
    var del = document.createElement('div');
    del.className = 'stk-del'; del.textContent = '✕';
    del.addEventListener('mousedown', function(e){ e.stopPropagation(); stopBlink(); removeStickerItem(item.id); });
    el.appendChild(del);

    // double-click to edit text
    el.addEventListener('dblclick', function(e){
      e.stopPropagation();
      var newText = prompt('แก้ไขข้อความในกรอบ:', item.badgeText);
      if(newText !== null){ item.badgeText = newText.trim()||item.badgeText; setTimeout(redraw,10); renderStickerList(); }
    });

    // drag
    el.addEventListener('mousedown', function(e){
      if(e.target.classList.contains('stk-hdl')||e.target.classList.contains('stk-del')) return;
      e.preventDefault(); e.stopPropagation();
      selectSticker(item.id);
      var sx=e.clientX, sy=e.clientY, ox=item.x, oy=item.y;
      function onMove(e2){
        item.x=Math.max(0,Math.min(100-item.w,ox+(e2.clientX-sx)/wW*100));
        item.y=Math.max(0,Math.min(100-item.h,oy+(e2.clientY-sy)/wH*100));
        el.style.left=(item.x/100*wW)+'px'; el.style.top=(item.y/100*wH)+'px';
      }
      function onUp(){ document.removeEventListener('mousemove',onMove); document.removeEventListener('mouseup',onUp); }
      document.addEventListener('mousemove',onMove); document.addEventListener('mouseup',onUp);
    });
    el.addEventListener('click', function(e){ e.stopPropagation(); selectSticker(item.id); });

    container.appendChild(el);
  };

  // ── patch renderStickerList thumbnail for badge ──
  var _origRenderList = renderStickerList;
  renderStickerList = function(){
    var list = document.getElementById('stk-list');
    if(!list) return;
    list.innerHTML = '';
    STK.items.forEach(function(item){
      var d = document.createElement('div');
      d.className = 'stk-item'+(STK.selId===item.id?' on':'');
      var thumbHtml;
      if(item.type==='badge'){
        thumbHtml = '<canvas id="bdg-th-'+item.id+'" width="44" height="30" style="border-radius:4px;display:block;"></canvas>';
      } else {
        thumbHtml = item.type==='video'
          ? '<video src="'+item.url+'" muted style="width:100%;height:100%;object-fit:contain;"></video>'
          : '<img src="'+item.url+'" style="width:100%;height:100%;object-fit:contain;"/>';
      }
      d.innerHTML =
        '<div class="stk-thumb">'+thumbHtml+'</div>'+
        '<div class="stk-info"><div class="stk-name">'+(item.type==='badge'?'✨ ':'')+item.name+'</div>'+
        '<div class="stk-sz">'+item.w.toFixed(0)+'% × '+item.h.toFixed(0)+'%</div></div>'+
        '<div class="stk-acts">'+
          '<button class="stk-act" data-a="vis" title="แสดง/ซ่อน">👁</button>'+
          '<button class="stk-act del" data-a="del" title="ลบ">✕</button>'+
        '</div>';
      d.addEventListener('click', function(e){
        if(e.target.dataset.a==='del'){ removeStickerItem(item.id); return; }
        if(e.target.dataset.a==='vis'){ toggleStickerVisibility(item.id); return; }
        selectSticker(item.id);
      });
      list.appendChild(d);
      // draw badge thumb
      if(item.type==='badge'){
        setTimeout(function(){
          var tc = document.getElementById('bdg-th-'+item.id);
          if(tc) drawBadgeFrame(tc, item.badgeStyle, item.badgeColor, 1, item.badgeText, item.badgeTxtColor, 10);
        }, 30);
      }
    });
    document.getElementById('stk-cnt').textContent = STK.items.length;
  };

  // ── init UI controls ──
  function initBadgeUI(){
    // color swatches
    document.getElementById('badge-colors').addEventListener('click', function(e){
      var sw = e.target.closest('.badge-color-swatch');
      if(!sw) return;
      _badgeColor = sw.dataset.c;
      document.querySelectorAll('#badge-colors .badge-color-swatch').forEach(function(s){ s.classList.remove('on'); });
      sw.classList.add('on');
      buildBadgePreviews();
      // apply to selected badge
      if(STK.selId){
        var it = STK.items.find(function(s){ return s.id===STK.selId&&s.type==='badge'; });
        if(it){ it.badgeColor=_badgeColor; renderStickerOnPreview(it); }
      }
    });
    document.getElementById('badge-custom-color').addEventListener('input', function(){
      _badgeColor = this.value;
      document.querySelectorAll('#badge-colors .badge-color-swatch').forEach(function(s){ s.classList.remove('on'); });
      buildBadgePreviews();
      if(STK.selId){
        var it = STK.items.find(function(s){ return s.id===STK.selId&&s.type==='badge'; });
        if(it){ it.badgeColor=_badgeColor; renderStickerOnPreview(it); }
      }
    });

    document.getElementById('badge-txtcolors').addEventListener('click', function(e){
      var sw = e.target.closest('.badge-color-swatch');
      if(!sw) return;
      _badgeTxtColor = sw.dataset.c;
      document.querySelectorAll('#badge-txtcolors .badge-color-swatch').forEach(function(s){ s.classList.remove('on'); });
      sw.classList.add('on');
      if(STK.selId){
        var it = STK.items.find(function(s){ return s.id===STK.selId&&s.type==='badge'; });
        if(it){ it.badgeTxtColor=_badgeTxtColor; renderStickerOnPreview(it); }
      }
    });
    document.getElementById('badge-custom-txtcolor').addEventListener('input', function(){
      _badgeTxtColor = this.value;
      document.querySelectorAll('#badge-txtcolors .badge-color-swatch').forEach(function(s){ s.classList.remove('on'); });
      if(STK.selId){
        var it = STK.items.find(function(s){ return s.id===STK.selId&&s.type==='badge'; });
        if(it){ it.badgeTxtColor=_badgeTxtColor; renderStickerOnPreview(it); }
      }
    });

    // font size slider
    document.getElementById('badge-fsize').addEventListener('input', function(){
      document.getElementById('badge-fsize-v').textContent = this.value;
      if(STK.selId){
        var it = STK.items.find(function(s){ return s.id===STK.selId&&s.type==='badge'; });
        if(it){ it.badgeFontSize=parseInt(this.value); renderStickerOnPreview(it); }
      }
    });

    // blink
    document.getElementById('badge-blink').addEventListener('change', function(){
      if(STK.selId){
        var it = STK.items.find(function(s){ return s.id===STK.selId&&s.type==='badge'; });
        if(it){ it.badgeBlink=parseInt(this.value)||0; renderStickerOnPreview(it); }
      }
    });

    // text input live update
    document.getElementById('badge-text-inp').addEventListener('input', function(){
      if(STK.selId){
        var it = STK.items.find(function(s){ return s.id===STK.selId&&s.type==='badge'; });
        if(it){ it.badgeText=this.value; it.name=this.value.substring(0,20)||'Badge'; renderStickerOnPreview(it); renderStickerList(); }
      }
    });

    // add button
    document.getElementById('btn-add-badge').addEventListener('click', addBadgeToPreview);

    buildBadgePreviews();
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded', initBadgeUI);
  } else {
    setTimeout(initBadgeUI, 200);
  }
})();


// ══════════════════════════════════════════════════════
// ⚡ NATIVE EXPORT — ใช้ ffmpeg binary แทน WASM (เร็วกว่า 10-50x)
// ══════════════════════════════════════════════════════
(function(){
  var btn = document.getElementById('exp-native');
  if(!btn) return;

  // แสดงปุ่มเฉพาะใน Electron
  if(typeof window.electronAPI !== 'undefined' && window.electronAPI.isElectron){
    btn.style.display = '';
  }

  btn.addEventListener('click', async function(){
    buildQueue();
    if(!playQueue.length){ showToast('⚠️ ลากวิดีโอมาใส่ไทม์ไลน์ก่อน'); return; }

    // เลือก output path ก่อน
    var fname = (document.getElementById('exp-name').value || 'suomsiang_output') + '.mp4';
    var pathRes = await window.electronAPI.chooseExportPath(fname);
    if(!pathRes.ok) return;
    var outputPath = pathRes.filePath;

    btn.disabled = true; btn.textContent = '⚡ กำลัง export...';
    var epw = document.getElementById('ep-wrap'); epw.style.display = 'block';
    var epf = document.getElementById('ep-fill'); epf.style.width = '0';
    var eps = document.getElementById('ep-stat');

    // ดึง resolution
    var resEl = document.querySelector('.em-res.on');
    var res = resEl ? resEl.dataset.eres : '1280x720';
    var earEl = document.querySelector('.em-ar.on');
    var ear = earEl ? earEl.dataset.ear : '16:9';
    var resParts = (res||'1280x720').split('x');
    var tw = parseInt(resParts[0])||1280;
    var th = parseInt(resParts[1])||720;
    if(ear==='9:16'||ear==='4:5'){ var tmp=tw; tw=th; th=tmp; }
    if(tw%2!==0) tw--; if(th%2!==0) th--;

    var crf = document.getElementById('exp-q') ? parseInt(document.getElementById('exp-q').value)||23 : 23;
    var fps = document.getElementById('exp-fps') ? parseInt(document.getElementById('exp-fps').value)||30 : 30;
    var ps = pxSec();

    // ฟัง progress
    window.electronAPI.onExportProgress(function(data){
      if(data.pct !== undefined) epf.style.width = data.pct + '%';
      if(data.msg) eps.textContent = '⚡ ' + data.msg;
      else if(data.step !== undefined) eps.textContent = '⚡ encode (' + (data.step+1) + '/' + data.total + ')...';
    });

    // เตรียม jobs — อ่านไฟล์เป็น ArrayBuffer
    var jobs = [];
    for(var i=0; i<playQueue.length; i++){
      var qItem = playQueue[i];
      var entry = qItem.entry;
      var c = qItem.c;
      var ext = '.' + (entry.file.name.split('.').pop().toLowerCase() || 'mp4');
      var isImage = entry.type === 'image';

      eps.textContent = '📂 อ่านไฟล์ (' + (i+1) + '/' + playQueue.length + ')...';
      epf.style.width = Math.round(i/playQueue.length*20) + '%';

      var ab = await entry.file.arrayBuffer();

      var tIn = c.tIn !== undefined ? c.tIn : 0;
      var clipDur = c.w / ps;
      var vf = 'scale='+tw+':'+th+':force_original_aspect_ratio=decrease,pad='+tw+':'+th+':(ow-iw)/2:(oh-ih)/2:black,setsar=1';

      jobs.push({
        data: ab, ext: ext, isImage: isImage,
        tIn: tIn, dur: clipDur, tw: tw, th: th, vf: vf
      });
    }

    eps.textContent = '📂 อ่านไฟล์เสียง...';

    // ── เตรียม audio file (bgAudio track) ──
    var audioJob = null;
    var ps2 = pxSec();
    var audioClips = Array.from(document.getElementById('tr-a').querySelectorAll('.clip'));
    if(audioClips.length > 0){
      var aEl = audioClips[0];
      var aCid = aEl.dataset.cid;
      var aC = S.clips[aCid];
      if(aC){
        var aEntry = S.files.find(function(f){ return f.id === aC.fid; });
        if(aEntry && aEntry.file){
          var aAb = await aEntry.file.arrayBuffer();
          var aExt = '.' + (aEntry.file.name.split('.').pop().toLowerCase() || 'mp3');
          var aStart = (aC.startSec !== undefined) ? aC.startSec : (aC.left/ps2);
          var tInA = aC.tIn || 0;
          audioJob = { data: aAb, ext: aExt, startSec: aStart, tIn: tInA };
        }
      }
    }

    // ── เตรียม waveform overlay PNG ──
    var waveDataUrl = null;
    if(window.S_WAVES && window.S_WAVES.length > 0){
      eps.textContent = '〰️ render waveform...';
      waveDataUrl = buildWaveOverlayPNG(tw, th, 0, 99999);
    }

    eps.textContent = '⚡ เริ่ม Native Export...';

    var result = await window.electronAPI.nativeExport(jobs, outputPath, fps, crf, audioJob, waveDataUrl);

    window.electronAPI.removeExportProgress();
    btn.disabled = false; btn.textContent = '⚡ Native Export (เร็ว)';

    if(result.ok){
      epf.style.width = '100%';
      eps.textContent = '✅ บันทึกแล้วที่: ' + result.filePath;
      showToast('🎉 Export สำเร็จ! ⚡ Native FFmpeg');
      window.electronAPI.showFile(result.filePath);
    } else {
      eps.textContent = '❌ ' + result.error;
      showToast('❌ Export ไม่สำเร็จ: ' + (result.error||'').substring(0,50));
    }
  });
})();
