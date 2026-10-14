const $=id=>document.getElementById(id);let teamId=localStorage.getItem('ukQuizTeam')||'',venueId='woolpack',data=null,offset=0,refreshSerial=0,selectedAnswer=null,selectedQuestion=-1,historyPicks=[];
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function api(path,body,key){const r=await fetch('/api/'+path,{method:'POST',headers:{'Content-Type':'application/json',...(key?{'X-Admin-Key':key}:{})},body:JSON.stringify(body)});const j=await r.json();if(!r.ok)throw Error(j.error||'Request failed');return j}
function tab(name){for(let n of ['play','board','admin','screen'])$(n).hidden=n!==name;}
$('playTab').onclick=()=>tab('play');$('boardTab').onclick=()=>tab('board');$('adminTab').onclick=()=>tab('admin');$('screenTab').onclick=()=>tab('screen');
$('joinBtn').onclick=async()=>{try{let r=await api('join',{venueId:'woolpack',name:$('teamName').value});teamId=r.teamId;localStorage.setItem('ukQuizTeam',teamId);$('join').hidden=true;$('game').hidden=false;$('teamInfo').textContent=$('teamName').value+' • Connected';await refresh()}catch(e){alert(e.message)}};
function venueSelect(el,venues,selected){let old=el.value;el.innerHTML=venues.map(v=>`<option value="${esc(v.id)}">${esc(v.name)}</option>`).join('');el.value=venues.some(v=>v.id===(selected||old))?(selected||old):venues[0]?.id||'';}
function render(){
 if(!data)return;const d=data;
 if(d.index!==selectedQuestion){selectedQuestion=d.index;selectedAnswer=null;historyPicks=[];}
 if(d.team&&d.team.choice!==null&&d.team.choice!==undefined)selectedAnswer=d.team.choice;
 if(d.historyRound&&d.team?.historyOrder)historyPicks=d.team.historyOrder.slice();
 maybeCelebrate(d);
 const labels={waiting:'Waiting for the quizmaster',bonusIntro:'Fastest Finger First — get ready!',question:'Question live',reveal:'Correct answer revealed',break:'Break — scores stay hidden',higherIntro:'Higher or Lower — get ready!',higher:'Higher or Lower — make your prediction',higherReveal:'Higher or Lower — result',ceremony:'Prize ceremony',finished:'Quiz finished'};
 $('status').textContent=(labels[d.status]||d.status)+' • '+d.total+' main questions';updateQr();
 $('join').hidden=!!d.team;$('game').hidden=!d.team;
 if(d.team){
  $('teamInfo').textContent=d.team.name+' • '+(d.status==='finished'?d.team.score+' points':'Scores hidden until the end');
  $('round').textContent=d.index<0?'Get ready':'Question '+(d.index+1)+' of '+d.total;
  let q='',html='',message='';
  if(d.status==='bonusIntro'){q='⚡ FASTEST FINGER FIRST!';message='Get ready — the first correct team wins 150 points!';}
  else if(d.status==='higherIntro'){q='🔢 HIGHER OR LOWER! HOW FAR CAN YOU GO?';message='Eight rounds, eight seconds each. Correct: 20 points. Complete all eight: 50 bonus!';}
  else if(d.status==='higher'||d.status==='higherReveal'){
   const h=d.higher||{};q='🔢 HIGHER OR LOWER — ROUND '+(h.round||1)+' OF 8';
   html='<div class="higher-number">'+(h.current??'?')+'</div>';
   if(d.status==='higher'){
    if(h.eliminated)message='You are out of Higher or Lower. Your earned points are safe!';
    else if(h.choice)message='Prediction locked: '+h.choice.toUpperCase();
    else{message='Will the next number (1–10) be higher or lower?';html+='<div class="higher-controls"><button data-higher="higher">⬆ HIGHER</button><button data-higher="lower">⬇ LOWER</button></div>';}
   }else{html+='<div class="higher-next">→ '+h.next+'</div>';message=h.results?.matched?'MATCH! The minigame ends here.':h.eliminated?'You are out — points already earned are kept.':h.finished?'Eight rounds completed! Survivors earn 50 bonus points.':'Get ready for the next number!';}
  }else if(d.status==='question'||d.status==='reveal'){
   q=d.question?.q||'';
   if(d.historyRound){
    q='📜 PUT THE EVENTS IN ORDER — EARLIEST TO LATEST';
    if(d.status==='reveal'){
     html='<div class="history-instructions">CORRECT ORDER — EARLIEST TO LATEST</div>'+(d.question?.correctOrder||[]).map((n,i)=>`<div class="history-correct">${i+1}. ${esc(d.question.events[n])}</div>`).join('');
    }else{
     html='<div class="history-instructions">Tap each event in order, starting with the earliest. You have '+d.historySeconds+' seconds.</div>'+(d.question?.events||[]).map((event,i)=>`<button data-history="${i}" ${d.team.answered||historyPicks.includes(i)?'disabled':''} class="${historyPicks.includes(i)?'history-picked':''}">${historyPicks.includes(i)?historyPicks.indexOf(i)+1+'. ':''}${esc(event)}</button>`).join('');
     if(!d.team.answered)html+='<div class="history-progress">'+historyPicks.map((n,i)=>`${i+1}. ${esc(d.question.events[n])}`).join(' → ')+'</div><button data-history-undo="1" '+(!historyPicks.length?'disabled':'')+'>↶ Undo last</button>';
    }
    message=d.status==='reveal'?'The correct chronological order is shown above.':d.team.answered?'Your order is locked in!':historyPicks.length===4?'All four chosen — submitting your answer…':'Select '+(4-historyPicks.length)+' more event(s).';
   }else{
    html=(d.question?.a||[]).map((a,i)=>`<button data-choice="${i}" ${d.team.answered||d.status!=='question'?'disabled':''} class="${[d.status==='reveal'&&d.question.correct===i?'answer-reveal':'',selectedAnswer===i?'selected':''].filter(Boolean).join(' ')}">${String.fromCharCode(65+i)}. ${esc(a)}</button>`).join('');
    message=d.status==='reveal'?(d.bonusWinner&&d.bonusRound?'⚡ Well done, '+d.bonusWinner+'! Fastest Finger First winner!':'Correct answer revealed!'):(d.team.answered?'Answer locked in — good luck!':d.bonusRound?'⚡ First correct: 150 points. Other correct: 50 points.':'Choose your answer before time runs out.');
   }
  }else if(d.status==='break'){q='Take a break!';message='Next question starts automatically.';}
  else if(d.status==='ceremony'){q='The results are in!';message='Watch the TV for the prize announcements.';}
  else if(d.status==='finished'){q='Thanks for playing!';message='Check the final leaderboard.';}
  else q='The quiz will begin shortly.';
  $('question').textContent=q;$('options').innerHTML=html;$('message').textContent=message;
  $('options').querySelectorAll('[data-choice]').forEach(b=>b.onclick=async()=>{selectedAnswer=Number(b.dataset.choice);$('options').querySelectorAll('[data-choice]').forEach(x=>x.classList.toggle('selected',Number(x.dataset.choice)===selectedAnswer));try{await api('answer',{teamId,choice:selectedAnswer});await refresh()}catch(e){$('message').textContent=e.message}});
  $('options').querySelectorAll('[data-history]').forEach(b=>b.onclick=async()=>{
   const n=Number(b.dataset.history);if(historyPicks.includes(n)||historyPicks.length>=4)return;
   historyPicks.push(n);
   if(historyPicks.length===4){try{await api('history',{teamId,order:historyPicks});await refresh()}catch(e){$('message').textContent=e.message;historyPicks=[];render()}}
   else render();
  });
  $('options').querySelectorAll('[data-history-undo]').forEach(b=>b.onclick=()=>{historyPicks.pop();render()});
  $('options').querySelectorAll('[data-higher]').forEach(b=>b.onclick=async()=>{try{await api('higher',{teamId,choice:b.dataset.higher});await refresh()}catch(e){$('message').textContent=e.message}});
 }
 $('scores').innerHTML=d.status!=='finished'?'Scores remain secret until the winners are announced.':d.leaderboard.length?d.leaderboard.map((t,i)=>`<div class="rank"><span>${i+1}. ${esc(t.name)}</span><b>${t.score}</b></div>`).join(''):'No teams joined.';
 $('revealBtn').disabled=true;$('publishBtn').disabled=true;
 $('privateResults').textContent=d.status==='ceremony'?'Quizmaster only: '+(d.privateLeaderboard?.map((t,i)=>`${i+1}. ${t.name} — ${t.score} pts`).join(' | ')||'No teams'):'Private results become available during the prize ceremony.';
 let heading='',content='';
 if(d.status==='bonusIntro'){heading='⚡ FASTEST FINGER FIRST!';content='<div class="intro-card"><h2>BE THE FIRST TO ANSWER CORRECTLY!</h2><p>FIRST CORRECT 150 POINTS • OTHER CORRECT 50 POINTS</p></div>';}
 else if(d.status==='higherIntro'){heading='🔢 HIGHER OR LOWER!';content='<div class="intro-card"><h2>HOW FAR CAN YOU GO?</h2><p>8 ROUNDS • 8 SECONDS EACH • 20 POINTS PER CORRECT PICK • 50 BONUS TO FINISH</p></div>';}
 else if(d.status==='higher'||d.status==='higherReveal'){
  const h=d.higher||{};heading='HIGHER OR LOWER — ROUND '+(h.round||1)+' OF 8';
  content='<div class="higher-number">'+(h.current??'?')+'</div>'+(d.status==='higherReveal'?'<div class="higher-next">→ '+h.next+'</div><h2>'+(h.results?.matched?'MATCH! GAME OVER':h.finished?'EIGHT ROUNDS COMPLETE!':h.next>h.current?'HIGHER!':'LOWER!')+'</h2>':'<h2>WILL THE NEXT NUMBER BE HIGHER OR LOWER?</h2>')+'<div class="screen-timer" id="screenTimer"></div>';
 }else if(d.status==='ceremony'){heading=['THE RESULTS ARE IN','THIRD PLACE','SECOND PLACE','FIRST PLACE'][d.revealStep||0];content=d.podium.length?d.podium.map(t=>`<div class="podium"><span>${t.place===1?'🥇':t.place===2?'🥈':'🥉'} ${t.place}${t.place===1?'ST':t.place===2?'ND':'RD'} PLACE</span><strong>${esc(t.name)}</strong><span>${t.score} POINTS</span></div>`).join(''):'<h2>Who will take third place?</h2>';}
 else if(d.status==='finished'){heading='FINAL LEADERBOARD';content=d.leaderboard.map((t,i)=>`<div class="rank">${i+1}. ${esc(t.name)} <b>${t.score}</b></div>`).join('');}
 else if(d.status==='question'||d.status==='reveal'){
  heading=d.historyRound?'📜 PUT THE EVENTS IN ORDER':d.bonusRound?'⚡ FASTEST FINGER FIRST':(d.status==='reveal'?'ANSWER TO QUESTION ':'QUESTION ')+(d.index+1);
  content=(d.bonusRound?'<p class="bonus-banner">FIRST CORRECT 150 • OTHER CORRECT 50 • WRONG 0</p>':'')+'<h2>'+esc(d.question?.q||'')+'</h2>';
  if(d.historyRound)content+='<div class="history-instructions">'+d.historySeconds+' SECONDS • TAP EVENTS EARLIEST TO LATEST ON YOUR PHONE</div>'+ (d.status==='reveal'?(d.question.correctOrder||[]).map((n,i)=>`<div class="history-correct">${i+1}. ${esc(d.question.events[n])}</div>`).join(''):(d.question.events||[]).map((e,i)=>`<div class="history-event">${String.fromCharCode(65+i)}. ${esc(e)}</div>`).join(''));
  if(d.status==='reveal'&&!d.historyRound){content+='<div class="screen-answers">'+(d.question?.a||[]).map((a,i)=>`<div class="${i===d.question.correct?'answer-reveal':''}">${String.fromCharCode(65+i)}. ${esc(a)}</div>`).join('')+'</div>';
   if(d.bonusRound)content+='<div class="winner-callout">'+(d.bonusWinner?'🎉 WELL DONE, '+esc(d.bonusWinner)+'! 🎉':'No correct answers this round')+'</div>';
  }
  content+='<div class="screen-timer" id="screenTimer"></div>';
 }else if(d.status==='break'){heading='TAKE A BREAK';content='<h2>Next question coming up!</h2><div class="screen-timer" id="screenTimer"></div>';}
 else{heading='THE BIG BRITISH LOCK INN QUIZ';content='<h2>Scan the QR code to join!</h2>';}
 $('screenHeading').textContent=heading;$('screenContent').innerHTML=content;
 $('answerKey').innerHTML=d.answerKey?d.answerKey.map(x=>`<div class="rank"><span>${x.number}. ${esc(x.question)}</span><b>${esc(x.answer)}</b></div>`).join(''):'';$('answersPanel').hidden=!d.answerKey;tick();
}
function tick(){if(!data)return;$('timer').textContent=['question','reveal','break','bonusIntro','higherIntro','higher','higherReveal'].includes(data.status)?Math.max(0,Math.ceil((data.endsAt-(Date.now()+offset))/1000))+'s '+(data.status==='question'?'to answer':data.status==='reveal'?'answer reveal':data.status==='higher'?'to choose':data.status==='higherReveal'?'result':data.status==='bonusIntro'||data.status==='higherIntro'?'get ready':'until next question'):'';if($('screenTimer'))$('screenTimer').textContent=$('timer').textContent;}
async function refresh(){const requestedTeam=teamId,serial=++refreshSerial;try{let r=await fetch('/api/state?teamId='+encodeURIComponent(requestedTeam),{cache:'no-store',headers:$('adminKey').value?{'X-Admin-Key':$('adminKey').value}:{}});if(!r.ok)throw Error('Server unavailable');let d=await r.json();if(serial!==refreshSerial||requestedTeam!==teamId)return;offset=d.serverTime-Date.now();if(requestedTeam&&!d.team){$('status').textContent='Reconnecting your team…';return}data=d;if(d.admin){$('questionSeconds').value=d.questionSeconds;$('breakSeconds').value=d.breakSeconds;}render()}catch(e){if(serial===refreshSerial)$('status').textContent='Disconnected — retrying…'}}
function updateQr(){let url=new URL('/',location.href);$('qrLink').href=url.href;$('qrLink').textContent=url.href;$('qrImage').src='https://api.qrserver.com/v1/create-qr-code/?size=320x320&data='+encodeURIComponent(url.href);}
$('printQr').onclick=()=>window.print();
document.querySelectorAll('[data-action]').forEach(b=>b.onclick=async()=>{if(b.dataset.action==='reset'&&!confirm('Start a new game? This clears all current teams and scores.'))return;try{await api('admin/'+b.dataset.action,{},$('adminKey').value);$('adminMessage').textContent='Action completed';await refresh()}catch(e){$('adminMessage').textContent=e.message}});

