const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const {performance} = require('node:perf_hooks');
// Minimal DOM and Canvas interfaces for deterministic rules, independent of browser availability.
// Geometry, focus, painting, input event delivery and audio are outside this runner's scope.
const root = path.join(__dirname, '..');

function boot(file) {
  const html=fs.readFileSync(path.join(root,file),'utf8');
  const ids=new Map(), store=new Map();
  const css={setProperty(key,value){this[key]=value;}};
  const makeClass=()=>{const keys=new Set();return {add(...values){values.forEach(v=>keys.add(v));},remove(v){keys.delete(v);},contains(v){return keys.has(v);},toggle(v,on=!keys.has(v)){if(on)keys.add(v);else keys.delete(v);return on;}};};
  const inertCtx=new Proxy({}, {get(obj,key){return obj[key]??(key==='getTransform'?()=>({e:0,f:0}):key==='createLinearGradient'?()=>({addColorStop(){}}):()=>{});}});
  let doc;
  class Element {
    constructor(tag,id,hidden=false){
      this.tagName=tag.toUpperCase();this.id=id;this.children=[];this.classList=makeClass();this.style=Object.create(css);
      this.attrs={};this.dataset={};this.events={};this._text='';this.hidden=hidden;
      this.width=1472;this.height=920;this.offsetWidth=1280;this.offsetHeight=800;
      this.clientWidth=1280;this.scrollWidth=1280;this.isConnected=true;
    }
    get textContent(){return this._text+this.children.map(x=>x.textContent).join('');}
    set textContent(text){this._text=String(text??'');this.children=[];}
    get firstChild(){return this._text?{textContent:this._text}:this.children[0];}
    get firstElementChild(){return this.children[0];}
    get lastElementChild(){return this.children.at(-1);}
    append(...els){for(const el of els){const next=typeof el==='string'?{textContent:el}:el;next.parentElement=this;this.children.push(next);}}
    replaceChildren(...els){for(const child of this.children)child.isConnected=false;this.children=[];this._text='';this.append(...els);}
    querySelectorAll(tag){return this.children.flatMap(x=>x.tagName?(x.tagName===tag.toUpperCase()?[x]:[]).concat(x.querySelectorAll(tag)):[]);}
    querySelector(tag){return this.querySelectorAll(tag)[0]??null;}
    setAttribute(k,v){this.attrs[k]=String(v);}
    getAttribute(k){return this.attrs[k]??null;}
    addEventListener(type,f){(this.events[type]??=[]).push(f);}
    dispatch(type,e){for(const f of this.events[type]??[])f(e);}
    click(){this.dispatch('click',{target:this,preventDefault(){}});}
    contains(el){return el===this||this.children.some(c=>c.contains?.(el));}
    closest(){return null;}
    focus(){doc.activeElement=this;}
    showModal(){this.open=true;}
    close(){this.open=false;this.dispatch('close',{target:this});}
    getBoundingClientRect(){return {width:1280,height:800,left:0,right:1280,top:0,bottom:800};}
    getContext(){return inertCtx;}
  }
  for(const [,tag,attrs] of html.matchAll(/<([a-z][\w-]*)\b([^>]*)>/gi)){
    const id=attrs.match(/\sid="([^"]+)"/)?.[1];
    if(id)ids.set(id,new Element(tag,id,/\shidden(?:\s|$|=)/.test(attrs)));
  }
  const create=tag=>new Element(tag);
  const body=create('body');
  const syntheticClass=new Map(['.side','.status','.top','main'].map(key=>[key,create('section')]));
  doc={createElement:create,body,activeElement:body,hidden:false,
    addEventListener(){},getElementById:id=>ids.get(id)??[...(ids.get("commandBar")?.children||[])].find(e=>e.id===id)??null,
    querySelector(sel){
      if(sel==='#dialogContent .choices button')return ids.get('dialogContent').querySelector('button');
      return syntheticClass.get(sel)??null;
    }};
  const sandbox={document:doc,console,performance,innerWidth:1440,innerHeight:900,
    getComputedStyle:()=>({display:'block'}),requestAnimationFrame(){},setTimeout:()=>1,clearTimeout(){},
    matchMedia:()=>({matches:false}),addEventListener(){},
    localStorage:{getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v)}};
  sandbox.window=sandbox;
  const ctx=vm.createContext(sandbox);
  const js=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n');
  vm.runInContext(js,ctx,{filename:file});
  const execute=(source)=>vm.runInContext(source,ctx);
  return execute;
}
module.exports = {boot};
