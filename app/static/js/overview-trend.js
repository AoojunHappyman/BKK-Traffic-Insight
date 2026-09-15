/* Reuses monthly aggregates already loaded by Overview; no extra network requests. */
(function() {
  const el=id=>document.getElementById(id);
  const number=new Intl.NumberFormat('en-US');
  const decimal=new Intl.NumberFormat('en-US',{maximumFractionDigits:1});
  const monthLabel=key=>{const [y,m]=key.split('-').map(Number);return new Intl.DateTimeFormat('en-US',{month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(Date.UTC(y,m-1,1)));};
  let current=TrendData.model([]), mode='monthly', chart;
  const coverage=r=>`${number.format(r.survey_count)} กลุ่มสำรวจ · ${number.format(r.location_count)} ชื่อสถานที่ · ${number.format(r.observation_count)} รายการ`;
  function summary(id,rows) {
    el(id).textContent=rows.length?rows.map(r=>monthLabel(r.month)).join(' / '):'N/A';
    el(id+'-value').textContent=rows.length?`${number.format(rows[0].vehicle_total)} คัน${rows.length>1?' ต่อเดือน · สูง/ต่ำเท่ากัน':''}`:'ไม่มีข้อมูลในตัวกรอง';
  }
  function render() {
    const s=current;
    summary('trend-peak',s.peak);summary('trend-lowest',s.lowest);summary('trend-latest',s.latest?[s.latest]:[]);
    el('trend-yoy').textContent=s.change===null?'N/A':`${s.change>0?'+':''}${decimal.format(s.change)}%`;
    el('trend-yoy-note').textContent=!s.latest?'ไม่มีข้อมูลในตัวกรอง':!s.previous?'ไม่มีเดือนเดียวกันของปีก่อนในตัวกรอง':Number(s.previous.vehicle_total)===0?'ฐานปีก่อนเป็นศูนย์ คำนวณ % ไม่ได้':`เทียบ ${monthLabel(s.previous.month)} · ${number.format(s.previous.vehicle_total)} คัน`;
    el('trend-insight').textContent=!s.peak.length?'ไม่มีข้อมูลเพียงพอสำหรับสรุปแนวโน้ม':
      `${s.peak.map(r=>`${monthLabel(r.month)} (${coverage(r)})`).join(' / ')} มียอดรถที่สำรวจสูงสุด${s.peak.length>1?'เท่ากัน':''} ${number.format(s.peak[0].vehicle_total)} คัน ควรพิจารณา Coverage ก่อนเปรียบเทียบ`;
    el('trend-yoy-coverage').textContent=s.latest&&s.previous?`${monthLabel(s.latest.month)}: ${coverage(s.latest)} เทียบ ${monthLabel(s.previous.month)}: ${coverage(s.previous)}`:'YoY ใช้เฉพาะข้อมูลที่อยู่ในตัวกรองเดียวกัน';
    el('trend-coverage-rows').replaceChildren();
    for(const key of s.calendar){
      const r=s.byMonth.get(key), tr=document.createElement('tr');
      [monthLabel(key),...(r?[r.vehicle_total,r.survey_count,r.location_count,r.observation_count].map(v=>number.format(v)):['N/A','N/A','N/A','N/A'])].forEach((v,i)=>{const td=document.createElement('td');td.textContent=v;if(i)td.className='numeric';tr.append(td);});
      el('trend-coverage-rows').append(tr);
    }
    if(!s.calendar.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=5;td.textContent='ไม่มีข้อมูลในตัวกรองนี้';tr.append(td);el('trend-coverage-rows').append(tr);}
    for(const b of document.querySelectorAll('[data-trend-mode]')) b.setAttribute('aria-pressed',String(mode===b.dataset.trendMode));
    el('trend-chart').hidden=!s.rows.length||!window.Chart;
    el('trend-empty').hidden=s.rows.length>0&&!!window.Chart;
    el('trend-empty').textContent=s.rows.length?'กราฟไม่พร้อมใช้งาน อ่านตัวเลขพร้อม Coverage ในตารางด้านล่าง':'ไม่มีข้อมูลในตัวกรองนี้';
    if(!s.rows.length||!window.Chart){if(chart){chart.destroy();chart=undefined;}return;}
    const style=getComputedStyle(document.documentElement),color=k=>style.getPropertyValue('--'+k).trim();
    const labels=mode==='monthly'?s.calendar.map(monthLabel):Array.from({length:12},(_,i)=>monthLabel(`2000-${String(i+1).padStart(2,'0')}`).split(' ')[0]);
    const series=mode==='monthly'?[{label:'Observed volume',keys:s.calendar}]:s.years.map(year=>({label:year,keys:Array.from({length:12},(_,i)=>`${year}-${String(i+1).padStart(2,'0')}`)}));
    const datasets=series.map((series,i)=>({label:series.label,data:series.keys.map(k=>s.byMonth.has(k)?Number(s.byMonth.get(k).vehicle_total):null),borderColor:i%2?color('muted'):color('accent'),backgroundColor:i%2?color('muted'):color('accent'),borderDash:i?[i*3+2,3]:[],pointStyle:['circle','rect','triangle'][i%3],pointRadius:3,pointHoverRadius:6,borderWidth:2,tension:0,spanGaps:false}));
    const options={responsive:true,maintainAspectRatio:false,animation:false,interaction:{mode:'index',intersect:false},plugins:{legend:{display:mode==='year',labels:{color:color('text'),usePointStyle:true}},tooltip:{backgroundColor:color('surface'),titleColor:color('text'),bodyColor:color('text'),borderColor:color('line'),borderWidth:1,callbacks:{title:items=>items.length?(mode==='monthly'?monthLabel(series[items[0].datasetIndex].keys[items[0].dataIndex]):labels[items[0].dataIndex]):'',label:item=>{const r=s.byMonth.get(series[item.datasetIndex].keys[item.dataIndex]);return r?[`${monthLabel(r.month)} · ${number.format(r.vehicle_total)} vehicles`,`Survey Groups: ${number.format(r.survey_count)}`,`Locations: ${number.format(r.location_count)}`,`Observations: ${number.format(r.observation_count)}`]:['N/A'];}}}},scales:{x:{grid:{display:false},ticks:{color:color('muted'),maxTicksLimit:window.innerWidth<650?4:8,maxRotation:0}},y:{beginAtZero:true,title:{display:true,text:'Observed volume (vehicles)',color:color('muted')},ticks:{color:color('muted'),maxTicksLimit:5,callback:v=>new Intl.NumberFormat('en-US',{notation:'compact'}).format(v)},grid:{color:color('line')}}}};
    if(chart){chart.data={labels,datasets};chart.options=options;chart.update('none');}else chart=new Chart(el('trend-chart'),{type:'line',data:{labels,datasets},options});
  }
  for(const b of document.querySelectorAll('[data-trend-mode]'))b.addEventListener('click',()=>{mode=b.dataset.trendMode;render();});
  window.OverviewTrend={update(rows){current=TrendData.model(rows);render();},refresh(){render();},reset(){mode='monthly';}};
})();
