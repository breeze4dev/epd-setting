let bleDevice, gattServer;
let epdService, epdCharacteristic;
let startTime, msgIndex, appVersion;
let canvas, ctx, textDecoder;

// Device information
let deviceInfo = {
  modelId: null,
  width: 0,
  height: 0
};

// Debug calendar variables
let debugCalendarCurrentDate = new Date();
let debugCalendarSelectedDate = new Date();

const EpdCmd = {
  SET_PINS:  0x00,
  INIT:      0x01,
  CLEAR:     0x02,
  SEND_CMD:  0x03,
  SEND_DATA: 0x04,
  REFRESH:   0x05,
  SLEEP:     0x06,

  SET_TIME:  0x20,
  SET_ROTATION: 0x22,

  WRITE_IMG: 0x30, // v1.6

  SET_CONFIG: 0x90,
  SYS_RESET:  0x91,
  SYS_SLEEP:  0x92,
  CFG_ERASE:  0x99,
};

// 检查蓝牙连接状态的辅助函数
function checkBluetoothConnection() {
  if (!bleDevice) {
    addLog("错误：未找到蓝牙设备，请先点击'连接'按钮");
    return false;
  }
  if (!bleDevice.gatt.connected) {
    addLog("错误：蓝牙设备未连接，请先点击'连接'按钮");
    return false;
  }
  return true;
}

// 定义setRotation函数
function setRotation(rotation) {
  console.log("setRotation called with:", rotation);
  addLog(`设置屏幕方向为: ${rotation * 90}°`);
  addLog("正在切换到日历模式以应用旋转...");
  
  if (!checkBluetoothConnection()) {
    return;
  }
  
  write(EpdCmd.SET_ROTATION, [rotation])
    .then(result => {
      console.log("setRotation success:", result);
      addLog("屏幕方向设置成功！");
      addLog("屏幕将自动切换到日历模式显示旋转效果");
    })
    .catch(error => {
      console.error("setRotation error:", error);
      addLog(`设置失败: ${error.message}`);
    });
}

// Debug Calendar Functions
function showDebugCalendar() {
  debugCalendarCurrentDate = new Date();
  debugCalendarSelectedDate = new Date();
  updateCalendarDisplay();
  document.getElementById('debugCalendarModal').style.display = 'flex';
}

function closeDebugCalendar() {
  document.getElementById('debugCalendarModal').style.display = 'none';
}

function changeMonth(direction) {
  debugCalendarCurrentDate.setMonth(debugCalendarCurrentDate.getMonth() + direction);
  updateCalendarDisplay();
}

function updateCalendarDisplay() {
  const monthNames = ['一月', '二月', '三月', '四月', '五月', '六月',
                     '七月', '八月', '九月', '十月', '十一月', '十二月'];
  
  // Update month/year header
  document.getElementById('currentMonthYear').textContent = 
    `${debugCalendarCurrentDate.getFullYear()}年 ${monthNames[debugCalendarCurrentDate.getMonth()]}`;
  
  // Generate calendar days
  const calendarDays = document.getElementById('calendarDays');
  calendarDays.innerHTML = '';
  
  const year = debugCalendarCurrentDate.getFullYear();
  const month = debugCalendarCurrentDate.getMonth();
  const today = new Date();
  
  // Get first day of month and number of days
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();
  const startDayOfWeek = firstDay.getDay();
  
  // Add empty cells for days before the first day of the month
  for (let i = 0; i < startDayOfWeek; i++) {
    const prevMonth = new Date(year, month, -startDayOfWeek + i + 1);
    const dayElement = createDayElement(prevMonth.getDate(), true, false, false);
    calendarDays.appendChild(dayElement);
  }
  
  // Add days of the current month
  for (let day = 1; day <= daysInMonth; day++) {
    const currentDate = new Date(year, month, day);
    const isToday = currentDate.toDateString() === today.toDateString();
    const isSelected = currentDate.toDateString() === debugCalendarSelectedDate.toDateString();
    
    const dayElement = createDayElement(day, false, isToday, isSelected);
    dayElement.onclick = () => selectDate(currentDate);
    calendarDays.appendChild(dayElement);
  }
  
  // Add empty cells for days after the last day of the month
  const remainingCells = 42 - (startDayOfWeek + daysInMonth); // 6 weeks * 7 days
  for (let i = 1; i <= remainingCells; i++) {
    const nextMonth = new Date(year, month + 1, i);
    const dayElement = createDayElement(nextMonth.getDate(), true, false, false);
    calendarDays.appendChild(dayElement);
  }
}

