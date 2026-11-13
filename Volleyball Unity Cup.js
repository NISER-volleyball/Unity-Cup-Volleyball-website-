const IMPACT_MS=460;
const TEAM_STAGGER_MS=90;
const SVG_NS="http://www.w3.org/2000/svg";
const API_URL="https://script.google.com/macros/s/AKfycbyAhAa44A-bWe1GKCaUqKMN1J78nb4vPtspcCwi1aiBb8t_EPl2JMZIt4asKfzZ8lgcow/exec";
const SESSION_KEY="unityCupSession";
const REFRESH_MS=60000;
const TAB_ORDER=["standings","matches","teams"];
const SLIDE_MS=420;
const SWIPE_MIN_PX=60;
const GROUPS=["A","B"];
const MAX_SETS=10;
let teams=[];
let matches=[];
let savedCopy="";
let version=0;
let session=null;
let isAdmin=false;
let hasChanges=false;
let isSaving=false;
let slotCount=0;
let shownGroups=null;
let toastTimer=null;
let currentTab="standings";
let leavingPanel=null;
let leaveTimer=null;
function byId(id)
{
  return document.getElementById(id);
}
function make(tag,className,text)
{
  const node=document.createElement(tag);
  if(className)
    {
      node.className=className;
    }
  if(text!==undefined)
    {
      node.textContent=text;
    }
  return node;
}
function makeButton(className,label,title,onClick)
{
  const button=make("button",className,label);
  button.type="button";
  button.setAttribute("aria-label",title);
  button.addEventListener("click",onClick);
  return button;
}
function findTeam(id)
{
  return teams.find(function (team)
  {
    return team.id===id;
  });
}
function nameOf(id)
{
  const team=findTeam(id);
  return team ? team.name:"";
}
function namedTeams()
{
  return teams.filter(function (team)
  {
    return team.name.trim();
  });
}
function emptySets()
{
  return [["",""],["",""]];
}
function isConnected()
{
  return API_URL.indexOf("http")===0;
}
async function callServer(body)
{
  const response=await fetch(API_URL,{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify(body)});
  return response.json();
}
function snapshot()
{
  return JSON.stringify({teams:teams,matches:matches});
}
function checkForChanges()
{
  hasChanges=snapshot()!==savedCopy;
  byId("saveBar").hidden=!isAdmin;
  byId("saveText").textContent=hasChanges ? "You have unsaved changes":"All changes are saved";
  document.body.classList.toggle("is-editing",isAdmin);
  updateSaveButtons();
}
function loadIntoPage(data)
{
  const copy=JSON.parse(JSON.stringify(data));
  teams=copy.teams;
  matches=copy.matches;
  renderAll();
}
function receiveData(data)
{
  version=Number(data.version) || 0;
  loadIntoPage(data);
  savedCopy=snapshot();
  checkForChanges();
}
function setStatus(text)
{
  const line=byId("dataStatus");
  line.textContent=text || "";
  line.hidden=!text;
}
function showToast(text,kind)
{
  const toast=byId("toast");
  toast.textContent=text;
  toast.className="toast "+(kind || "");
  toast.hidden=false;
  clearTimeout(toastTimer);
  toastTimer=setTimeout(function ()
  {
    toast.hidden=true;
  },4500);
}
async function loadData(quiet)
{
  if(!isConnected())
    {
      setStatus("Not connected: set API_URL in the script to link the spreadsheet.");
      return;
    }
  if(quiet && (hasChanges || isSaving))
    {
      return;
    }
  try
  {
    const response=await fetch(API_URL,{cache:"no-store"});
    const reply=await response.json();
    if(!reply.ok)
      {
        throw new Error(reply.error);
      }
    if(hasChanges || isSaving)
      {
        return;
      }
    if(quiet && Number(reply.data.version)===version)
      {
        return;
      }
    receiveData(reply.data);
    setStatus("");
  }
  catch(error)
  {
    if(!quiet)
      {
        setStatus("Can't reach the server right now.");
      }
  }
}
function getWinner(match)
{
  let sets1=0;
  let sets2=0;
  let complete=true;
  match.sets.forEach(function (set)
  {
    if(set[0]==="" || set[1]==="")
      {
        complete=false;
        return;
      }
    if(set[0]>set[1])
      {
        sets1++;
      }
    else if(set[1]>set[0])
      {
        sets2++;
      }
  });
  const bothTeamsPicked=nameOf(match.team1) && nameOf(match.team2) && match.team1!==match.team2;
  if(!bothTeamsPicked || !complete || sets1===sets2)
    {
      return 0;
    }
  return sets1>sets2 ? 1:2;
}
function setsNeeded(match)
{
  let needed=2;
  while(needed<MAX_SETS)
    {
      let sets1=0;
      let sets2=0;
      for(let i=0;i<needed;i++)
        {
          const set=match.sets[i];
          if(!set || set[0]==="" || set[1]==="")
            {
              return needed;
            }
          if(set[0]>set[1])
            {
              sets1++;
            }
          else if(set[1]>set[0])
            {
              sets2++;
            }
        }
      if(sets1!==sets2)
        {
          return needed;
        }
      needed++;
    }
  return needed;
}
function computeStandings()
{
  const table={};
  namedTeams().forEach(function (team)
  {
    table[team.id]={name:team.name,group:team.group,played:0,won:0,lost:0,points:0};
  });
  matches.forEach(function (match)
  {
    const winner=getWinner(match);
    const row1=table[match.team1];
    const row2=table[match.team2];
    if(!winner || !row1 || !row2)
      {
        return;
      }
    row1.played++;
    row2.played++;
    const winnerRow=winner===1 ? row1:row2;
    const loserRow=winner===1 ? row2:row1;
    winnerRow.won++;
    winnerRow.points+=3;
    loserRow.lost++;
  });
  return table;
}
function compareTeams(a,b)
{
  return (b.points-a.points) || a.name.localeCompare(b.name);
}
function buildGroupCards()
{
  const groups=GROUPS.filter(function (group)
  {
    return namedTeams().some(function (team)
    {
      return team.group===group;
    });
  });
  if(groups.join(",")===shownGroups)
    {
      return;
    }
  shownGroups=groups.join(",");
  const grid=document.querySelector("#standings .groups-grid");
  grid.innerHTML="";
  if(!groups.length)
    {
      grid.appendChild(make("p","empty-note","No teams yet."));
      return;
    }
  groups.forEach(function (group,index)
  {
    const card=make("div","group-card "+(index===0 ? "group-a":"group-b"));
    card.dataset.group=group;
    card.appendChild(make("h2",null,"Group "+group));
    card.appendChild(make("table"));
    grid.appendChild(card);
  });
  if(currentTab==="standings")
    {
      playLanding();
    }
}
function makeTableRow(cellTag,values,className)
{
  const row=make("tr",className);
  values.forEach(function (value,index)
  {
    row.appendChild(make(cellTag,index===4 ? "pts":null,value));
  });
  return row;
}
function renderStandings()
{
  buildGroupCards();
  const table=computeStandings();
  document.querySelectorAll("#standings .group-card").forEach(function (card)
  {
    const rows=Object.keys(table).map(function (id)
    {
      return table[id];
    }).filter(function (row)
    {
      return row.group===card.dataset.group;
    }).sort(compareTeams);
    const grid=card.querySelector("table");
    grid.innerHTML="";
    grid.appendChild(makeTableRow("th",["Team","MP","W","L","PTS"]));
    rows.forEach(function (row,index)
    {
      const next=rows[1];
      const isLeader=index===0 && row.played>0 && (!next || row.points>next.points);
      grid.appendChild(makeTableRow("td",[row.name,row.played,row.won,row.lost,row.points],isLeader ? "leader":null));
    });
  });
}
function renderTeams()
{
  const grid=document.querySelector("#teams .teams-grid");
  grid.innerHTML="";
  const list=isAdmin ? teams:teams.slice().sort(function (a,b)
  {
    return a.group.localeCompare(b.group) || a.name.localeCompare(b.name);
  });
  if(!list.length && !isAdmin)
    {
      grid.appendChild(make("p","empty-note","No teams yet."));
      return;
    }
  list.forEach(function (team)
  {
    const card=make("div","team-card");
    card.dataset.group=team.group;
    if(!isAdmin)
      {
        card.appendChild(make("span","group-tag","Group "+team.group));
        card.appendChild(make("h3",null,team.name));
        grid.appendChild(card);
        return;
      }
    const groupSelect=make("select","group-select");
    GROUPS.forEach(function (group)
    {
      const option=make("option",null,"Group "+group);
      option.value=group;
      groupSelect.appendChild(option);
    });
    groupSelect.value=team.group;
    groupSelect.addEventListener("change",function ()
    {
      team.group=groupSelect.value;
      card.dataset.group=team.group;
      renderStandings();
      checkForChanges();
    });
    const nameInput=make("input","team-name");
    nameInput.type="text";
    nameInput.maxLength=30;
    nameInput.placeholder="Team name";
    nameInput.value=team.name;
    nameInput.setAttribute("aria-label","Team name");
    nameInput.addEventListener("input",function ()
    {
      team.name=nameInput.value;
      renderStandings();
      checkForChanges();
    });
    nameInput.addEventListener("change",renderMatches);
    card.appendChild(groupSelect);
    card.appendChild(nameInput);
    card.appendChild(makeButton("del-btn","−","Remove team",function ()
    {
      removeTeam(team);
    }));
    grid.appendChild(card);
  });
  if(isAdmin)
    {
      grid.appendChild(makeButton("add-btn add-card","+ Add team","Add a team slot",addTeam));
    }
}
function addTeam()
{
  if(isSaving)
    {
      return;
    }
  teams.push({id:"new-"+(++slotCount),name:"",group:"A"});
  renderTeams();
  checkForChanges();
  const inputs=document.querySelectorAll("#teams .team-name");
  inputs[inputs.length-1].focus();
}
function removeTeam(team)
{
  if(isSaving)
    {
      return;
    }
  const isUsed=matches.some(function (match)
  {
    return match.team1===team.id || match.team2===team.id;
  });
  const needsConfirm=team.name.trim() || isUsed;
  if(needsConfirm && !window.confirm("Remove "+(team.name.trim() || "this team")+(isUsed ? "? Its matches will be removed too.":"?")))
    {
      return;
    }
  teams=teams.filter(function (other)
  {
    return other!==team;
  });
  matches=matches.filter(function (match)
  {
    return match.team1!==team.id && match.team2!==team.id;
  });
  renderAll();
  checkForChanges();
}
function fillTeamOptions(select,selectedId)
{
  select.innerHTML="";
  const placeholder=make("option",null,"Select team");
  placeholder.value="";
  select.appendChild(placeholder);
  namedTeams().forEach(function (team)
  {
    const option=make("option",null,team.name);
    option.value=team.id;
    select.appendChild(option);
  });
  select.value=selectedId;
}
function lastSetIsBlank(match)
{
  const last=match.sets[match.sets.length-1];
  return last[0]==="" && last[1]==="";
}
function showResult(row,match)
{
  const winner=getWinner(match);
  row.classList.toggle("winner-1",winner===1);
  row.classList.toggle("winner-2",winner===2);
  const label=row.querySelector(".result");
  if(!label)
    {
      return;
    }
  if(winner)
    {
      label.textContent=nameOf(winner===1 ? match.team1:match.team2)+" won";
    }
  else if(match.sets.length>2 && lastSetIsBlank(match))
    {
      label.textContent="Level, so play another set";
    }
  else
    {
      label.textContent="";
    }
}
function editableRow(match)
{
  const row=make("div","match-row");
  const sides=["team1","team2"].map(function (key,index)
  {
    const select=make("select","team-select");
    select.setAttribute("aria-label","Team "+(index+1));
    fillTeamOptions(select,match[key]);
    select.addEventListener("change",function ()
    {
      match[key]=select.value;
      showResult(row,match);
      renderStandings();
      checkForChanges();
    });
    const side=make("span","team team-"+(index+1));
    side.appendChild(select);
    return side;
  });
  const middle=make("div","sets-wrap");
  const setsBox=make("div","sets");
  const pills=[];
  function makePill(index)
  {
    const set=match.sets[index];
    const pill=make("span","set");
    if(index>=2)
      {
        pill.title="Extra set, because the teams were level";
      }
    [0,1].forEach(function (side)
    {
      const input=make("input","score-in");
      input.type="number";
      input.min="0";
      input.inputMode="numeric";
      input.value=set[side];
      input.setAttribute("aria-label","Set "+(index+1)+" team "+(side+1)+" score");
      input.addEventListener("input",function ()
      {
        set[side]=input.value==="" ? "":Math.max(0,Math.floor(Number(input.value)));
        syncSets();
        showResult(row,match);
        renderStandings();
        checkForChanges();
      });
      if(side===1)
        {
          pill.appendChild(make("span","dash","–"));
        }
      pill.appendChild(input);
    });
    return pill;
  }
  function syncSets()
  {
    const needed=setsNeeded(match);
    while(match.sets.length>needed)
      {
        match.sets.pop();
      }
    while(match.sets.length<needed)
      {
        match.sets.push(["",""]);
      }
    while(pills.length>needed)
      {
        pills.pop().remove();
      }
    while(pills.length<needed)
      {
        const pill=makePill(pills.length);
        pills.push(pill);
        setsBox.appendChild(pill);
      }
  }
  middle.appendChild(setsBox);
  middle.appendChild(make("span","result"));
  row.appendChild(sides[0]);
  row.appendChild(middle);
  row.appendChild(sides[1]);
  row.appendChild(makeButton("del-btn","−","Remove match",function ()
  {
    removeMatch(match);
  }));
  syncSets();
  showResult(row,match);
  return row;
}
function publicRow(match)
{
  const winner=getWinner(match);
  const row=make("div","match-row winner-"+winner);
  const side1=make("span","team team-1");
  side1.appendChild(document.createTextNode(nameOf(match.team1)));
  if(winner===1)
    {
      side1.appendChild(make("span","win-badge","WIN"));
    }
  const side2=make("span","team team-2");
  if(winner===2)
    {
      side2.appendChild(make("span","win-badge","WIN"));
    }
  side2.appendChild(document.createTextNode(nameOf(match.team2)));
  const middle=make("div","sets-wrap");
  const setsBox=make("div","sets");
  match.sets.filter(function (set)
  {
    return set[0]!=="" && set[1]!=="";
  }).forEach(function (set)
  {
    const pill=make("span","set");
    pill.appendChild(document.createTextNode(set[0]));
    pill.appendChild(make("span","dash","–"));
    pill.appendChild(document.createTextNode(set[1]));
    setsBox.appendChild(pill);
  });
  middle.appendChild(setsBox);
  middle.appendChild(make("span","result",nameOf(winner===1 ? match.team1:match.team2)+" won"));
  row.appendChild(side1);
  row.appendChild(middle);
  row.appendChild(side2);
  return row;
}
function renderMatches()
{
  const list=byId("matchesList");
  list.innerHTML="";
  if(!matches.length)
    {
      list.appendChild(make("p","empty-note",isAdmin ? "No matches yet. Press + Add match.":"No matches recorded yet."));
    }
  matches.forEach(function (match)
  {
    list.appendChild(isAdmin ? editableRow(match):publicRow(match));
  });
}
function addMatch()
{
  if(isSaving)
    {
      return;
    }
  matches.push({id:"new-"+(++slotCount),team1:"",team2:"",sets:emptySets()});
  renderMatches();
  checkForChanges();
  const selects=document.querySelectorAll("#matchesList .team-select");
  selects[selects.length-2].focus();
}
function removeMatch(match)
{
  if(isSaving)
    {
      return;
    }
  const hasData=match.team1 || match.team2 || match.sets.some(function (set)
  {
    return set[0]!=="" || set[1]!=="";
  });
  if(hasData && !window.confirm("Remove this match?"))
    {
      return;
    }
  matches=matches.filter(function (other)
  {
    return other!==match;
  });
  renderAll();
  checkForChanges();
}
function renderAll()
{
  renderStandings();
  renderTeams();
  renderMatches();
}
function discardChanges()
{
  if(!hasChanges || !window.confirm("Discard all unsaved changes?"))
    {
      return;
    }
  loadIntoPage(JSON.parse(savedCopy));
  checkForChanges();
}
function updateSaveButtons()
{
  byId("saveBtn").disabled=isSaving || !hasChanges;
  byId("saveBtn").textContent=isSaving ? "Saving…":"Save changes";
  byId("discardBtn").disabled=isSaving || !hasChanges;
}
function findIncomplete()
{
  for(let i=0;i<teams.length;i++)
    {
      if(!teams[i].name.trim())
        {
          return "Team "+(i+1)+" has no name yet. Type a name or remove it with −.";
        }
    }
  for(let i=0;i<matches.length;i++)
    {
      if(!getWinner(matches[i]))
        {
          return "Match "+(i+1)+" isn't finished. Pick both teams and enter the scores, or remove it with −.";
        }
    }
  return "";
}
async function saveChanges()
{
  if(!isAdmin || isSaving || !hasChanges)
    {
      return;
    }
  const problem=findIncomplete();
  if(problem)
    {
      showToast(problem,"err");
      return;
    }
  isSaving=true;
  updateSaveButtons();
  try
  {
    const reply=await callServer({action:"save",token:session.token,baseVersion:version,teams:teams,matches:matches});
    if(reply.ok)
      {
        receiveData(reply.data);
        showToast(reply.message || "Saved.","ok");
      }
    else if(reply.error==="auth")
      {
        session=null;
        storeSession(null);
        updateEditorMode();
        openLogin("Your session expired. Log in again to save (your changes are kept).");
      }
    else if(reply.error==="conflict")
      {
        receiveData(reply.data);
        showToast("Someone else saved first. The latest data is loaded; please redo your change.","err");
      }
    else
      {
        showToast(reply.error || "Save failed.","err");
      }
  }
  catch(error)
  {
    showToast("Couldn't reach the server. Your changes are still here; try again.","err");
  }
  isSaving=false;
  updateSaveButtons();
}
function loadSession()
{
  try
  {
    const saved=JSON.parse(sessionStorage.getItem(SESSION_KEY));
    return saved && saved.token ? saved:null;
  }
  catch(error)
  {
    return null;
  }
}
function storeSession(value)
{
  try
  {
    if(value)
      {
        sessionStorage.setItem(SESSION_KEY,JSON.stringify(value));
      }
    else
      {
        sessionStorage.removeItem(SESSION_KEY);
      }
  }
  catch(error)
  {
  }
}
function updateEditorMode()
{
  isAdmin=!!session;
  byId("loginBtn").textContent=isAdmin ? "Logout":"Login";
  byId("adminBadge").hidden=!isAdmin;
  byId("adminBadge").textContent=isAdmin ? session.name:"";
  byId("addMatchRow").hidden=!isAdmin;
  renderTeams();
  renderMatches();
  checkForChanges();
}
function logout()
{
  if(hasChanges && !window.confirm("You have unsaved changes. Log out and discard them?"))
    {
      return;
    }
  if(isConnected())
    {
      callServer({action:"logout",token:session.token}).catch(function ()
      {
      });
    }
  session=null;
  storeSession(null);
  loadIntoPage(JSON.parse(savedCopy));
  updateEditorMode();
}
function openLogin(message)
{
  byId("loginModal").hidden=false;
  byId("loginError").textContent=message || "";
  byId("loginUser").value="";
  byId("loginPass").value="";
  byId("loginUser").focus();
}
function closeLogin()
{
  byId("loginModal").hidden=true;
  byId("loginBtn").focus();
}
function loginFailed(text)
{
  const card=byId("loginForm");
  byId("loginError").textContent=text;
  card.classList.remove("shake");
  void card.offsetWidth;
  card.classList.add("shake");
  byId("loginPass").value="";
  byId("loginPass").focus();
}
async function submitLogin(event)
{
  event.preventDefault();
  const username=byId("loginUser").value.trim();
  const password=byId("loginPass").value;
  if(!isConnected())
    {
      return loginFailed("The spreadsheet isn't connected yet (API_URL is not set).");
    }
  if(!username || !password)
    {
      return loginFailed("Enter your username and password.");
    }
  const button=byId("loginSubmit");
  button.disabled=true;
  button.textContent="Checking…";
  try
  {
    const reply=await callServer({action:"login",username:username,password:password});
    if(reply.ok)
      {
        session={token:reply.token,name:reply.name};
        storeSession(session);
        byId("loginModal").hidden=true;
        updateEditorMode();
        byId("loginBtn").focus();
      }
    else
      {
        loginFailed(reply.error || "Login failed.");
      }
  }
  catch(error)
  {
    loginFailed("Couldn't reach the server. Check your connection.");
  }
  button.disabled=false;
  button.textContent="Log in";
}
function setupControls()
{
  byId("loginBtn").addEventListener("click",function ()
  {
    if(isAdmin)
      {
        logout();
      }
    else
      {
        openLogin();
      }
  });
  byId("loginCancel").addEventListener("click",closeLogin);
  byId("loginBackdrop").addEventListener("click",closeLogin);
  byId("loginForm").addEventListener("submit",submitLogin);
  byId("saveBtn").addEventListener("click",saveChanges);
  byId("discardBtn").addEventListener("click",discardChanges);
  byId("addMatch").addEventListener("click",addMatch);
  document.addEventListener("keydown",function (event)
  {
    if(event.key==="Escape" && !byId("loginModal").hidden)
      {
        closeLogin();
      }
  });
  window.addEventListener("beforeunload",function (event)
  {
    if(isAdmin && hasChanges)
      {
        event.preventDefault();
        event.returnValue="";
      }
  });
}
function clearSlideClasses(panel)
{
  panel.classList.remove("slide-in-left","slide-in-right","slide-out-left","slide-out-right");
}
function finishSlide()
{
  if(leaveTimer)
    {
      clearTimeout(leaveTimer);
      leaveTimer=null;
    }
  if(leavingPanel)
    {
      leavingPanel.classList.add("hidden");
      leavingPanel=null;
    }
  TAB_ORDER.forEach(function (id)
  {
    const panel=byId(id);
    if(panel)
      {
        clearSlideClasses(panel);
      }
  });
}
function positionIndicator(instant)
{
  const indicator=byId("tabIndicator");
  const active=document.querySelector(".tab.active");
  if(!indicator || !active)
    {
      return;
    }
  if(instant===true)
    {
      indicator.style.transition="none";
    }
  indicator.style.width=active.offsetWidth+"px";
  indicator.style.transform="translateX("+active.offsetLeft+"px)";
  if(instant===true)
    {
      void indicator.offsetWidth;
      indicator.style.transition="";
    }
}
function updateTabButtons(name)
{
  document.querySelectorAll(".tab").forEach(function (btn)
  {
    btn.classList.toggle("active",btn.dataset.tab===name);
  });
}
function showTab(name)
{
  if(name===currentTab || TAB_ORDER.indexOf(name)<0)
    {
      return;
    }
  finishSlide();
  const from=byId(currentTab);
  const to=byId(name);
  const dir=TAB_ORDER.indexOf(name)>TAB_ORDER.indexOf(currentTab) ? 1:-1;
  currentTab=name;
  updateTabButtons(name);
  positionIndicator();
  to.classList.remove("hidden");
  if(prefersReducedMotion())
    {
      from.classList.add("hidden");
    }
  else
    {
      from.classList.add(dir>0 ? "slide-out-left":"slide-out-right");
      to.classList.add(dir>0 ? "slide-in-right":"slide-in-left");
      leavingPanel=from;
      leaveTimer=setTimeout(finishSlide,SLIDE_MS+40);
    }
  if(name==="matches")
    {
      playFusion();
    }
  if(name==="standings")
    {
      playLanding();
    }
  if(name==="teams")
    {
      playAssemble();
    }
}
function setupSwipe()
{
  const area=document.querySelector("main");
  let startX=0;
  let startY=0;
  let tracking=false;
  if(!area)
    {
      return;
    }
  area.addEventListener("touchstart",function (e)
  {
    if(e.touches.length!==1 || e.target.closest("input,select,textarea,button"))
      {
        tracking=false;
        return;
      }
    startX=e.touches[0].clientX;
    startY=e.touches[0].clientY;
    tracking=true;
  },{passive:true});
  area.addEventListener("touchend",function (e)
  {
    if(!tracking)
      {
        return;
      }
    tracking=false;
    const t=e.changedTouches[0];
    const dx=t.clientX-startX;
    const dy=t.clientY-startY;
    if(Math.abs(dx)<SWIPE_MIN_PX || Math.abs(dx)<Math.abs(dy)*1.5)
      {
        return;
      }
    const next=TAB_ORDER.indexOf(currentTab)+(dx<0 ? 1:-1);
    if(next>=0 && next<TAB_ORDER.length)
      {
        showTab(TAB_ORDER[next]);
      }
  },{passive:true});
}
function prefersReducedMotion()
{
  return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
function playFusion()
{
  const overlay=document.getElementById("fusionOverlay");
  if(!overlay)
    {
      return;
    }
  overlay.classList.remove("play");
  void overlay.offsetWidth;
  const focus=setFusionFocus(overlay);
  generateLightning(overlay,focus);
  overlay.classList.add("play");
}
function setFusionFocus(overlay)
{
  const rect=overlay.getBoundingClientRect();
  const viewHeight=window.innerHeight || document.documentElement.clientHeight;
  const middle=rect.top+rect.height/2;
  const centerOnScreen=middle>=0 && middle<=viewHeight;
  const visibleTop=Math.max(rect.top,0);
  const visibleBottom=Math.min(rect.bottom,viewHeight);
  const hasVisiblePart=visibleBottom>visibleTop;
  let focusY=rect.height/2;
  let areaHeight=rect.height;
  let startTop=-80;
  let startBottom=rect.height+16;
  if(!centerOnScreen && hasVisiblePart)
    {
      focusY=(visibleTop+visibleBottom)/2-rect.top;
      areaHeight=visibleBottom-visibleTop;
      startTop=visibleTop-rect.top-80;
      startBottom=visibleBottom-rect.top+16;
    }
  overlay.classList.toggle("vertical",!centerOnScreen);
  overlay.style.setProperty("--focus-y",focusY+"px");
  overlay.style.setProperty("--start-top",startTop+"px");
  overlay.style.setProperty("--start-bottom",startBottom+"px");
  return {y:focusY,height:areaHeight};
}
function generateLightning(overlay,focus)
{
  const svg=overlay.querySelector(".lightning-svg");
  if(!svg)
    {
      return;
    }
  svg.innerHTML="";
  if(prefersReducedMotion())
    {
      return;
    }
  const rect=overlay.getBoundingClientRect();
  const width=rect.width || 400;
  const height=rect.height || 160;
  svg.setAttribute("viewBox","0 0 "+width+" "+height);
  svg.setAttribute("preserveAspectRatio","none");
  const centerX=width/2;
  const centerY=focus ? focus.y:height/2;
  const area=focus ? focus.height:height;
  const reach=Math.min(width,area)*0.55+Math.max(width,area)*0.15;
  const boltCount=5+Math.floor(Math.random()*3);
  for(let i=0;i<boltCount;i++)
    {
      const angle=Math.random()*Math.PI*2;
      const length=reach*(0.55+Math.random()*0.55);
      const mainBolt=buildJaggedPath(centerX,centerY,angle,length);
      drawBolt(svg,mainBolt,false);
      let forks=0;
      if(Math.random()<0.75)
        {
          forks=Math.random()<0.3 ? 2:1;
        }
      for(let f=0;f<forks;f++)
        {
          const fork=buildBranch(mainBolt);
          if(fork)
            {
              drawBolt(svg,fork,true);
            }
        }
    }
}
function buildJaggedPath(startX,startY,angle,length)
{
  const segments=5+Math.floor(Math.random()*4);
  const dirX=Math.cos(angle);
  const dirY=Math.sin(angle);
  const sideX=-dirY;
  const sideY=dirX;
  const points=[{x:startX,y:startY}];
  let drift=0;
  for(let s=1;s<=segments;s++)
    {
      const distance=(length/segments)*s;
      drift+=(Math.random()-0.5)*length*0.22;
      points.push(
        {
          x:startX+dirX*distance+sideX*drift,y:startY+dirY*distance+sideY*drift
        });
    }
  return points;
}
function buildBranch(mainPoints)
{
  if(mainPoints.length<4)
    {
      return null;
    }
  const index=1+Math.floor(Math.random()*(mainPoints.length-3));
  const start=mainPoints[index];
  const next=mainPoints[index+1];
  const parentAngle=Math.atan2(next.y-start.y,next.x-start.x);
  const turn=(0.5+Math.random()*0.9)*(Math.random()<0.5 ? -1:1);
  const stepLength=Math.hypot(next.x-start.x,next.y-start.y);
  const branchLength=stepLength*(2.5+Math.random()*2.5);
  return buildJaggedPath(start.x,start.y,parentAngle+turn,branchLength);
}
function pointsToPath(points)
{
  return points.map(function (p,i)
  {
    return (i===0 ? "M":"L")+p.x.toFixed(1)+","+p.y.toFixed(1);
  }).join(" ");
}
function drawBolt(svg,points,isBranch)
{
  const d=pointsToPath(points);
  const glow=document.createElementNS(SVG_NS,"path");
  glow.setAttribute("d",d);
  glow.setAttribute("class","bolt-glow");
  const core=document.createElementNS(SVG_NS,"path");
  core.setAttribute("d",d);
  core.setAttribute("class","bolt-core");
  svg.appendChild(glow);
  svg.appendChild(core);
  let delay=IMPACT_MS+Math.random()*25;
  if(isBranch)
    {
      delay+=40+Math.random()*70;
    }
  const peak=isBranch ? 0.75:1;
  const travelTime=90+Math.random()*70;
  [glow,core].forEach(function (path)
  {
    const length=path.getTotalLength();
    path.style.strokeDasharray=length;
    path.animate([{strokeDashoffset:length,opacity:0,offset:0},{strokeDashoffset:length*0.55,opacity:peak,offset:0.18},{strokeDashoffset:0,opacity:peak,offset:0.42},{strokeDashoffset:0,opacity:peak*0.15,offset:0.55},{strokeDashoffset:0,opacity:peak*0.9,offset:0.63},{strokeDashoffset:0,opacity:peak*0.1,offset:0.74},{strokeDashoffset:0,opacity:peak*0.6,offset:0.8},{strokeDashoffset:0,opacity:0,offset:1}],
      {
        duration:420+travelTime,
        delay:delay,
        easing:"linear",
        fill:"forwards"
      });
  });
}
function playLanding()
{
  const cards=document.querySelectorAll("#standings .group-card");
  cards.forEach(function (card)
  {
    card.classList.remove("drop");
  });
  const section=document.getElementById("standings");
  if(section)
    {
      void section.offsetWidth;
    }
  cards.forEach(function (card)
  {
    card.classList.add("drop");
  });
}
function playAssemble()
{
  const cards=document.querySelectorAll("#teams .team-card");
  cards.forEach(function (card)
  {
    card.classList.remove("materialize");
  });
  const section=document.getElementById("teams");
  if(section)
    {
      void section.offsetWidth;
    }
  cards.forEach(function (card,i)
  {
    card.style.setProperty("--stagger",i*TEAM_STAGGER_MS+"ms");
    card.classList.add("materialize");
  });
}
document.addEventListener("DOMContentLoaded",function ()
{
  document.querySelectorAll(".tab").forEach(function (btn)
  {
    btn.addEventListener("click",function ()
    {
      showTab(btn.dataset.tab);
    });
  });
  setupControls();
  setupSwipe();
  receiveData({teams:[],matches:[],version:0});
  session=loadSession();
  updateEditorMode();
  if(session && isConnected())
    {
      callServer({action:"verify",token:session.token}).then(function (reply)
      {
        if(!reply.ok)
          {
            session=null;
            storeSession(null);
            updateEditorMode();
          }
      }).catch(function ()
      {
      });
    }
  loadData(false);
  setInterval(function ()
  {
    if(!document.hidden)
      {
        loadData(true);
      }
  },REFRESH_MS);
  updateTabButtons(currentTab);
  positionIndicator(true);
  playLanding();
  const refit=function ()
  {
    positionIndicator(true);
  };
  window.addEventListener("resize",refit);
  window.addEventListener("load",refit);
  if(document.fonts && document.fonts.ready)
    {
      document.fonts.ready.then(refit);
    }
});
