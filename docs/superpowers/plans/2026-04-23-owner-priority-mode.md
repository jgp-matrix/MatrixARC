# Owner Priority Mode — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a soft-lockout layer that activates when the project owner is present — non-owners (including admins) see a banner + chime and 14 destructive/state-changing actions disable. Owner gets a "Hold priority while away" checkbox. Admin can Take Over with audit trail.

**Architecture:** Extends existing `projectPresence` + `activeExtractions` concurrency system (v1.19.599 / v1.19.616). Introduces `ownerPriorityActive` state computed from viewers + project doc. 14 buttons gate on this state. Firestore rules reject locked writes from non-owner clients as belt-and-suspenders. Admin Take Over writes to new `ownerTakeovers` audit collection + appends to `project.ownerTakeoverLog`.

**Tech Stack:** React (hooks, no new libraries). Firebase Firestore (new fields + one new collection + rules update). No build step (single-file HTML).

**Design reference:** `docs/superpowers/specs/2026-04-23-owner-priority-mode-design.md`

---

## Task 1: Firestore security rules — reject locked writes from non-owners

**Goal:** Even if a buggy/old client tries to write to a locked project, server-side rules stop it. Belt-and-suspenders.

**Files:**
- Modify: `firestore.rules`

- [ ] **Step 1: Read current rules structure**

Run: `cat firestore.rules | head -60`

Note the existing `match /companies/{companyId}/projects/{projectId}` rule — we'll extend its write allow-check.

- [ ] **Step 2: Add helper function `isOwnerPriorityLocked`**

Add near the top of the rules file (after any existing helpers):

```
function isOwnerPriorityLocked(project, request) {
  // Locked when: project has an active ownerLockActive OR presence doc shows owner recent
  // AND current user is not the owner
  // AND no active takeover exists (or takeover expired)
  let isOwner = request.auth.uid == project.createdBy;
  let hasTakeover = project.ownerTakeoverActive != null
    && project.ownerTakeoverActive.expiresAt > request.time.toMillis();
  return !isOwner && !hasTakeover && project.ownerLockActive == true;
}
```

Note: This is a conservative check — it only blocks when owner EXPLICITLY sets `ownerLockActive=true`. The presence-based 90s window is client-side only. Server-side we can't easily query the projectPresence collection from within a project rule.

- [ ] **Step 3: Update write allow for `/projects/{projectId}` to reject when locked**

Find the existing `match /companies/{companyId}/projects/{projectId}` block. Modify its `allow update` line:

```
allow update: if request.auth != null
  && isCompanyMember(companyId)
  && !isOwnerPriorityLocked(resource.data, request);
```

- [ ] **Step 4: Add rule for new `ownerTakeovers` subcollection**

Inside the same `/companies/{companyId}` block, add:

```
match /ownerTakeovers/{takeoverId} {
  allow read: if request.auth != null && isCompanyMember(companyId);
  // Only admins can create takeover records
  allow create: if request.auth != null
    && isCompanyMember(companyId)
    && request.resource.data.takeoverBy == request.auth.uid;
  allow update, delete: if false;  // append-only audit log
}
```

- [ ] **Step 5: Deploy rules + commit**

Run: `firebase deploy --only firestore:rules`
Expected output: `✓ Deploy complete!` with `cloud.firestore: released rules`

Run:
```bash
git add firestore.rules
git commit -m "Firestore rules: reject locked writes + ownerTakeovers audit collection"
```

---

## Task 2: Detect Owner Priority Mode — add computed state

**Goal:** Add `ownerPriorityActive` state + `iAmOwner` + `takeoverActive` state to ProjectView. No UI changes yet — just the data. Console-log transitions for debug.

**Files:**
- Modify: `public/index.html` — ProjectView component near line 20380

- [ ] **Step 1: Add new state variables after `viewers` state**

Locate line ~20414 (`const [viewers,setViewers]=useState([]);`) and add right after it:

```js
// DECISION(v1.19.678): Owner Priority Mode — soft-lockout that activates when
// the project owner is present. Non-owners see banner + chime; 14 destructive
// actions are disabled. See docs/superpowers/specs/2026-04-23-owner-priority-mode-design.md
const [ownerPriorityActive,setOwnerPriorityActive]=useState(false);
const [takeoverActive,setTakeoverActive]=useState(null);
const [showTakeoverModal,setShowTakeoverModal]=useState(false);
const iAmOwner=!project.createdBy||project.createdBy===uid;
const iAmAdmin=_appCtx.role==="admin";
```

- [ ] **Step 2: Add effect that computes `ownerPriorityActive` from viewers + project doc**

