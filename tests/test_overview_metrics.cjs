const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('app/static/js/overview.js','utf8');
const nodes = new Map();
const $ = id => {if (!nodes.has(id)) nodes.set(id,{children:[],setAttribute(k,v){this[k]=v;},append(n){this.children.push(n);},replaceChildren(){this.children=[];}});return nodes.get(id);};
let creations=0;
class Chart {constructor(el,config){creations++;Object.assign(this,config);} update(){} destroy(){this.destroyed=true;}}
const context=vm.createContext({$,Chart,window:{Chart},document:{createElement:()=>({})},Intl,
 number:new Intl.NumberFormat('en-US'),decimal:new Intl.NumberFormat('en-US',{maximumFractionDigits:2}),
 palette:()=>({accent:'green',muted:'gray',surface:'black',text:'white',line:'gray'})});
vm.runInContext("let chart, locationChart; let metric='total';\n"+source.slice(source.indexOf('const average ='),source.indexOf('const decimal ='))+source.slice(source.indexOf('function chartOptions'),source.indexOf('for (const [id, mode]')),context);
const data={periods:[{start:'07:00',end:'09:00',duration_minutes:120,vehicle_total:100,observation_count:2},{start:'09:00',end:'17:00',duration_minutes:480,vehicle_total:120,observation_count:6}],locations:[]};
context.data=data;
context.renderTime(data);
assert.equal(creations,1);
vm.runInContext("metric='average';renderTime(data);",context);
assert.deepEqual(Array.from(vm.runInContext('chart.data.datasets[0].data',context)),[50,20]);
assert.equal(creations,1,'metric switch reuses the existing chart');
assert.match($('period-values').children[0].textContent,/50 คัน \/ รายการ/);
data.periods[0].vehicle_total=0;
context.renderTime(data);
assert.equal(vm.runInContext('chart.data.datasets[0].data[0]',context),0);
data.periods.forEach(p=>p.observation_count=0);
context.renderTime(data);
assert.equal($('period-chart').hidden,true);
assert.equal(vm.runInContext('chart',context),undefined);
data.periods=[];context.renderTime(data);
assert.equal($('chart-empty').hidden,false);
console.log('Overview metrics: unequal sample denominators, zero vs missing, chart reuse and empty states passed');
