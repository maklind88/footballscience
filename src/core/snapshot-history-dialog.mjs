import { createSnapshotCompatibleReader } from './snapshot-compatible-reader.mjs';
import { encodeSnapshotReview } from './snapshot-history-format.mjs';
import { createSnapshotRecoveryDrafts } from './snapshot-recovery-draft-service.mjs';
import { mountSnapshotRecoveryDraftPanel } from './snapshot-recovery-draft-panel.mjs';

export async function openSnapshotHistory({win,documentRef:doc=win.document,indexedDB=win.indexedDB,
  databaseName,storeName='snapshots',getScope,protectedStorageKeys,storageLabels={},canPrepareRecoveryDraft=()=>false}) {
  const scope=getScope();
  if(!scope||!doc?.body||doc.querySelector('dialog[data-snapshot-history]'))return;
  const focus=doc.activeElement,keys=new Set(protectedStorageKeys);
  let invalid=false, generation=0, requestSequence=0, selectedSource='legacy';
  const recoveryAbort=new AbortController();let recoveryPanel;
  const dialog=doc.createElement('dialog');dialog.dataset.snapshotHistory='';dialog.setAttribute('aria-label','Saved browser copies');
  if(!doc.getElementById('snapshot-history-style')){
    const link=doc.createElement('link');link.id='snapshot-history-style';link.rel='stylesheet';
    link.href=new URL('./snapshot-history.css',import.meta.url).href;doc.head.append(link);
  }
  const heading=doc.createElement('h2');heading.textContent='Saved browser copies';
  const intro=doc.createElement('p');intro.textContent='Review copies saved by this account on this browser. A browser copy does not confirm central saving. Downloading a review file does not restore or change any work.';
  const status=doc.createElement('p');status.setAttribute('role','status');status.textContent='Reading saved copies…';
  const list=doc.createElement('div'),close=doc.createElement('button');close.type='button';close.textContent='Close saved copies';
  close.onclick=()=>dialog.close();dialog.append(heading,intro,status,list,close);doc.body.append(dialog);
  const invalidate=()=>{invalid=true;generation++;recoveryAbort.abort();recoveryPanel?.invalidate();list.replaceChildren();status.textContent='Account or access changed. Close and reopen this review.';};
  const active=()=>{
    if(!dialog.isConnected||invalid)return false;
    if(getScope()!==scope){invalidate();return false;}
    return true;
  };
  // Invalidate on every auth event, including A -> B -> A within an async read.
  win.addEventListener('platform:user-change',invalidate);
  const mayPrepare=()=>{try{return active()&&canPrepareRecoveryDraft()===true;}catch{return false;}};
  const timer=win.setInterval(()=>{
    if(dialog.isConnected&&getScope()!==scope)invalidate();
    if(recoveryPanel&&!mayPrepare())invalidate();
  },500);
  dialog.addEventListener('close',()=>{
    invalid=true;recoveryAbort.abort();recoveryPanel?.invalidate();win.clearInterval(timer);win.removeEventListener('platform:user-change',invalidate);dialog.remove();
    if(focus?.isConnected)focus.focus();
  },{once:true});
  dialog.showModal();
  const reader=createSnapshotCompatibleReader({indexedDB,databaseName,storeName,getAccess:()=>({
    scope:getScope(),generation:String(generation),canReview:active(),allowedKeys:keys,
  })});
  if(mayPrepare()){
    const host=doc.createElement('div');dialog.insertBefore(host,list);
    const service=createSnapshotRecoveryDrafts({indexedDB,reader,signal:recoveryAbort.signal,getAccess:()=>({
      scope:getScope(),generation:String(generation),canPrepare:mayPrepare(),allowedKeys:keys,
    })});
    recoveryPanel=mountSnapshotRecoveryDraftPanel({win,doc,host,service,active:mayPrepare,status});
  }
  async function load(beforeKey) {
    if(!active())return;
    const source=selectedSource,sequence=++requestSequence;
    const current=()=>active()&&sequence===requestSequence;
    list.replaceChildren();status.textContent='Reading saved copies…';
    const report=await reader.list({source,beforeKey});
    if(!current())return;
    if(report.status==='denied'){invalidate();return;}
    if(report.status==='unavailable'){status.textContent='Saved copies could not be read. Your data has not been changed. Close and retry.';return;}
    status.textContent=report.status==='partial'?'The check stopped at a reading limit. This list is incomplete; no copies were removed.'
      :report.rows.length?`${report.rows.length} verified browser copies available on this page.`:'No verified copies are available in this check. Other recovery copies may still exist.';
    if(report.skipped){const note=doc.createElement('p');note.textContent='Some copies could not be verified for this account or need their module’s recovery view. They were left unchanged.';list.append(note);}
    const sorted=report.rows.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||b.id.localeCompare(a.id));
    for(const row of sorted){
      const section=doc.createElement('section'),title=doc.createElement('h3');title.textContent=new Date(row.createdAt).toLocaleString();section.append(title);
      const state=doc.createElement('p');state.textContent=Object.values(row.saveContext.entries).some(entry=>entry.pendingCentralSync||entry.localWritePrepared)
        ?'This copy includes work marked as awaiting central saving. Use its module to resolve it.':'Local copy — central saving is not verified by this view.';section.append(state);
      for(const [key,value] of Object.entries(row.storage)){
        if(key==='football-medical-team-v1'){
          const note=doc.createElement('p');note.textContent='Medical Room: review clinical details in Medical. The downloaded review file includes this module’s medical information.';
          section.append(note);continue;
        }
        const details=doc.createElement('details'),summary=doc.createElement('summary');
        summary.textContent=Object.hasOwn(storageLabels,key)?storageLabels[key]:'Saved module';details.append(summary);
        details.addEventListener('toggle',()=>{
          if(!details.open||details.dataset.loaded||!current())return;
          details.dataset.loaded='true';const pre=doc.createElement('pre');pre.textContent=value.slice(0,20000);details.append(pre);
          if(value.length>20000){const note=doc.createElement('p');note.textContent='Preview shortened. Download the review file for the complete copy.';details.append(note);}
        });section.append(details);
      }
      const download=doc.createElement('button');download.type='button';download.textContent='Download review file';
      download.onclick=async()=>{
        if(!current()||download.disabled)return;download.disabled=true;
        const fresh=await reader.read({source,id:row.id});
        if(!current())return;
        const copy=fresh.envelope;
        if(fresh.status!=='ok'||!copy||JSON.stringify(copy)!==JSON.stringify(row)){
          status.textContent='This copy changed or could not be verified. Close and reopen the review.';return;
        }
        try{
          const text=encodeSnapshotReview(copy,scope,keys);
          if(!current())return;
          const url=win.URL.createObjectURL(new win.Blob([text],{type:'application/json'}));
          const link=doc.createElement('a');link.href=url;link.download=`football-science-review-${row.createdAt.replace(/[^0-9T]/g,'-')}.json`;
          doc.body.append(link);
          try{link.click();}finally{link.remove();win.setTimeout(()=>win.URL.revokeObjectURL(url),1000);}
          status.textContent='Review file downloaded. No work was restored or changed.';
        }catch{status.textContent='The review file could not be downloaded. Your saved copy remains unchanged.';}
        finally{if(current())download.disabled=false;}
      };
      section.append(download);recoveryPanel?.addPrepareButton(section,{row,source,current});list.append(section);
    }
    if(report.status==='partial'&&report.nextKey!==null){
      const next=doc.createElement('button');next.type='button';next.textContent='Next copies';
      next.onclick=()=>{if(current())load(report.nextKey);};list.append(next);
    }
  }
  const discovery=await reader.discover();
  if(!active())return;
  if(discovery.compact){
    const label=doc.createElement('label'),select=doc.createElement('select');
    label.textContent='Saved-copy collection ';select.setAttribute('aria-label','Saved-copy collection');
    for(const [value,text] of [['legacy','Browser history'],['compact','Additional saved copies']]){
      const option=doc.createElement('option');option.value=value;option.textContent=text;select.append(option);
    }
    select.onchange=()=>{if(active()){selectedSource=select.value;load();}};
    label.append(select);dialog.insertBefore(label,status);
  }else if(discovery.status==='unavailable'){
    const note=doc.createElement('p');note.textContent='Additional saved copies could not be checked. This review may be incomplete.';
    dialog.insertBefore(note,status);
  }
  await load();
}