function createDayElement(day, isOtherMonth, isToday, isSelected) {
  const dayElement = document.createElement('div');
  dayElement.className = 'calendar-day';
  dayElement.textContent = day;
  
  if (isOtherMonth) {
    dayElement.classList.add('other-month');
  }
  if (isToday) {
    dayElement.classList.add('today');
  }
  if (isSelected) {
    dayElement.classList.add('selected');
  }
  
  return dayElement;
}

function selectDate(date) {
  debugCalendarSelectedDate = new Date(date);
  updateCalendarDisplay();
}

async function syncCustomDate() {
  // Create a new date with the selected date but current time
  const now = new Date();
  const customDate = new Date(
    debugCalendarSelectedDate.getFullYear(),
    debugCalendarSelectedDate.getMonth(),
    debugCalendarSelectedDate.getDate(),
    now.getHours(),
    now.getMinutes(),
    now.getSeconds()
  );
  
  const timestamp = customDate.getTime() / 1000;
  const data = new Uint8Array([
    (timestamp >> 24) & 0xFF,
    (timestamp >> 16) & 0xFF,
    (timestamp >> 8) & 0xFF,
    timestamp & 0xFF,
    -(new Date().getTimezoneOffset() / 60),
    1 // Calendar mode
  ]);
  
  if(await write(EpdCmd.SET_TIME, data)) {
    addLog(`调试日期已同步：${customDate.toLocaleString()}`);
    closeDebugCalendar();
  }
}

const canvasSizes = [
  // { name: '1.54_152_152', width: 152, height: 152 },
  // { name: '1.54_200_200', width: 200, height: 200 },
  // { name: '2.13_212_104', width: 212, height: 104 },
  { name: '2.13_250_122', width: 250, height: 122 },
  // { name: '2.13_250_134', width: 250, height: 134 },
  // { name: '2.66_296_152', width: 296, height: 152 },
  { name: '2.9_296_128', width: 296, height: 128 },
  // { name: '2.9_384_168', width: 384, height: 168 },
  // { name: '3.5_384_184', width: 384, height: 184 },
  // { name: '3.7_416_240', width: 416, height: 240 },
  // { name: '3.97_800_480', width: 800, height: 480 },
  // { name: '4.2_400_300', width: 400, height: 300 },
  // { name: '5.79_792_272', width: 792, height: 272 },
  // { name: '7.5_800_480', width: 800, height: 480 },
  // { name: '10.2_960_640', width: 960, height: 640 },
  // { name: '10.85_1360_480', width: 1360, height: 480 },
  // { name: '11.6_960_640', width: 960, height: 640 },
  // { name: '4E_600_400', width: 600, height: 400 },
  // { name: '7.3E6', width: 480, height: 800 }
];

function hex2bytes(hex) {
  for (var bytes = [], c = 0; c < hex.length; c += 2)
    bytes.push(parseInt(hex.substr(c, 2), 16));
  return new Uint8Array(bytes);
}

function bytes2hex(data) {
  return new Uint8Array(data).reduce(
    function (memo, i) {
      return memo + ("0" + i.toString(16)).slice(-2);
    }, "");
}

function intToHex(intIn) {
  let stringOut = ("0000" + intIn.toString(16)).substr(-4)
  return stringOut.substring(2, 4) + stringOut.substring(0, 2);
}