let stream=new EventSource('/api/events');stream.onmessage=()=>refresh();setInterval(tick,250);setInterval(refresh,5000);refresh();

$('saveTimers').onclick=async()=>{try{await api('admin/settings',{questionSeconds:Number($('questionSeconds').value),breakSeconds:Number($('breakSeconds').value)},$('adminKey').value);$('adminMessage').textContent='Timers saved';await refresh()}catch(e){$('adminMessage').textContent=e.message}};

$('adminKey').addEventListener('change',refresh);

// Celebrate only the player's own correct answer, once per question, after time expires.
function maybeCelebrate(d){
 if(d.status!=='reveal'||!d.team||!d.question)return;
 if(d.historyRound){if(!d.team.historyOrder||!d.team.historyOrder.every((n,i)=>n===d.question.correctOrder[i]))return;}
 else if(d.team.choice===null||d.team.choice===undefined||d.team.choice!==d.question.correct)return;
 const key='woolpack-confetti:'+d.gameId+':'+d.index+':'+d.team.id;
 if(sessionStorage.getItem(key))return;
 sessionStorage.setItem(key,'1');
 const layer=document.createElement('div');layer.className='woolpack-confetti-layer';layer.setAttribute('aria-hidden','true');document.body.appendChild(layer);
 const colors=['#e5f6c8','#a8d7a5','#ffffff','#f2d57a','#b8d6c0','#d4eab5'];
 for(let i=0;i<70;i++){
  const piece=document.createElement('i');piece.className='woolpack-confetti-piece';
  piece.style.setProperty('--x',(Math.random()*100).toFixed(2)+'vw');
  piece.style.setProperty('--drift',((Math.random()-.5)*180).toFixed(0)+'px');
  piece.style.setProperty('--delay',(Math.random()*.45).toFixed(2)+'s');
  piece.style.setProperty('--duration',(1.8+Math.random()*1.4).toFixed(2)+'s');
  piece.style.backgroundColor=colors[i%colors.length];layer.appendChild(piece);
 }
 setTimeout(()=>layer.remove(),3900);
}
