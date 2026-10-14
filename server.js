const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const PORT=process.env.PORT||3000, ADMIN_KEY=process.env.ADMIN_KEY||'change-me-before-launch', DATA=process.env.DATA_FILE||path.join(__dirname,'data.json');
const questionBank=require('./questions.json');
const questions=questionBank.slice(0,30);
const historyBank=require('./history_order.json');
const HISTORY_SLOTS=[4,24], HALFWAY_INDEX=14;
function newHigher(){return {round:0,current:1+crypto.randomInt(10),next:null,choices:{},out:{},finished:false,matched:false,results:[]};}
function prepNext(g){g.higher.next=1+crypto.randomInt(10);g.higher.choices={};}
function startQuestion(g,at){g.index++;g.status=BONUS_ROUNDS.includes(g.index)?'bonusIntro':'question';g.startsAt=at;g.endsAt=at+(g.status==='bonusIntro'?5000:(HISTORY_SLOTS.includes(g.index)?g.questionSeconds+20:g.questionSeconds)*1000);}

// Three Fastest Finger First questions within the normal 30-question game.
const BONUS_ROUNDS=[9,19,29]; // zero-based: questions 10, 20 and 30
function isBonus(index){return BONUS_ROUNDS.includes(index);}
let db={venues:[{id:'woolpack',name:process.env.VENUE_NAME||'The Woolpack, Esholt'}],teams:[],answers:{},game:{id:1,status:'waiting',index:-1,startsAt:null,endsAt:null,questionSeconds:15,breakSeconds:20,questions}};
try {let saved=JSON.parse(fs.readFileSync(DATA)); if(saved&&saved.game&&Array.isArray(saved.venues)){db=saved;db.venues=[{id:'woolpack',name:process.env.VENUE_NAME||'The Woolpack, Esholt'}];db.teams=db.teams.filter(t=>t.venueId==='woolpack');if(db.game.status==='waiting'){db.game.questions=questions;db.game.index=-1;db.game.questionSetSelected=false;db.game.questionSeconds=15;db.game.breakSeconds=20;}if(!Number.isInteger(db.game.revealStep))db.game.revealStep=0;}}catch{}
// Persist used question IDs so games rotate through the entire question bank.
if(!Array.isArray(db.usedQuestionIds))db.usedQuestionIds=[];
function drawQuestions(){
 const used=new Set(db.usedQuestionIds);
 if(questionBank.length-used.size<30){db.usedQuestionIds=[];used.clear();}
 const categories=[...new Set(questionBank.map(q=>q.category))];
 const available=questionBank.map((q,i)=>({...q,bankId:i})).filter(q=>!used.has(q.bankId));
 const shuffled=a=>a.sort(()=>Math.random()-.5);
 const picked=[];const pickedIds=new Set();
 // Mix categories: include at least one question from each represented category.
 for(const category of shuffled([...categories])){
  const choice=shuffled(available.filter(q=>q.category===category&&!pickedIds.has(q.bankId)))[0];
  if(choice&&picked.length<30){picked.push(choice);pickedIds.add(choice.bankId);}
 }
 for(const q of shuffled(available.filter(q=>!pickedIds.has(q.bankId)))){
  if(picked.length>=30)break;picked.push(q);pickedIds.add(q.bankId);
 }
 shuffled(picked);
 // Historical-order questions are always at 5 and 25 and rotate without repeats until all 100 are used.
 if(!Array.isArray(db.usedHistoryIds))db.usedHistoryIds=[];
 if(historyBank.length-db.usedHistoryIds.length<2)db.usedHistoryIds=[];
 const eligible=historyBank.map((q,i)=>i).filter(i=>!db.usedHistoryIds.includes(i));
 for(const slot of HISTORY_SLOTS){const id=eligible.splice(crypto.randomInt(eligible.length),1)[0];db.usedHistoryIds.push(id);picked[slot]=historyBank[id];}
 db.usedQuestionIds.push(...picked.map(q=>q.bankId));
 return picked.map(({bankId,...q})=>q);
}
// First game gets its own randomised set, not the same first 50 each time.
if(!db.game.questionSetSelected && db.game.status==='waiting' && db.game.index===-1){db.game.questions=drawQuestions();db.game.questionSetSelected=true;}
const clients=new Set();function save(){fs.writeFileSync(DATA,JSON.stringify(db,null,2));}function uid(){return crypto.randomBytes(8).toString('hex');}
function send(res,status,obj){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(obj));}
function body(req){return new Promise((resolve,reject)=>{let s='';req.on('data',d=>{s+=d;if(s.length>100000)reject(Error('Too large'));});req.on('end',()=>{try{resolve(JSON.parse(s||'{}'))}catch{reject(Error('Invalid JSON'))}})});}
function phase(){
 const g=db.game;const now=Date.now();let changed=false;
 if(!Number.isFinite(g.breakSeconds)||g.breakSeconds<0)g.breakSeconds=20;
 while(g.endsAt!=null&&now>=g.endsAt){
  const at=g.endsAt;
  if(g.status==='bonusIntro'){g.status='question';g.startsAt=at;g.endsAt=at+(HISTORY_SLOTS.includes(g.index)?g.questionSeconds+20:g.questionSeconds)*1000;}
  else if(g.status==='question'){g.status='reveal';g.startsAt=at;g.endsAt=at+4000;}
  else if(g.status==='reveal'){
   if(g.index===HALFWAY_INDEX){g.status='higherIntro';g.startsAt=at;g.endsAt=at+6000;g.higher=newHigher();}
   else if(g.index>=g.questions.length-1){g.status='ceremony';g.revealStep=0;g.startsAt=at;g.endsAt=at+6000;}
   else{g.status='break';g.startsAt=at;g.endsAt=at+g.breakSeconds*1000;}
  }else if(g.status==='higherIntro'){g.status='higher';g.startsAt=at;g.endsAt=at+8000;prepNext(g);}
  else if(g.status==='higher'){
   const h=g.higher;const matched=h.current===h.next;
   const result={round:h.round+1,from:h.current,to:h.next,matched};h.results.push(result);
   for(const t of db.teams.filter(t=>t.gameId===g.id)){
    if(h.out[t.id])continue;
    const pick=h.choices[t.id];
    const right=!matched&&pick&&(h.next>h.current?pick==='higher':pick==='lower');
    if(right){t.score+=20;if(h.round===7)t.score+=50;}
    else h.out[t.id]=true;
   }
   h.round++;h.matched=matched;h.finished=matched||h.round>=8;
   g.status='higherReveal';g.startsAt=at;g.endsAt=at+4000;
  }else if(g.status==='higherReveal'){
   if(g.higher.finished){g.status='break';g.startsAt=at;g.endsAt=at+g.breakSeconds*1000;}
   else{g.higher.current=g.higher.next;prepNext(g);g.status='higher';g.startsAt=at;g.endsAt=at+8000;}
  }else if(g.status==='break'){startQuestion(g,at);}
  else if(g.status==='ceremony'){
   if((g.revealStep||0)<3){g.revealStep=(g.revealStep||0)+1;g.startsAt=at;g.endsAt=at+6000;}
   else{g.status='finished';g.startsAt=at;g.endsAt=null;}
  }else break;
  changed=true;
 }
 if(changed){save();broadcast();}return g.status;
}
function scores(){return db.teams.filter(t=>t.gameId===db.game.id).map(t=>({id:t.id,name:t.name,venueId:t.venueId,score:t.score})).sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name));}
function state(teamId,admin=false){
 phase();const g=db.game,q=g.questions[g.index],published=g.status==='finished';
 const a=['question','reveal'].includes(g.status)&&q?(HISTORY_SLOTS.includes(g.index)?{q:q.q,events:q.events,...(g.status==='reveal'?{correctOrder:q.correctOrder}:{})}:{q:q.q,a:q.a,...(g.status==='reveal'?{correct:q.correct}:{})}):null;
 const team=db.teams.find(t=>t.id===teamId&&t.gameId===g.id),ranked=scores(),winners=ranked.slice(0,3).map((t,i)=>({...t,place:i+1}));
 const step=g.revealStep||0,podium=step===0?[]:winners.filter(w=>w.place>=4-step).sort((x,y)=>y.place-x.place);
 const bonusWinner=g.status==='reveal'&&isBonus(g.index)?Object.entries(db.answers).filter(([key,a])=>key.startsWith(g.id+':'+g.index+':')&&a.correct).sort((a,b)=>a[1].at-b[1].at)[0]:null;
 const winnerTeam=bonusWinner?db.teams.find(t=>t.id===bonusWinner[0].split(':')[2]):null;
 const h=g.higher||null;
 return {serverTime:Date.now(),gameId:g.id,status:g.status,index:g.index,total:g.questions.length,endsAt:g.endsAt,question:a,bonusRound:isBonus(g.index),historyRound:HISTORY_SLOTS.includes(g.index),historySeconds:g.questionSeconds+20,bonusWinner:winnerTeam?.name||null,bonusNumbers:BONUS_ROUNDS.map(i=>i+1),venues:db.venues,revealStep:step,podium:g.status==='ceremony'||published?podium:[],leaderboard:published?ranked:[],
 higher:h&&['higherIntro','higher','higherReveal'].includes(g.status)?{round:h.round+1,current:h.current,next:g.status==='higherReveal'?h.next:null,matched:h.matched,finished:h.finished,results:g.status==='higherReveal'?h.results[h.results.length-1]:null,eliminated:team?!!h.out[team.id]:false,choice:team?h.choices[team.id]||null:null}:null,
 team:team?{id:team.id,name:team.name,venueId:team.venueId,score:published?team.score:null,answered:!!db.answers[g.id+':'+g.index+':'+team.id],choice:db.answers[g.id+':'+g.index+':'+team.id]?.choice??null,historyOrder:db.answers[g.id+':'+g.index+':'+team.id]?.order??null}:null,
 answerKey:published?g.questions.map((item,i)=>({number:i+1,question:item.q,answer:item.correctOrder?item.correctOrder.map(n=>item.events[n]).join(' → '):item.a[item.correct]})):null,
 ...(admin?{admin:true,questionSeconds:g.questionSeconds,breakSeconds:g.breakSeconds,privateLeaderboard:g.status==='ceremony'?ranked:[]}:{} )};
}
function broadcast(){for(let c of clients){try{c.write('data: update\n\n')}catch{clients.delete(c)}}}
function isAdmin(req){return req.headers['x-admin-key']===ADMIN_KEY;}
function clean(v,max=50){return String(v||'').trim().slice(0,max).replace(/[<>]/g,'');}
const server=http.createServer(async(req,res)=>{let url=new URL(req.url,'http://localhost');try{
 if(url.pathname==='/api/events'){res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive'});res.write('data: connected\n\n');clients.add(res);req.on('close',()=>clients.delete(res));return;}
 if(url.pathname==='/api/state'&&req.method==='GET')return send(res,200,state(url.searchParams.get('teamId'),isAdmin(req)));
 if(url.pathname==='/api/join'&&req.method==='POST'){let b=await body(req),v=db.venues[0],name=clean(b.name);if(!v||name.length<2)return send(res,400,{error:'Choose a venue and a team name of at least 2 characters.'});if(['ceremony','finished'].includes(db.game.status))return send(res,400,{error:'The quiz has finished. Please wait for the next game.'});if(db.teams.some(t=>t.gameId===db.game.id&&t.venueId===v.id&&t.name.toLowerCase()===name.toLowerCase()))return send(res,409,{error:'That team name is already in use at this venue.'});let t={id:uid(),gameId:db.game.id,venueId:v.id,name,score:0};db.teams.push(t);save();broadcast();return send(res,200,{teamId:t.id});}
 if(url.pathname==='/api/higher'&&req.method==='POST'){
  const b=await body(req);phase();const g=db.game,t=db.teams.find(t=>t.id===b.teamId&&t.gameId===g.id);
  if(!t)return send(res,403,{error:'Join this game first.'});
  if(g.status!=='higher'||Date.now()>=g.endsAt)return send(res,409,{error:'Higher or Lower is not accepting answers.'});
  if(g.higher.out[t.id])return send(res,409,{error:'You are out of this minigame.'});
  if(g.higher.choices[t.id])return send(res,409,{error:'Your prediction is already locked in.'});
  if(!['higher','lower'].includes(b.choice))return send(res,400,{error:'Choose higher or lower.'});
  g.higher.choices[t.id]=b.choice;save();broadcast();return send(res,200,{ok:true});
 }
 if(url.pathname==='/api/history'&&req.method==='POST'){
  const b=await body(req);phase();const g=db.game,t=db.teams.find(t=>t.id===b.teamId&&t.gameId===g.id);
  if(!t)return send(res,403,{error:'Join this game first.'});
  if(g.status!=='question'||!HISTORY_SLOTS.includes(g.index)||Date.now()>=g.endsAt)return send(res,409,{error:'History answers are closed.'});
  const key=g.id+':'+g.index+':'+t.id;if(db.answers[key])return send(res,409,{error:'Answer already submitted.'});
  const order=b.order;if(!Array.isArray(order)||order.length!==4||new Set(order).size!==4||!order.every(n=>Number.isInteger(n)&&n>=0&&n<4))return send(res,400,{error:'Choose all four events in order.'});
  const correct=order.every((n,i)=>n===g.questions[g.index].correctOrder[i]);
  const points=correct?100:0;db.answers[key]={order,at:Date.now(),correct,points};t.score+=points;save();broadcast();return send(res,200,{ok:true});
 }
 if(url.pathname==='/api/answer'&&req.method==='POST'){let b=await body(req);phase();let g=db.game,t=db.teams.find(t=>t.id===b.teamId&&t.gameId===g.id);if(!t)return send(res,403,{error:'Join this game first.'});if(g.status!=='question'||Date.now()>=g.endsAt)return send(res,409,{error:'Answers are closed.'});if(HISTORY_SLOTS.includes(g.index))return send(res,409,{error:'Use the history ordering buttons.'});let choice=Number(b.choice),key=g.id+':'+g.index+':'+t.id;if(!Number.isInteger(choice)||choice<0||choice>3)return send(res,400,{error:'Invalid answer.'});if(db.answers[key])return send(res,409,{error:'Answer already submitted.'});let correct=choice===g.questions[g.index].correct;
  // Requests are handled sequentially by this Node process. The first accepted
  // correct answer for a bonus question receives 150; later correct answers 50.
  const bonus=isBonus(g.index);
  const firstCorrect=bonus&&correct&&!Object.entries(db.answers).some(([k,a])=>k.startsWith(g.id+':'+g.index+':')&&a.correct);
  const points=correct?(bonus?(firstCorrect?150:50):100):0;
  db.answers[key]={choice,at:Date.now(),correct,points};t.score+=points;save();broadcast();return send(res,200,{ok:true});}
 if(url.pathname.startsWith('/api/admin/')){if(!isAdmin(req))return send(res,401,{error:'Incorrect admin key.'});if(req.method!=='POST')return send(res,405,{error:'POST required'});let b=await body(req),action=url.pathname.split('/').pop(),g=db.game;
 if(action==='venue'){return send(res,403,{error:'This edition supports one venue only.'});}
 else if(action==='start'){if(g.status==='question')return send(res,409,{error:'Question already live.'});if(['ceremony','finished'].includes(g.status))return send(res,409,{error:'Reset for a new game first.'});if(g.index>=g.questions.length-1)return send(res,409,{error:'No questions remaining.'});startQuestion(g,Date.now());}
 
 else if(action==='reveal'){return send(res,409,{error:'The winners are announced automatically after question 30.'});}
 else if(action==='publish'){return send(res,409,{error:'The leaderboard appears automatically after the winners are announced.'});}
 else if(action==='finish'){return send(res,409,{error:'The quiz finishes automatically after question 30.'});}
 else if(action==='settings'){if(g.status!=='waiting')return send(res,409,{error:'Change timers before the quiz begins.'});let qs=Number(b.questionSeconds),bs=Number(b.breakSeconds);if(!Number.isInteger(qs)||qs<5||qs>300||!Number.isInteger(bs)||bs<5||bs>300)return send(res,400,{error:'Timers must be whole seconds from 5 to 300.'});g.questionSeconds=qs;g.breakSeconds=bs;}
 else if(action==='reset'){db.game={id:g.id+1,status:'waiting',index:-1,startsAt:null,endsAt:null,questionSeconds:15,breakSeconds:20,questions:drawQuestions(),questionSetSelected:true,revealStep:0,higher:null};db.answers={};db.teams=[];}
 else return send(res,404,{error:'Unknown action'});save();broadcast();return send(res,200,{ok:true});}
 if(req.method!=='GET')return send(res,405,{error:'Method not allowed'});
 let p=url.pathname==='/'?'/index.html':url.pathname;let file=path.resolve(__dirname,'public','.'+p);if(!file.startsWith(path.join(__dirname,'public')+path.sep))return send(res,403,{error:'Forbidden'});fs.readFile(file,(err,data)=>{if(err)return send(res,404,{error:'Not found'});let ext=path.extname(file);res.writeHead(200,{'Content-Type':({'.html':'text/html; charset=utf-8','.css':'text/css','.js':'application/javascript','.svg':'image/svg+xml'})[ext]||'application/octet-stream'});res.end(data);});
 }catch(e){send(res,400,{error:e.message||'Request failed'});}});
setInterval(()=>{phase();for(let c of clients){try{c.write(': ping\n\n')}catch{clients.delete(c)}}},3000);
save();server.listen(PORT,()=>console.log('Single Venue Quiz on http://localhost:'+PORT+' | Set ADMIN_KEY before deploying'));