function resetVariables() {
  gattServer = null;
  epdService = null;
  epdCharacteristic = null;
  msgIndex = 0;
  document.getElementById("log").value = '';
}

async function write(cmd, data, withResponse = true) {
  if (!epdCharacteristic) {
    addLog("服务不可用，请检查蓝牙连接");
    return false;
  }
  let payload = [cmd];
  if (data) {
    if (typeof data == 'string') data = hex2bytes(data);
    if (data instanceof Uint8Array) data = Array.from(data);
    payload.push(...data)
  }
  addLog(bytes2hex(payload), '⇑');
  try {
    if (withResponse)
      await epdCharacteristic.writeValueWithResponse(Uint8Array.from(payload));
    else
      await epdCharacteristic.writeValueWithoutResponse(Uint8Array.from(payload));
  } catch (e) {
    console.error(e);
    if (e.message) addLog("write: " + e.message);
    return false;
  }
  return true;
}

async function writeImage(data, step = 'bw') {
  const chunkSize = document.getElementById('mtusize').value - 2;
  const interleavedCount = document.getElementById('interleavedcount').value;
  const count = Math.round(data.length / chunkSize);
  let chunkIdx = 0;
  let noReplyCount = interleavedCount;

  for (let i = 0; i < data.length; i += chunkSize) {
    let currentTime = (new Date().getTime() - startTime) / 1000.0;
    setStatus(`${step == 'bw' ? '黑白' : '颜色'}块: ${chunkIdx + 1}/${count + 1}, 总用时: ${currentTime}s`);
    const payload = [
      (step == 'bw' ? 0x0F : 0x00) | (i == 0 ? 0x00 : 0xF0),
      ...data.slice(i, i + chunkSize),
    ];
    if (noReplyCount > 0) {
      await write(EpdCmd.WRITE_IMG, payload, false);
      noReplyCount--;
    } else {
      await write(EpdCmd.WRITE_IMG, payload, true);
      noReplyCount = interleavedCount;
    }
    chunkIdx++;
  }
}

async function setDriver() {
  await write(EpdCmd.SET_PINS, document.getElementById("epdpins").value);
  await write(EpdCmd.INIT, document.getElementById("epddriver").value);
}

async function syncTime(mode) {
  if (mode === 2) {
    if (!confirm('提醒：时钟模式目前使用全刷实现，仅供体验，不建议长期开启，是否继续?')) return;
  }
  const timestamp = new Date().getTime() / 1000;
  const data = new Uint8Array([
    (timestamp >> 24) & 0xFF,
    (timestamp >> 16) & 0xFF,
    (timestamp >> 8) & 0xFF,
    timestamp & 0xFF,
    -(new Date().getTimezoneOffset() / 60),
    mode
  ]);
  if (await write(EpdCmd.SET_TIME, data)) {
    addLog("时间已同步！");
    addLog("屏幕刷新完成前请不要操作。");
  }
}

async function clearScreen() {
  if (confirm('确认清除屏幕内容?')) {
    await write(EpdCmd.CLEAR);
    addLog("清屏指令已发送！");
    addLog("屏幕刷新完成前请不要操作。");
  }
}

async function sendcmd() {
  const cmdTXT = document.getElementById('cmdTXT').value;
  if (cmdTXT == '') return;
  const bytes = hex2bytes(cmdTXT);
  await write(bytes[0], bytes.length > 1 ? bytes.slice(1) : null);
}

