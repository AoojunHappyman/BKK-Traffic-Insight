/* Shared download controls. Export only the last successfully applied filters. */
window.TrafficExport = (() => {
  const bar = document.querySelector('[data-export-view]');
  if (!bar) return {invalidate() {}, ready() {}};
  const buttons = [...bar.querySelectorAll('[data-export-format]')];
  const status = document.getElementById('export-status');
  let applied = null, pending = null;
  const setDisabled = disabled => buttons.forEach(button => {button.disabled = disabled;});
  function invalidate() {
    pending?.abort(); pending = null; applied = null;
    setDisabled(true); status.classList.remove('error');
    status.textContent = 'กดแสดงข้อมูลเพื่อโหลดผลก่อนดาวน์โหลด';
  }
  function ready(params, count) {
    const fields = {start_date: 'start-date', end_date: 'end-date', intersection_name: 'location', period: 'period'};
    if (Object.entries(fields).some(([key, id]) => (document.getElementById(id)?.value || '') !== (params.get(key) || ''))) return;
    applied = count > 0 ? params.toString() : null;
    setDisabled(applied === null);
    status.textContent = count > 0 ? 'ส่งออกครบตามตัวกรองที่แสดง · ไม่จำกัดเฉพาะอันดับในกราฟ' : 'ไม่พบข้อมูลสำหรับดาวน์โหลด';
  }
  for (const button of buttons) button.addEventListener('click', async () => {
    if (applied === null || pending) return;
    const controller = new AbortController(); pending = controller;
    const format = button.dataset.exportFormat;
    const url = `/api/export/${bar.dataset.exportView}.${format}?${applied}`;
    setDisabled(true); status.classList.remove('error'); status.textContent = 'กำลังเตรียมไฟล์…';
    try {
      const response = await fetch(url, {signal: controller.signal});
      if (!response.ok) throw new Error('ดาวน์โหลดไม่สำเร็จ กรุณาลองอีกครั้ง');
      const blob = await response.blob();
      if (controller.signal.aborted) return;
      const link = document.createElement('a');
      const objectURL = URL.createObjectURL(blob);
      link.href = objectURL;
      link.download = response.headers.get('Content-Disposition')?.match(/filename="?([^";]+)/)?.[1] || `bangkok-traffic.${format}`;
      document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(objectURL), 30000);
      status.textContent = `ดาวน์โหลด ${Number(response.headers.get('X-Export-Rows') || 0).toLocaleString('th-TH')} แถวแล้ว`;
    } catch (error) {
      if (error.name !== 'AbortError') {status.textContent = 'ดาวน์โหลดไม่สำเร็จ กรุณาตรวจการเชื่อมต่อแล้วลองอีกครั้ง'; status.classList.add('error');}
    } finally {
      if (pending === controller) {pending = null; setDisabled(applied === null);}
    }
  });
  document.getElementById('filters').addEventListener('input', invalidate);
  document.getElementById('filters').addEventListener('change', invalidate);
  return {invalidate, ready};
})();
