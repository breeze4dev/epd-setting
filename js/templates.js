/**
 * Template system for EPD canvas (400x300, B/W/Red).
 * Currently implements: Course schedule.
 */

const DAY_LABELS = ['', '\u5468\u4e00', '\u5468\u4e8c', '\u5468\u4e09', '\u5468\u56db', '\u5468\u4e94', '\u5468\u516d', '\u5468\u65e5'];
const DEFAULT_SLOT_TIMES = ['08:00', '09:00', '10:00', '11:00', '14:00', '15:00'];
const MIN_SLOTS = 1;
const MAX_SLOTS = 8;
const STORAGE_KEY = 'epd_schedule_draft';

let scheduleSlotCount = 6;
let saveTimeout = null;

function getScheduleDays() {
  var days = [];
  document.querySelectorAll('.schedule-day-check input:checked').forEach(function(cb) {
    days.push(parseInt(cb.getAttribute('data-day'), 10));
  });
  return days.sort(function(a, b) { return a - b; });
}

function buildScheduleSlotsDOM(savedSlots) {
  var container = document.getElementById('schedule-slots');
  if (!container) return;
  container.innerHTML = '';
  var days = getScheduleDays();
  for (var i = 0; i < scheduleSlotCount; i++) {
    var row = document.createElement('div');
    row.className = 'schedule-slot-row';
    var timeInput = document.createElement('input');
    timeInput.type = 'text';
    timeInput.className = 'schedule-slot-time';
    timeInput.placeholder = '08:00';
    var saved = savedSlots && savedSlots[i];
    timeInput.value = saved ? (saved.time || '') : (DEFAULT_SLOT_TIMES[i] || '');
    timeInput.setAttribute('data-slot-index', String(i));
    var cellsWrap = document.createElement('div');
    cellsWrap.className = 'schedule-slot-cells';
    days.forEach(function(dayIdx, cellIdx) {
      var wrap = document.createElement('div');
      wrap.className = 'schedule-cell-wrap';
      wrap.setAttribute('data-day', String(dayIdx));
      wrap.setAttribute('data-slot-index', String(i));
      var cell = document.createElement('input');
      cell.type = 'text';
      cell.className = 'schedule-slot-cell';
      cell.placeholder = DAY_LABELS[dayIdx];
      var savedCell = saved && saved.cells && saved.cells[cellIdx];
      var cellText = '';
      var cellColor = 'black';
      if (savedCell != null) {
        if (typeof savedCell === 'object') {
          cellText = savedCell.text || '';
          cellColor = savedCell.color === 'red' ? 'red' : 'black';
        } else {
          cellText = String(savedCell);
        }
      }
      cell.value = cellText;
      var colorBlock = document.createElement('div');
      colorBlock.className = 'schedule-cell-color-block';
      colorBlock.setAttribute('data-color', cellColor);
      colorBlock.title = '\u70b9\u51fb\u5207\u6362\u9ed1/\u7ea2';
      colorBlock.style.backgroundColor = cellColor === 'red' ? '#e00' : '#333';
      colorBlock.addEventListener('click', function() {
        var next = colorBlock.getAttribute('data-color') === 'red' ? 'black' : 'red';
        colorBlock.setAttribute('data-color', next);
        colorBlock.style.backgroundColor = next === 'red' ? '#e00' : '#333';
      });
      wrap.appendChild(cell);
      wrap.appendChild(colorBlock);
      cellsWrap.appendChild(wrap);
    });
    row.appendChild(timeInput);
    row.appendChild(cellsWrap);
    container.appendChild(row);
  }
  var panel = document.getElementById('template-panel-inline');
  if (panel) {
    if (days.length >= 7) panel.classList.add('schedule-days-7');
    else panel.classList.remove('schedule-days-7');
  }
}

function addScheduleSlot() {
  if (scheduleSlotCount >= MAX_SLOTS) return;
  scheduleSlotCount++;
  buildScheduleSlotsDOM();
  updateScheduleSlotButtons();
}

