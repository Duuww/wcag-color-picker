document.addEventListener('DOMContentLoaded', () => {
  // --- DOM 元素获取 ---
  const hexInput = document.getElementById('hexInput');
  const colorPickerUI = document.getElementById('colorPickerUI');
  const eyeDropperBtn = document.getElementById('eyeDropperBtn');
  const roleRadios = document.getElementsByName('colorRole');
  const fontSizeInput = document.getElementById('fontSize');
  const isBoldInput = document.getElementById('isBold');
  const requiredRatioEl = document.getElementById('requiredRatio');
  const paletteDesc = document.getElementById('paletteDesc');
  const resetBtn = document.getElementById('resetBtn');
  
  const previewBox = document.getElementById('previewBox');
  const previewText = document.getElementById('previewText');

  const hueSlider = document.getElementById('hueSlider');
  const canvas = document.getElementById('colorBoard');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const pointer = document.getElementById('pickerPointer');
  
  const selectedSwatch = document.getElementById('selectedSwatch');
  const selectedHexEl = document.getElementById('selectedHex');
  const selectedRatioText = document.getElementById('selectedRatioText');
  const passBadge = document.getElementById('passBadge');
  const copyBtn = document.getElementById('copyBtn');

  // --- 状态变量 ---
  let baseColorHex = '#333333';
  let requiredRatio = 4.5;
  let currentHue = 0;
  let currentS = 0;   
  let currentL = 100; 
  let isDragging = false;
  let selectedFinalHex = '#FFFFFF';
  
  // 用于缓存当前面板上所有合规的坐标点，实现边缘吸附
  let validPixels = []; 

  // --- 数学与颜色转换 ---
  function getLuminance(r, g, b) {
    const a = [r, g, b].map(v => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
  }

  function getLuminanceFromHex(hex) {
    let r = parseInt(hex.slice(1, 3), 16);
    let g = parseInt(hex.slice(3, 5), 16);
    let b = parseInt(hex.slice(5, 7), 16);
    return getLuminance(r, g, b);
  }

  function hslToRgb(h, s, l) {
    h /= 360; s /= 100; l /= 100;
    let r, g, b;
    if (s === 0) {
      r = g = b = l;
    } else {
      const hue2rgb = (p, q, t) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
      };
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1 / 3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1 / 3);
    }
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
  }

  function rgbToHex(r, g, b) {
    return "#" + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('').toUpperCase();
  }

  function getRatio(baseLum, targetLum) {
    const lightest = Math.max(baseLum, targetLum);
    const darkest = Math.min(baseLum, targetLum);
    return (lightest + 0.05) / (darkest + 0.05);
  }

  // --- 更新实时预览区 ---
  function updatePreview() {
    const isTextRole = document.querySelector('input[name="colorRole"]:checked').value === 'text';
    const size = parseFloat(fontSizeInput.value) || 12;
    const isBold = isBoldInput.checked;

    if (isTextRole) {
      previewText.style.color = baseColorHex;
      previewBox.style.backgroundColor = selectedFinalHex;
    } else {
      previewBox.style.backgroundColor = baseColorHex;
      previewText.style.color = selectedFinalHex;
    }
    previewText.style.fontSize = `${size}pt`;
    previewText.style.fontWeight = isBold ? 'bold' : 'normal';
  }

  // --- 寻找最近的合规点 (吸附算法) ---
  function getClosestValidPoint(targetS, targetL) {
    if (validPixels.length === 0) return null;

    let minDistance = Infinity;
    let closestPoint = validPixels[0];

    for (let i = 0; i < validPixels.length; i++) {
      const p = validPixels[i];
      // 计算两点之间的欧氏距离平方
      const distSq = (p.s - targetS) ** 2 + (p.l - targetL) ** 2;
      if (distSq < minDistance) {
        minDistance = distSq;
        closestPoint = p;
      }
    }
    return closestPoint;
  }

  // --- 更新画布逻辑 ---
  function renderColorBoard() {
    const width = canvas.width;
    const height = canvas.height;
    const imgData = ctx.createImageData(width, height);
    const data = imgData.data;
    
    const baseLuminance = getLuminanceFromHex(baseColorHex);
    validPixels = []; // 清空缓存

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const s = (x / width) * 100;
        const l = 100 - ((y / height) * 100);
        const [r, g, b] = hslToRgb(currentHue, s, l);

        const lum = getLuminance(r, g, b);
        const ratio = getRatio(baseLuminance, lum);

        const idx = (y * width + x) * 4;
        data[idx] = r;
        data[idx + 1] = g;
        data[idx + 2] = b;
        
        if (ratio < requiredRatio) {
          data[idx + 3] = 40; // 不合规，暗化
        } else {
          data[idx + 3] = 255; // 合规，点亮并存入集合
          validPixels.push({ x, y, s, l, ratio, r, g, b });
        }
      }
    }
    ctx.putImageData(imgData, 0, 0);

    // 绘制完画布后，检查当前指针位置是否依然合法
    const currentLum = getLuminance(...hslToRgb(currentHue, currentS, currentL));
    const currentRatio = getRatio(baseLuminance, currentLum);
    
    // 如果底色改变导致原先的点变不合规了，强制吸附到最近合法点
    if (currentRatio < requiredRatio) {
      const validPoint = getClosestValidPoint(currentS, currentL);
      if (validPoint) {
        currentS = validPoint.s;
        currentL = validPoint.l;
      }
    }

    updateSelectedColor(); 
  }

  // --- 计算阈值与基本设定 ---
  function updateSettings() {
    let color = hexInput.value.trim();
    if (/^#[0-9A-Fa-f]{6}$/.test(color)) {
      baseColorHex = color.toUpperCase();
      colorPickerUI.value = baseColorHex;
    }

    const size = parseFloat(fontSizeInput.value) || 12;
    const isBold = isBoldInput.checked;
    requiredRatio = (size >= 18 || (size >= 14 && isBold)) ? 3.0 : 4.5;
    requiredRatioEl.textContent = `${requiredRatio.toFixed(1)}:1`;

    renderColorBoard();
  }

  // --- 更新选取的颜色与UI ---
  function updateSelectedColor() {
    // 极端情况：当前面板没有任何合规颜色
    if (validPixels.length === 0) {
      pointer.style.display = 'none';
      passBadge.textContent = "无合规色";
      passBadge.className = "badge fail";
      selectedRatioText.innerHTML = `当前色相下无可用颜色 <span id="passBadge" class="${passBadge.className}">${passBadge.textContent}</span>`;
      copyBtn.disabled = true;
      selectedFinalHex = '#000000';
      selectedSwatch.style.backgroundColor = '#000';
      selectedHexEl.textContent = '----';
      return;
    }

    pointer.style.display = 'block';
    const x = (currentS / 100) * canvas.width;
    const y = (1 - currentL / 100) * canvas.height;
    
    pointer.style.left = `${x}px`;
    pointer.style.top = `${y}px`;

    const [r, g, b] = hslToRgb(currentHue, currentS, currentL);
    selectedFinalHex = rgbToHex(r, g, b);

    const baseLum = getLuminanceFromHex(baseColorHex);
    const targetLum = getLuminance(r, g, b);
    const ratio = getRatio(baseLum, targetLum);

    selectedSwatch.style.backgroundColor = selectedFinalHex;
    selectedHexEl.textContent = selectedFinalHex;
    
    // 由于指针总是吸附在合规区，所以永远是 "通过"
    passBadge.textContent = "通过";
    passBadge.className = "badge pass";
    copyBtn.disabled = false;
    
    selectedRatioText.innerHTML = `对比度: ${ratio.toFixed(2)}:1 <span id="passBadge" class="${passBadge.className}">${passBadge.textContent}</span>`;
    copyBtn.textContent = '复制颜色';

    updatePreview();
  }

  // --- 鼠标交互事件 (加入吸附机制) ---
  function handleCanvasPick(e) {
    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, canvas.width - 1));
    const y = Math.max(0, Math.min(e.clientY - rect.top, canvas.height - 1));
    
    let targetS = (x / canvas.width) * 100;
    let targetL = 100 - ((y / canvas.height) * 100);
    
    // 不管点在哪里，通过算法寻找离鼠标最近的合规点
    const validPoint = getClosestValidPoint(targetS, targetL);
    if (validPoint) {
      currentS = validPoint.s;
      currentL = validPoint.l;
    }
    
    updateSelectedColor();
  }

  canvas.addEventListener('mousedown', (e) => {
    isDragging = true;
    handleCanvasPick(e);
  });

  window.addEventListener('mousemove', (e) => {
    if (isDragging) handleCanvasPick(e);
  });

  window.addEventListener('mouseup', () => {
    isDragging = false;
  });

  hueSlider.addEventListener('input', (e) => {
    currentHue = e.target.value;
    renderColorBoard();
  });

  // --- 基本输入事件 ---
  hexInput.addEventListener('input', (e) => {
    let val = e.target.value;
    if (!val.startsWith('#')) val = '#' + val;
    e.target.value = val;
    if (val.length === 7) updateSettings();
  });

  colorPickerUI.addEventListener('input', (e) => {
    hexInput.value = e.target.value.toUpperCase();
    updateSettings();
  });

  roleRadios.forEach(r => r.addEventListener('change', updateSettings));
  fontSizeInput.addEventListener('input', updateSettings);
  isBoldInput.addEventListener('change', updateSettings);

  // --- 原生滴管 API ---
  eyeDropperBtn.addEventListener('click', async () => {
    if (!window.EyeDropper) {
      alert("当前浏览器不支持原生滴管功能，请升级。");
      return;
    }
    try {
      const eyeDropper = new EyeDropper();
      const result = await eyeDropper.open();
      hexInput.value = result.sRGBHex.toUpperCase();
      colorPickerUI.value = hexInput.value;
      updateSettings();
    } catch (e) {
      console.log('滴管已取消');
    }
  });

  // --- 复制颜色 ---
  copyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(selectedFinalHex).then(() => {
      copyBtn.textContent = '已复制!';
      setTimeout(() => { copyBtn.textContent = '复制颜色'; }, 1500);
    });
  });

  resetBtn.addEventListener('click', () => {
    window.location.reload();
  });

  // 初始化运行
  updateSettings();
});