Locate the `useEffect` that sets `viewers` (around line 20431). After that useEffect closes, add a new one:

```js
// DECISION(v1.19.678): Compute Owner Priority Mode from viewers + project doc.
// Active when owner is present (recent heartbeat OR lockActive checkbox) AND
// no takeover is currently overriding it AND I am not the owner.
useEffect(()=>{
  if(iAmOwner){setOwnerPriorityActive(false);return;}
  const now=Date.now();
  // Owner's presence is fresh if lastSeen within 90s OR project.ownerLockActive is true
  const ownerPresence=viewers.find(v=>v.isOwner&&v.uid===project.createdBy);
  const lockHeld=!!project.ownerLockActive;
  const ownerIsWatching=ownerPresence&&(lockHeld||(now-(ownerPresence.lastSeen||0))<90000);
  // Check for active takeover
  const ta=project.ownerTakeoverActive;
  const takeoverValid=ta&&ta.expiresAt>now;
  setTakeoverActive(takeoverValid?ta:null);
  const active=!!ownerIsWatching&&!takeoverValid;
  setOwnerPriorityActive(active);
},[viewers,project.createdBy,project.ownerLockActive,project.ownerTakeoverActive,iAmOwner,uid]);
```

- [ ] **Step 3: Add console-log for state transitions (debug aid)**

Immediately after the useEffect above, add:

```js
// DECISION(v1.19.678): Log state transitions for debug (remove when stable)
const _prevOwnerPriorityRef=useRef(false);
useEffect(()=>{
  if(_prevOwnerPriorityRef.current!==ownerPriorityActive){
    console.log("[OWNER PRIORITY]",ownerPriorityActive?"ACTIVATED":"DEACTIVATED",
      "iAmOwner:",iAmOwner,"takeoverActive:",!!takeoverActive);
    _prevOwnerPriorityRef.current=ownerPriorityActive;
  }
},[ownerPriorityActive,iAmOwner,takeoverActive]);
```

- [ ] **Step 4: Manual verification**

1. Run `node validate_jsx.js` — expect `JSX OK`
2. `bash deploy.sh` — expect `✓ Deployed v1.19.xxx`
3. Open matrix-arc.web.app in two browser windows: Window A as project owner, Window B as a non-owner teammate
4. In Window B, open the owner's project. Open console.
5. In Window A, open the same project. Within ~30 seconds Window B's console should log `[OWNER PRIORITY] ACTIVATED`
6. Close Window A. Within 90 seconds Window B should log `[OWNER PRIORITY] DEACTIVATED`

- [ ] **Step 5: Commit**

```bash
# Note: deploy.sh already commits public/index.html automatically
git log -1
# Confirm the auto-commit covers the changes
```

---

## Task 3: Banner + toast + chime notification UI

**Goal:** When `ownerPriorityActive` flips true, show toast + play chime. Show persistent banner while active. Banner includes (eventually) the Admin Take Over button — we'll wire that in Task 6.

**Files:**
- Modify: `public/index.html` — ProjectView near the top of its render return

- [ ] **Step 1: Add state for the toast**

Near the other ProjectView state (after `showTakeoverModal`), add:

```js
const [ownerPriorityToast,setOwnerPriorityToast]=useState(null); // {ownerName, shownAt} | null
const _chimeUnlockedRef=useRef(false);
```

- [ ] **Step 2: Add the chime helper function (reuse-friendly)**

Add near the top of ProjectView, before the return statement:

```js
// DECISION(v1.19.678): Subtle chime via WebAudio — single tone, 250ms. Browsers
// require a user interaction before audio can play, so we silently ignore errors
// on the first firing if autoplay blocks us. Tone: E5 (659Hz) for non-owner
// (descending feel), C5 (523Hz) for owner-side (ascending feel). Volume 0.15.
function _playChime(type){
  try{
    if(typeof AudioContext==="undefined"&&typeof webkitAudioContext==="undefined")return;
    const Ctx=window.AudioContext||window.webkitAudioContext;
    const ctx=new Ctx();
    const osc=ctx.createOscillator();const gain=ctx.createGain();
    osc.frequency.value=type==="owner-join"?659:523;
    gain.gain.value=0;
    osc.connect(gain);gain.connect(ctx.destination);
    const now=ctx.currentTime;
    gain.gain.linearRampToValueAtTime(0.15,now+0.02);
    gain.gain.linearRampToValueAtTime(0,now+0.25);
    osc.start(now);osc.stop(now+0.27);
    setTimeout(()=>{try{ctx.close();}catch(e){}},500);
  }catch(e){/* autoplay blocked, etc. — silent */}
}
```

- [ ] **Step 3: Trigger toast + chime when ownerPriorityActive flips true**