function removeScheduleSlot() {
  if (scheduleSlotCount <= MIN_SLOTS) return;
  scheduleSlotCount--;
  buildScheduleSlotsDOM();
  updateScheduleSlotButtons();
}

function updateScheduleSlotButtons() {
  var addBtn = document.getElementById('schedule-slot-add');
  var removeBtn = document.getElementById('schedule-slot-remove');
  if (addBtn) addBtn.disabled = scheduleSlotCount >= MAX_SLOTS;
  if (removeBtn) removeBtn.disabled = scheduleSlotCount <= MIN_SLOTS;
  var countEl = document.getElementById('schedule-slot-count');
  if (countEl) countEl.textContent = scheduleSlotCount;
}

function getScheduleData() {
  var titleEl = document.getElementById('schedule-title');
  var title = (titleEl && titleEl.value.trim()) || '\u8bfe\u7a0b\u8868';
  var days = getScheduleDays();
  var slots = [];
  document.querySelectorAll('.schedule-slot-row').forEach(function(row) {
    var timeInput = row.querySelector('.schedule-slot-time');
    var time = timeInput ? timeInput.value.trim() || '--' : '--';
    var cells = [];
    var wraps = row.querySelectorAll('.schedule-cell-wrap');
    if (wraps.length) {
      wraps.forEach(function(wrap) {
        var input = wrap.querySelector('.schedule-slot-cell');
        var block = wrap.querySelector('.schedule-cell-color-block');
        var color = (block && block.getAttribute('data-color') === 'red') ? 'red' : 'black';
        cells.push({ text: (input && input.value) ? input.value.trim() : '', color: color });
      });
    } else {
      row.querySelectorAll('.schedule-slot-cell').forEach(function(cell) {
        cells.push({ text: (cell.value || '').trim(), color: 'black' });
      });
    }
    slots.push({ time: time, cells: cells });
  });
  return { title: title, days: days, slots: slots };
}

function truncateText(ctx, text, maxWidth, suffix) {
  if (!text) return '';
  suffix = suffix || '\u2026';
  if (ctx.measureText(text).width <= maxWidth) return text;
  var low = 0;
  var high = text.length;
  while (low < high - 1) {
    var mid = Math.ceil((low + high) / 2);
    var sub = text.slice(0, mid) + suffix;
    if (ctx.measureText(sub).width <= maxWidth) low = mid;
    else high = mid;
  }
  var result = text.slice(0, low) + suffix;
  return ctx.measureText(result).width <= maxWidth ? result : text.slice(0, 1) + suffix;
}

