// ============================================
// MÓDULO 2: RECORTE MANUAL (CUADRÍCULA VISIBLE Y DPI UNIFICADO)
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

    // PDF CONTROLS
    const pdfControls = document.getElementById('pdfControls');
    const pdfPrevPageBtn = document.getElementById('pdfPrevPageBtn');
    const pdfNextPageBtn = document.getElementById('pdfNextPageBtn');
    const pdfApplyToAllBtn = document.getElementById('pdfApplyToAllBtn');
    const pdfSavePatternBtn = document.getElementById('pdfSavePatternBtn');
    const pdfPageCounter = document.getElementById('pdfPageCounter');

    // ============ ESTADO GLOBAL ============
    let cropImages = [];
    let cropIndex = 0;
    window.cropBoards = [];
    let cropSelected = new Set();
    let cropOriginalImage = null;
    let cropOriginalWidth = 0, cropOriginalHeight = 0;
    let includeCircleInDownload = true;

    // Recuadros
    let cropBoxes = [];
    let activeCropIndex = -1;

    // Interacción ratón
    let isDragging = false;
    let isResizing = false;
    let resizeDir = '';
    let startX = 0, startY = 0;
    let startBoxX = 0, startBoxY = 0, startBoxW = 0, startBoxH = 0;

    // PDF
    let pdfPages = [];
    let currentPdfPage = 0;
    let pagePatterns = {};

    // ============ ESCALA Y OFFSET ============
    function getScale() {
        if (!cropOriginalWidth || !cropOriginalHeight) return 1;
        const rect = imageToCrop.getBoundingClientRect();
        const displayWidth = rect.width;
        if (displayWidth === 0) return 1;
        return displayWidth / cropOriginalWidth;
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

    // ============ CUADRÍCULA (REGLAS VISIBLES) ============
    function updateGrid() {
        if (!gridOverlay || !gridToggle) return;
        const visible = gridToggle.checked;
        if (!visible) {
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

        // Líneas cada 10% del ancho/alto, color cian visible
        gridOverlay.style.backgroundImage = `
            linear-gradient(to right, rgba(0, 255, 255, 0.6) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(0, 255, 255, 0.6) 1px, transparent 1px)
        `;
        gridOverlay.style.backgroundSize = '10% 10%';
        gridOverlay.style.backgroundPosition = '0 0';
        gridOverlay.style.border = '1px solid rgba(0,255,255,0.3)'; // borde de referencia
    }

    // ============ ACTUALIZAR RECUADROS Y CUADRÍCULA ============
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

    // ============ CREAR RECUADRO (TAMAÑO HEREDADO) ============
    function addCropBox(x, y, w, h) {
        const container = document.getElementById('cropBoxesContainer');
        if (!container) return;

        // Si ya hay recuadros, usar el tamaño del último
        if (cropBoxes.length > 0) {
            const lastBox = cropBoxes[cropBoxes.length - 1];
            w = lastBox.w;
            h = lastBox.h;
        }

        x = Math.round(x);
        y = Math.round(y);
        w = Math.round(w);
        h = Math.round(h);

        // Límites
        if (x + w > cropOriginalWidth) w = cropOriginalWidth - x;
        if (y + h > cropOriginalHeight) h = cropOriginalHeight - y;
        if (w < 10) w = 10;
        if (h < 10) h = 10;
        if (x < 0) x = 0;
        if (y < 0) y = 0;

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

        // Manejadores de redimensionamiento (esquinas)
        ['nw', 'ne', 'sw', 'se'].forEach(dir => {
            const handle = document.createElement('div');
            handle.className = `resize-handle resize-${dir}`;
            handle.style.cssText = `
                position: absolute;
                width: 12px;
                height: 12px;
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

        // Botón eliminar
        const deleteBtn = document.createElement('div');
        deleteBtn.textContent = '×';
        deleteBtn.style.cssText = `
            position: absolute;
            top: -8px;
            right: -8px;
            width: 16px;
            height: 16px;
            background: #e74c3c;
            color: white;
            border-radius: 50%;
            font-size: 12px;
            line-height: 16px;
            text-align: center;
            cursor: pointer;
            pointer-events: auto;
            z-index: 10;
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
            }
        });
        box.appendChild(deleteBtn);

        const boxObj = { x, y, w, h, element: box };
        cropBoxes.push(boxObj);
        activeCropIndex = cropBoxes.length - 1;

        // Evento de arrastre
        box.addEventListener('mousedown', (e) => {
            if (e.target.classList.contains('resize-handle') || e.target === deleteBtn) return;
            e.stopPropagation();
            e.preventDefault();
            const idx = cropBoxes.findIndex(b => b.element === box);
            if (idx < 0) return;
            activeCropIndex = idx;
            const obj = cropBoxes[idx];
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            startBoxX = obj.x;
            startBoxY = obj.y;
            box.style.borderColor = '#2ecc71';
            box.style.borderWidth = '3px';
        });

        // Eventos de redimensionamiento
        box.querySelectorAll('.resize-handle').forEach(handle => {
            handle.addEventListener('mousedown', (e) => {
                e.stopPropagation();
                e.preventDefault();
                const idx = cropBoxes.findIndex(b => b.element === box);
                if (idx < 0) return;
                activeCropIndex = idx;
                const obj = cropBoxes[idx];
                isResizing = true;
                resizeDir = handle.className.split(' ')[1].replace('resize-', '');
                startX = e.clientX;
                startY = e.clientY;
                startBoxX = obj.x;
                startBoxY = obj.y;
                startBoxW = obj.w;
                startBoxH = obj.h;
                box.style.borderColor = '#2ecc71';
                box.style.borderWidth = '3px';
            });
        });

        container.appendChild(box);
        updateCropBoxesVisual();
    }

    // ============ EVENTOS GLOBALES DE RATÓN ============
    document.addEventListener('mousemove', function(e) {
        if (!isDragging && !isResizing) return;
        if (activeCropIndex < 0 || activeCropIndex >= cropBoxes.length) return;

        const obj = cropBoxes[activeCropIndex];
        const scale = getScale();
        const dx = (e.clientX - startX) / scale;
        const dy = (e.clientY - startY) / scale;

        if (isDragging) {
            let newX = startBoxX + dx;
            let newY = startBoxY + dy;
            newX = Math.max(0, Math.min(cropOriginalWidth - obj.w, newX));
            newY = Math.max(0, Math.min(cropOriginalHeight - obj.h, newY));
            obj.x = Math.round(newX);
            obj.y = Math.round(newY);
        } else if (isResizing) {
            let newW = startBoxW;
            let newH = startBoxH;
            let newX = startBoxX;
            let newY = startBoxY;
            if (resizeDir.includes('e')) newW = Math.max(10, startBoxW + dx);
            if (resizeDir.includes('w')) { newX = Math.max(0, startBoxX + dx); newW = Math.max(10, startBoxW - dx); }
            if (resizeDir.includes('s')) newH = Math.max(10, startBoxH + dy);
            if (resizeDir.includes('n')) { newY = Math.max(0, startBoxY + dy); newH = Math.max(10, startBoxH - dy); }
            if (newX + newW > cropOriginalWidth) newW = cropOriginalWidth - newX;
            if (newY + newH > cropOriginalHeight) newH = cropOriginalHeight - newY;
            obj.x = Math.round(newX);
            obj.y = Math.round(newY);
            obj.w = Math.round(newW);
            obj.h = Math.round(newH);
        }
        updateCropBoxesVisual();
    });

    document.addEventListener('mouseup', function() {
        isDragging = false;
        isResizing = false;
    });

    // ============ BOTÓN: AÑADIR RECUADRO ============
    if (addCropBoxBtn) {
        addCropBoxBtn.addEventListener('click', function() {
            if (!cropOriginalWidth || !cropOriginalHeight) {
                window.showNotification('Primero carga una imagen.', true);
                return;
            }
            let w, h;
            if (cropBoxes.length > 0) {
                const last = cropBoxes[cropBoxes.length - 1];
                w = last.w;
                h = last.h;
            } else {
                w = Math.floor(cropOriginalWidth * 0.3);
                h = Math.floor(cropOriginalHeight * 0.3);
            }
            const x = Math.floor((cropOriginalWidth - w) / 2);
            const y = Math.floor((cropOriginalHeight - h) / 2);
            addCropBox(x, y, w, h);
            window.showNotification('Recuadro añadido (hereda tamaño del último).');
        });
    }

    // ============ CARGA DE IMÁGENES SUELTAS ============
    cropLoadBtn.addEventListener('click', function() {
        const files = cropFileInput.files;
        if (!files.length) {
            window.showNotification('Selecciona imágenes.', true);
            return;
        }
        cropImages = Array.from(files);
        cropIndex = 0;
        cropEditor.style.display = 'block';
        clearCropBoxes();
        if (pdfControls) pdfControls.style.display = 'none';
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
                        const w = Math.floor(cropOriginalWidth * 0.6);
                        const h = Math.floor(cropOriginalHeight * 0.6);
                        const x = Math.floor((cropOriginalWidth - w) / 2);
                        const y = Math.floor((cropOriginalHeight - h) / 2);
                        addCropBox(x, y, w, h);
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

    // ============ FUNCIONES PARA PDF ============
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
                if (pagePatterns[pageIndex]) {
                    pagePatterns[pageIndex].forEach(box => addCropBox(box.x, box.y, box.w, box.h));
                } else {
                    // Grid 3x2 por defecto con margen 10%
                    const cols = 2, rows = 3;
                    const cellW = Math.floor(cropOriginalWidth / cols);
                    const cellH = Math.floor(cropOriginalHeight / rows);
                    const margin = Math.min(15, Math.floor(Math.min(cellW, cellH) * 0.1));
                    for (let r = 0; r < rows; r++) {
                        for (let c = 0; c < cols; c++) {
                            const x = c * cellW + margin;
                            const y = r * cellH + margin;
                            const w = cellW - 2 * margin;
                            const h = cellH - 2 * margin;
                            if (w > 20 && h > 20) addCropBox(x, y, w, h);
                        }
                    }
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
        if (!pagesData || !pagesData.length) {
            window.showNotification('No se recibieron páginas del PDF.', true);
            return;
        }
        pdfPages = pagesData;
        currentPdfPage = 0;
        pagePatterns = {};
        cropEditor.style.display = 'block';
        if (pdfControls) pdfControls.style.display = 'flex';
        loadPdfPage(0);
    };

    window.getPdfPatterns = function() {
        if (cropBoxes.length > 0 && currentPdfPage >= 0) {
            const pattern = getCropPattern();
            if (pattern.length > 0) {
                pagePatterns[currentPdfPage] = pattern;
            }
        }
        return pagePatterns;
    };

    // ============ LIMPIAR RECUADROS ============
    function clearCropBoxes() {
        const container = document.getElementById('cropBoxesContainer');
        if (container) container.innerHTML = '';
        cropBoxes = [];
        activeCropIndex = -1;
    }

    function getCropPattern() {
        return cropBoxes.map(obj => ({
            x: Math.round(obj.x),
            y: Math.round(obj.y),
            w: Math.round(obj.w),
            h: Math.round(obj.h)
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
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.checked = cropSelected.has(idx);
            cb.addEventListener('change', function(e) {
                e.stopPropagation();
                if (this.checked) cropSelected.add(idx);
                else cropSelected.delete(idx);
                renderCropGallery();
            });

            const downloadBtn = document.createElement('button');
            downloadBtn.className = 'btn btn-sm btn-success';
            downloadBtn.innerHTML = '<i class="fas fa-download"></i>';
            downloadBtn.title = 'Descargar este recorte';
            downloadBtn.style.marginLeft = '5px';
            downloadBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                const link = document.createElement('a');
                link.href = board.dataUrl;
                link.download = `tablero_${idx+1}${board.turno ? '_'+board.turno : ''}.jpg`;
                link.click();
            });

            info.appendChild(badge);
            info.appendChild(label);
            info.appendChild(cb);
            info.appendChild(downloadBtn);

            img.addEventListener('click', function(e) {
                e.stopPropagation();
                const turnos = [null, 'white', 'black'];
                let idxTurno = turnos.indexOf(board.turno);
                idxTurno = (idxTurno + 1) % turnos.length;
                board.turno = turnos[idxTurno];
                renderCropGallery();
                if (window.updatePdfPreview) window.updatePdfPreview();
            });

            div.appendChild(img);
            div.appendChild(info);
            cropGalleryGrid.appendChild(div);
        });
        if (window.updatePdfPreview) window.updatePdfPreview();
    }

    // ============ EVENTOS DE GALERÍA ============
    cropSelectAll.addEventListener('click', () => {
        for (let i = 0; i < window.cropBoards.length; i++) cropSelected.add(i);
        renderCropGallery();
    });
    cropDeselectAll.addEventListener('click', () => {
        cropSelected.clear();
        renderCropGallery();
    });
    cropBatchWhite.addEventListener('click', () => {
        for (let i = 0; i < window.cropBoards.length; i++) {
            if (cropSelected.has(i)) window.cropBoards[i].turno = 'white';
            else window.cropBoards[i].turno = 'black';
        }
        renderCropGallery();
        window.showNotification('Blancas asignadas a seleccionados, Negras al resto');
    });
    cropBatchBlack.addEventListener('click', () => {
        for (let i = 0; i < window.cropBoards.length; i++) {
            if (cropSelected.has(i)) window.cropBoards[i].turno = 'black';
            else window.cropBoards[i].turno = 'white';
        }
        renderCropGallery();
        window.showNotification('Negras asignadas a seleccionados, Blancas al resto');
    });
    cropDeleteSelectedBtn.addEventListener('click', () => {
        if (cropSelected.size === 0) { window.showNotification('No hay imágenes seleccionadas.', true); return; }
        if (confirm(`¿Eliminar ${cropSelected.size} imágenes seleccionadas?`)) {
            const newBoards = [];
            const newSelected = new Set();
            window.cropBoards.forEach((board, idx) => {
                if (!cropSelected.has(idx)) {
                    const newIdx = newBoards.length;
                    newBoards.push(board);
                    if (cropSelected.has(idx)) newSelected.add(newIdx);
                }
            });
            window.cropBoards = newBoards;
            cropSelected = newSelected;
            renderCropGallery();
            window.showNotification('Imágenes eliminadas.');
        }
    });
    cropClearAll.addEventListener('click', () => {
        if (confirm('¿Eliminar todos los recortes?')) {
            window.cropBoards = [];
            cropSelected.clear();
            renderCropGallery();
            window.showNotification('Todos los recortes eliminados.');
        }
    });
    cropDownloadAllBtn.addEventListener('click', () => {
        if (window.cropBoards.length === 0) { window.showNotification('No hay recortes.', true); return; }
        window.cropBoards.forEach((board, idx) => {
            setTimeout(() => {
                const link = document.createElement('a');
                link.href = board.dataUrl;
                link.download = `tablero_${idx+1}${board.turno ? '_'+board.turno : ''}.jpg`;
                link.click();
            }, idx * 200);
        });
        window.showNotification('Descargando todas...');
    });
    cropToggleCircle.addEventListener('change', function() {
        includeCircleInDownload = this.checked;
        window.showNotification(includeCircleInDownload ? 'Círculo activado' : 'Círculo desactivado');
    });

    window.renderCropGallery = renderCropGallery;
    window.getCropBoards = () => window.cropBoards;

    // ============ PROCESAR TODAS LAS IMÁGENES ============
    processAllBtn.addEventListener('click', function() {
        if (cropImages.length === 0 || cropBoxes.length === 0) {
            window.showNotification('Carga imágenes y ajusta recuadros primero.', true);
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

    // ============ GUARDAR RECORTE ============
    cropSaveBtn.addEventListener('click', function() {
        if (cropBoxes.length === 0) {
            window.showNotification('No hay recuadros.', true);
            return;
        }
        cropBoxes.forEach(obj => {
            const canvas = document.createElement('canvas');
            canvas.width = obj.w;
            canvas.height = obj.h;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(cropOriginalImage, obj.x, obj.y, obj.w, obj.h, 0, 0, obj.w, obj.h);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
            window.cropBoards.push({ dataUrl, turno: null });
        });
        renderCropGallery();
        window.showNotification(`Guardados ${cropBoxes.length} recortes.`);
        if (cropIndex < cropImages.length - 1) { cropIndex++; loadCropImage(); }
        else { cropGallery.style.display = 'block'; }
    });

    // ============ NAVEGACIÓN ENTRE IMÁGENES SUELTAS ============
    cropPrevBtn.addEventListener('click', () => { if (cropIndex > 0) { cropIndex--; loadCropImage(); } });
    cropNextBtn.addEventListener('click', () => { if (cropIndex < cropImages.length-1) { cropIndex++; loadCropImage(); } });

    // ============ EVENTOS DE PDF ============
    if (pdfPrevPageBtn) pdfPrevPageBtn.addEventListener('click', () => {
        if (cropBoxes.length > 0 && currentPdfPage >= 0) {
            pagePatterns[currentPdfPage] = getCropPattern();
        }
        if (currentPdfPage > 0) loadPdfPage(currentPdfPage - 1);
    });
    if (pdfNextPageBtn) pdfNextPageBtn.addEventListener('click', () => {
        if (cropBoxes.length > 0 && currentPdfPage >= 0) {
            pagePatterns[currentPdfPage] = getCropPattern();
        }
        if (currentPdfPage < pdfPages.length - 1) loadPdfPage(currentPdfPage + 1);
    });
    if (pdfApplyToAllBtn) pdfApplyToAllBtn.addEventListener('click', applyCurrentPatternToAll);
    if (pdfSavePatternBtn) pdfSavePatternBtn.addEventListener('click', saveCurrentPagePattern);

    function saveCurrentPagePattern() {
        const pattern = getCropPattern();
        if (pattern.length === 0) {
            window.showNotification('No hay recuadros en esta página.', true);
            return;
        }
        pagePatterns[currentPdfPage] = pattern;
        window.showNotification(`Patrón guardado para página ${currentPdfPage+1}.`);
    }

    function applyCurrentPatternToAll() {
        const pattern = getCropPattern();
        if (pattern.length === 0) {
            window.showNotification('No hay recuadros para copiar.', true);
            return;
        }
        for (let i = 0; i < pdfPages.length; i++) {
            pagePatterns[i] = JSON.parse(JSON.stringify(pattern));
        }
        window.showNotification('Patrón aplicado a todas las páginas.');
    }

    // ============ MOSTRAR/OCULTAR CUADRÍCULA ============
    if (gridToggle) {
        gridToggle.addEventListener('change', updateGrid);
    }
    window.addEventListener('resize', () => {
        updateCropBoxesVisual(); // actualiza también la cuadrícula
    });

    // ============ INICIALIZAR ============
    function initCropEditor() {
        const container = document.getElementById('cropBoxesContainer');
        if (container) {
            container.innerHTML = '';
            container.style.position = 'absolute';
            container.style.top = '0';
            container.style.left = '0';
            container.style.width = '100%';
            container.style.height = '100%';
            container.style.pointerEvents = 'none';
            container.style.zIndex = '5';
        }
        if (cropContainer) {
            cropContainer.style.position = 'relative';
        }
        if (gridOverlay) {
            gridOverlay.style.position = 'absolute';
            gridOverlay.style.pointerEvents = 'none';
            gridOverlay.style.zIndex = '3';
        }
        updateGrid();
    }

    initCropEditor();

})();