async function sendimg() {
  if (!canvas || !ctx) {
    addLog("画布未初始化，无法发送图片");
    return;
  }
  
  if (isCropMode()) {
    alert("请先完成图片裁剪！发送已取消。");
    return;
  }

  const canvasSize = document.getElementById('canvasSize').value;
  const ditherMode = document.getElementById('ditherMode').value;
  const epdDriverSelect = document.getElementById('epddriver');
  const selectedOption = epdDriverSelect.options[epdDriverSelect.selectedIndex];

  // if (selectedOption.getAttribute('data-size') !== canvasSize) {
  //   if (!confirm("警告：画布尺寸和驱动不匹配，是否继续？")) return;
  // }
  if (selectedOption.getAttribute('data-color') !== ditherMode) {
    if (!confirm("警告：颜色模式和驱动不匹配，是否继续？")) return;
  }

  startTime = new Date().getTime();
  const status = document.getElementById("status");
  status.parentElement.style.display = "block";

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const processedData = processImageData(imageData, ditherMode);

  updateButtonStatus(true);

  if (ditherMode === 'fourColor') {
    await writeImage(processedData, 'color');
  } else if (ditherMode === 'threeColor') {
    const halfLength = Math.floor(processedData.length / 2);
    await writeImage(processedData.slice(0, halfLength), 'bw');
    await writeImage(processedData.slice(halfLength), 'red');
  } else if (ditherMode === 'blackWhiteColor') {
    await writeImage(processedData, 'bw');
  } else {
    addLog("当前固件不支持此颜色模式。");
    updateButtonStatus();
    return;
  }

  await write(EpdCmd.REFRESH);
  updateButtonStatus();

  const sendTime = (new Date().getTime() - startTime) / 1000.0;
  addLog(`发送完成！耗时: ${sendTime}s`);
  setStatus(`发送完成！耗时: ${sendTime}s`);
  addLog("屏幕刷新完成前请不要操作。");
  setTimeout(() => {
    status.parentElement.style.display = "none";
  }, 5000);
}

function downloadDataArray() {
  if (!canvas || !ctx) {
    addLog("画布未初始化，无法下载数据");
    return;
  }
  
  if (isCropMode()) {
    alert("请先完成图片裁剪！下载已取消。");
    return;
  }

  const mode = document.getElementById('ditherMode').value;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const processedData = processImageData(imageData, mode);

  if (mode === 'sixColor' && processedData.length !== canvas.width * canvas.height) {
    console.log(`错误：预期${canvas.width * canvas.height}字节，但得到${processedData.length}字节`);
    addLog('数组大小不匹配。请检查图像尺寸和模式。');
    return;
  }

  const dataLines = [];
  for (let i = 0; i < processedData.length; i++) {
    const hexValue = (processedData[i] & 0xff).toString(16).padStart(2, '0');
    dataLines.push(`0x${hexValue}`);
  }

  const formattedData = [];
  for (let i = 0; i < dataLines.length; i += 16) {
    formattedData.push(dataLines.slice(i, i + 16).join(', '));
  }

  const colorModeValue = mode === 'sixColor' ? 0 : mode === 'fourColor' ? 1 : mode === 'blackWhiteColor' ? 2 : 3;
  const arrayContent = [
    'const uint8_t imageData[] PROGMEM = {',
    formattedData.join(',\n'),
    '};',
    `const uint16_t imageWidth = ${canvas.width};`,
    `const uint16_t imageHeight = ${canvas.height};`,
    `const uint8_t colorMode = ${colorModeValue};`
  ].join('\n');

  const blob = new Blob([arrayContent], { type: 'text/plain' });
  const link = document.createElement('a');
  link.download = 'imagedata.h';
  link.href = URL.createObjectURL(blob);
  link.click();
  URL.revokeObjectURL(link.href);
}

function updateButtonStatus(forceDisabled = false) {
  const connected = gattServer != null && gattServer.connected;
  const status = forceDisabled ? 'disabled' : (connected ? null : 'disabled');
  document.getElementById("reconnectbutton").disabled = (gattServer == null || gattServer.connected) ? 'disabled' : null;
  document.getElementById("sendcmdbutton").disabled = status;
  document.getElementById("calendarmodebutton").disabled = status;
  document.getElementById("debugcalendarbutton").disabled = status;
  document.getElementById("clockmodebutton").disabled = status;
  document.getElementById("clearscreenbutton").disabled = status;
  document.getElementById("sendimgbutton").disabled = status;
  document.getElementById("setDriverbutton").disabled = status;
}