// E-ink: fill only for consistent weight; no stroke to avoid uneven thickness
function fillTextEPD(ctx, text, x, y, color) {
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

function renderCourseScheduleToCanvas(canvas, ctx, data) {
  var cw = canvas.width;
  var ch = canvas.height;
  var margin = 8;
  var fontFamily = 'SimSun, "宋体", serif';
  var titleFamily = 'SimHei,  "黑体", sans-serif';

  var days = data.days || [];
  var slots = data.slots || [];
  var title = (data.title || '\u8bfe\u7a0b\u8868').trim() || '\u8bfe\u7a0b\u8868';

  var timeColWidth = 50;
  var tableLeft = Math.round(margin);
  var tableRight = Math.round(cw - margin);
  var tableWidth = tableRight - tableLeft;
  var dataWidth = tableWidth - timeColWidth;
  var colCount = days.length || 1;
  var colWidth = colCount > 0 ? dataWidth / colCount : dataWidth;

  var titleArea = 22;
  var rowCount = slots.length + 1;
  var tableHeight = Math.floor(ch - 2 * margin - titleArea - 4);
  var rowHeight = rowCount > 0 ? tableHeight / rowCount : 18;
  var titleFontSize = Math.min(18, Math.max(12, Math.floor(rowHeight * 1.1)));
  var headerFontSize = Math.max(9, Math.min(15, Math.floor(rowHeight * 0.72)));
  var cellFontSize = Math.max(7, Math.min(12, Math.floor(rowHeight * 0.5)));

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, cw, ch);

  var y = Math.round(margin);
  ctx.fillStyle = '#000000';
  ctx.font = '500 ' + titleFontSize + 'px ' + titleFamily;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  var titleX = Math.round(margin + tableWidth / 2);
  var titleY = Math.round(y + titleFontSize / 2 + 2);
  fillTextEPD(ctx, truncateText(ctx, title, tableWidth - 4), titleX, titleY, '#000000');
  y = Math.round(y + titleArea + 5);

  ctx.fillStyle = '#000000';
  ctx.fillRect(tableLeft, y, tableWidth, 1);
  ctx.fillRect(tableLeft, y + tableHeight - 1, tableWidth, 1);
  ctx.fillRect(tableLeft, y, 1, tableHeight);
  ctx.fillRect(tableLeft + tableWidth - 1, y, 1, tableHeight);

  ctx.font = headerFontSize + 'px ' + fontFamily;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  var headerCenterY = Math.round(y + rowHeight * 0.52);
  var x = tableLeft + Math.round(timeColWidth / 2);
  fillTextEPD(ctx, '\u65f6\u95f4', x, headerCenterY, '#000000');
  for (var d = 0; d < days.length; d++) {
    x = Math.round(tableLeft + timeColWidth + (d + 0.5) * colWidth);
    var label = DAY_LABELS[days[d]] || '';
    fillTextEPD(ctx, truncateText(ctx, label, colWidth - 2), x, headerCenterY, '#000000');
  }

  ctx.fillStyle = '#000000';
  for (var i = 0; i <= rowCount; i++) {
    var ly = Math.round(y + i * rowHeight);
    ctx.fillRect(tableLeft, ly, tableWidth, 1);
  }
  for (var col = 0; col <= colCount; col++) {
    var vx = col === 0 ? tableLeft : Math.round(tableLeft + timeColWidth + (col - 1) * colWidth);
    ctx.fillRect(vx, y, 1, tableHeight);
  }

  y += rowHeight;

  ctx.textBaseline = 'middle';
  for (var r = 0; r < slots.length; r++) {
    var slot = slots[r];
    var timeStr = truncateText(ctx, slot.time || '', timeColWidth - 4);
    ctx.font = cellFontSize + 'px ' + fontFamily;
    ctx.textAlign = 'center';
    var centerY = Math.round(y + rowHeight * 0.52);
    var timeX = Math.round(tableLeft + timeColWidth / 2);
    fillTextEPD(ctx, timeStr, timeX, centerY, '#000000');
    for (var c = 0; c < (slot.cells || []).length && c < days.length; c++) {
      var cellData = slot.cells[c];
      var cellText = typeof cellData === 'object' ? (cellData.text || '') : String(cellData || '');
      var cellColor = (typeof cellData === 'object' && cellData.color === 'red') ? '#FF0000' : '#000000';
      cellText = truncateText(ctx, cellText, colWidth - 4);
      var cellCenterX = Math.round(tableLeft + timeColWidth + (c + 0.5) * colWidth);
      fillTextEPD(ctx, cellText, cellCenterX, centerY, cellColor);
    }
    y += rowHeight;
  }
  ctx.textBaseline = 'alphabetic';
}

function openTemplateModal() {
  var panel = document.getElementById('template-panel-inline');
  var container = document.querySelector('.canvas-container');
  if (!panel || !container) return;
  if (container.classList.contains('template-mode')) {
    container.classList.remove('template-mode');
    panel.setAttribute('aria-hidden', 'true');
    return;
  }
  loadScheduleDraft();
  container.classList.add('template-mode');
  panel.setAttribute('aria-hidden', 'false');
}

