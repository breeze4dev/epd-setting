let bleDevice, gattServer;
let epdService, epdCharacteristic;
let startTime, msgIndex, appVersion;
let firmwareVersion = null;  // Additional firmware version from config
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
  SET_WEEK_START: 0x21,
  SET_ROTATION: 0x22,
  LED_CTRL:  0x23,
  SET_SHOW_DEVICE_ID: 0x24,
  SET_BLE_MODE: 0x25,
  SET_CALENDAR_THEME: 0x26,
  SET_CLOCK_THEME: 0x27,

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
  { name: '2.13_212_104', width: 212, height: 104 },
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
  firmwareVersion = null;  // Reset firmware version
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
    if (!confirm('提醒：时钟模式比较费电，并且会缩短屏幕寿命，不建议长期开启，是否继续?')) return;
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

// Rotate ImageData 90 degrees counterclockwise
function rotateImageDataCounterclockwise(imageData) {
  const width = imageData.width;
  const height = imageData.height;
  const data = imageData.data;
  
  // Create new ImageData with swapped dimensions
  const rotatedImageData = new ImageData(height, width);
  const rotatedData = rotatedImageData.data;
  
  // Rotate counterclockwise: (x, y) -> (y, width - 1 - x)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const srcIndex = (y * width + x) * 4;
      const dstX = y;
      const dstY = width - 1 - x;
      const dstIndex = (dstY * height + dstX) * 4;
      
      rotatedData[dstIndex] = data[srcIndex];         // R
      rotatedData[dstIndex + 1] = data[srcIndex + 1]; // G
      rotatedData[dstIndex + 2] = data[srcIndex + 2]; // B
      rotatedData[dstIndex + 3] = data[srcIndex + 3]; // A
    }
  }
  
  return rotatedImageData;
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

  let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  
  addLog(`发送图像: 画布尺寸=${canvas.width}x${canvas.height}, 颜色模式=${ditherMode}`);
  
  // If canvas is landscape (width > height), it means user rotated the canvas clockwise
  // The device expects portrait orientation data, so we need to rotate counterclockwise
  // Note: For 2.13 inch BW screens, canvas should already be rotated to 104x212 by autoRotateCanvasIfNeeded
  // But if it's still 212x104, we need to rotate the image data
  if (canvas.width > canvas.height) {
    addLog(`检测到横屏画布(${canvas.width}x${canvas.height})，旋转图像数据为竖屏方向`);
    imageData = rotateImageDataCounterclockwise(imageData);
    addLog(`图像数据已旋转: ${imageData.width}x${imageData.height}`);
  } else {
    addLog(`画布已是竖屏方向(${canvas.width}x${canvas.height})，无需旋转`);
  }
  
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
  const ledSelect = document.getElementById("ledSelect");
  if (ledSelect) ledSelect.disabled = !!status;
  const showDeviceIdSelect = document.getElementById("showDeviceIdSelect");
  if (showDeviceIdSelect) showDeviceIdSelect.disabled = !!status;
  const bleModeSelect = document.getElementById("bleModeSelect");
  if (bleModeSelect) bleModeSelect.disabled = !!status;
  const calendarThemeSelect = document.getElementById("calendarThemeSelect");
  if (calendarThemeSelect) calendarThemeSelect.disabled = !!status;
}