function disconnect() {
  updateButtonStatus();
  resetVariables();
  addLog('已断开连接.');
  document.getElementById("connectbutton").innerHTML = '连接';
}

async function preConnect() {
  if (gattServer != null && gattServer.connected) {
    if (bleDevice != null && bleDevice.gatt.connected) {
      bleDevice.gatt.disconnect();
    }
  }
  else {
    resetVariables();
    try {
      bleDevice = await navigator.bluetooth.requestDevice({
        optionalServices: ['62750001-d828-918d-fb46-b6c11c675aec'],
        acceptAllDevices: true
      });
    } catch (e) {
      console.error(e);
      if (e.message) addLog("requestDevice: " + e.message);
      addLog("请检查蓝牙是否已开启，且使用的浏览器支持蓝牙！建议使用以下浏览器：");
      addLog("• 电脑: Chrome/Edge");
      addLog("• Android: Chrome/Edge");
      addLog("• iOS: Bluefy 浏览器");
      return;
    }

    await bleDevice.addEventListener('gattserverdisconnected', disconnect);
    setTimeout(async function () { await connect(); }, 300);
  }
}

async function reConnect() {
  if (bleDevice != null && bleDevice.gatt.connected)
    bleDevice.gatt.disconnect();
  resetVariables();
  addLog("正在重连");
  setTimeout(async function () { await connect(); }, 300);
}

function handleNotify(value, idx) {
  const data = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  if (idx == 0) {
    addLog(`收到配置：${bytes2hex(data)}`);
    const epdpins = document.getElementById("epdpins");
    const epddriver = document.getElementById("epddriver");
    epdpins.value = bytes2hex(data.slice(0, 7));
    if (data.length > 10) epdpins.value += bytes2hex(data.slice(10, 11));
    epddriver.value = bytes2hex(data.slice(7, 8));
    updateDitcherOptions();
  } else {
    if (textDecoder == null) textDecoder = new TextDecoder();
    const msg = textDecoder.decode(data);
    addLog(msg, '⇓');
    if (msg.startsWith('mtu=') && msg.length > 4) {
      const mtuSize = parseInt(msg.substring(4));
      document.getElementById('mtusize').value = mtuSize;
      addLog(`MTU 已更新为: ${mtuSize}`);
    } else if (msg.startsWith('t=') && msg.length > 2) {
      const t = parseInt(msg.substring(2)) + new Date().getTimezoneOffset() * 60;
      addLog(`远端时间: ${new Date(t * 1000).toLocaleString()}`);
      addLog(`本地时间: ${new Date().toLocaleString()}`);
    } else if (msg.startsWith('device=') && msg.length > 7) {
      // Parse device information: device=modelId,width,height
      const deviceStr = msg.substring(7);
      const parts = deviceStr.split(',');
      if (parts.length >= 3) {
        deviceInfo.modelId = parseInt(parts[0]);
        deviceInfo.width = parseInt(parts[1]);
        deviceInfo.height = parseInt(parts[2]);
        addLog(`设备信息: 型号=${deviceInfo.modelId}, 尺寸=${deviceInfo.width}x${deviceInfo.height}`);
        updateUIForDevice();
      }
    }
  }
}