function saveScheduleDraft() {
  try {
    var data = getScheduleData();
    var draft = { title: data.title, days: data.days, slots: data.slots, slotCount: scheduleSlotCount };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  } catch (e) {}
}
function loadScheduleDraft() {
  try {
    var raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) { buildScheduleSlotsDOM(); updateScheduleSlotButtons(); return; }
    var draft = JSON.parse(raw);
    loadScheduleFromData(draft);
  } catch (e) { buildScheduleSlotsDOM(); updateScheduleSlotButtons(); }
}

function loadScheduleFromData(data) {
  var titleEl = document.getElementById('schedule-title');
  if (titleEl) titleEl.value = (data.title || '').trim() || '\u8bfe\u7a0b\u8868';
  document.querySelectorAll('.schedule-day-check input').forEach(function(cb) {
    var d = parseInt(cb.getAttribute('data-day'), 10);
    cb.checked = data.days && data.days.indexOf(d) !== -1;
  });
  scheduleSlotCount = Math.min(MAX_SLOTS, Math.max(MIN_SLOTS, (data.slotCount != null ? data.slotCount : (data.slots && data.slots.length) || 5)));
  buildScheduleSlotsDOM(data.slots);
  updateScheduleSlotButtons();
}

function escapeCSVCell(s) {
  s = String(s == null ? '' : s);
  if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function parseCSVLine(line) {
  var out = [];
  var i = 0;
  while (i < line.length) {
    if (line[i] === '"') {
      var end = i + 1;
      var s = '';
      while (end < line.length) {
        if (line[end] === '"') {
          if (line[end + 1] === '"') { s += '"'; end += 2; continue; }
          break;
        }
        s += line[end++];
      }
      out.push(s);
      i = end + 1;
    } else {
      var j = i;
      while (j < line.length && line[j] !== ',') j++;
      out.push(line.slice(i, j).trim());
      i = j + 1;
    }
  }
  return out;
}

function exportScheduleToCSV() {
  var data = getScheduleData();
  var rows = [];
  rows.push([data.title]);
  var header = ['\u65f6\u95f4'];
  data.days.forEach(function(d) { header.push(DAY_LABELS[d] || ''); });
  rows.push(header);
  data.slots.forEach(function(slot) {
    var row = [slot.time || ''];
    (slot.cells || []).forEach(function(c) {
      var text = (typeof c === 'object' ? c.text : String(c || '')) || '';
      if (typeof c === 'object' && c.color === 'red') text += '|red';
      row.push(text);
    });
    rows.push(row);
  });
  var csv = rows.map(function(row) {
    return row.map(escapeCSVCell).join(',');
  }).join('\r\n');
  var blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (data.title || 'schedule') + '.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}

function importScheduleFromCSV(csvText) {
  var lines = csvText.split(/\r\n|\r|\n/).filter(function(l) { return l.length; });
  if (lines.length < 2) return;
  var row0 = parseCSVLine(lines[0]);
  var row1 = parseCSVLine(lines[1]);
  var title = (row0[0] || '').trim() || '\u8bfe\u7a0b\u8868';
  var timeColIdx = 0;
  var dayColIndices = [];
  var dayMap = { '\u5468\u4e00': 1, '\u5468\u4e8c': 2, '\u5468\u4e09': 3, '\u5468\u56db': 4, '\u5468\u4e94': 5, '\u5468\u516d': 6, '\u5468\u65e5': 7 };
  for (var i = 0; i < row1.length; i++) {
    var h = (row1[i] || '').trim();
    if (h === '\u65f6\u95f4') timeColIdx = i;
    else if (dayMap[h] != null) dayColIndices.push({ idx: i, day: dayMap[h] });
  }
  dayColIndices.sort(function(a, b) { return a.day - b.day; });
  var days = dayColIndices.map(function(x) { return x.day; });
  var slots = [];
  for (var r = 2; r < lines.length; r++) {
    var cells = parseCSVLine(lines[r]);
    var time = (cells[timeColIdx] || '').trim() || '--';
    var slotCells = [];
    dayColIndices.forEach(function(x) {
      var raw = (cells[x.idx] || '').trim();
      var color = 'black';
      if (raw.slice(-4) === '|red') { raw = raw.slice(0, -4).trim(); color = 'red'; }
      slotCells.push({ text: raw, color: color });
    });
    slots.push({ time: time, cells: slotCells });
  }
  loadScheduleFromData({ title: title, days: days.length ? days : [1, 2, 3, 4, 5], slots: slots, slotCount: slots.length });
  saveScheduleDraft();
}
function saveScheduleDraftDebounced() {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(saveScheduleDraft, 300);
}

function initTemplateSchedule() {
  document.querySelectorAll('.schedule-day-check input').forEach(function(cb) {
    cb.addEventListener('change', function() { buildScheduleSlotsDOM(); });
  });
  var addBtn = document.getElementById('schedule-slot-add');
  var removeBtn = document.getElementById('schedule-slot-remove');
  if (addBtn) addBtn.addEventListener('click', addScheduleSlot);
  if (removeBtn) removeBtn.addEventListener('click', removeScheduleSlot);
  buildScheduleSlotsDOM();
  updateScheduleSlotButtons();
}

function initTemplates() {
  initTemplateSchedule();

  var applyBtn = document.getElementById('template-apply-schedule');
  if (applyBtn) {
    applyBtn.addEventListener('click', function() {
      var data = getScheduleData();
      saveScheduleDraft();
      if (typeof canvas !== 'undefined' && typeof ctx !== 'undefined') {
        renderCourseScheduleToCanvas(canvas, ctx, data);
        if (typeof paintManager !== 'undefined') {
          paintManager.clearElements();
          paintManager.clearHistory();
          paintManager.saveToHistory();
        } else {
          if (typeof clearHistory === 'function') clearHistory();
          if (typeof textElements !== 'undefined') textElements.length = 0;
          if (typeof lineSegments !== 'undefined') lineSegments.length = 0;
          if (typeof saveCanvasState === 'function') saveCanvasState();
        }
        if (typeof setCanvasTitle === 'function') setCanvasTitle('');
      }
    });
  }

  var templateModeBtn = document.getElementById('template-mode');
  if (templateModeBtn) templateModeBtn.addEventListener('click', openTemplateModal);

  var exportCsvBtn = document.getElementById('schedule-export-csv');
  if (exportCsvBtn) exportCsvBtn.addEventListener('click', exportScheduleToCSV);

  var importCsvBtn = document.getElementById('schedule-import-csv-btn');
  var importCsvInput = document.getElementById('schedule-import-csv');
  if (importCsvBtn && importCsvInput) {
    importCsvBtn.addEventListener('click', function(ev) {
      ev.preventDefault();
      ev.stopImmediatePropagation();
      importCsvInput.click();
    });
    importCsvInput.addEventListener('change', function(e) {
      e.stopPropagation();
      var f = e.target.files[0];
      if (!f) return;
      var r = new FileReader();
      r.onload = function() {
        try { importScheduleFromCSV(r.result); } catch (err) { console.error(err); }
        setTimeout(function() { e.target.value = ''; }, 0);
      };
      r.readAsText(f, 'UTF-8');
    });
  }

  document.addEventListener('input', function(e) {
    if (e.target.closest && e.target.closest('#template-panel-inline')) saveScheduleDraftDebounced();
  });
  document.addEventListener('change', function(e) {
    if (e.target.id === 'schedule-import-csv') return;
    if (e.target.closest && e.target.closest('#template-panel-inline')) saveScheduleDraftDebounced();
  });
}

if (typeof document !== 'undefined' && document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initTemplates);
} else {
  initTemplates();
}