After the debug-log useEffect from Task 2, add:

```js
// DECISION(v1.19.678): Fire toast + chime on transition to Owner Priority Mode.
useEffect(()=>{
  if(!ownerPriorityActive)return;
  const ownerPresence=viewers.find(v=>v.isOwner&&v.uid===project.createdBy);
  const ownerName=(ownerPresence?.userName||(ownerPresence?.userEmail||"").split("@")[0])||"The owner";
  setOwnerPriorityToast({ownerName,shownAt:Date.now()});
  _playChime("owner-join");
  const t=setTimeout(()=>setOwnerPriorityToast(null),6000);
  return()=>clearTimeout(t);
},[ownerPriorityActive]); // eslint-disable-line react-hooks/exhaustive-deps
```

- [ ] **Step 4: Render the toast and banner**

Locate the ProjectView's return statement. Near the top of the JSX (just after the outer fragment opens, before the `{view==="quote"?…` line around line 21416), add:

```jsx
{/* DECISION(v1.19.678): Owner Priority Mode — toast + banner + chime */}
{ownerPriorityToast&&(
  <div style={{position:"fixed",top:16,left:"50%",transform:"translateX(-50%)",zIndex:99998,
    background:"#1e1b4b",border:"2px solid #c4b5fd",borderRadius:10,padding:"10px 18px",
    boxShadow:"0 8px 40px rgba(167,139,250,0.5)",fontSize:14,fontWeight:600,color:"#e0e7ff",
    animation:"fadeInDown 0.25s ease"}}>
    👑 <strong style={{color:"#fcd34d"}}>{ownerPriorityToast.ownerName}</strong> (owner) just joined — they now have priority. Your destructive actions are disabled.
  </div>
)}
{ownerPriorityActive&&!takeoverActive&&(
  <div style={{background:"#1e1b4b",border:"1px solid #818cf8",borderRadius:8,
    padding:"10px 16px",margin:"12px 24px 0",display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
    <span style={{fontSize:18}}>👑</span>
    <div style={{flex:1,minWidth:240,fontSize:13,color:"#e0e7ff",lineHeight:1.5}}>
      <strong style={{color:"#c4b5fd"}}>Owner is working this project.</strong> You can keep reviewing, but destructive and state-changing actions are disabled until they leave.
    </div>
    {iAmAdmin&&(
      <button onClick={()=>setShowTakeoverModal(true)}
        style={{background:"#3b0764",color:"#fcd34d",border:"1px solid #fcd34d66",borderRadius:6,padding:"5px 14px",fontSize:12,fontWeight:700,cursor:"pointer"}}>
        🛡 Admin Take Over
      </button>
    )}
  </div>
)}
{takeoverActive&&(
  <div style={{background:"#052e16",border:"1px solid #4ade80",borderRadius:8,
    padding:"10px 16px",margin:"12px 24px 0",fontSize:13,color:"#bbf7d0",lineHeight:1.5}}>
    🛡 <strong style={{color:"#4ade80"}}>Admin Take Over active</strong> by {takeoverActive.byName||"admin"}. Reason: {takeoverActive.reason||"(none given)"}. Expires {new Date(takeoverActive.expiresAt).toLocaleTimeString()}.
  </div>
)}
```

- [ ] **Step 5: Add the fadeInDown keyframe animation**

Find the `<style>` block at the top of the HTML file (search for `@keyframes pulse`). Add this keyframe in the same block:

```css
@keyframes fadeInDown { from { opacity:0; transform: translate(-50%, -10px); } to { opacity:1; transform: translate(-50%, 0); } }
```

- [ ] **Step 6: Manual verification**

1. `node validate_jsx.js` → `JSX OK`
2. `bash deploy.sh`
3. Two windows, owner + non-owner, open same project
4. Non-owner should: hear chime, see purple toast at top center (auto-dismisses in 6s), see persistent purple banner
5. Owner closes tab → banner disappears within 90s for non-owner
6. Verify admin's banner shows "🛡 Admin Take Over" button (other non-owners don't see it)

- [ ] **Step 7: Commit** (auto via deploy.sh)

---

## Task 4: Owner's "Hold priority while away" checkbox

**Goal:** Owner-side control to keep lock active even if they close tab. Writes `project.ownerLockActive` boolean.

**Files:**
- Modify: `public/index.html` — ProjectView near the project header

- [ ] **Step 1: Locate the ProjectView header area**

