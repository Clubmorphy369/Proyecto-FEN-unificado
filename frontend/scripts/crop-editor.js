// ============================================
// MÓDULO 2: RECORTE MANUAL (CON CÍRCULO DE TURNO Y SELECTIVIDAD)
// ============================================
(function() {
    'use strict';

    const cropFileInput = document.getElementById('cropFileInput');
    const cropLoadBtn = document.getElementById('cropLoadBtn');
    const cropCounter = document.getElementById('cropCounter');
    const cropEditor = document.getElementById('cropEditor');
    const imageToCrop = document.getElementById('imageToCrop');
    const cropX = document.getElementById('cropX');
    const cropY = document.getElementById('cropY');
    const cropW = document.getElementById('cropW');
    const cropH = document.getElementById('cropH');
    const cropApplyBtn = document.getElementById('cropApplyBtn');
    const cropZoomBtn = document.getElementById('cropZoomBtn');
    const cropSaveBtn = document.getElementById('cropSaveBtn');
    const cropPrevBtn = document.getElementById('cropPrevBtn');
    const cropNextBtn = document.getElementById('cropNextBtn');
    const cropTemplateSaveBtn = document.getElementById('cropTemplateSaveBtn');
    const cropTemplateApplyBtn = document.getElementById('cropTemplateApplyBtn');
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

    let cropImages = [];
    let cropIndex = 0;
    window.cropBoards = []; // { dataUrl, turno: 'white'|'black'|null }
    let cropSelected = new Set();
    let cropTemplate = null;
    let cropOriginalImage = null;
    let cropOriginalWidth = 0, cropOriginalHeight = 0;
    let cropBox = null;
    let isDragging = false, isResizing = false, resizeDir = null;
    let startX, startY;
    let cropBoxX = 0, cropBoxY = 0, cropBoxW = 200, cropBoxH = 200;
    let cropZoomActive = false;
    let includeCircleInDownload = true; // por defecto activado

    // ---------- INICIALIZAR CAJA DE RECORTE ----------
    function initCropBox() {
        cropBox = document.querySelector('.crop-box');
        if (!cropBox) return;
        cropBox.classList.add('hidden');
    }

    // ---------- CARGAR IMÁGENES ----------
    cropLoadBtn.addEventListener('click', function() {
        const files = cropFileInput.files;
        if (!files.length) {
            window.showNotification('Selecciona imágenes.', true);
            return;
        }
        cropImages = Array.from(files);
        cropIndex = 0;
        cropEditor.style.display = 'block';
        loadCropImage();
    });

    function loadCropImage() {
        if (!cropImages.length) return;
        const reader = new FileReader();
        reader.onload = function(e) {
            const img = new Image();
            img.onload = function() {
                cropOriginalImage = img;
                cropOriginalWidth = img.width;
                cropOriginalHeight = img.height;
                imageToCrop.src = e.target.result;
                if (cropBoxW === 200 && cropBoxH === 200) {
                    cropBoxW = Math.floor(cropOriginalWidth * 0.6);
                    cropBoxH = Math.floor(cropOriginalHeight * 0.6);
                    cropBoxX = Math.floor((cropOriginalWidth - cropBoxW) / 2);
                    cropBoxY = Math.floor((cropOriginalHeight - cropBoxH) / 2);
                }
                syncCropUI();
                cropBox.classList.remove('hidden');
                cropSaveBtn.disabled = false;
                attachCropEvents();
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(cropImages[cropIndex]);
        cropCounter.textContent = `Imagen ${cropIndex+1} de ${cropImages.length}`;
        cropPrevBtn.disabled = cropIndex === 0;
        cropNextBtn.disabled = cropIndex === cropImages.length - 1;
    }

    // ---------- SINCronizar UI ----------
    function syncCropUI() {
        cropX.value = Math.round(cropBoxX);
        cropY.value = Math.round(cropBoxY);
        cropW.value = Math.round(cropBoxW);
        cropH.value = Math.round(cropBoxH);
        updateCropBoxVisual();
    }

    function updateCropBoxVisual() {
        if (!cropBox) return;
        const scale = imageToCrop.width / cropOriginalWidth;
        cropBox.style.left = (cropBoxX * scale) + 'px';
        cropBox.style.top = (cropBoxY * scale) + 'px';
        cropBox.style.width = (cropBoxW * scale) + 'px';
        cropBox.style.height = (cropBoxH * scale) + 'px';
    }

    // ---------- EVENTOS DE ARRASTRE ----------
    function attachCropEvents() {
        if (!cropBox) return;
        cropBox.removeEventListener('mousedown', startDrag);
        cropBox.querySelectorAll('.resize-handle').forEach(h => h.removeEventListener('mousedown', startResize));
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', stopInteraction);
        cropBox.addEventListener('mousedown', startDrag);
        cropBox.querySelectorAll('.resize-handle').forEach(h => h.addEventListener('mousedown', startResize));
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', stopInteraction);
    }

    function startDrag(e) { if (e.target.classList.contains('resize-handle')) return; isDragging = true; startX = e.clientX; startY = e.clientY; }
    function startResize(e) { isResizing = true; resizeDir = e.target.classList[1]; startX = e.clientX; startY = e.clientY; }

    function onMouseMove(e) {
        if (!isDragging && !isResizing) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        const scale = imageToCrop.width / cropOriginalWidth;
        if (isDragging) {
            let newX = cropBoxX + dx/scale;
            let newY = cropBoxY + dy/scale;
            if (newX >= 0 && newX + cropBoxW <= cropOriginalWidth) cropBoxX = newX;
            if (newY >= 0 && newY + cropBoxH <= cropOriginalHeight) cropBoxY = newY;
            cropBoxX = Math.round(cropBoxX);
            cropBoxY = Math.round(cropBoxY);
        } else {
            let deltaW = 0, deltaH = 0;
            if (resizeDir.includes('w')) deltaW = -dx/scale;
            if (resizeDir.includes('e')) deltaW = dx/scale;
            if (resizeDir.includes('n')) deltaH = -dy/scale;
            if (resizeDir.includes('s')) deltaH = dy/scale;
            let newW = cropBoxW + deltaW;
            let newH = cropBoxH + deltaH;
            let newX = cropBoxX;
            let newY = cropBoxY;
            if (resizeDir.includes('w')) newX = cropBoxX + deltaW;
            if (resizeDir.includes('n')) newY = cropBoxY + deltaH;
            if (newW >= 20 && newX >= 0 && newX + newW <= cropOriginalWidth) { cropBoxW = Math.round(newW); cropBoxX = Math.round(newX); }
            if (newH >= 20 && newY >= 0 && newY + newH <= cropOriginalHeight) { cropBoxH = Math.round(newH); cropBoxY = Math.round(newY); }
        }
        syncCropUI();
        startX = e.clientX;
        startY = e.clientY;
    }
    function stopInteraction() { isDragging = false; isResizing = false; }

    // ---------- ACCIONES DE RECORTE ----------
    cropApplyBtn.addEventListener('click', function() {
        let x = parseInt(cropX.value) || 0;
        let y = parseInt(cropY.value) || 0;
        let w = parseInt(cropW.value) || 100;
        let h = parseInt(cropH.value) || 100;
        if (x + w > cropOriginalWidth) w = cropOriginalWidth - x;
        if (y + h > cropOriginalHeight) h = cropOriginalHeight - y;
        if (x < 0) x = 0;
        if (y < 0) y = 0;
        if (w < 10) w = 10;
        if (h < 10) h = 10;
        cropBoxX = x; cropBoxY = y; cropBoxW = w; cropBoxH = h;
        syncCropUI();
        window.showNotification('Recorte aplicado');
    });

    cropZoomBtn.addEventListener('click', function() {
        cropZoomActive = !cropZoomActive;
        if (cropZoomActive) {
            imageToCrop.style.maxWidth = 'none';
            imageToCrop.style.width = cropOriginalWidth + 'px';
            imageToCrop.style.height = 'auto';
            cropZoomBtn.textContent = 'Zoom normal';
        } else {
            imageToCrop.style.maxWidth = '100%';
            imageToCrop.style.width = 'auto';
            cropZoomBtn.textContent = 'Zoom 100%';
        }
        setTimeout(updateCropBoxVisual, 50);
    });

    function getCropDataUrl() {
        if (!cropOriginalImage || cropBoxW <= 0 || cropBoxH <= 0) return null;
        const canvas = document.createElement('canvas');
        canvas.width = cropBoxW;
        canvas.height = cropBoxH;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(cropOriginalImage, cropBoxX, cropBoxY, cropBoxW, cropBoxH, 0, 0, cropBoxW, cropBoxH);
        return canvas.toDataURL('image/jpeg', 0.92);
    }

    // ---------- DIBUJAR CÍRCULO DE TURNO ----------
    function addTurnCircle(dataUrl, turno, callback) {
        if (!turno || !includeCircleInDownload) {
            callback(dataUrl);
            return;
        }
        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            const circleSize = Math.max(20, Math.min(40, Math.floor(img.width / 15)));
            const padding = 10;
            const x = img.width - circleSize - padding;
            const y = img.height - circleSize - padding;
            ctx.beginPath();
            ctx.arc(x + circleSize/2, y + circleSize/2, circleSize/2, 0, 2 * Math.PI);
            ctx.fillStyle = turno === 'white' ? '#ffffff' : '#000000';
            ctx.fill();
            ctx.strokeStyle = '#333333';
            ctx.lineWidth = 2;
            ctx.stroke();
            callback(canvas.toDataURL('image/jpeg', 0.92));
        };
        img.src = dataUrl;
    }

    // ---------- GUARDAR RECORTE ----------
    cropSaveBtn.addEventListener('click', function() {
        const dataUrl = getCropDataUrl();
        if (!dataUrl) { window.showNotification('Error al recortar', true); return; }
        window.cropBoards.push({ dataUrl, turno: null });
        renderCropGallery();
        window.showNotification(`Recorte guardado. Asigna turno en la galería.`);
        if (cropIndex < cropImages.length - 1) { cropIndex++; loadCropImage(); }
        else { cropGallery.style.display = 'block'; }
    });

    // ---------- NAVEGACIÓN ENTRE IMÁGENES ----------
    cropPrevBtn.addEventListener('click', function() { if (cropIndex > 0) { cropIndex--; loadCropImage(); } });
    cropNextBtn.addEventListener('click', function() { if (cropIndex < cropImages.length-1) { cropIndex++; loadCropImage(); } });

    // ---------- PLANTILLAS ----------
    cropTemplateSaveBtn.addEventListener('click', function() {
        if (cropOriginalWidth && cropOriginalHeight) {
            cropTemplate = {
                x: cropBoxX / cropOriginalWidth,
                y: cropBoxY / cropOriginalHeight,
                w: cropBoxW / cropOriginalWidth,
                h: cropBoxH / cropOriginalHeight
            };
            cropTemplateApplyBtn.disabled = false;
            window.showNotification('Plantilla guardada');
        }
    });

    cropTemplateApplyBtn.addEventListener('click', function() {
        if (!cropTemplate || !cropOriginalWidth) return;
        cropBoxX = cropTemplate.x * cropOriginalWidth;
        cropBoxY = cropTemplate.y * cropOriginalHeight;
        cropBoxW = cropTemplate.w * cropOriginalWidth;
        cropBoxH = cropTemplate.h * cropOriginalHeight;
        cropBoxX = Math.round(cropBoxX);
        cropBoxY = Math.round(cropBoxY);
        cropBoxW = Math.max(10, Math.round(cropBoxW));
        cropBoxH = Math.max(10, Math.round(cropBoxH));
        syncCropUI();
        window.showNotification('Plantilla aplicada');
    });

    // ---------- PROCESAR TODAS LAS IMÁGENES ----------
    processAllBtn.addEventListener('click', function() {
        if (cropImages.length === 0) {
            window.showNotification('Primero carga imágenes.', true);
            return;
        }
        if (!cropOriginalImage) {
            window.showNotification('Ajusta el recorte en la imagen actual.', true);
            return;
        }
        if (!cropTemplate) {
            cropTemplate = {
                x: cropBoxX / cropOriginalWidth,
                y: cropBoxY / cropOriginalHeight,
                w: cropBoxW / cropOriginalWidth,
                h: cropBoxH / cropOriginalHeight
            };
            cropTemplateApplyBtn.disabled = false;
        }
        let processed = 0;
        const total = cropImages.length;
        window.showNotification(`Procesando ${total} imágenes...`);

        function processNext(idx) {
            if (idx >= total) {
                window.showNotification(`¡Procesadas ${total} imágenes! Ahora asigna turnos en la galería.`);
                renderCropGallery();
                return;
            }
            const reader = new FileReader();
            reader.onload = function(e) {
                const img = new Image();
                img.onload = function() {
                    const w = img.width;
                    const h = img.height;
                    const cropX = Math.round(cropTemplate.x * w);
                    const cropY = Math.round(cropTemplate.y * h);
                    const cropW = Math.max(10, Math.round(cropTemplate.w * w));
                    const cropH = Math.max(10, Math.round(cropTemplate.h * h));
                    const canvas = document.createElement('canvas');
                    canvas.width = cropW;
                    canvas.height = cropH;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
                    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
                    window.cropBoards.push({ dataUrl, turno: null });
                    processed++;
                    processNext(idx + 1);
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(cropImages[idx]);
        }
        processNext(0);
    });

    // ---------- RENDERIZAR GALERÍA ----------
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
            img.alt = 'Tablero '+(idx+1);
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
                addTurnCircle(board.dataUrl, board.turno, (finalUrl) => {
                    const link = document.createElement('a');
                    link.href = finalUrl;
                    link.download = `tablero_${idx+1}${board.turno ? '_'+board.turno : ''}.jpg`;
                    link.click();
                });
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

    // ---------- EVENTOS DE GALERÍA ----------
    cropSelectAll.addEventListener('click', function() {
        for (let i = 0; i < window.cropBoards.length; i++) cropSelected.add(i);
        renderCropGallery();
    });
    cropDeselectAll.addEventListener('click', function() {
        cropSelected.clear();
        renderCropGallery();
    });
    cropBatchWhite.addEventListener('click', function() {
        for (let i = 0; i < window.cropBoards.length; i++) {
            if (cropSelected.has(i)) window.cropBoards[i].turno = 'white';
            else window.cropBoards[i].turno = 'black';
        }
        renderCropGallery();
        window.showNotification('Blancas asignadas a seleccionados, Negras al resto');
    });
    cropBatchBlack.addEventListener('click', function() {
        for (let i = 0; i < window.cropBoards.length; i++) {
            if (cropSelected.has(i)) window.cropBoards[i].turno = 'black';
            else window.cropBoards[i].turno = 'white';
        }
        renderCropGallery();
        window.showNotification('Negras asignadas a seleccionados, Blancas al resto');
    });

    // ---------- ELIMINAR SELECCIONADAS ----------
    cropDeleteSelectedBtn.addEventListener('click', function() {
        if (cropSelected.size === 0) {
            window.showNotification('No hay imágenes seleccionadas.', true);
            return;
        }
        if (confirm(`¿Eliminar ${cropSelected.size} imágenes seleccionadas?`)) {
            const newBoards = [];
            const newSelected = new Set();
            const oldIndices = Array.from(cropSelected).sort((a,b)=>a-b);
            let shift = 0;
            window.cropBoards.forEach((board, idx) => {
                if (cropSelected.has(idx)) {
                    shift++;
                } else {
                    const newIdx = idx - shift;
                    newBoards.push(board);
                    if (cropSelected.has(idx)) {
                        newSelected.add(newIdx);
                    }
                }
            });
            window.cropBoards = newBoards;
            cropSelected = newSelected;
            renderCropGallery();
            window.showNotification('Imágenes eliminadas.');
        }
    });

    // ---------- ELIMINAR TODAS ----------
    cropClearAll.addEventListener('click', function() {
        if (confirm('¿Eliminar todos los recortes?')) {
            window.cropBoards = [];
            cropSelected.clear();
            renderCropGallery();
            window.showNotification('Todos los recortes eliminados');
        }
    });

    // ---------- DESCARGAR TODAS ----------
    cropDownloadAllBtn.addEventListener('click', function() {
        if (window.cropBoards.length === 0) {
            window.showNotification('No hay recortes para descargar', true);
            return;
        }
        window.cropBoards.forEach((board, idx) => {
            setTimeout(() => {
                addTurnCircle(board.dataUrl, board.turno, (finalUrl) => {
                    const link = document.createElement('a');
                    link.href = finalUrl;
                    link.download = `tablero_${idx+1}${board.turno ? '_'+board.turno : ''}.jpg`;
                    link.click();
                });
            }, idx * 200);
        });
        window.showNotification('Descargando todas las imágenes...');
    });

    // ---------- TOGGLE CÍRCULO ----------
    cropToggleCircle.addEventListener('change', function() {
        includeCircleInDownload = this.checked;
        window.showNotification(includeCircleInDownload ? 'Círculo de turno activado' : 'Círculo de turno desactivado');
    });

    // Exponer funciones para otros módulos
    window.renderCropGallery = renderCropGallery;
    window.getCropBoards = () => window.cropBoards;

    initCropBox();
})();