function disconnect() {
  updateButtonStatus();
  resetVariables();
  // Hide feature options when disconnecting (they will be shown again if device supports them)
  const ledGroup = document.getElementById('ledSelectGroup');
  if (ledGroup) ledGroup.style.display = 'none';
  const deviceIdGroup = document.getElementById('showDeviceIdGroup');
  if (deviceIdGroup) deviceIdGroup.style.display = 'none';
  const bleModeGroup = document.getElementById('bleModeGroup');
  if (bleModeGroup) bleModeGroup.style.display = 'none';
  const calendarThemeGroup = document.getElementById('calendarThemeGroup');
  if (calendarThemeGroup) calendarThemeGroup.style.display = 'none';
  const clockThemeGroup = document.getElementById('clockThemeGroup');
  if (clockThemeGroup) clockThemeGroup.style.display = 'none';
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
    // Don't call updateDitcherOptions here - wait for device= message
    // updateDitcherOptions will be called by updateUIForDevice after device info is received
    addLog(`配置已读取，等待设备信息...`);
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
    } else if (msg.startsWith('led=') && msg.length > 4) {
      const mode = msg.substring(4);
      setLedSelect(mode);
      // Show LED control option when device sends LED state (device supports LED control)
      const ledGroup = document.getElementById('ledSelectGroup');
      if (ledGroup) ledGroup.style.display = '';
      addLog(`时钟LED闪烁模式: ${mode}`);
    } else if (msg.startsWith('show_device_id=') && msg.length > 15) {
      const value = msg.substring(15);
      setShowDeviceIdSelect(value);
      // Show device ID option when device sends show_device_id state (device supports this feature)
      const deviceIdGroup = document.getElementById('showDeviceIdGroup');
      if (deviceIdGroup) deviceIdGroup.style.display = '';
      addLog(`设备ID显示: ${value === '1' ? '显示' : '隐藏'}`);
    } else if (msg.startsWith('ble_mode=') && msg.length > 8) {
      const value = msg.substring(9);
      setBleModeSelect(value);
      // Show BLE mode option when device sends ble_mode state (device supports this feature)
      const bleModeGroup = document.getElementById('bleModeGroup');
      if (bleModeGroup) bleModeGroup.style.display = '';
      const modeText = {
        '0': '关闭蓝牙',
        '1': '每小时开启5分钟',
        '2': '每10分钟开启1分钟',
        '3': '保持打开'
      };
      addLog(`蓝牙广播模式: ${modeText[value] || value}`);
    } else if (msg.startsWith('calendar_theme=') && msg.length > 14) {
      const value = msg.substring(15);
      setCalendarThemeSelect(value);
      // Show calendar theme option when device sends calendar_theme state (device supports this feature)
      const calendarThemeGroup = document.getElementById('calendarThemeGroup');
      if (calendarThemeGroup) calendarThemeGroup.style.display = '';
      const themeText = {
        '0': '主题1',
        '1': '主题2'
      };
      addLog(`日历主题: ${themeText[value] || value}`);
    } else if (msg.startsWith('clock_theme=') && msg.length > 11) {
      const value = msg.substring(12);
      setClockThemeSelect(value);
      // Show clock theme option when device sends clock_theme state (device supports this feature)
      const clockThemeGroup = document.getElementById('clockThemeGroup');
      if (clockThemeGroup) clockThemeGroup.style.display = '';
      const themeText = {
        '0': '主题1',
        '1': '主题2'
      };
      addLog(`时钟主题: ${themeText[value] || value}`);
    } else if (msg.startsWith('firmware_version=') && msg.length > 17) {
      firmwareVersion = parseInt(msg.substring(17));
      // Update firmware version display with format: 0x18-01
      const versionText = firmwareVersion != null ? `0x${appVersion.toString(16)}-${firmwareVersion.toString(16).padStart(2, '0').toUpperCase()}` : `0x${appVersion.toString(16)}`;
      // Update the version log entry by replacing the previous version line
      const logElement = document.getElementById("log");
      if (logElement && logElement.value) {
        const logValue = logElement.value;
        const versionLineIndex = logValue.indexOf('固件版本:');
        if (versionLineIndex !== -1) {
          const beforeVersion = logValue.substring(0, versionLineIndex);
          const afterVersion = logValue.substring(versionLineIndex);
          const lineEnd = afterVersion.indexOf('\n');
          const rest = lineEnd !== -1 ? afterVersion.substring(lineEnd + 1) : '';
          logElement.value = beforeVersion + `固件版本: ${versionText}\n` + rest;
        } else {
          addLog(`固件版本: ${versionText}`);
        }
      }
    }
  }
}

function setShowDeviceIdSelect(value) {
  const select = document.getElementById('showDeviceIdSelect');
  if (select) {
    select.value = value;
    select.dataset.prevValue = value;
  }
}

function setBleModeSelect(value) {
  const select = document.getElementById('bleModeSelect');
  if (select) {
    select.value = value;
    select.dataset.prevValue = value;
  }
}

function setCalendarThemeSelect(value) {
  const select = document.getElementById('calendarThemeSelect');
  if (select) {
    select.value = value;
    select.dataset.prevValue = value;
  }
}

function setClockThemeSelect(value) {
  const select = document.getElementById('clockThemeSelect');
  if (select) {
    select.value = value;
    select.dataset.prevValue = value;
  }
}

