'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const {performance} = require('node:perf_hooks');

const ROOT = path.join(__dirname, '..', '..');
const HTML_FILE = 'Border-Guard-v0.29.html';

function makeClassList(){
  const keys = new Set();
  return {
    add(...values){values.forEach(v=>keys.add(v));},
    remove(v){keys.delete(v);},
    contains(v){return keys.has(v);},
    toggle(v, on=!keys.has(v)){if(on)keys.add(v);else keys.delete(v);return on;}
  };
}

function bootV029(options = {}){
  const file = options.file || HTML_FILE;
  const html = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const ids = new Map();
  const store = new Map();
  const css = {setProperty(key, value){this[key]=value;}};
  let doc;
  class Element {
    constructor(tag, id, hidden=false){
      this.tagName = String(tag).toUpperCase();
      this._id = id || '';
      this.children = [];
      this.classList = makeClassList();
      this.style = Object.create(css);
      this.attrs = {};
      this.dataset = {};
      this.events = {};
      this._text = '';
      this.hidden = hidden;
      this.width = 1472;
      this.height = 920;
      this.offsetWidth = 1280;
      this.offsetHeight = 800;
      this.clientWidth = 1280;
      this.scrollWidth = 1280;
      this.isConnected = true;
      if(this._id) ids.set(this._id, this);
    }
    get id(){return this._id;}
    set id(value){
      this._id = String(value || '');
      if(this._id) ids.set(this._id, this);
    }
    get textContent(){return this._text + this.children.map(x=>x.textContent).join('');}
    set textContent(text){this._text = String(text ?? ''); this.children = [];}
    get firstChild(){return this._text ? {textContent:this._text} : this.children[0];}
    get firstElementChild(){return this.children[0];}
    get lastElementChild(){return this.children.at(-1);}
    append(...els){
      for(const el of els){
        const next = typeof el === 'string' ? {textContent:el} : el;
        next.parentElement = this;
        this.children.push(next);
      }
    }
    insertBefore(node, ref){
      const next = typeof node === 'string' ? {textContent:node} : node;
      next.parentElement = this;
      const idx = ref ? this.children.indexOf(ref) : -1;
      if(idx >= 0) this.children.splice(idx, 0, next);
      else this.children.push(next);
      return next;
    }
    replaceChildren(...els){
      for(const child of this.children) child.isConnected = false;
      this.children = [];
      this._text = '';
      this.append(...els);
    }
    querySelectorAll(tag){
      return this.children.flatMap(x=>x.tagName
        ? (x.tagName === String(tag).toUpperCase() ? [x] : []).concat(x.querySelectorAll(tag))
        : []);
    }
    querySelector(tag){return this.querySelectorAll(tag)[0] ?? null;}
    setAttribute(k, v){
      this.attrs[k] = String(v);
      if(k === 'id') this.id = String(v);
    }
    getAttribute(k){return this.attrs[k] ?? null;}
    addEventListener(type, f){(this.events[type] ??= []).push(f);}
    dispatch(type, e){for(const f of this.events[type] ?? []) f(e);}
    click(){this.dispatch('click', {target:this, preventDefault(){}});}
    contains(el){return el === this || this.children.some(c=>c.contains?.(el));}
    closest(){return null;}
    focus(){doc.activeElement = this;}
    showModal(){this.open = true;}
    close(){this.open = false; this.dispatch('close', {target:this});}
    getBoundingClientRect(){
      return {x:0,y:0,width:this.clientWidth||1280,height:this.clientHeight||800,left:0,right:this.clientWidth||1280,top:0,bottom:this.clientHeight||800};
    }
    getClientRects(){return [this.getBoundingClientRect()];}
    getContext(){
      return new Proxy({}, {
        get(obj, key){
          return obj[key] ?? (key === 'getTransform' ? ()=>({e:0,f:0})
            : key === 'createLinearGradient' ? ()=>({addColorStop(){}})
            : ()=>{});
        }
      });
    }
  }
  for(const [, tag, attrs] of html.matchAll(/<([a-z][\w-]*)\b([^>]*)>/gi)){
    const id = attrs.match(/\sid="([^"]+)"/)?.[1];
    if(id) ids.set(id, new Element(tag, id, /\shidden(?:\s|$|=)/.test(attrs)));
  }
  const create = tag => new Element(tag);
  const body = create('body');
  const syntheticClass = new Map(['.side','.status','.top','main'].map(key=>[key, create('section')]));
  doc = {
    createElement: create,
    createElementNS(_ns, tag){return create(tag);},
    body,
    activeElement: body,
    hidden: false,
    addEventListener(){},
    getElementById: id => ids.get(id) ?? [...(ids.get('commandBar')?.children || [])].find(e=>e.id === id) ?? null,
    querySelector(sel){
      if(sel === '#dialogContent .choices button') return ids.get('dialogContent').querySelector('button');
      return syntheticClass.get(sel) ?? null;
    }
  };
  let simNow = Number.isFinite(options.now) ? options.now : 0;
  const sandbox = {
    document: doc,
    console,
    performance: {
      now(){return simNow;}
    },
    Date,
    Math,
    JSON,
    Number,
    String,
    Boolean,
    Array,
    Object,
    Map,
    Set,
    Proxy,
    Reflect,
    Error,
    TypeError,
    RangeError,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    Infinity,
    NaN,
    undefined,
    innerWidth: options.innerWidth || 1440,
    innerHeight: options.innerHeight || 900,
    getComputedStyle: ()=>({display:'block'}),
    requestAnimationFrame(){return 1;},
    cancelAnimationFrame(){},
    setTimeout: ()=>1,
    clearTimeout(){},
    setInterval: ()=>1,
    clearInterval(){},
    matchMedia: ()=>({matches:false, addListener(){}, removeListener(){}}),
    addEventListener(){},
    removeEventListener(){},
    localStorage: {
      getItem: k => store.get(k) ?? null,
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: k => store.delete(k)
    }
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  const ctx = vm.createContext(sandbox);
  const js = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n');
  vm.runInContext(js, ctx, {filename: file});
  const execute = source => vm.runInContext(source, ctx);
  const api = () => execute('window.FW');
  function setSimTime(ms){
    simNow = ms;
    return simNow;
  }
  function advanceSimTime(ms){
    simNow += ms;
    return simNow;
  }
  function freshGame(seed = 42){
    execute(`window.FW.setGame(window.FW.makeGame(${Number(seed)}));`);
    return execute('window.FW.game');
  }
  if(Number.isFinite(options.seed)) freshGame(options.seed);
  return {
    file,
    ctx,
    execute,
    api,
    fw: api(),
    get game(){return execute('window.FW.game');},
    setGame(next){
      // tests may pass plain objects; keep inside VM
      sandbox.__testGame = next;
      execute('window.FW.setGame(globalThis.__testGame)');
    },
    freshGame,
    setSimTime,
    advanceSimTime,
    get now(){return simNow;}
  };
}

module.exports = {bootV029, HTML_FILE, ROOT};
