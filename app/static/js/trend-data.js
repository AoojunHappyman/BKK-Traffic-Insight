/* Calendar alignment preserves missing months as null, never zero. */
(function(root) {
  function model(rows) {
    const sorted=[...rows].sort((a,b)=>a.month.localeCompare(b.month));
    const byMonth=new Map(sorted.map(r=>[r.month,r]));
    const calendar=[];
    if(sorted.length){
      const [y,m]=sorted[0].month.split('-').map(Number), [ey,em]=sorted.at(-1).month.split('-').map(Number);
      for(let n=y*12+m-1;n<=ey*12+em-1;n++) calendar.push(`${String(Math.floor(n/12)).padStart(4,'0')}-${String(n%12+1).padStart(2,'0')}`);
    }
    const latest=sorted.at(-1)||null;
    const previous=latest ? byMonth.get(`${String(Number(latest.month.slice(0,4))-1).padStart(4,'0')}${latest.month.slice(4)}`)||null : null;
    const change=previous && Number(previous.vehicle_total)>0 ? (Number(latest.vehicle_total)-Number(previous.vehicle_total))/Number(previous.vehicle_total)*100 : null;
    const high=sorted.length?Math.max(...sorted.map(r=>Number(r.vehicle_total))):null;
    const low=sorted.length?Math.min(...sorted.map(r=>Number(r.vehicle_total))):null;
    return {rows:sorted,calendar,byMonth,latest,previous,change,
      peak:sorted.filter(r=>Number(r.vehicle_total)===high),lowest:sorted.filter(r=>Number(r.vehicle_total)===low),
      years:[...new Set(sorted.map(r=>r.month.slice(0,4)))]};
  }
  if(typeof module!=='undefined'&&module.exports) module.exports={model};
  else root.TrendData={model};
})(typeof window!=='undefined'?window:globalThis);