function setLedSelect(value) {
  const ledSelect = document.getElementById('ledSelect');
  if (ledSelect) {
    ledSelect.value = value;
    ledSelect.dataset.prevValue = value;
  }
}

async function updateClockLed(select) {
  if (!select) return;
  const previous = select.dataset.prevValue || "0";
  const value = parseInt(select.value);
  if (!checkBluetoothConnection()) {
    select.value = previous;
    return;
  }
  const success = await write(EpdCmd.LED_CTRL, [value]);
  if (!success) {
    select.value = previous;
  } else {
    select.dataset.prevValue = select.value;
  }
}

async function updateShowDeviceId(select) {
  if (!select) return;
  const previous = select.dataset.prevValue || "1";
  const value = parseInt(select.value);
  if (!checkBluetoothConnection()) {
    select.value = previous;
    return;
  }
  const success = await write(EpdCmd.SET_SHOW_DEVICE_ID, [value]);
  if (!success) {
    select.value = previous;
  } else {
    select.dataset.prevValue = select.value;
  }
}

async function updateBleMode(select) {
  if (!select) return;
  const previous = select.dataset.prevValue || "3";
  const value = parseInt(select.value);
  if (!checkBluetoothConnection()) {
    select.value = previous;
    return;
  }
  const success = await write(EpdCmd.SET_BLE_MODE, [value]);
  if (!success) {
    select.value = previous;
  } else {
    select.dataset.prevValue = select.value;
    const modeText = {
      0: '关闭蓝牙',
      1: '每小时开启5分钟',
      2: '每10分钟开启1分钟',
      3: '保持打开'
    };
    addLog(`蓝牙广播模式设置已更新: ${modeText[value] || value}`);
  }
}

async function updateCalendarTheme(select) {
  if (!select) return;
  const previous = select.dataset.prevValue || "0";
  const value = parseInt(select.value);
  if (!checkBluetoothConnection()) {
    select.value = previous;
    return;
  }
  const success = await write(EpdCmd.SET_CALENDAR_THEME, [value]);
  if (!success) {
    select.value = previous;
  } else {
    select.dataset.prevValue = select.value;
    const themeText = {
      0: '主题1',
      1: '主题2'
    };
    addLog(`日历主题设置已更新: ${themeText[value] || value}`);
  }
}

async function updateClockTheme(select) {
  if (!select) return;
  const previous = select.dataset.prevValue || "0";
  const value = parseInt(select.value);
  if (!checkBluetoothConnection()) {
    select.value = previous;
    return;
  }
  const success = await write(EpdCmd.SET_CLOCK_THEME, [value]);
  if (!success) {
    select.value = previous;
  } else {
    select.dataset.prevValue = select.value;
    const themeText = {
      0: '主题1',
      1: '主题2'
    };
    addLog(`时钟主题设置已更新: ${themeText[value] || value}`);
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
    // Firmware version will be updated when device sends firmware_version message
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
      // alert("图片宽高比例与画布不匹配，将进入裁剪模式。\n请放大图片后移动图片使其充满画布，再点击“完成”按钮。");
      setActiveTool(null, '');
      initializeCrop();
    }
  };
  image.src = URL.createObjectURL(imageFile.files[0]);
}