async function connect() {
  if (bleDevice == null || epdCharacteristic != null) return;

  try {
    addLog("正在连接: " + bleDevice.name);
    gattServer = await bleDevice.gatt.connect();
    addLog('  找到 GATT Server');
    epdService = await gattServer.getPrimaryService('62750001-d828-918d-fb46-b6c11c675aec');
    addLog('  找到 EPD Service');
    epdCharacteristic = await epdService.getCharacteristic('62750002-d828-918d-fb46-b6c11c675aec');
    addLog('  找到 Characteristic');
  } catch (e) {
    console.error(e);
    if (e.message) addLog("connect: " + e.message);
    disconnect();
    return;
  }

  try {
    const versionCharacteristic = await epdService.getCharacteristic('62750003-d828-918d-fb46-b6c11c675aec');
    const versionData = await versionCharacteristic.readValue();
    appVersion = versionData.getUint8(0);
    addLog(`固件版本: 0x${appVersion.toString(16)}`);
  } catch (e) {
    console.error(e);
    appVersion = 0x15;
  }

  if (appVersion < 0x16) {
    const oldURL = "https://tsl0922.github.io/EPD-nRF5/v1.5";
    alert("!!!注意!!!\n当前固件版本过低，可能无法正常使用部分功能，建议升级到最新版本。");
    if (confirm('是否访问旧版本上位机？')) location.href = oldURL;
    setTimeout(() => {
      addLog(`如遇到问题，可访问旧版本上位机: ${oldURL}`);
    }, 500);
  }

  try {
    await epdCharacteristic.startNotifications();
    epdCharacteristic.addEventListener('characteristicvaluechanged', (event) => {
      handleNotify(event.target.value, msgIndex++);
    });
  } catch (e) {
    console.error(e);
    if (e.message) addLog("startNotifications: " + e.message);
  }

  await write(EpdCmd.INIT);

  document.getElementById("connectbutton").innerHTML = '断开';
  updateButtonStatus();
}

function setStatus(statusText) {
  document.getElementById("status").innerHTML = statusText;
}

function addLog(logTXT, action = '') {
  const log = document.getElementById("log");
  const now = new Date();
  const time = String(now.getHours()).padStart(2, '0') + ":" +
    String(now.getMinutes()).padStart(2, '0') + ":" +
    String(now.getSeconds()).padStart(2, '0') + " ";

  const logEntry = document.createElement('div');
  const timeSpan = document.createElement('span');
  timeSpan.className = 'time';
  timeSpan.textContent = time;
  logEntry.appendChild(timeSpan);

  if (action !== '') {
    const actionSpan = document.createElement('span');
    actionSpan.className = 'action';
    actionSpan.innerHTML = action;
    logEntry.appendChild(actionSpan);
  }
  logEntry.appendChild(document.createTextNode(logTXT));

  log.appendChild(logEntry);
  log.scrollTop = log.scrollHeight;

  while (log.childNodes.length > 20) {
    log.removeChild(log.firstChild);
  }
}

function clearLog() {
  document.getElementById("log").innerHTML = '';
}

