// ============================================
// MÓDULO 2: RECORTE MANUAL
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

    // Inicializar la caja de recorte
    function initCropBox() {
        cropBox = document.querySelector('.crop-box');
        if (!cropBox) return;
        cropBox.classList.add('hidden');
    }

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

    cropSaveBtn.addEventListener('click', function() {
        const dataUrl = getCropDataUrl();
        if (!dataUrl) { window.showNotification('Error al recortar', true); return; }
        window.cropBoards.push({ dataUrl, turno: null });
        renderCropGallery();
        window.showNotification('Recorte guardado');
        if (cropIndex < cropImages.length - 1) { cropIndex++; loadCropImage(); }
        else { cropGallery.style.display = 'block'; }
    });

    cropPrevBtn.addEventListener('click', function() { if (cropIndex > 0) { cropIndex--; loadCropImage(); } });
    cropNextBtn.addEventListener('click', function() { if (cropIndex < cropImages.length-1) { cropIndex++; loadCropImage(); } });

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
            info.appendChild(badge);
            info.appendChild(label);
            info.appendChild(cb);

            img.addEventListener('click', function(e) {
                e.stopPropagation();
                const turnos = [null, 'white', 'black'];
                let idxTurno = turnos.indexOf(board.turno);
                idxTurno = (idxTurno + 1) % turnos.length;
                board.turno = turnos[idxTurno];
                renderCropGallery();
                // Actualizar vista previa PDF si está disponible
                if (window.updatePdfPreview) window.updatePdfPreview();
            });

            div.appendChild(img);
            div.appendChild(info);
            cropGalleryGrid.appendChild(div);
        });
        // Notificar al módulo PDF que hay cambios
        if (window.updatePdfPreview) window.updatePdfPreview();
    }

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
    cropClearAll.addEventListener('click', function() {
        if (confirm('¿Eliminar todos los recortes?')) {
            window.cropBoards = [];
            cropSelected.clear();
            renderCropGallery();
            window.showNotification('Todos los recortes eliminados');
        }
    });

    // Exponer funciones para otros módulos
    window.renderCropGallery = renderCropGallery;
    window.getCropBoards = () => window.cropBoards;

    // Inicializar
    initCropBox();
})();