function updateCanvasSize(sizeNameOverride) {
  // Check if canvas is initialized
  if (!canvas) {
    console.log("Canvas not initialized yet, skipping updateCanvasSize");
    addLog("Canvas not initialized yet, skipping updateCanvasSize");
    return;
  }
  
  // Handle event object: if sizeNameOverride is an Event, get value from target
  // Otherwise use the provided string value or read from DOM
  let selectedSizeName;
  if (sizeNameOverride && typeof sizeNameOverride === 'object' && sizeNameOverride.target) {
    // It's an event object, get value from target
    selectedSizeName = sizeNameOverride.target.value;
  } else if (typeof sizeNameOverride === 'string') {
    // It's a string value
    selectedSizeName = sizeNameOverride;
  } else {
    // Read from DOM
    selectedSizeName = document.getElementById('canvasSize').value;
  }
  
  console.log("updateCanvasSize: sizeNameOverride =", sizeNameOverride);
  console.log("updateCanvasSize: selectedSizeName =", selectedSizeName);
  console.log("updateCanvasSize: DOM value =", document.getElementById('canvasSize').value);
  console.log("updateCanvasSize: available canvasSizes =", canvasSizes.map(s => s.name));
  addLog(`更新画布尺寸: 选择的尺寸名称 = "${selectedSizeName}"`);
  
  // Ensure selectedSizeName is a string
  if (typeof selectedSizeName !== 'string') {
    addLog(`错误: 画布尺寸名称类型错误: ${typeof selectedSizeName}`);
    return;
  }
  
  if (!selectedSizeName || selectedSizeName.trim() === '') {
    addLog(`错误: 画布尺寸名称为空`);
    return;
  }
  
  const selectedSize = canvasSizes.find(size => size.name === selectedSizeName);

  if (!selectedSize) {
    console.log("Selected size not found:", selectedSizeName);
    console.log("Available sizes:", canvasSizes.map(s => s.name));
    addLog(`错误: 未找到画布尺寸 "${selectedSizeName}"`);
    addLog(`可用的尺寸: ${canvasSizes.map(s => s.name).join(", ")}`);
    
    // Try to find a similar size by matching the prefix (e.g., "2.13_250_134" -> "2.13_250_122")
    let fallbackSize = null;
    if (selectedSizeName) {
      const parts = selectedSizeName.split('_');
      if (parts.length >= 2) {
        const prefix = parts[0]; // e.g., "2.13"
        fallbackSize = canvasSizes.find(size => size.name.startsWith(prefix + '_'));
        if (fallbackSize) {
          console.log("Found fallback size:", fallbackSize.name);
          addLog(`找到相似尺寸: ${fallbackSize.name} (${fallbackSize.width}x${fallbackSize.height})`);
        }
      }
    }
    
    // If no fallback found, use the first available
    if (!fallbackSize && canvasSizes.length > 0) {
      fallbackSize = canvasSizes[0];
      addLog(`使用默认尺寸: ${fallbackSize.name} (${fallbackSize.width}x${fallbackSize.height})`);
    }
    
    if (fallbackSize) {
      document.getElementById('canvasSize').value = fallbackSize.name;
      canvas.width = fallbackSize.width;
      canvas.height = fallbackSize.height;
      updateImage();
    }
    return;
  }

  console.log("updateCanvasSize: found size =", selectedSize);
  addLog(`设置画布尺寸: ${selectedSize.name} (${selectedSize.width}x${selectedSize.height})`);
  
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

  console.log("updateDitcherOptions: colorMode =", colorMode, "canvasSize =", canvasSize);
  addLog(`更新驱动选项: 颜色模式 = ${colorMode}, 画布尺寸 = ${canvasSize}`);

  if (colorMode) document.getElementById('ditherMode').value = colorMode;
  if (canvasSize) {
    console.log("updateDitcherOptions: setting canvasSize to", canvasSize);
    const canvasSizeElement = document.getElementById('canvasSize');
    canvasSizeElement.value = canvasSize;
    console.log("updateDitcherOptions: canvasSize element value after setting =", canvasSizeElement.value);
  }

  // Only update canvas if it's initialized
  if (canvas) {
    // Pass canvasSize directly to avoid timing issues
    updateCanvasSize(canvasSize); // always update image
    
    // Auto-rotate canvas if needed for landscape screens
    if (canvasSize) {
      autoRotateCanvasIfNeeded(canvasSize);
    }
  }
}

