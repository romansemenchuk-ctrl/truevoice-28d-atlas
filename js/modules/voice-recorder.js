/* Recordings stay in this browser's IndexedDB. No microphone uploads. */
class VoiceJourneyRecorder {
  constructor(){
    this.mediaRecorder=null;this.isRecording=false;this.isStarting=false;this.stream=null;this.db=null;this.animId=null;this.audioCtx=null;this.token=0;this.stopPromise=null;this.lastError='';
    this.ready=this.initDB();this.ready.catch(()=>{});
    window.addEventListener('pagehide',()=>{this.cancelPending();if(this.isRecording)this.stopRecording(this.lessonKey||'unknown').catch(()=>{});this.releaseTracks();});
  }
  initDB(){return new Promise((resolve,reject)=>{
    if(!window.indexedDB){reject(new Error('Цей браузер не підтримує локальне сховище записів.'));return;}
    let req;try{req=indexedDB.open('TrueVoiceRecordings',1);}catch(e){reject(e);return;}
    req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains('samples'))req.result.createObjectStore('samples',{keyPath:'id'});};
    req.onsuccess=()=>{this.db=req.result;this.db.onversionchange=()=>{this.db.close();this.db=null;};resolve(this.db);};
    req.onerror=()=>reject(req.error||new Error('Локальне сховище недоступне.'));
    req.onblocked=()=>reject(new Error('Закрий інші вкладки атласу й повтори спробу.'));
  });}
  cancelPending(){this.token++;this.isStarting=false;}
  async startRecording(canvasEl,lessonKey){
    if(this.isRecording||this.isStarting||this.stopPromise)return false;
    const token=++this.token;this.isStarting=true;this.lastError='';this.canvas=canvasEl;this.lessonKey=lessonKey;
    try{
      await this.ready;if(!this.db)throw new Error('Сховище записів закрите. Перезавантаж сторінку.');
      if(token!==this.token)return false;
      if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder)throw new Error('Для запису потрібен підтримуваний браузер і HTTPS або localhost.');
      const stream=await navigator.mediaDevices.getUserMedia({audio:true});
      if(token!==this.token||document.hidden){stream.getTracks().forEach(t=>t.stop());return false;}
      this.stream=stream;this.chunks=[];
      const mime=['audio/webm;codecs=opus','audio/mp4','audio/webm','audio/ogg;codecs=opus'].find(t=>MediaRecorder.isTypeSupported(t));
      this.mediaRecorder=new MediaRecorder(stream,mime?{mimeType:mime}:undefined);
      this.mediaRecorder.ondataavailable=e=>{if(e.data.size)this.chunks.push(e.data);};
      this.mediaRecorder.start(250);this.isRecording=true;
      try{this.startVisualizer();}catch(e){console.warn('Voice visualizer unavailable',e);this.stopVisualizer();}
      return true;
    }catch(e){this.lastError=e.name==='NotAllowedError'?'Доступ до мікрофона не надано. Дозволь його в налаштуваннях браузера.':e.message;this.releaseTracks();this.stopVisualizer();return false;}
    finally{if(token===this.token)this.isStarting=false;}
  }
  stopRecording(lessonKey=this.lessonKey){
    if(this.stopPromise)return this.stopPromise;
    if(!this.mediaRecorder||!this.isRecording)return Promise.resolve(null);
    const recorder=this.mediaRecorder;this.isRecording=false;
    this.stopPromise=new Promise((resolve,reject)=>{
      recorder.onstop=async()=>{
        try{
          const mime=recorder.mimeType||this.chunks[0]?.type||'audio/webm';
          const blob=new Blob(this.chunks,{type:mime});if(!blob.size)throw new Error('Запис порожній. Спробуй ще раз.');
          const record={id:`rec_${lessonKey}_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,lessonKey,date:new Date().toISOString(),blob};
          await this.saveSample(record);resolve(record);
        }catch(e){this.lastError='Не вдалося зберегти запис: '+e.message;reject(e);}
        finally{this.releaseTracks();this.stopVisualizer();this.mediaRecorder=null;this.chunks=[];}
      };
      recorder.onerror=e=>{this.releaseTracks();this.stopVisualizer();reject(e.error||new Error('Помилка запису.'));};
      try{recorder.stop();this.releaseTracks();this.stopVisualizer();}catch(e){this.releaseTracks();this.stopVisualizer();reject(e);}
    }).finally(()=>{this.stopPromise=null;});return this.stopPromise;
  }
  releaseTracks(){this.stream?.getTracks().forEach(t=>t.stop());this.stream=null;}
  startVisualizer(){
    if(!this.canvas||!this.stream)return;
    const C=window.AudioContext||window.webkitAudioContext;if(!C)return;
    this.audioCtx=new C();const source=this.audioCtx.createMediaStreamSource(this.stream);const analyser=this.audioCtx.createAnalyser();analyser.fftSize=256;source.connect(analyser);
    const data=new Uint8Array(analyser.frequencyBinCount),canvas=this.canvas,g=canvas.getContext('2d');if(!g)return;
    const motion=matchMedia('(prefers-reduced-motion: reduce)');let last=0;
    const draw=t=>{if(!this.isRecording||!canvas.isConnected)return;if(t-last>=(motion.matches?250:33)){
      last=t;const d=Math.min(devicePixelRatio||1,2),w=Math.max(1,canvas.clientWidth),h=Math.max(1,canvas.clientHeight);
      if(canvas.width!==Math.round(w*d)||canvas.height!==Math.round(h*d)){canvas.width=Math.round(w*d);canvas.height=Math.round(h*d);}
      g.setTransform(d,0,0,d,0,0);g.clearRect(0,0,w,h);analyser.getByteFrequencyData(data);g.fillStyle='#ff382e';const n=48,b=w/n;
      for(let i=0;i<n;i++){const y=data[i]/255*h*.85;g.fillRect(i*b,h-y,Math.max(1,b-2),y);}
    }this.animId=requestAnimationFrame(draw);};this.animId=requestAnimationFrame(draw);
  }
  stopVisualizer(){cancelAnimationFrame(this.animId);this.animId=null;this.audioCtx?.close().catch(()=>{});this.audioCtx=null;if(this.canvas){const g=this.canvas.getContext('2d');g?.clearRect(0,0,this.canvas.width,this.canvas.height);}}
  async transaction(mode,operation){await this.ready;if(!this.db)throw new Error('Сховище недоступне.');return new Promise((resolve,reject)=>{const tx=this.db.transaction('samples',mode),req=operation(tx.objectStore('samples'));let result;req.onsuccess=()=>result=req.result;tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('Збереження скасовано.'));});}
  saveSample(record){return this.transaction('readwrite',s=>s.put(record));}
  getAllSamples(){return this.transaction('readonly',s=>s.getAll());}
  async getSamplesForLesson(key){return(await this.getAllSamples()).filter(r=>r.lessonKey===key).sort((a,b)=>b.date.localeCompare(a.date));}
  deleteSample(id){return this.transaction('readwrite',s=>s.delete(id));}
}
window.VoiceJourneyRecorder=VoiceJourneyRecorder;window.voiceRecorder=new VoiceJourneyRecorder();
