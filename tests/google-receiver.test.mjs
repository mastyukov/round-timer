import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function createContext() {
  const values = [];
  let sheetId='';
  const sheet={
    getLastRow(){return values.length;},
    appendRow(row){values.push([...row]);},
    getRange(row,col,length,width) {
      if(length===undefined){
        return {
          getValue(){return values[row-1][col-1];},
          setValue(value){values[row-1][col-1]=value;}
        };
      }
      return {getValues(){return values.slice(row-1,row-1+length).map(x=>x.slice(col-1,col-1+width));}};
    },
    deleteRow(row){values.splice(row-1,1);}
  };
  const context={
    ContentService:{MimeType:{TEXT:'text'},createTextOutput(message){return {message,setMimeType(){return this;}};}},
    LockService:{getScriptLock(){return {tryLock(){return true;},releaseLock(){}};}},
    PropertiesService:{getScriptProperties(){return {
      getProperty(){return sheetId;},setProperty(_,value){sheetId=value;}
    };}},
    SpreadsheetApp:{
      create(){return {getId(){return 'private-id';},getSheets(){return [sheet];}};},
      openById(){return {getSheets(){return [sheet];}};}
    },
    Utilities:{formatDate(){return '2026-11-08';}}
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(new URL('../receiver/google-apps-script/Code.gs',import.meta.url),'utf8'),context);
  return {context,values};
}

test('backend rejects visits or workout statistics',()=>{
  const {context,values}=createContext();
  for(const event of ['session_start','workout_start','workout_complete']){
    const x=context.doPost({postData:{contents:JSON.stringify({event,code:'UNKNOWN',component:'other',version:'0.8.3'})}});
    assert.equal(x.message,'ignored');
  }
  assert.equal(values.length,0);
});

test('backend stores daily aggregates only, not event histories or PII',()=>{
  const {context,values}=createContext();
  const raw=JSON.stringify({
    event:'audio_failure',code:'AUDIO_PLAY_REJECTED',
    component:'audio',version:'0.8.3',
    email:'someone@private.com',ip:'198.51.100.4',
    name:'Person',deviceId:'private',message:'private'
  });
  assert.equal(context.doPost({postData:{contents:raw}}).message,'stored');
  assert.equal(context.doPost({postData:{contents:raw}}).message,'stored');
  assert.equal(values.length,2);
  assert.equal(values[1][5],2);
  assert.deepEqual(values[1],['2026-11-08','audio_failure','AUDIO_PLAY_REJECTED','audio','0.8.3',2]);
  assert(!JSON.stringify(values).includes('private'));
  assert(!JSON.stringify(values).includes('198.51.'));
});

test('backend discards overlong and unrecognized payloads',()=>{
  const {context,values}=createContext();
  assert.equal(context.doPost({postData:{contents:'x'.repeat(500)}}).message,'ignored');
  assert.equal(context.doPost({postData:{contents:'not json'}}).message,'ignored');
  assert.equal(context.doPost({postData:{contents:JSON.stringify({event:'app_error',code:'SECRET_MESSAGE',component:'ui',version:'0.8.3'})}}).message,'ignored');
  assert.equal(values.length,0);
});

test('receiver caps aggregated event counts at 200/day',()=>{
  const {context,values}=createContext();
  const e={postData:{contents:JSON.stringify({event:'app_error',code:'UNHANDLED_ERROR',component:'ui',version:'0.8.3'})}};
  for(let i=0;i<201;i++) context.doPost(e);
  assert.equal(values[1][5],200);
  assert.equal(values.length,2);
});