function updateUIForDevice() {
  if (!deviceInfo.modelId) {
    return;
  }
  
  // Update driver selection based on model ID
  const epddriver = document.getElementById("epddriver");
  const modelIdHex = deviceInfo.modelId.toString(16).padStart(2, '0');
  
  addLog(`设备型号ID: 0x${modelIdHex}, 设备尺寸: ${deviceInfo.width}x${deviceInfo.height}`);
  
  // Find matching option and get its data-size BEFORE changing selection
  // This prevents the change event from using wrong values
  let driverFound = false;
  let correctCanvasSize = null;
  let correctColorMode = null;
  let driverIndex = -1;
  
  for (let i = 0; i < epddriver.options.length; i++) {
    if (epddriver.options[i].value === modelIdHex) {
      driverIndex = i;
      const option = epddriver.options[i];
      correctCanvasSize = option.getAttribute('data-size');
      correctColorMode = option.getAttribute('data-color');
      addLog(`找到匹配驱动: ${option.text}, 画布尺寸=${correctCanvasSize}, 颜色模式=${correctColorMode}`);
      driverFound = true;
      break;
    }
  }
  
  // If driver found, ALWAYS use its data-size attribute to set canvas size
  // This ensures consistency between driver and canvas size, regardless of device-reported dimensions
  if (driverFound) {
    // Temporarily remove change event listener to prevent it from interfering
    const changeHandler = updateDitcherOptions;
    epddriver.removeEventListener("change", changeHandler);
    
    // Set driver selection
    epddriver.selectedIndex = driverIndex;
    addLog(`自动选择驱动: ${epddriver.options[driverIndex].text}`);
    
    // Set UI elements with the correct values we found earlier
    if (correctColorMode) {
      document.getElementById('ditherMode').value = correctColorMode;
    }
    if (correctCanvasSize) {
      const canvasSizeElement = document.getElementById('canvasSize');
      // Temporarily remove change event listener to prevent interference
      const canvasSizeChangeHandler = updateCanvasSize;
      canvasSizeElement.removeEventListener("change", canvasSizeChangeHandler);
      
      canvasSizeElement.value = correctCanvasSize;
      addLog(`自动选择画布尺寸: ${correctCanvasSize} (来自驱动配置)`);
      
      // Immediately update canvas size (same logic as updateDitcherOptions)
      if (canvas) {
        updateCanvasSize(correctCanvasSize); // Pass string directly, not event
        autoRotateCanvasIfNeeded(correctCanvasSize);
      }
      
      // Re-add the event listener
      canvasSizeElement.addEventListener("change", canvasSizeChangeHandler);
    }
    
    // Re-add the event listener
    epddriver.addEventListener("change", changeHandler);
    
    // Ensure all UI elements are synchronized (but don't trigger canvas update again)
    // The canvas has already been updated above
  } else {
    // If driver not found, try to match canvas size based on device dimensions
    addLog(`警告: 未找到匹配的驱动 (model_id=0x${modelIdHex})，尝试根据设备尺寸匹配画布`);
    if (deviceInfo.width && deviceInfo.height) {
      const canvasSize = document.getElementById("canvasSize");
      
      // Try both orientations: width_height and height_width
      const sizeString1 = `${deviceInfo.width}_${deviceInfo.height}`;
      const sizeString2 = `${deviceInfo.height}_${deviceInfo.width}`;
      
      addLog(`尝试匹配尺寸: ${sizeString1} 或 ${sizeString2}`);
      
      // First try to find exact match (check both orientations)
      let foundMatch = false;
      for (let i = 0; i < canvasSize.options.length; i++) {
        const optionValue = canvasSize.options[i].value;
        // Check if option contains either orientation
        if (optionValue.includes(sizeString1) || optionValue.includes(sizeString2)) {
          canvasSize.selectedIndex = i;
          addLog(`自动选择画布尺寸: ${canvasSize.options[i].text} (精确匹配)`);
          foundMatch = true;
          break;
        }
      }
      
      // If no exact match found, try to find closest match based on device dimensions
      if (!foundMatch) {
        addLog(`设备尺寸 ${deviceInfo.width}x${deviceInfo.height} 未找到精确匹配，尝试选择最接近的尺寸`);
        
        // Find the closest available size (check both orientations)
        let closestIndex = 0;
        let minDifference = Infinity;
        
        for (let i = 0; i < canvasSize.options.length; i++) {
          const optionValue = canvasSize.options[i].value;
          // Extract dimensions from option value (format: "size_width_height")
          const parts = optionValue.split('_');
          if (parts.length >= 3) {
            const optionWidth = parseInt(parts[1]);
            const optionHeight = parseInt(parts[2]);
            
            // Calculate difference for both orientations
            const diff1 = Math.abs(optionWidth - deviceInfo.width) + Math.abs(optionHeight - deviceInfo.height);
            const diff2 = Math.abs(optionWidth - deviceInfo.height) + Math.abs(optionHeight - deviceInfo.width);
            const difference = Math.min(diff1, diff2);
            
            if (difference < minDifference) {
              minDifference = difference;
              closestIndex = i;
            }
          }
        }
        
        canvasSize.selectedIndex = closestIndex;
        addLog(`选择最接近的画布尺寸: ${canvasSize.options[closestIndex].text} (差异=${minDifference})`);
      }
    }
  }
  
  addLog(`UI已根据设备信息自动更新`);
}