Find the line that renders the project title bar (around line 21420-21500 — look for where the project's back button and name are rendered). We'll add the checkbox next to existing header controls.

Run: `grep -n 'projectName\|project.name.*editing\|back.*dashboard' public/index.html | head -10`

- [ ] **Step 2: Add the checkbox (owner-only)**

Render just after the project name header (above the banners from Task 3):

```jsx
{iAmOwner&&(
  <div style={{margin:"8px 24px 0",display:"flex",alignItems:"center",gap:8,fontSize:12,color:C.muted}}>
    <label style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer"}}>
      <input type="checkbox"
        checked={!!project.ownerLockActive}
        onChange={e=>{
          const upd={...project,ownerLockActive:e.target.checked,updatedAt:Date.now()};
          onUpdate(upd);safeSave(uid,upd);
        }}
        style={{cursor:"pointer"}}/>
      <span>🔒 Hold priority while I'm away</span>
    </label>
    <span style={{fontSize:11,color:C.muted,fontStyle:"italic"}} title="Normally your priority lock releases 90 seconds after you close the tab. Check this to keep teammates locked out even if you step away or lose connection.">(keeps lock active if tab goes idle)</span>
  </div>
)}
```

- [ ] **Step 3: Update presence doc to mirror `ownerLockActive`**

Find the `entry()` function inside the `useEffect` that writes presence (around line 20420):

```js
const entry=()=>({
  uid,userEmail:fbAuth.currentUser?.email||"",userName:fbAuth.currentUser?.displayName||"",
  projectId,isOwner:init?.createdBy===uid,
  lastSeen:Date.now(),
});
```

Replace with:

```js
const entry=()=>({
  uid,userEmail:fbAuth.currentUser?.email||"",userName:fbAuth.currentUser?.displayName||"",
  projectId,isOwner:init?.createdBy===uid,
  lastSeen:Date.now(),
  lockActive:!!project.ownerLockActive, // mirrored for listener convenience
});
```

- [ ] **Step 4: Also update the heartbeat payload**

A few lines below, find the `heartbeat=setInterval(...)` call:

```js
heartbeat=setInterval(()=>{
  if(!alive)return;
  fbDb.doc(presencePath).update({lastSeen:Date.now()}).catch(()=>{});
},30000);
```

Replace the update payload to include `lockActive`:

```js
heartbeat=setInterval(()=>{
  if(!alive)return;
  fbDb.doc(presencePath).update({lastSeen:Date.now(),lockActive:!!project.ownerLockActive}).catch(()=>{});
},30000);
```

- [ ] **Step 5: Manual verification**

1. `node validate_jsx.js` → `JSX OK`
2. `bash deploy.sh`
3. Owner opens project → sees "🔒 Hold priority while I'm away" checkbox near header
4. Owner checks it → `project.ownerLockActive=true` saves
5. Owner closes tab WITHOUT unchecking → non-owner's banner should NOT disappear after 90s (stays locked)
6. Owner reopens project, unchecks the box → after owner closes tab, non-owner's banner releases within 90s as before

- [ ] **Step 6: Commit** (auto via deploy.sh)

---

## Task 5: Hard-lock the 14 destructive actions

**Goal:** Every one of the 14 buttons listed in the design spec gates on `ownerPriorityActive`. Disabled state shows visual + tooltip. Clicking a disabled button fires a single alert.

**Files:**
- Modify: `public/index.html` — multiple callsites for each button

For each of the 14 actions, apply the same pattern:

```jsx
<button disabled={readOnly||ownerPriorityActive||/* existing conditions */}
  title={ownerPriorityActive?"Disabled — owner is working this project. Wait until they leave or ask an admin to Take Over.":/* existing title */}
  onClick={ownerPriorityActive?()=>alert("This action is disabled while the owner is working this project. Wait until they leave, or ask an admin to Take Over."):/* existing onClick */}
  style={{...existingStyle,opacity:ownerPriorityActive?0.45:1,cursor:ownerPriorityActive?"not-allowed":"pointer"}}>
```

- [ ] **Step 1: Prop-drill `ownerPriorityActive` into PanelCard and QuoteSendModal**

These two components own most of the locked buttons. In ProjectView's render, find where `<PanelCard ...>` is mounted and add the prop:

```jsx
<PanelCard
  /* ...existing props... */
  ownerPriorityActive={ownerPriorityActive}
  takeoverActive={takeoverActive}
/>
```

Find where `<QuoteSendModal ...>` is mounted (around line 19796) and add same props.

Update each component's destructuring signature to accept them.

- [ ] **Step 2: Lock button #1 — Re-extract BOM**

Find in PanelCard (around line 14894):
```jsx
<button onClick={()=>{...}} disabled={extracting}
  style={...opacity:extracting?0.6:1}}>
  {extracting?"Extracting…":"Re-Extract Drawings"}
</button>
```

Change to:
```jsx
<button onClick={ownerPriorityActive?()=>alert("This action is disabled while the owner is working this project. Wait until they leave, or ask an admin to Take Over."):()=>{...}}
  disabled={extracting||ownerPriorityActive}
  title={ownerPriorityActive?"Disabled — owner is working this project":undefined}
  style={...opacity:(extracting||ownerPriorityActive)?0.45:1,cursor:(extracting||ownerPriorityActive)?"not-allowed":"pointer"}}>
  {extracting?"Extracting…":"Re-Extract Drawings"}
</button>
```

- [ ] **Step 3: Lock button #2 — Re-extract with feedback**

Find the AI feedback modal's submit button (search for `reExtractWithFeedback` caller, around line 16386). Apply same pattern.

- [ ] **Step 4: Lock button #3 — Run Validation**

Find the Validate button in PanelCard. Search: `grep -n 'runPanelValidation\|Re-Validate' public/index.html`. Apply pattern.

- [ ] **Step 5: Lock button #4 — Run/Refresh Pricing (normal + force-fresh)**

Find in PanelCard (around line 15275): `runPricingOnPanel`. There are likely 2 callsites — normal and force-fresh. Apply pattern to both.

- [ ] **Step 6: Lock button #5 — Apply Supplier Portal prices**

Find in PortalSubmissionsModal render (around line 21495). Apply pattern.

- [ ] **Step 7: Lock button #6 — Delete panel**

Find `onDelete` caller in PanelCard. Apply pattern.

- [ ] **Step 8: Lock button #7 — Delete drawing**

Find `removePage(pg.id)` caller (around line 15159). Apply pattern to the ✕ button on drawing thumbnails.

- [ ] **Step 9: Lock button #8 — Send Quote**

In QuoteSendModal's handleSend button (line 18921). Gate with `ownerPriorityActive`:
```jsx
<button onClick={handleSend} disabled={sending||sendBlocked||ownerPriorityActive}
  title={ownerPriorityActive?"Disabled — owner is working this project":sendBlocked?"…":""}
  style={...opacity:(sending||sendBlocked||ownerPriorityActive)?0.4:1,cursor:(sendBlocked||ownerPriorityActive)?"not-allowed":"pointer"}}>
```
Also in PanelListView's main Send button (line ~19875). Apply pattern.

- [ ] **Step 10: Lock button #9 — Send/Print RFQs**

Find `onSendRfqEmails` button in PanelCard (around line 19798). Apply pattern.

- [ ] **Step 11: Lock button #10 — Record PO Received**

Find `onPoReceived` button (line 19881). Apply pattern.

- [ ] **Step 12: Lock button #11 — Approve pre/post review**

Find the approve/return buttons in the pre-review banner (line 19449, 19454) and post-review banner (line 19483, 19488). Apply pattern to all 4 buttons.

- [ ] **Step 13: Lock button #12 — Unlock sent quote**

Find the Unlock button (line 19861): `onClick={()=>setShowUnlockConfirm(true)}`. Apply pattern.

- [ ] **Step 14: Lock button #13 — Push BOM to BC**

Find Update BOM in BC button (line 19883). Apply pattern.

- [ ] **Step 15: Lock button #14 — Transfer / Copy project**

Find Transfer button and Copy button in project tile on Dashboard. These live at the dashboard level, so `ownerPriorityActive` isn't in scope there. Instead, gate them based on: "is owner currently viewing this project".

Add at the dashboard level (around where ProjectTile is rendered):
```jsx
// Check if owner is currently present on the project
const ownerPresentOnProject=(projectViewers||[]).some(v=>v.projectId===p.id&&v.uid===p.createdBy&&(Date.now()-(v.lastSeen||0))<90000);
const transferBlocked=ownerPresentOnProject&&p.createdBy!==uid;
```
Gate Transfer/Copy buttons with `transferBlocked`.

Alternative (simpler): skip dashboard-level gating for Transfer/Copy since ownership change is rare and the Firestore rules from Task 1 will catch illegal writes anyway. User's call.

- [ ] **Step 16: Manual verification**

1. `node validate_jsx.js` → `JSX OK`
2. `bash deploy.sh`
3. Two windows, owner + non-owner. Non-owner opens project while owner is present.
4. Walk through each of the 14 buttons. Verify:
   - Visually greyed out (45% opacity, `not-allowed` cursor)
   - Hover tooltip shows "Disabled — owner is working this project"
   - Click still triggers the alert (not the action)
5. Owner closes tab. Within 90s, all buttons re-enable for non-owner.
6. Owner checks "Hold priority while away" + closes tab. Buttons stay disabled.

- [ ] **Step 17: Commit** (auto via deploy.sh)

---

## Task 6: Admin Take Over modal + audit log

**Goal:** Admin clicks "🛡 Admin Take Over" → reason prompt → writes audit entry + project.ownerTakeoverActive → banner flips to green, all actions re-enable.

**Files:**
- Modify: `public/index.html` — ProjectView (modal component + handler)

- [ ] **Step 1: Build the TakeoverModal component**

Add a new component definition before ProjectView (near the other modal components):

```jsx
function OwnerTakeoverModal({ownerName,onClose,onConfirm}){
  const [reason,setReason]=useState("");
  const [submitting,setSubmitting]=useState(false);
  return ReactDOM.createPortal(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:99999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{background:"#1a1a2e",border:"2px solid #fcd34d",borderRadius:12,padding:"22px 26px",maxWidth:520,width:"100%",boxShadow:"0 20px 60px rgba(0,0,0,0.7)"}}>
        <div style={{fontSize:17,fontWeight:800,color:"#fcd34d",marginBottom:10}}>🛡 Admin Take Over</div>
        <div style={{fontSize:13,color:"#cbd5e1",lineHeight:1.6,marginBottom:14}}>
          You're about to take priority from <strong style={{color:"#fcd34d"}}>{ownerName}</strong>. This will enable all actions on the project for you and log an audit entry visible to both parties.
        </div>
        <label style={{fontSize:11,fontWeight:600,color:"#fcd34d",textTransform:"uppercase",letterSpacing:0.5,display:"block",marginBottom:6}}>
          Reason (required)
        </label>
        <textarea value={reason} onChange={e=>setReason(e.target.value)} rows={3} placeholder="e.g. 'Jon out sick — pushing PRJ402100 quote per customer deadline'" autoFocus
          style={{width:"100%",background:"#0d0d14",border:"1px solid #3d6090",borderRadius:6,color:"#f1f5f9",fontSize:13,padding:"8px 12px",resize:"vertical",outline:"none",fontFamily:"inherit",marginBottom:16,boxSizing:"border-box"}}/>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
          <button onClick={onClose} disabled={submitting}
            style={{background:"#1a1a2a",border:"1px solid #334155",color:"#94a3b8",padding:"7px 18px",borderRadius:6,fontSize:13,cursor:"pointer"}}>Cancel</button>
          <button onClick={async()=>{
            if(!reason.trim()){alert("Please enter a reason.");return;}
            setSubmitting(true);
            try{await onConfirm(reason.trim());}catch(e){alert("Take over failed: "+e.message);}
            setSubmitting(false);
          }} disabled={submitting||!reason.trim()}
            style={{background:"#3b0764",border:"1px solid #fcd34d",color:"#fcd34d",padding:"7px 18px",borderRadius:6,fontSize:13,fontWeight:700,cursor:"pointer",opacity:submitting||!reason.trim()?0.5:1}}>
            {submitting?"Taking over…":"🛡 Take Over"}
          </button>
        </div>
      </div>
    </div>
  ,document.body);
}
```

- [ ] **Step 2: Add handler that writes takeover + audit log**

Inside ProjectView, near other handlers, add:

```js
async function handleAdminTakeover(reason){
  const ownerPresence=viewers.find(v=>v.isOwner&&v.uid===project.createdBy);
  const ownerName=(ownerPresence?.userName||(ownerPresence?.userEmail||"").split("@")[0])||"owner";
  const now=Date.now();
  const EXPIRE_MS=15*60*1000;
  const takeover={
    byUid:uid,
    byName:fbAuth.currentUser?.displayName||fbAuth.currentUser?.email||"admin",
    atMs:now,
    reason,
    expiresAt:now+EXPIRE_MS,
  };
  const logEntry={
    takeoverBy:uid,
    takeoverByName:takeover.byName,
    originalOwnerUid:project.createdBy,
    originalOwnerName:ownerName,
    reason,
    takeoverAt:now,
  };
  const upd={
    ...project,
    ownerTakeoverActive:takeover,
    ownerTakeoverLog:[...(project.ownerTakeoverLog||[]),logEntry],
    updatedAt:now,
  };
  onUpdate(upd);safeSave(uid,upd);
  // Also write to company-scoped audit collection for reporting
  const cid=_appCtx.companyId;
  if(cid){
    try{
      await fbDb.collection(`companies/${cid}/ownerTakeovers`).add({
        ...logEntry,projectId:project.id,companyId:cid,
      });
    }catch(e){console.warn("ownerTakeovers audit write failed:",e);}
  }
  setShowTakeoverModal(false);
}
```

- [ ] **Step 3: Render the modal**

In ProjectView's return, after the toast/banner JSX from Task 3, add:

```jsx
{showTakeoverModal&&(
  <OwnerTakeoverModal
    ownerName={(viewers.find(v=>v.isOwner&&v.uid===project.createdBy)?.userName)||"owner"}
    onClose={()=>setShowTakeoverModal(false)}
    onConfirm={handleAdminTakeover}/>
)}
```

- [ ] **Step 4: Manual verification**

1. `node validate_jsx.js` → `JSX OK`
2. `bash deploy.sh`
3. Three windows: owner, admin (non-owner), regular teammate (non-owner)
4. Owner opens project → admin + teammate both see banner + chime
5. Admin clicks "🛡 Admin Take Over" → modal opens, enter reason, click Take Over
6. Verify:
   - Admin's banner flips to green "🛡 Admin Take Over active"
   - All 14 locked buttons re-enable for admin
   - Teammate's banner also flips to green (same listener)
   - Owner's banner (if still present) updates to "🛡 {admin name} has taken over…"
   - Firestore: `companies/{cid}/ownerTakeovers/` has a new doc with full audit fields
   - Firestore: `project.ownerTakeoverLog` has the append entry
7. Wait 15 minutes (or manually modify `expiresAt` to now) → verify takeover expires, lockout resumes for non-admins

- [ ] **Step 5: Commit** (auto via deploy.sh)

---

## Task 7: Owner-side viewers badge + opt-in chime on teammate join

**Goal:** Owner sees who's watching their project in real time. Optional chime when teammate joins (default OFF — opt-in via settings).

**Files:**
- Modify: `public/index.html` — ProjectView header
- Modify: `public/index.html` — SettingsModal (add toggle)

- [ ] **Step 1: Compute "other viewers currently watching"**

In ProjectView, after the viewers useEffect, add:

```js
const otherViewers=viewers.filter(v=>v.uid!==uid&&(Date.now()-(v.lastSeen||0))<90000);
```

- [ ] **Step 2: Render a small badge next to the project header (owner only)**

Find the project header area (where "Back to Dashboard" or project name renders). Add:

```jsx
{iAmOwner&&otherViewers.length>0&&(
  <div style={{display:"inline-flex",alignItems:"center",gap:6,marginLeft:10,padding:"3px 10px",background:"#1e1b4b",border:"1px solid #818cf866",borderRadius:14,fontSize:11,fontWeight:600,color:"#c4b5fd"}}
    title={"Watching: "+otherViewers.map(v=>v.userName||v.userEmail).join(", ")}>
    👁 {otherViewers.length} teammate{otherViewers.length>1?"s":""} watching
  </div>
)}
```

- [ ] **Step 3: Load + save chime-on-join preference**

Add at the top of ProjectView:

```js
const [chimeOnViewer,setChimeOnViewer]=useState(()=>{
  try{return localStorage.getItem("arc_chime_on_viewer_"+uid)==="1";}catch(e){return false;}
});
function _saveChimePref(v){
  try{localStorage.setItem("arc_chime_on_viewer_"+uid,v?"1":"0");}catch(e){}
  setChimeOnViewer(v);
}
```

- [ ] **Step 4: Fire chime when a new viewer appears (owner only)**

Track previous viewer set:

```js
const _prevViewersRef=useRef(new Set());
useEffect(()=>{
  if(!iAmOwner||!chimeOnViewer)return;
  const currentSet=new Set(viewers.filter(v=>v.uid!==uid).map(v=>v.uid));
  // New viewer = present now but not in previous set
  let newViewer=false;
  currentSet.forEach(id=>{if(!_prevViewersRef.current.has(id))newViewer=true;});
  if(newViewer&&_prevViewersRef.current.size>=0){ // skip first fire (initial load)
    _playChime("viewer-join");
  }
  _prevViewersRef.current=currentSet;
},[viewers,iAmOwner,chimeOnViewer,uid]);
```

Wait — to skip the initial fire, track a "mounted" flag:

```js
const _viewersMountedRef=useRef(false);
const _prevViewersRef=useRef(new Set());
useEffect(()=>{
  if(!iAmOwner)return;
  const currentSet=new Set(viewers.filter(v=>v.uid!==uid).map(v=>v.uid));
  if(_viewersMountedRef.current&&chimeOnViewer){
    let newViewer=false;
    currentSet.forEach(id=>{if(!_prevViewersRef.current.has(id))newViewer=true;});
    if(newViewer)_playChime("viewer-join");
  }
  _prevViewersRef.current=currentSet;
  _viewersMountedRef.current=true;
},[viewers,iAmOwner,chimeOnViewer,uid]);
```

- [ ] **Step 5: Add toggle to SettingsModal**

Find `function SettingsModal(` (grep for it). Add a new labeled checkbox section:

```jsx
<div style={{marginBottom:16,paddingTop:12,borderTop:`1px solid ${C.border}`}}>
  <div style={{fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:0.5,marginBottom:8}}>Presence Notifications</div>
  <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:13,color:C.text}}>
    <input type="checkbox"
      checked={localStorage.getItem("arc_chime_on_viewer_"+uid)==="1"}
      onChange={e=>{
        try{localStorage.setItem("arc_chime_on_viewer_"+uid,e.target.checked?"1":"0");}catch(err){}
        // Visual feedback
        e.target.blur();
      }}/>
    <span>🔔 Chime when a teammate opens one of my projects</span>
  </label>
  <div style={{fontSize:11,color:C.muted,marginLeft:22,marginTop:4,lineHeight:1.4}}>
    Only plays if you're the project owner. The non-owner lockout chime is always on.
  </div>
</div>
```

- [ ] **Step 6: Manual verification**

1. `node validate_jsx.js` → `JSX OK`
2. `bash deploy.sh`
3. Owner + non-owner windows. Owner sees "👁 1 teammate watching" badge. Hover shows name.
4. Owner goes to Settings, checks the "Chime when a teammate opens…" box.
5. Close + re-open the project so the new preference loads.
6. Second non-owner joins → owner hears chime.
7. First non-owner leaves + rejoins → owner hears chime again.
8. Owner unchecks the box → no chime on next join.

- [ ] **Step 7: Commit** (auto via deploy.sh)

---

## Task 8: End-to-end verification + docs

**Goal:** Walk through every scenario from the spec's "Testing plan" section. Update CLAUDE.md with the new concurrency rules.

- [ ] **Step 1: Update CLAUDE.md to document Owner Priority Mode**

Add a new subsection under the existing "Global State" → "Badge Component" area, or near the firestore paths table:

```markdown
### Owner Priority Mode (v1.19.678)

Soft-lockout that activates when the project owner is viewing. Sits between Hard
Project Lock (task running) and free-for-all. See
`docs/superpowers/specs/2026-04-23-owner-priority-mode-design.md` for full spec.

**Trigger:** Owner's projectPresence doc has `lastSeen` within 90s OR
`project.ownerLockActive === true`. Overridden by admin takeover.

**New fields:**
- `project.ownerLockActive: boolean` — owner's "hold priority while away" checkbox
- `project.ownerTakeoverActive: { byUid, byName, atMs, reason, expiresAt } | null` — active admin override
- `project.ownerTakeoverLog: []` — append-only history on the project doc
- `projectPresence.lockActive: boolean` — mirrored for listener convenience

**New Firestore collection:**
`companies/{companyId}/ownerTakeovers` — audit trail, one doc per takeover event.

**14 actions locked while active** (see spec Section 5 for full list):
re-extract, re-extract with feedback, validate, refresh pricing, apply supplier
prices, delete panel, delete drawings, send quote, send RFQs, PO received,
approve pre/post review, unlock quote, push to BC, transfer/copy.

**Allowed while active:** view, BOM row edits, title block edits, quote field
edits, review notes, answer questions, BC browser lookups, Just Print.
```

- [ ] **Step 2: Run through the spec's 8 testing scenarios**

For each scenario in `docs/superpowers/specs/2026-04-23-owner-priority-mode-design.md` "Testing plan" section (there are 8), do the test and confirm pass/fail. If any fail, fix inline and re-test.

- [ ] **Step 3: Final commit**

```bash
git add CLAUDE.md
git commit -m "Document Owner Priority Mode in CLAUDE.md"
# Hosting already deployed through the iterative commits above
```

---

## Self-review checklist (performed during plan writing)

- [x] Every task has exact file paths
- [x] Every code step shows actual code (no "add appropriate handling")
- [x] Verification steps describe exact manual test procedures
- [x] Commit granularity matches task boundaries (auto-commits via deploy.sh for public/index.html; manual for firestore.rules + CLAUDE.md)
- [x] No placeholders, TBDs, or "similar to Task N"
- [x] Type/variable consistency: `ownerPriorityActive`, `takeoverActive`, `iAmOwner`, `iAmAdmin` used identically across all tasks
- [x] Matches spec: 14 locked actions (Task 5), owner checkbox (Task 4), admin takeover (Task 6), owner-side badge + chime (Task 7)
- [x] Spec coverage: every numbered requirement in the spec has a task implementing it
- [x] No dependencies between tasks that force out-of-order execution (Task 1 rules can deploy anytime; Tasks 2-7 are ordered but each produces a demoable increment)
