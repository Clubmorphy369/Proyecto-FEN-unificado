// ============================================
// MÓDULO 2: RECORTE MANUAL CON SOPORTE PARA PDF (MEJORAS)
// ============================================
(function() {
    'use strict';

    // DOM ELEMENTS
    const cropFileInput = document.getElementById('cropFileInput');
    const cropLoadBtn = document.getElementById('cropLoadBtn');
    const cropCounter = document.getElementById('cropCounter');
    const cropEditor = document.getElementById('cropEditor');
    const imageToCrop = document.getElementById('imageToCrop');
    const cropContainer = document.getElementById('cropContainer');
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

    // NUEVOS BOTONES
    const copySizeBtn = document.getElementById('copySizeBtn');
    const pasteSizeToAllBtn = document.getElementById('pasteSizeToAllBtn');
    const duplicateCropBoxBtn = document.getElementById('duplicateCropBoxBtn');

    // PDF CONTROLS
    const pdfControls = document.getElementById('pdfControls');
    const pdfPrevPageBtn = document.getElementById('pdfPrevPageBtn');
    const pdfNextPageBtn = document.getElementById('pdfNextPageBtn');
    const pdfApplyToAllBtn = document.getElementById('pdfApplyToAllBtn');
    const pdfSavePatternBtn = document.getElementById('pdfSavePatternBtn');
    const pdfPageCounter = document.getElementById('pdfPageCounter');

    // VARIABLES
    let cropImages = [];
    let cropIndex = 0;
    window.cropBoards = [];
    let cropSelected = new Set();
    let cropTemplate = null;
    let cropOriginalImage = null;
    let cropOriginalWidth = 0, cropOriginalHeight = 0;
    let cropZoomActive = false;
    let includeCircleInDownload = true;

    // Variables para recuadros
    let cropBoxes = [];
    let activeCropIndex = -1;
    let isDragging = false, isResizing = false, resizeDir = null;
    let startX, startY;

    // Variables para copiar tamaño
    let copiedSize = { w: 0, h: 0 };

    // Variables para PDF
    let pdfPages = [];
    let currentPdfPage = 0;
    let pagePatterns = {};

    // ---------- INICIALIZAR EDITOR ----------
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
    }

    // ---------- FUNCIONES DE RECUADROS ----------
    function addCropBox(x, y, w, h) {
        const container = document.getElementById('cropBoxesContainer');
        if (!container) return;

        // Redondear para evitar decimales
        x = Math.round(x);
        y = Math.round(y);
        w = Math.round(w);
        h = Math.round(h);

        const box = document.createElement('div');
        box.className = 'crop-box';
        box.style.cssText = `
            position: absolute;
            border: 2px solid #f1c40f;
            background: rgba(52,152,219,0.15);
            cursor: move;
            box-shadow: 0 0 0 9999px rgba(0,0,0,0.3);
            pointer-events: auto;
            left: ${x}px;
            top: ${y}px;
            width: ${w}px;
            height: ${h}px;
        `;

        // Handles de redimensionamiento
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
            }
        });
        box.appendChild(deleteBtn);

        // Eventos de arrastre
        box.addEventListener('mousedown', (e) => {
            if (e.target.classList.contains('resize-handle') || e.target === deleteBtn) return;
            e.stopPropagation();
            e.preventDefault();
            activeCropIndex = cropBoxes.findIndex(b => b.element === box);
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            const scale = imageToCrop.width / cropOriginalWidth;
            cropBoxes[activeCropIndex]._startX = parseFloat(box.style.left) / scale || 0;
            cropBoxes[activeCropIndex]._startY = parseFloat(box.style.top) / scale || 0;
        });

        box.querySelectorAll('.resize-handle').forEach(handle => {
            handle.addEventListener('mousedown', (e) => {
                e.stopPropagation();
                e.preventDefault();
                activeCropIndex = cropBoxes.findIndex(b => b.element === box);
                isResizing = true;
                resizeDir = handle.className.split(' ')[1].replace('resize-', '');
                startX = e.clientX;
                startY = e.clientY;
                const scale = imageToCrop.width / cropOriginalWidth;
                const el = cropBoxes[activeCropIndex].element;
                cropBoxes[activeCropIndex]._startX = parseFloat(el.style.left) / scale || 0;
                cropBoxes[activeCropIndex]._startY = parseFloat(el.style.top) / scale || 0;
                cropBoxes[activeCropIndex]._startW = parseFloat(el.style.width) / scale || 0;
                cropBoxes[activeCropIndex]._startH = parseFloat(el.style.height) / scale || 0;
            });
        });

        container.appendChild(box);
        cropBoxes.push({ x, y, w, h, element: box });
        activeCropIndex = cropBoxes.length - 1;
        updateCropBoxesVisual();
    }

    function clearCropBoxes() {
        const container = document.getElementById('cropBoxesContainer');
        if (container) container.innerHTML = '';
        cropBoxes = [];
        activeCropIndex = -1;
    }

    function getCropPattern() {
        return cropBoxes.map(box => ({
            x: Math.round(box.x),
            y: Math.round(box.y),
            w: Math.round(box.w),
            h: Math.round(box.h)
        }));
    }

    function updateCropBoxesVisual() {
        if (!cropOriginalWidth || !cropOriginalHeight) return;
        const scale = imageToCrop.width / cropOriginalWidth;
        cropBoxes.forEach((box, idx) => {
            const el = box.element;
            el.style.left = (box.x * scale) + 'px';
            el.style.top = (box.y * scale) + 'px';
            el.style.width = (box.w * scale) + 'px';
            el.style.height = (box.h * scale) + 'px';
            el.style.borderColor = (idx === activeCropIndex) ? '#2ecc71' : '#f1c40f';
            el.style.borderWidth = (idx === activeCropIndex) ? '3px' : '2px';
        });
    }

    // ---------- EVENTOS DE MOUSE ----------
    document.addEventListener('mousemove', (e) => {
        if (!isDragging && !isResizing) return;
        if (activeCropIndex < 0 || activeCropIndex >= cropBoxes.length) return;
        const box = cropBoxes[activeCropIndex];
        const scale = imageToCrop.width / cropOriginalWidth;
        const dx = (e.clientX - startX) / scale;
        const dy = (e.clientY - startY) / scale;

        if (isDragging) {
            let newX = box._startX + dx;
            let newY = box._startY + dy;
            newX = Math.max(0, Math.min(cropOriginalWidth - box.w, newX));
            newY = Math.max(0, Math.min(cropOriginalHeight - box.h, newY));
            box.x = newX;
            box.y = newY;
        } else if (isResizing) {
            let newW = box._startW;
            let newH = box._startH;
            let newX = box._startX;
            let newY = box._startY;
            if (resizeDir.includes('e')) newW = Math.max(20, box._startW + dx);
            if (resizeDir.includes('w')) { newX = Math.max(0, box._startX + dx); newW = Math.max(20, box._startW - dx); }
            if (resizeDir.includes('s')) newH = Math.max(20, box._startH + dy);
            if (resizeDir.includes('n')) { newY = Math.max(0, box._startY + dy); newH = Math.max(20, box._startH - dy); }
            if (newX + newW > cropOriginalWidth) newW = cropOriginalWidth - newX;
            if (newY + newH > cropOriginalHeight) newH = cropOriginalHeight - newY;
            box.x = newX;
            box.y = newY;
            box.w = newW;
            box.h = newH;
        }
        // Redondear para evitar decimales
        box.x = Math.round(box.x);
        box.y = Math.round(box.y);
        box.w = Math.round(box.w);
        box.h = Math.round(box.h);
        updateCropBoxesVisual();
    });

    document.addEventListener('mouseup', () => {
        isDragging = false;
        isResizing = false;
    });

    // ---------- COPIAR TAMAÑO ----------
    copySizeBtn.addEventListener('click', function() {
        if (activeCropIndex < 0 || activeCropIndex >= cropBoxes.length) {
            window.showNotification('Selecciona un recuadro primero.', true);
            return;
        }
        const box = cropBoxes[activeCropIndex];
        copiedSize.w = box.w;
        copiedSize.h = box.h;
        window.showNotification(`Tamaño copiado: ${box.w}×${box.h}`);
    });

    // ---------- PEGAR TAMAÑO A TODOS ----------
    pasteSizeToAllBtn.addEventListener('click', function() {
        if (copiedSize.w === 0 || copiedSize.h === 0) {
            window.showNotification('Primero copia un tamaño.', true);
            return;
        }
        if (cropBoxes.length === 0) return;
        cropBoxes.forEach(box => {
            box.w = copiedSize.w;
            box.h = copiedSize.h;
            // Ajustar si se sale de la imagen
            if (box.x + box.w > cropOriginalWidth) box.w = cropOriginalWidth - box.x;
            if (box.y + box.h > cropOriginalHeight) box.h = cropOriginalHeight - box.y;
        });
        updateCropBoxesVisual();
        window.showNotification(`Tamaño ${copiedSize.w}×${copiedSize.h} aplicado a todos los recuadros.`);
    });

    // ---------- DUPLICAR RECUADRO ----------
    duplicateCropBoxBtn.addEventListener('click', function() {
        if (activeCropIndex < 0 || activeCropIndex >= cropBoxes.length) {
            window.showNotification('Selecciona un recuadro para duplicar.', true);
            return;
        }
        const src = cropBoxes[activeCropIndex];
        // Desplazar ligeramente el nuevo recuadro
        const offset = 20;
        let newX = src.x + offset;
        let newY = src.y + offset;
        // Si se sale, intentar en otra dirección
        if (newX + src.w > cropOriginalWidth) newX = src.x - offset;
        if (newY + src.h > cropOriginalHeight) newY = src.y - offset;
        // Si aún se sale, centrar
        if (newX < 0) newX = Math.floor((cropOriginalWidth - src.w) / 2);
        if (newY < 0) newY = Math.floor((cropOriginalHeight - src.h) / 2);
        addCropBox(newX, newY, src.w, src.h);
        window.showNotification('Recuadro duplicado.');
    });

    // ---------- CARGAR IMÁGENES SUELTAS ----------
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
            const img = new Image();
            img.onload = function() {
                cropOriginalImage = img;
                cropOriginalWidth = img.width;
                cropOriginalHeight = img.height;
                imageToCrop.src = e.target.result;
                if (cropBoxes.length === 0) {
                    const w = Math.floor(cropOriginalWidth * 0.6);
                    const h = Math.floor(cropOriginalHeight * 0.6);
                    const x = Math.floor((cropOriginalWidth - w) / 2);
                    const y = Math.floor((cropOriginalHeight - h) / 2);
                    addCropBox(x, y, w, h);
                }
                cropSaveBtn.disabled = false;
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(cropImages[cropIndex]);
        cropCounter.textContent = `Imagen ${cropIndex+1} de ${cropImages.length}`;
        cropPrevBtn.disabled = cropIndex === 0;
        cropNextBtn.disabled = cropIndex === cropImages.length - 1;
    }

    // ---------- PROCESAR TODAS LAS IMÁGENES (SUELTAS) ----------
    processAllBtn.addEventListener('click', function() {
        if (cropImages.length === 0 || cropBoxes.length === 0) {
            window.showNotification('Carga imágenes y ajusta recuadros primero.', true);
            return;
        }
        let processed = 0;
        const total = cropImages.length;
        window.showNotification(`Procesando ${total} imágenes con ${cropBoxes.length} recuadros...`);

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
                    cropBoxes.forEach(box => {
                        const x = Math.round(box.x * scaleX);
                        const y = Math.round(box.y * scaleY);
                        const w = Math.max(10, Math.round(box.w * scaleX));
                        const h = Math.max(10, Math.round(box.h * scaleY));
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

    // ---------- GUARDAR RECORTE (IMÁGENES SUELTAS) ----------
    cropSaveBtn.addEventListener('click', function() {
        if (cropBoxes.length === 0) {
            window.showNotification('No hay recuadros.', true);
            return;
        }
        cropBoxes.forEach(box => {
            const canvas = document.createElement('canvas');
            canvas.width = box.w;
            canvas.height = box.h;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(cropOriginalImage, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
            window.cropBoards.push({ dataUrl, turno: null });
        });
        renderCropGallery();
        window.showNotification(`Guardados ${cropBoxes.length} recortes.`);
        if (cropIndex < cropImages.length - 1) { cropIndex++; loadCropImage(); }
        else { cropGallery.style.display = 'block'; }
    });

    // ---------- NAVEGACIÓN ENTRE IMÁGENES (SUELTAS) ----------
    cropPrevBtn.addEventListener('click', () => { if (cropIndex > 0) { cropIndex--; loadCropImage(); } });
    cropNextBtn.addEventListener('click', () => { if (cropIndex < cropImages.length-1) { cropIndex++; loadCropImage(); } });

    // ---------- PLANTILLAS ----------
    cropTemplateSaveBtn.addEventListener('click', function() {
        if (!cropOriginalWidth || !cropOriginalHeight) return;
        const pattern = getCropPattern();
        if (pattern.length === 0) { window.showNotification('No hay recuadros.', true); return; }
        cropTemplate = pattern.map(box => ({
            x: box.x / cropOriginalWidth,
            y: box.y / cropOriginalHeight,
            w: box.w / cropOriginalWidth,
            h: box.h / cropOriginalHeight
        }));
        cropTemplateApplyBtn.disabled = false;
        window.showNotification('Plantilla guardada (proporcional).');
    });

    cropTemplateApplyBtn.addEventListener('click', function() {
        if (!cropTemplate || !cropOriginalWidth) return;
        clearCropBoxes();
        cropTemplate.forEach(t => {
            const x = Math.round(t.x * cropOriginalWidth);
            const y = Math.round(t.y * cropOriginalHeight);
            const w = Math.max(10, Math.round(t.w * cropOriginalWidth));
            const h = Math.max(10, Math.round(t.h * cropOriginalHeight));
            addCropBox(x, y, w, h);
        });
        window.showNotification('Plantilla aplicada.');
    });

    // ---------- FUNCIONES PARA PDF ----------
    function loadPdfPage(pageIndex) {
        if (!pdfPages.length || pageIndex < 0 || pageIndex >= pdfPages.length) return;
        currentPdfPage = pageIndex;
        const img = new Image();
        img.onload = function() {
            cropOriginalImage = img;
            cropOriginalWidth = img.width;
            cropOriginalHeight = img.height;
            imageToCrop.src = pdfPages[pageIndex];
            clearCropBoxes();
            if (pagePatterns[pageIndex]) {
                pagePatterns[pageIndex].forEach(box => addCropBox(box.x, box.y, box.w, box.h));
            } else {
                // Patrón por defecto: grid 3x2 con margen
                const cols = 2, rows = 3;
                const cellW = Math.floor(img.width / cols);
                const cellH = Math.floor(img.height / rows);
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
        };
        img.onerror = function(e) {
            console.error('[ERROR] Error al cargar la imagen:', e);
        };
        img.src = pdfPages[pageIndex];
    }

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

    // ---------- EVENTOS DE PDF ----------
    if (pdfPrevPageBtn) pdfPrevPageBtn.addEventListener('click', () => {
        if (currentPdfPage > 0) loadPdfPage(currentPdfPage - 1);
    });
    if (pdfNextPageBtn) pdfNextPageBtn.addEventListener('click', () => {
        if (currentPdfPage < pdfPages.length - 1) loadPdfPage(currentPdfPage + 1);
    });
    if (pdfApplyToAllBtn) pdfApplyToAllBtn.addEventListener('click', applyCurrentPatternToAll);
    if (pdfSavePatternBtn) pdfSavePatternBtn.addEventListener('click', saveCurrentPagePattern);

    // ---------- EXPONER FUNCIONES ----------
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
        return pagePatterns;
    };

    // ---------- RENDER GALERÍA ----------
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

    // ---------- EVENTOS DE GALERÍA ----------
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
            const indices = Array.from(cropSelected).sort((a,b)=>a-b);
            let shift = 0;
            window.cropBoards.forEach((board, idx) => {
                if (cropSelected.has(idx)) { shift++; }
                else {
                    const newIdx = idx - shift;
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

    initCropEditor();
})();
