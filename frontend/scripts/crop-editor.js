// ============================================
// MÓDULO 2: RECORTE MANUAL (REGLA FINA 0.5%, SIN PANEL DE PRECISIÓN)
// ============================================
(function() {
    'use strict';

    // ============ ELEMENTOS DOM ============
    const cropFileInput = document.getElementById('cropFileInput');
    const cropLoadBtn = document.getElementById('cropLoadBtn');
    const cropCounter = document.getElementById('cropCounter');
    const cropEditor = document.getElementById('cropEditor');
    const imageToCrop = document.getElementById('imageToCrop');
    const cropContainer = document.getElementById('cropContainer');
    const cropSaveBtn = document.getElementById('cropSaveBtn');
    const cropPrevBtn = document.getElementById('cropPrevBtn');
    const cropNextBtn = document.getElementById('cropNextBtn');
    const cropGalleryGrid = document.getElementById('cropGalleryGrid');
    const cropCount = document.getElementById('cropCount');
    const cropSelectAll = document.getElementById('cropSelectAll');
    const cropDeselectAll = document.getElementById('cropDeselectAll');
    const cropBatchWhite = document.getElementById('cropBatchWhite');
    const cropBatchBlack = document.getElementById('cropBatchBlack');
    const cropClearAll = document.getElementById('cropClearAll');
    const cropGallery = document.getElementById('cropGallery');
    const processAllBtn = document.getElementById('cropProcessAllBtn');
    const cropDownloadAllBtn = document.getElementById('cropDownloadAllBtn');
    const cropDeleteSelectedBtn = document.getElementById('cropDeleteSelectedBtn');
    const cropToggleCircle = document.getElementById('cropToggleCircle');
    const addCropBoxBtn = document.getElementById('addCropBoxBtn');
    const gridToggle = document.getElementById('gridToggle');
    const gridOverlay = document.getElementById('gridOverlay');
    const autoSnapBtn = document.getElementById('autoSnapBtn');

    // PDF CONTROLS
    const pdfControls = document.getElementById('pdfControls');
    const pdfPrevPageBtn = document.getElementById('pdfPrevPageBtn');
    const pdfNextPageBtn = document.getElementById('pdfNextPageBtn');
    const pdfSavePatternBtn = document.getElementById('pdfSavePatternBtn');
    const pdfPageCounter = document.getElementById('pdfPageCounter');

    // ============ ESTADO GLOBAL ============
    let cropImages = [];               // imágenes sueltas
    let cropIndex = 0;
    window.cropBoards = [];
    let cropSelected = new Set();
    let cropOriginalImage = null;
    let cropOriginalWidth = 0, cropOriginalHeight = 0;
    let includeCircleInDownload = true;

    let cropBoxes = [];
    let activeCropIndex = -1;

    let isDragging = false, isResizing = false, resizeDir = '';
    let startX = 0, startY = 0;
    let startBoxX = 0, startBoxY = 0, startBoxW = 0, startBoxH = 0;

    let pdfPages = [];
    let currentPdfPage = 0;
    let pagePatterns = {};

    // ============ ESCALA Y OFFSET ============
    function getScale() {
        if (!cropOriginalWidth || !cropOriginalHeight) return 1;
        const rect = imageToCrop.getBoundingClientRect();
        const displayWidth = rect.width;
        return displayWidth === 0 ? 1 : displayWidth / cropOriginalWidth;
    }

    function getImageOffset() {
        const containerRect = cropContainer.getBoundingClientRect();
        const imageRect = imageToCrop.getBoundingClientRect();
        return {
            left: imageRect.left - containerRect.left,
            top: imageRect.top - containerRect.top
        };
    }

    function getDisplayedImageSize() {
        const rect = imageToCrop.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
    }

    // ============ CUADRÍCULA (VERDE FINO 0.5%) ============
    function updateGrid() {
        if (!gridOverlay || !gridToggle) return;
        if (!gridToggle.checked) {
            gridOverlay.style.display = 'none';
            return;
        }
        gridOverlay.style.display = 'block';
        const offset = getImageOffset();
        const size = getDisplayedImageSize();
        gridOverlay.style.left = offset.left + 'px';
        gridOverlay.style.top = offset.top + 'px';
        gridOverlay.style.width = size.width + 'px';
        gridOverlay.style.height = size.height + 'px';
        gridOverlay.style.backgroundImage = `
            linear-gradient(to right, rgba(0,255,0,0.8) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(0,255,0,0.8) 1px, transparent 1px)
        `;
        gridOverlay.style.backgroundSize = '0.5% 0.5%';
        gridOverlay.style.backgroundPosition = '0 0';
        gridOverlay.style.border = 'none';
        gridOverlay.style.backgroundColor = 'transparent';
        gridOverlay.style.boxShadow = 'none';
    }

    function snapToGrid(value, gridSize) {
        return Math.round(value / gridSize) * gridSize;
    }

    function getGridSize() {
        return Math.round(Math.min(cropOriginalWidth, cropOriginalHeight) * 0.005);
    }

    function applySnapToBox(box) {
        if (!cropOriginalWidth || !cropOriginalHeight) return;
        const grid = getGridSize();
        if (grid <= 0) return;
        box.x = snapToGrid(box.x, grid);
        box.y = snapToGrid(box.y, grid);
        box.w = snapToGrid(box.w, grid);
        box.h = snapToGrid(box.h, grid);
    }

    // ============ AUTOAPLICAR PATRÓN A TODAS LAS PÁGINAS (si no hay personalización) ============
    function autoApplyPatternIfFirstPage() {
        if (pdfPages.length === 0 || currentPdfPage !== 0 || cropBoxes.length === 0) return;
        const currentPattern = getCropPattern();
        let hasCustom = false;
        for (let i = 1; i < pdfPages.length; i++) {
            if (pagePatterns[i] && pagePatterns[i].length > 0 &&
                JSON.stringify(pagePatterns[i]) !== JSON.stringify(currentPattern)) {
                hasCustom = true;
                break;
            }
        }
        if (hasCustom) return;
        for (let i = 0; i < pdfPages.length; i++) {
            pagePatterns[i] = JSON.parse(JSON.stringify(currentPattern));
        }
    }

    function updateCropBoxesVisual() {
        const scale = getScale();
        const offset = getImageOffset();
        cropBoxes.forEach((boxObj, idx) => {
            const el = boxObj.element;
            el.style.left = (offset.left + boxObj.x * scale) + 'px';
            el.style.top = (offset.top + boxObj.y * scale) + 'px';
            el.style.width = (boxObj.w * scale) + 'px';
            el.style.height = (boxObj.h * scale) + 'px';
            el.style.borderColor = (idx === activeCropIndex) ? '#2ecc71' : '#f1c40f';
            el.style.borderWidth = (idx === activeCropIndex) ? '3px' : '2px';
        });
        updateGrid();
    }

    function addCropBox(x, y, w, h) {
        const container = document.getElementById('cropBoxesContainer');
        if (!container) return;

        if (cropBoxes.length > 0) {
            const lastBox = cropBoxes[cropBoxes.length - 1];
            w = lastBox.w; h = lastBox.h;
        } else {
            const cols = 2, rows = 3;
            const cellW = Math.floor(cropOriginalWidth / cols);
            const cellH = Math.floor(cropOriginalHeight / rows);
            const margin = Math.min(15, Math.floor(Math.min(cellW, cellH) * 0.1));
            w = cellW - 2 * margin; h = cellH - 2 * margin;
        }

        x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
        const temp = { x, y, w, h };
        applySnapToBox(temp);
        x = temp.x; y = temp.y; w = temp.w; h = temp.h;

        if (x + w > cropOriginalWidth) w = cropOriginalWidth - x;
        if (y + h > cropOriginalHeight) h = cropOriginalHeight - y;
        if (w < 10) w = 10; if (h < 10) h = 10;
        if (x < 0) x = 0; if (y < 0) y = 0;

        const box = document.createElement('div');
        box.className = 'crop-box';
        box.dataset.index = cropBoxes.length;
        box.style.cssText = `
            position: absolute;
            border: 2px solid #f1c40f;
            background: rgba(52,152,219,0.15);
            cursor: move;
            pointer-events: auto;
        `;

        ['nw', 'ne', 'sw', 'se'].forEach(dir => {
            const handle = document.createElement('div');
            handle.className = `resize-handle resize-${dir}`;
            handle.style.cssText = `
                position: absolute;
                width: 12px; height: 12px;
                background: #f1c40f;
                border-radius: 50%;
                border: 1px solid white;
                ${dir.includes('n') ? 'top: -5px;' : 'bottom: -5px;'}
                ${dir.includes('w') ? 'left: -5px;' : 'right: -5px;'}
                cursor: ${dir}-resize;
                pointer-events: auto;
            `;
            box.appendChild(handle);
        });

        const deleteBtn = document.createElement('div');
        deleteBtn.textContent = '×';
        deleteBtn.style.cssText = `
            position: absolute; top: -8px; right: -8px;
            width: 16px; height: 16px;
            background: #e74c3c; color: white;
            border-radius: 50%; font-size: 12px; line-height: 16px;
            text-align: center; cursor: pointer; pointer-events: auto; z-index: 10;
        `;
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const idx = cropBoxes.findIndex(b => b.element === box);
            if (idx >= 0) {
                cropBoxes.splice(idx, 1);
                box.remove();
                if (activeCropIndex === idx) activeCropIndex = -1;
                if (activeCropIndex > idx) activeCropIndex--;
                updateCropBoxesVisual();
                if (pdfPages.length > 0 && currentPdfPage === 0) autoApplyPatternIfFirstPage();
            }
        });
        box.appendChild(deleteBtn);

        const boxObj = { x, y, w, h, element: box };
        cropBoxes.push(boxObj);
        activeCropIndex = cropBoxes.length - 1;

        box.addEventListener('mousedown', (e) => {
            if (e.target.classList.contains('resize-handle') || e.target === deleteBtn) return;
            e.stopPropagation(); e.preventDefault();
            const idx = cropBoxes.findIndex(b => b.element === box);
            if (idx < 0) return;
            activeCropIndex = idx;
            const obj = cropBoxes[idx];
            isDragging = true;
            startX = e.clientX; startY = e.clientY;
            startBoxX = obj.x; startBoxY = obj.y;
            box.style.borderColor = '#2ecc71';
            box.style.borderWidth = '3px';
        });

        box.querySelectorAll('.resize-handle').forEach(handle => {
            handle.addEventListener('mousedown', (e) => {
                e.stopPropagation(); e.preventDefault();
                const idx = cropBoxes.findIndex(b => b.element === box);
                if (idx < 0) return;
                activeCropIndex = idx;
                const obj = cropBoxes[idx];
                isResizing = true;
                resizeDir = handle.className.split(' ')[1].replace('resize-', '');
                startX = e.clientX; startY = e.clientY;
                startBoxX = obj.x; startBoxY = obj.y;
                startBoxW = obj.w; startBoxH = obj.h;
                box.style.borderColor = '#2ecc71';
                box.style.borderWidth = '3px';
            });
        });

        container.appendChild(box);
        updateCropBoxesVisual();
        autoApplyPatternIfFirstPage();
    }

    document.addEventListener('mousemove', function(e) {
        if (!isDragging && !isResizing) return;
        if (activeCropIndex < 0 || activeCropIndex >= cropBoxes.length) return;
        const obj = cropBoxes[activeCropIndex];
        const scale = getScale();
        const dx = (e.clientX - startX) / scale;
        const dy = (e.clientY - startY) / scale;

        if (isDragging) {
            let newX = startBoxX + dx, newY = startBoxY + dy;
            newX = Math.max(0, Math.min(cropOriginalWidth - obj.w, newX));
            newY = Math.max(0, Math.min(cropOriginalHeight - obj.h, newY));
            obj.x = Math.round(newX);
            obj.y = Math.round(newY);
            if (!e.altKey) {
                const grid = getGridSize();
                obj.x = snapToGrid(obj.x, grid);
                obj.y = snapToGrid(obj.y, grid);
            }
        } else if (isResizing) {
            let newW = startBoxW, newH = startBoxH, newX = startBoxX, newY = startBoxY;
            if (resizeDir.includes('e')) newW = Math.max(10, startBoxW + dx);
            if (resizeDir.includes('w')) { newX = Math.max(0, startBoxX + dx); newW = Math.max(10, startBoxW - dx); }
            if (resizeDir.includes('s')) newH = Math.max(10, startBoxH + dy);
            if (resizeDir.includes('n')) { newY = Math.max(0, startBoxY + dy); newH = Math.max(10, startBoxH - dy); }
            if (newX + newW > cropOriginalWidth) newW = cropOriginalWidth - newX;
            if (newY + newH > cropOriginalHeight) newH = cropOriginalHeight - newY;
            obj.x = Math.round(newX); obj.y = Math.round(newY);
            obj.w = Math.round(newW); obj.h = Math.round(newH);
            if (!e.altKey) {
                const grid = getGridSize();
                obj.x = snapToGrid(obj.x, grid); obj.y = snapToGrid(obj.y, grid);
                obj.w = snapToGrid(obj.w, grid); obj.h = snapToGrid(obj.h, grid);
            }
        }
        updateCropBoxesVisual();
    });

    document.addEventListener('mouseup', function() {
        const was = isDragging || isResizing;
        isDragging = false; isResizing = false;
        if (was && pdfPages.length > 0 && currentPdfPage === 0) autoApplyPatternIfFirstPage();
    });

    // ============ BOTONES ============
    if (addCropBoxBtn) addCropBoxBtn.addEventListener('click', () => {
        if (!cropOriginalWidth || !cropOriginalHeight) {
            window.showNotification('Primero carga una imagen.', true);
            return;
        }
        let w, h;
        if (cropBoxes.length > 0) {
            w = cropBoxes[cropBoxes.length - 1].w;
            h = cropBoxes[cropBoxes.length - 1].h;
        } else {
            const cols = 2, rows = 3;
            const cellW = Math.floor(cropOriginalWidth / cols);
            const cellH = Math.floor(cropOriginalHeight / rows);
            const margin = Math.min(15, Math.floor(Math.min(cellW, cellH) * 0.1));
            w = cellW - 2 * margin; h = cellH - 2 * margin;
        }
        const x = Math.floor((cropOriginalWidth - w) / 2);
        const y = Math.floor((cropOriginalHeight - h) / 2);
        addCropBox(x, y, w, h);
        window.showNotification('Recuadro añadido (ajustado a la regla).');
    });

    if (autoSnapBtn) autoSnapBtn.addEventListener('click', () => {
        cropBoxes.forEach(box => applySnapToBox(box));
        updateCropBoxesVisual();
        autoApplyPatternIfFirstPage();
        window.showNotification('Todos los recuadros alineados a la regla.');
    });

    // ============ CARGA DE IMÁGENES SUELTAS ============
    cropLoadBtn.addEventListener('click', () => {
        const files = cropFileInput.files;
        if (!files.length) { window.showNotification('Selecciona imágenes.', true); return; }
        cropImages = Array.from(files);
        cropIndex = 0;
        pdfPages = []; pagePatterns = {};
        cropEditor.style.display = 'block';
        clearCropBoxes();
        if (pdfControls) pdfControls.style.display = 'none';
        cropSaveBtn.style.display = 'inline-flex';
        loadCropImage();
    });

    function loadCropImage() {
        if (!cropImages.length) return;
        const reader = new FileReader();
        reader.onload = function(e) {
            cropOriginalImage = new Image();
            cropOriginalImage.onload = function() {
                cropOriginalWidth = cropOriginalImage.width;
                cropOriginalHeight = cropOriginalImage.height;
                imageToCrop.src = e.target.result;
                imageToCrop.onload = function() {
                    if (cropBoxes.length === 0) {
                        const cols = 2, rows = 3;
                        const cellW = Math.floor(cropOriginalWidth / cols);
                        const cellH = Math.floor(cropOriginalHeight / rows);
                        const margin = Math.min(15, Math.floor(Math.min(cellW, cellH) * 0.1));
                        for (let r = 0; r < rows; r++) {
                            for (let c = 0; c < cols; c++) {
                                addCropBox(c * cellW + margin, r * cellH + margin, cellW - 2*margin, cellH - 2*margin);
                            }
                        }
                    }
                    cropSaveBtn.disabled = false;
                    updateCropBoxesVisual();
                };
            };
            cropOriginalImage.src = e.target.result;
        };
        reader.readAsDataURL(cropImages[cropIndex]);
        cropCounter.textContent = `Imagen ${cropIndex+1} de ${cropImages.length}`;
        cropPrevBtn.disabled = cropIndex === 0;
        cropNextBtn.disabled = cropIndex === cropImages.length - 1;
    }

    // ============ PDF ============
    function loadPdfPage(pageIndex) {
        if (!pdfPages.length || pageIndex < 0 || pageIndex >= pdfPages.length) return;
        currentPdfPage = pageIndex;
        const imgLoader = new Image();
        imgLoader.onload = function() {
            cropOriginalImage = imgLoader;
            cropOriginalWidth = imgLoader.width;
            cropOriginalHeight = imgLoader.height;
            imageToCrop.src = pdfPages[pageIndex];
            imageToCrop.onload = function() {
                clearCropBoxes();
                const pattern = pagePatterns[pageIndex];
                if (pattern && pattern.length) {
                    pattern.forEach(box => addCropBox(box.x, box.y, box.w, box.h));
                } else if (pageIndex === 0 && Object.keys(pagePatterns).length === 0) {
                    const cols = 2, rows = 3;
                    const cellW = Math.floor(cropOriginalWidth / cols);
                    const cellH = Math.floor(cropOriginalHeight / rows);
                    const margin = Math.min(15, Math.floor(Math.min(cellW, cellH) * 0.1));
                    for (let r = 0; r < rows; r++) {
                        for (let c = 0; c < cols; c++) {
                            addCropBox(c * cellW + margin, r * cellH + margin, cellW - 2*margin, cellH - 2*margin);
                        }
                    }
                    autoApplyPatternIfFirstPage();
                }
                if (pdfPageCounter) pdfPageCounter.textContent = `Página ${pageIndex+1} de ${pdfPages.length}`;
                if (pdfPrevPageBtn) pdfPrevPageBtn.disabled = pageIndex === 0;
                if (pdfNextPageBtn) pdfNextPageBtn.disabled = pageIndex === pdfPages.length - 1;
                cropSaveBtn.disabled = false;
                updateCropBoxesVisual();
            };
        };
        imgLoader.src = pdfPages[pageIndex];
    }

    window.loadPdfForCrop = function(pagesData) {
        if (!pagesData || !pagesData.length) { window.showNotification('No se recibieron páginas del PDF.', true); return; }
        pdfPages = pagesData;
        currentPdfPage = 0;
        pagePatterns = {};
        cropImages = [];
        cropEditor.style.display = 'block';
        if (pdfControls) pdfControls.style.display = 'flex';
        cropSaveBtn.style.display = 'none';   // ocultar en modo PDF
        loadPdfPage(0);
    };

    window.getPdfPatterns = function() {
        if (cropBoxes.length > 0 && currentPdfPage >= 0) {
            pagePatterns[currentPdfPage] = getCropPattern();
        }
        return pagePatterns;
    };

    function saveCurrentPagePattern() {
        if (cropBoxes.length > 0 && currentPdfPage >= 0) {
            pagePatterns[currentPdfPage] = getCropPattern();
        }
    }

    // ============ NAVEGACIÓN PDF ============
    if (pdfPrevPageBtn) pdfPrevPageBtn.addEventListener('click', () => {
        saveCurrentPagePattern();
        if (currentPdfPage > 0) loadPdfPage(currentPdfPage - 1);
    });
    if (pdfNextPageBtn) pdfNextPageBtn.addEventListener('click', () => {
        saveCurrentPagePattern();
        if (currentPdfPage < pdfPages.length - 1) loadPdfPage(currentPdfPage + 1);
    });

    if (pdfSavePatternBtn) pdfSavePatternBtn.addEventListener('click', () => {
        const pattern = getCropPattern();
        if (!pattern.length) { window.showNotification('No hay recuadros en esta página.', true); return; }
        pagePatterns[currentPdfPage] = pattern;
        pdfSavePatternBtn.style.background = '#2ecc71';
        setTimeout(() => { pdfSavePatternBtn.style.background = ''; }, 500);
        window.showNotification(`Patrón guardado para página ${currentPdfPage+1}`);
    });

    function clearCropBoxes() {
        const container = document.getElementById('cropBoxesContainer');
        if (container) container.innerHTML = '';
        cropBoxes = [];
        activeCropIndex = -1;
    }

    function getCropPattern() {
        return cropBoxes.map(obj => ({
            x: Math.round(obj.x), y: Math.round(obj.y),
            w: Math.round(obj.w), h: Math.round(obj.h)
        }));
    }

    // ============ GALERÍA ============
    function renderCropGallery() {
        cropGalleryGrid.innerHTML = '';
        cropCount.textContent = window.cropBoards.length;
        if (window.cropBoards.length === 0) { cropGallery.style.display = 'none'; return; }
        cropGallery.style.display = 'block';

        window.cropBoards.forEach((board, idx) => {
            const div = document.createElement('div');
            div.className = 'gallery-item' + (cropSelected.has(idx) ? ' selected' : '');
            const img = document.createElement('img');
            img.src = board.dataUrl;
            const info = document.createElement('div');
            info.className = 'gallery-info';
            const badge = document.createElement('span');
            badge.className = 'circle-badge' + (board.turno === 'white' ? ' white' : (board.turno === 'black' ? ' black' : ''));
            const label = document.createElement('span');
            label.textContent = board.turno ? (board.turno === 'white' ? 'Blancas' : 'Negras') : 'Sin turno';
            const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = cropSelected.has(idx);
            cb.addEventListener('change', function(e) { e.stopPropagation(); if (this.checked) cropSelected.add(idx); else cropSelected.delete(idx); renderCropGallery(); });
            const downloadBtn = document.createElement('button');
            downloadBtn.className = 'btn btn-sm btn-success'; downloadBtn.innerHTML = '<i class="fas fa-download"></i>';
            downloadBtn.addEventListener('click', function(e) { e.stopPropagation(); const a = document.createElement('a'); a.href = board.dataUrl; a.download = `tablero_${idx+1}.jpg`; a.click(); });
            info.appendChild(badge); info.appendChild(label); info.appendChild(cb); info.appendChild(downloadBtn);
            img.addEventListener('click', function(e) { e.stopPropagation(); const turnos = [null, 'white', 'black']; let t = turnos.indexOf(board.turno); t = (t+1)%turnos.length; board.turno = turnos[t]; renderCropGallery(); if (window.updatePdfPreview) window.updatePdfPreview(); });
            div.appendChild(img); div.appendChild(info);
            cropGalleryGrid.appendChild(div);
        });
        if (window.updatePdfPreview) window.updatePdfPreview();
    }

    // ============ EVENTOS DE GALERÍA ============
    cropSelectAll.addEventListener('click', () => { for (let i=0; i<window.cropBoards.length; i++) cropSelected.add(i); renderCropGallery(); });
    cropDeselectAll.addEventListener('click', () => { cropSelected.clear(); renderCropGallery(); });
    cropBatchWhite.addEventListener('click', () => { for (let i=0; i<window.cropBoards.length; i++) { if (cropSelected.has(i)) window.cropBoards[i].turno='white'; else window.cropBoards[i].turno='black'; } renderCropGallery(); window.showNotification('Blancas asignadas a seleccionados, Negras al resto'); });
    cropBatchBlack.addEventListener('click', () => { for (let i=0; i<window.cropBoards.length; i++) { if (cropSelected.has(i)) window.cropBoards[i].turno='black'; else window.cropBoards[i].turno='white'; } renderCropGallery(); window.showNotification('Negras asignadas a seleccionados, Blancas al resto'); });
    cropDeleteSelectedBtn.addEventListener('click', () => { if (cropSelected.size===0) return; if (confirm(`¿Eliminar ${cropSelected.size} imágenes?`)) { const nb=[]; window.cropBoards.forEach((b,i)=>{ if(!cropSelected.has(i)) nb.push(b); }); window.cropBoards=nb; cropSelected.clear(); renderCropGallery(); window.showNotification('Imágenes eliminadas.'); } });
    cropClearAll.addEventListener('click', () => { if (confirm('¿Eliminar todos?')) { window.cropBoards=[]; cropSelected.clear(); renderCropGallery(); window.showNotification('Todos los recortes eliminados.'); } });
    cropDownloadAllBtn.addEventListener('click', () => { if (window.cropBoards.length===0) return; window.cropBoards.forEach((b,i)=>setTimeout(()=>{ const a=document.createElement('a'); a.href=b.dataUrl; a.download=`tablero_${i+1}${b.turno?'_'+b.turno:''}.jpg`; a.click(); }, i*200)); window.showNotification('Descargando todas...'); });
    cropToggleCircle.addEventListener('change', function() { includeCircleInDownload = this.checked; });

    window.renderCropGallery = renderCropGallery;
    window.getCropBoards = () => window.cropBoards;

    // ============ PROCESAR TODAS (PDF Y SUELTAS) ============
    processAllBtn.addEventListener('click', function() {
        // ----- CASO PDF -----
        if (pdfPages.length > 0) {
            if (cropBoxes.length === 0) { window.showNotification('No hay recuadros. Ajusta al menos uno en la primera página.', true); return; }
            saveCurrentPagePattern();
            if (window.cropBoards.length > 0 && confirm('La galería ya contiene imágenes. ¿Deseas vaciarla antes de extraer los nuevos diagramas?')) {
                window.cropBoards = []; cropSelected.clear(); renderCropGallery();
            }
            let totalBoards = 0, pagesDone = 0;
            for (let i = 0; i < pdfPages.length; i++) {
                const pageImg = new Image();
                pageImg.src = pdfPages[i];
                pageImg.onload = (function(idx) {
                    return function() {
                        const pattern = pagePatterns[idx] || (idx === 0 ? getCropPattern() : null);
                        if (pattern && pattern.length) {
                            pattern.forEach(box => {
                                const canvas = document.createElement('canvas');
                                canvas.width = box.w; canvas.height = box.h;
                                const ctx = canvas.getContext('2d');
                                ctx.drawImage(pageImg, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
                                window.cropBoards.push({ dataUrl: canvas.toDataURL('image/jpeg', 0.92), turno: null });
                                totalBoards++;
                            });
                        }
                        pagesDone++;
                        if (pagesDone === pdfPages.length) {
                            window.showNotification(`Se añadieron ${totalBoards} tableros a la galería.`);
                            renderCropGallery();
                        }
                    };
                })(i);
            }
            return;
        }

        // ----- CASO IMÁGENES SUELTAS -----
        if (cropImages.length === 0 || cropBoxes.length === 0) {
            window.showNotification('Carga imágenes sueltas y ajusta recuadros, o usa un PDF.', true);
            return;
        }

        let processed = 0;
        const total = cropImages.length;
        window.showNotification(`Procesando ${total} imágenes...`);

        function processNext(idx) {
            if (idx >= total) {
                window.showNotification(`¡Procesadas ${total} imágenes!`);
                renderCropGallery();
                return;
            }
            const reader = new FileReader();
            reader.onload = function(e) {
                const img = new Image();
                img.onload = function() {
                    const scaleX = img.width / cropOriginalWidth;
                    const scaleY = img.height / cropOriginalHeight;
                    cropBoxes.forEach(obj => {
                        const x = Math.round(obj.x * scaleX);
                        const y = Math.round(obj.y * scaleY);
                        const w = Math.max(10, Math.round(obj.w * scaleX));
                        const h = Math.max(10, Math.round(obj.h * scaleY));
                        const canvas = document.createElement('canvas');
                        canvas.width = w;
                        canvas.height = h;
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(img, x, y, w, h, 0, 0, w, h);
                        const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
                        window.cropBoards.push({ dataUrl, turno: null });
                    });
                    processed++;
                    processNext(idx + 1);
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(cropImages[idx]);
        }
        processNext(0);
    });

    // ============ GUARDAR RECORTE (IMÁGENES SUELTAS) ============
    cropSaveBtn.addEventListener('click', () => {
        if (cropBoxes.length===0) { window.showNotification('No hay recuadros.', true); return; }
        cropBoxes.forEach(obj => {
            const canvas=document.createElement('canvas'); canvas.width=obj.w; canvas.height=obj.h;
            const ctx=canvas.getContext('2d'); ctx.drawImage(cropOriginalImage, obj.x, obj.y, obj.w, obj.h, 0, 0, obj.w, obj.h);
            window.cropBoards.push({dataUrl:canvas.toDataURL('image/jpeg',0.92), turno:null});
        });
        renderCropGallery();
        window.showNotification(`Guardados ${cropBoxes.length} recortes.`);
        if (cropIndex < cropImages.length-1) { cropIndex++; loadCropImage(); } else { cropGallery.style.display='block'; }
    });

    // ============ NAVEGACIÓN ENTRE IMÁGENES SUELTAS ============
    cropPrevBtn.addEventListener('click', () => { if (cropIndex>0) { cropIndex--; loadCropImage(); } });
    cropNextBtn.addEventListener('click', () => { if (cropIndex<cropImages.length-1) { cropIndex++; loadCropImage(); } });

    // ============ CUADRÍCULA TOGGLE ============
    if (gridToggle) gridToggle.addEventListener('change', updateGrid);
    window.addEventListener('resize', () => { updateCropBoxesVisual(); });

    // ============ INICIALIZAR ============
    function initCropEditor() {
        if (cropContainer) cropContainer.style.position = 'relative';
        if (gridOverlay) {
            gridOverlay.style.position = 'absolute';
            gridOverlay.style.pointerEvents = 'none';
            gridOverlay.style.zIndex = '3';
            gridOverlay.style.backgroundColor = 'transparent';
        }
        updateGrid();
    }
    initCropEditor();

})();