function rotateCanvas() {
  if (!canvas || !ctx) {
    addLog("画布未初始化，无法旋转");
    return;
  }
  
  const currentWidth = canvas.width;
  const currentHeight = canvas.height;
  
  // Save old coordinates before updating
  const oldTextElements = JSON.parse(JSON.stringify(textElements));
  const oldLineSegments = JSON.parse(JSON.stringify(lineSegments));
  
  // Save current canvas content
  const imageData = ctx.getImageData(0, 0, currentWidth, currentHeight);
  
  // Create a temporary canvas to hold the original content
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = currentWidth;
  tempCanvas.height = currentHeight;
  const tempCtx = tempCanvas.getContext('2d');
  tempCtx.putImageData(imageData, 0, 0);
  
  // Clear text and lines from temp canvas by drawing white rectangles over them
  tempCtx.fillStyle = 'white';
  oldTextElements.forEach(text => {
    tempCtx.font = text.font;
    const textWidth = tempCtx.measureText(text.text).width;
    const fontSizeMatch = text.font.match(/(\d+)px/);
    const fontSize = fontSizeMatch ? parseInt(fontSizeMatch[1]) : 14;
    const textHeight = fontSize * 1.2;
    tempCtx.fillRect(text.x - 2, text.y - textHeight - 2, textWidth + 4, textHeight + 4);
  });
  
  // Clear lines from temp canvas
  oldLineSegments.forEach(segment => {
    tempCtx.strokeStyle = 'white';
    tempCtx.lineWidth = segment.size + 2;
    tempCtx.beginPath();
    if (segment.type === 'dot') {
      tempCtx.moveTo(segment.x, segment.y);
      tempCtx.lineTo(segment.x + 0.1, segment.y + 0.1);
    } else {
      tempCtx.moveTo(segment.x1, segment.y1);
      tempCtx.lineTo(segment.x2, segment.y2);
    }
    tempCtx.stroke();
  });
  
  // Swap canvas dimensions
  canvas.width = currentHeight;
  canvas.height = currentWidth;
  
  // Clear the canvas completely
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // Rotate and draw the image (clockwise 90 degrees)
  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(Math.PI / 2); // 90 degrees clockwise
  ctx.drawImage(tempCanvas, -currentWidth / 2, -currentHeight / 2);
  ctx.restore();
  
  // Update coordinates for text elements (clockwise 90 degrees)
  // Formula: (x, y) -> (height - y, x)
  textElements.forEach((text, index) => {
    const oldX = oldTextElements[index].x;
    const oldY = oldTextElements[index].y;
    text.x = currentHeight - oldY;
    text.y = oldX;
  });
  
  // Update coordinates for line segments (clockwise 90 degrees)
  lineSegments.forEach((segment, index) => {
    if (segment.type === 'dot') {
      const oldX = oldLineSegments[index].x;
      const oldY = oldLineSegments[index].y;
      segment.x = currentHeight - oldY;
      segment.y = oldX;
    } else {
      const oldX1 = oldLineSegments[index].x1;
      const oldY1 = oldLineSegments[index].y1;
      const oldX2 = oldLineSegments[index].x2;
      const oldY2 = oldLineSegments[index].y2;
      segment.x1 = currentHeight - oldY1;
      segment.y1 = oldX1;
      segment.x2 = currentHeight - oldY2;
      segment.y2 = oldX2;
    }
  });
  
  // Redraw text and line elements at new coordinates
  redrawTextElements();
  redrawLineSegments();
  
  // Clear history to prevent undo/redo conflicts with rotation
  clearHistory();
  
  // Save current state as the new initial state
  saveCanvasState();
  
  // If there's an image file, reload it to fit the new canvas size
  const imageFile = document.getElementById('imageFile');
  if (imageFile.files.length > 0) {
    updateImage();
  }
  
  addLog(`画布已顺时针旋转: ${currentWidth}x${currentHeight} -> ${canvas.width}x${canvas.height}`);
  addLog("历史记录已清空，无法撤销到旋转前的状态");
}