function fillCanvas(style) {
  if (!canvas || !ctx) {
    return;
  }
  ctx.fillStyle = style;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function updateImage() {
  if (!canvas || !ctx) {
    return;
  }
  
  const imageFile = document.getElementById('imageFile');
  if (imageFile.files.length == 0) {
    fillCanvas('white');
    return;
  }

  const image = new Image();
  image.onload = function () {
    URL.revokeObjectURL(this.src);
    if (image.width / image.height == canvas.width / canvas.height) {
      if (isCropMode()) exitCropMode();
      ctx.drawImage(image, 0, 0, image.width, image.height, 0, 0, canvas.width, canvas.height);
      redrawTextElements();
      redrawLineSegments();
      convertDithering();
      saveCanvasState(); // Save state after loading image
    } else {
      alert("图片宽高比例与画布不匹配，将进入裁剪模式。\n请放大图片后移动图片使其充满画布，再点击“完成”按钮。");
      setActiveTool(null, '');
      initializeCrop();
    }
  };
  image.src = URL.createObjectURL(imageFile.files[0]);
}

function updateCanvasSize() {
  // Check if canvas is initialized
  if (!canvas) {
    console.log("Canvas not initialized yet, skipping updateCanvasSize");
    return;
  }
  
  const selectedSizeName = document.getElementById('canvasSize').value;
  const selectedSize = canvasSizes.find(size => size.name === selectedSizeName);

  if (!selectedSize) {
    console.log("Selected size not found:", selectedSizeName);
    return;
  }

  canvas.width = selectedSize.width;
  canvas.height = selectedSize.height;

  updateImage();
  
  // Auto-rotate canvas if needed for landscape screens
  autoRotateCanvasIfNeeded(selectedSizeName);
}

function updateDitcherOptions() {
  const epdDriverSelect = document.getElementById('epddriver');
  const selectedOption = epdDriverSelect.options[epdDriverSelect.selectedIndex];
  const colorMode = selectedOption.getAttribute('data-color');
  const canvasSize = selectedOption.getAttribute('data-size');

  if (colorMode) document.getElementById('ditherMode').value = colorMode;
  if (canvasSize) document.getElementById('canvasSize').value = canvasSize;

  // Only update canvas if it's initialized
  if (canvas) {
    updateCanvasSize(); // always update image
    
    // Auto-rotate canvas if needed for landscape screens
    if (canvasSize) {
      autoRotateCanvasIfNeeded(canvasSize);
    }
  }
}

function updateUIForDevice() {
  if (!deviceInfo.modelId || !deviceInfo.width || !deviceInfo.height) {
    return;
  }
  
  // Update driver selection based on model ID
  const epddriver = document.getElementById("epddriver");
  const modelIdHex = deviceInfo.modelId.toString(16).padStart(2, '0');
  
  // Find matching option
  for (let i = 0; i < epddriver.options.length; i++) {
    if (epddriver.options[i].value === modelIdHex) {
      epddriver.selectedIndex = i;
      addLog(`自动选择驱动: ${epddriver.options[i].text}`);
      break;
    }
  }
  
  // Update canvas size based on device dimensions
  const canvasSize = document.getElementById("canvasSize");
  const sizeString = `${deviceInfo.width}_${deviceInfo.height}`;
  
  // First try to find exact match
  let foundMatch = false;
  for (let i = 0; i < canvasSize.options.length; i++) {
    if (canvasSize.options[i].value.includes(sizeString)) {
      canvasSize.selectedIndex = i;
      addLog(`自动选择画布尺寸: ${canvasSize.options[i].text}`);
      foundMatch = true;
      break;
    }
  }
  
  // If no exact match found, try to find closest match based on device dimensions
  if (!foundMatch) {
    addLog(`设备尺寸 ${deviceInfo.width}x${deviceInfo.height} 未找到精确匹配，尝试选择最接近的尺寸`);
    
    // Find the closest available size
    let closestIndex = 0;
    let minDifference = Infinity;
    
    for (let i = 0; i < canvasSize.options.length; i++) {
      const optionValue = canvasSize.options[i].value;
      // Extract dimensions from option value (format: "size_width_height")
      const parts = optionValue.split('_');
      if (parts.length >= 3) {
        const optionWidth = parseInt(parts[1]);
        const optionHeight = parseInt(parts[2]);
        const difference = Math.abs(optionWidth - deviceInfo.width) + Math.abs(optionHeight - deviceInfo.height);
        
        if (difference < minDifference) {
          minDifference = difference;
          closestIndex = i;
        }
      }
    }
    
    canvasSize.selectedIndex = closestIndex;
    addLog(`选择最接近的画布尺寸: ${canvasSize.options[closestIndex].text}`);
  }
  
  // Update dither options based on selected driver
  // Only call if canvas is initialized
  if (canvas) {
    updateDitcherOptions();
  } else {
    // If canvas not ready, just update the UI elements without canvas operations
    const epdDriverSelect = document.getElementById('epddriver');
    const selectedOption = epdDriverSelect.options[epdDriverSelect.selectedIndex];
    const colorMode = selectedOption.getAttribute('data-color');
    
    if (colorMode) {
      document.getElementById('ditherMode').value = colorMode;
    }
  }
  
  addLog(`UI已根据设备信息自动更新`);
}

function rotateCanvas() {
  if (!canvas) {
    addLog("画布未初始化，无法旋转");
    return;
  }
  
  const currentWidth = canvas.width;
  const currentHeight = canvas.height;
  canvas.width = currentHeight;
  canvas.height = currentWidth;
  addLog(`画布已旋转: ${currentWidth}x${currentHeight} -> ${canvas.width}x${canvas.height}`);
  updateImage();
  saveCanvasState(); // Save state after rotating
}

// Auto-rotate canvas for screens where width > height (landscape screens)
function autoRotateCanvasIfNeeded(sizeName) {
  if (!canvas) {
    return false;
  }
  
  // Check if this is a landscape screen that needs rotation
  const needsRotation = sizeName.includes('2.13_250_122') || 
                       sizeName.includes('2.13_250_134') || 
                       sizeName.includes('2.9_296_128') || 
                       sizeName.includes('2.66_296_152');
  
  if (needsRotation) {
    const currentWidth = canvas.width;
    const currentHeight = canvas.height;
    
    // Only rotate if current orientation is landscape (width > height)
    if (currentWidth > currentHeight) {
      canvas.width = currentHeight;
      canvas.height = currentWidth;
      addLog(`画布已自动旋转90度: ${currentWidth}x${currentHeight} -> ${canvas.width}x${canvas.height}`);
      
      // Redraw the image after rotation
      updateImage();
      return true;
    }
  }
  return false;
}

function clearCanvas() {
  if (confirm('清除画布内容?')) {
    fillCanvas('white');
    textElements = []; // Clear stored text positions
    lineSegments = []; // Clear stored line segments
    if (isCropMode()) exitCropMode();
    saveCanvasState(); // Save state after clearing
    return true;
  }
  return false;
}

function convertDithering() {
  if (!canvas || !ctx) {
    return;
  }
  
  const contrast = parseFloat(document.getElementById('ditherContrast').value);
  const currentImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const imageData = new ImageData(
    new Uint8ClampedArray(currentImageData.data),
    currentImageData.width,
    currentImageData.height
  );

  adjustContrast(imageData, contrast);

  const alg = document.getElementById('ditherAlg').value;
  const strength = parseFloat(document.getElementById('ditherStrength').value);
  const mode = document.getElementById('ditherMode').value;
  const processedData = processImageData(ditherImage(imageData, alg, strength, mode), mode);
  const finalImageData = decodeProcessedData(processedData, canvas.width, canvas.height, mode);
  ctx.putImageData(finalImageData, 0, 0);
}

function initEventHandlers() {
  document.getElementById("epddriver").addEventListener("change", updateDitcherOptions);
  document.getElementById("imageFile").addEventListener("change", updateImage);
  document.getElementById("ditherMode").addEventListener("change", finishCrop);
  document.getElementById("ditherAlg").addEventListener("change", finishCrop);
  document.getElementById("ditherStrength").addEventListener("input", function () {
    finishCrop();
    document.getElementById("ditherStrengthValue").innerText = parseFloat(this.value).toFixed(1);
  });
  document.getElementById("ditherContrast").addEventListener("input", function () {
    finishCrop();
    document.getElementById("ditherContrastValue").innerText = parseFloat(this.value).toFixed(1);
  });
  document.getElementById("canvasSize").addEventListener("change", updateCanvasSize);
}

function checkDebugMode() {
  const link = document.getElementById('debug-toggle');
  const urlParams = new URLSearchParams(window.location.search);
  const debugMode = urlParams.get('debug');

  if (debugMode === 'true') {
    document.body.classList.add('debug-mode');
    link.innerHTML = '正常模式';
    link.setAttribute('href', window.location.pathname);
    addLog("注意：开发模式功能已开启！不懂请不要随意修改，否则后果自负！");
  } else {
    document.body.classList.remove('debug-mode');
    link.innerHTML = '开发模式';
    link.setAttribute('href', window.location.pathname + '?debug=true');
  }
}


document.body.onload = () => {
  textDecoder = null;
  canvas = document.getElementById('canvas');
  ctx = canvas.getContext("2d");

  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  initPaintTools();
  initCropTools();
  initEventHandlers();
  updateButtonStatus();
  checkDebugMode();
}