// Auto-rotate canvas for screens where width > height (landscape screens)
function autoRotateCanvasIfNeeded(sizeName) {
  if (!canvas || !ctx) {
    return false;
  }
  
  // Check if this is a landscape screen that needs rotation
  // Note: 2.13_212_104 is displayed as landscape (212x104) but device expects portrait (104x212) data
  // So we need to rotate it to portrait orientation
  const needsRotation = sizeName.includes('2.13_250_122') || 
                       sizeName.includes('2.13_250_134') || 
                       sizeName.includes('2.13_212_104') ||  // 2.13 inch BW screen needs rotation
                       sizeName.includes('2.9_296_128') || 
                       sizeName.includes('2.66_296_152');
  
  if (needsRotation) {
    const currentWidth = canvas.width;
    const currentHeight = canvas.height;
    
    addLog(`autoRotateCanvasIfNeeded: 尺寸=${sizeName}, 当前画布=${currentWidth}x${currentHeight}`);
    
    // Only rotate if current orientation is landscape (width > height)
    if (currentWidth > currentHeight) {
      addLog(`检测到横屏画布，开始旋转为竖屏`);
      // Check if canvas has content (not just white)
      const imageData = ctx.getImageData(0, 0, currentWidth, currentHeight);
      const hasContent = imageData.data.some((value, index) => {
        // Check if pixel is not white (skip alpha channel)
        if (index % 4 === 3) return false; // Skip alpha
        return value < 255;
      });
      
      if (hasContent) {
        // If canvas has content, rotate it properly
        // Create a temporary canvas to hold the original image
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = currentWidth;
        tempCanvas.height = currentHeight;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.putImageData(imageData, 0, 0);
        
        // Swap canvas dimensions
      canvas.width = currentHeight;
      canvas.height = currentWidth;
        
        // Clear the canvas
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Rotate and draw the image (counterclockwise 90 degrees)
        ctx.save();
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate(-Math.PI / 2); // 90 degrees counterclockwise
        ctx.drawImage(tempCanvas, -currentWidth / 2, -currentHeight / 2);
        ctx.restore();
        
        // Rotate text elements coordinates (counterclockwise 90 degrees)
        // Formula: (x, y) -> (y, width - x)
        textElements.forEach(text => {
          const oldX = text.x;
          const oldY = text.y;
          text.x = oldY;
          text.y = currentWidth - oldX;
        });
        
        // Rotate line segments coordinates (counterclockwise 90 degrees)
        lineSegments.forEach(segment => {
          if (segment.type === 'dot') {
            const oldX = segment.x;
            const oldY = segment.y;
            segment.x = oldY;
            segment.y = currentWidth - oldX;
          } else {
            const oldX1 = segment.x1;
            const oldY1 = segment.y1;
            const oldX2 = segment.x2;
            const oldY2 = segment.y2;
            segment.x1 = oldY1;
            segment.y1 = currentWidth - oldX1;
            segment.x2 = oldY2;
            segment.y2 = currentWidth - oldX2;
          }
        });
        
        // Redraw text and line elements on rotated canvas
        redrawTextElements();
        redrawLineSegments();
      } else {
        // If canvas is empty, just swap dimensions
        addLog(`画布为空，直接交换尺寸`);
        canvas.width = currentHeight;
        canvas.height = currentWidth;
      }
      
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
  const imageFileInput = document.getElementById("imageFile");
  imageFileInput.addEventListener("change", function() {
    updateImage();
  });
  // Fix: allow re-selecting the same file by clearing value on mousedown
  // This allows the change event to fire even when selecting the same file
  imageFileInput.addEventListener("mousedown", function() {
    if (this.files.length > 0) {
      // Store the current file before clearing
      const currentFile = this.files[0];
      // Clear value to allow change event to fire
      this.value = '';
      // If user cancels, we can't restore, but that's okay
      // The change event will handle the new selection
    }
  });
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
  const urlParams = new URLSearchParams(window.location.search);
  const debugMode = urlParams.get('debug');
  const link = document.getElementById('debug-toggle');

  if (debugMode === 'true') {
    document.body.classList.add('debug-mode');
    if (link) {
      link.innerHTML = '正常模式';
      link.setAttribute('href', window.location.pathname);
    }
    addLog("注意：开发模式功能已开启！不懂请不要随意修改，否则后果自负！");
  } else {
    document.body.classList.remove('debug-mode');
    if (link) {
      link.innerHTML = '开发模式';
      link.setAttribute('href', window.location.pathname + '?debug=true');
    }
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