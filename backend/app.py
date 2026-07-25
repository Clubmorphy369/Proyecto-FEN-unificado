import os
import tempfile
import requests
import base64
import cv2
import numpy as np
from flask import Flask, request, jsonify, send_from_directory, Response
from werkzeug.utils import secure_filename
from pdf2image import convert_from_bytes
from PIL import Image
import io
import traceback
import shutil
from datetime import datetime, timezone
import re

app = Flask(__name__)

app.config['MAX_CONTENT_LENGTH'] = 100 * 1024 * 1024
UPLOAD_FOLDER = tempfile.mkdtemp()
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.join(BASE_DIR, '..', 'frontend')

def clean_fen(raw_fen):
    if not raw_fen:
        return None
    fen = raw_fen.replace('_', ' ')
    parts = fen.split()
    if len(parts) >= 6:
        return ' '.join(parts[:6])
    return None

# ===== DETECCIÓN POR COLOR (para StepChess y similares) =====
def detect_board_by_color(image):
    """
    Detecta el tablero por color (casillas claras y oscuras).
    Funciona bien cuando el tablero tiene colores contrastantes.
    """
    try:
        hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
        # Rango de colores para casillas claras (blanco, beige, etc.)
        lower_light = np.array([0, 0, 150])
        upper_light = np.array([180, 50, 255])
        mask_light = cv2.inRange(hsv, lower_light, upper_light)

        # Rango de colores para casillas oscuras (marrón, gris oscuro)
        lower_dark = np.array([0, 0, 0])
        upper_dark = np.array([180, 255, 80])
        mask_dark = cv2.inRange(hsv, lower_dark, upper_dark)

        # Combinar ambas máscaras
        mask = cv2.bitwise_or(mask_light, mask_dark)

        # Morfología para conectar áreas
        kernel = np.ones((5, 5), np.uint8)
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, iterations=2)
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel, iterations=1)

        # Encontrar contornos
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not contours:
            return None

        # Buscar el contorno más grande que sea aproximadamente cuadrado
        h, w = image.shape[:2]
        best_rect = None
        max_area = 0
        for cnt in contours:
            area = cv2.contourArea(cnt)
            if area < 1000:
                continue
            peri = cv2.arcLength(cnt, True)
            approx = cv2.approxPolyDP(cnt, 0.02 * peri, True)
            if len(approx) == 4:
                x, y, w_box, h_box = cv2.boundingRect(cnt)
                aspect = w_box / h_box
                if 0.5 < aspect < 1.5:  # Permitir relación de aspecto más flexible
                    if area > max_area:
                        max_area = area
                        best_rect = (x, y, w_box, h_box)

        if best_rect:
            x, y, w_box, h_box = best_rect
            margin = 15
            x1 = max(0, x - margin)
            y1 = max(0, y - margin)
            x2 = min(w, x + w_box + margin)
            y2 = min(h, y + h_box + margin)
            print("[INFO] Tablero detectado por color")
            return image[y1:y2, x1:x2]
    except Exception as e:
        print(f"[WARN] Detección por color falló: {e}")
    return None

# ===== DETECCIÓN POR CONTORNOS (original) =====
def detect_board_contours(image):
    try:
        h, w = image.shape[:2]
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8,8))
        gray_eq = clahe.apply(gray)
        thresh = cv2.adaptiveThreshold(gray_eq, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                                       cv2.THRESH_BINARY, 15, 2)
        kernel = np.ones((5, 5), np.uint8)
        thresh = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel, iterations=2)
        thresh = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, kernel, iterations=1)
        contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        best_rect = None
        max_area = 0
        min_area = 5000
        for cnt in contours:
            area = cv2.contourArea(cnt)
            if area < min_area:
                continue
            peri = cv2.arcLength(cnt, True)
            approx = cv2.approxPolyDP(cnt, 0.02 * peri, True)
            if len(approx) == 4:
                x, y, w_box, h_box = cv2.boundingRect(cnt)
                aspect = w_box / h_box
                if 0.7 < aspect < 1.3:
                    if area > max_area:
                        max_area = area
                        best_rect = (x, y, w_box, h_box)
        if best_rect:
            x, y, w_box, h_box = best_rect
            margin = 10
            x1 = max(0, x - margin)
            y1 = max(0, y - margin)
            x2 = min(w, x + w_box + margin)
            y2 = min(h, y + h_box + margin)
            return image[y1:y2, x1:x2]
    except Exception as e:
        print(f"[WARN] Contornos falló: {e}")
    return None

# ===== DETECCIÓN CON findChessboardCorners =====
def detect_board_chessboard(image):
    try:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        ret, corners = cv2.findChessboardCorners(gray, (8, 8), None)
        if ret:
            corners = corners.reshape(-1, 2)
            x_min = int(np.min(corners[:, 0]))
            x_max = int(np.max(corners[:, 0]))
            y_min = int(np.min(corners[:, 1]))
            y_max = int(np.max(corners[:, 1]))
            margin = 15
            h, w = image.shape[:2]
            x1 = max(0, x_min - margin)
            y1 = max(0, y_min - margin)
            x2 = min(w, x_max + margin)
            y2 = min(h, y_max + margin)
            return image[y1:y2, x1:x2]
    except Exception as e:
        print(f"[WARN] findChessboardCorners falló: {e}")
    return None

# ===== FUNCIÓN PRINCIPAL DE DETECCIÓN =====
def detect_board(image):
    """
    Detecta el tablero usando múltiples métodos en orden:
    1. Por color (para StepChess y similares)
    2. Contornos (para capturas de Lichess)
    3. findChessboardCorners (para imágenes nítidas)
    4. Recorte central ampliado (fallback)
    """
    # 1. Por color (mejor para StepChess)
    board = detect_board_by_color(image)
    if board is not None:
        print("[INFO] Tablero detectado por color")
        return board

    # 2. Contornos
    board = detect_board_contours(image)
    if board is not None:
        print("[INFO] Tablero detectado por contornos")
        return board

    # 3. findChessboardCorners
    board = detect_board_chessboard(image)
    if board is not None:
        print("[INFO] Tablero detectado por findChessboardCorners")
        return board

    # 4. Fallback: recorte central ampliado (85% en lugar de 75%)
    h, w = image.shape[:2]
    size = min(h, w)
    crop_size = int(size * 0.85)  # Más amplio para capturar mejor
    center_x = w // 2
    center_y = h // 2
    half = crop_size // 2
    x1 = max(0, center_x - half)
    y1 = max(0, center_y - half)
    x2 = min(w, center_x + half)
    y2 = min(h, center_y + half)
    print("[INFO] Usando recorte central ampliado (85%) como fallback")
    return image[y1:y2, x1:x2]

def split_grid(image, rows=3, cols=2, margin=10):
    try:
        h, w = image.shape[:2]
        cell_h = h // rows
        cell_w = w // cols
        cropped = []
        for r in range(rows):
            for c in range(cols):
                x1 = c * cell_w
                y1 = r * cell_h
                x2 = (c + 1) * cell_w
                y2 = (r + 1) * cell_h
                x1c = max(0, x1 + margin)
                y1c = max(0, y1 + margin)
                x2c = min(w, x2 - margin)
                y2c = min(h, y2 - margin)
                if x2c > x1c and y2c > y1c:
                    crop = image[y1c:y2c, x1c:x2c]
                    cropped.append(crop)
        return cropped
    except Exception as e:
        print(f"[ERROR] split_grid: {e}")
        return []

def detect_boards_in_image(image_bytes, use_grid=False):
    try:
        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img is None:
            return [image_bytes]
        if use_grid:
            result = split_grid(img, rows=3, cols=2, margin=10)
            if result:
                return result
            return [img]
        return [img]
    except Exception as e:
        print(f"[ERROR] detect_boards_in_image: {e}")
        return [image_bytes]

def process_image_to_fen_and_thumbnail(image_bytes):
    try:
        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img is None:
            return None, None, "No se pudo decodificar la imagen"

        board_img = detect_board(img)
        if board_img is None or board_img.size == 0:
            return None, None, "No se pudo detectar tablero"
        print(f"[INFO] Recorte obtenido: {board_img.shape}")

        # Generar miniatura
        h, w = board_img.shape[:2]
        size = 200
        scale = min(size / w, size / h) if w > 0 and h > 0 else 1.0
        new_w = max(1, int(w * scale))
        new_h = max(1, int(h * scale))
        resized = cv2.resize(board_img, (new_w, new_h), interpolation=cv2.INTER_AREA)
        canvas = np.ones((size, size, 3), dtype=np.uint8) * 255
        x_offset = (size - new_w) // 2
        y_offset = (size - new_h) // 2
        canvas[y_offset:y_offset+new_h, x_offset:x_offset+new_w] = resized
        _, buffer = cv2.imencode('.jpg', canvas, [int(cv2.IMWRITE_JPEG_QUALITY), 85])
        thumbnail_b64 = base64.b64encode(buffer).decode('utf-8')

        # Enviar a Chessvision.ai
        _, board_bytes = cv2.imencode('.jpg', board_img)
        board_bytes = board_bytes.tobytes()
        img_pil = Image.open(io.BytesIO(board_bytes))
        if img_pil.size[0] > 1000 or img_pil.size[1] > 1000:
            img_pil.thumbnail((1000, 1000))
            buffer_pil = io.BytesIO()
            img_pil.save(buffer_pil, format='JPEG', quality=80)
            board_bytes = buffer_pil.getvalue()

        encoded_string = base64.b64encode(board_bytes).decode('utf-8')
        payload = {
            "board_orientation": "predict",
            "cropped": False,
            "current_player": "white",
            "image": f"data:image/jpeg;base64,{encoded_string}",
            "predict_turn": True
        }
        response = requests.post('http://app.chessvision.ai/predict', json=payload, timeout=15)
        print(f"[DEBUG] Chessvision.ai status: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            if data.get('success'):
                raw_fen = data.get('result')
                fen = clean_fen(raw_fen)
                if fen:
                    return thumbnail_b64, fen, None
                else:
                    return thumbnail_b64, None, f"FEN inválido: {raw_fen}"
            else:
                return thumbnail_b64, None, f"Chessvision.ai falló: {data.get('message', '')}"
        else:
            return thumbnail_b64, None, f"Chessvision.ai error HTTP {response.status_code}"
    except Exception as e:
        print(f"[ERROR] process_image_to_fen_and_thumbnail: {traceback.format_exc()}")
        return None, None, str(e)

# ===== ENDPOINTS =====
@app.route('/')
def index():
    return send_from_directory(FRONTEND_DIR, 'index.html')

@app.route('/<path:filename>')
def static_files(filename):
    return send_from_directory(FRONTEND_DIR, filename)

@app.route('/upload', methods=['POST'])
def upload_files():
    try:
        if 'files' not in request.files:
            return jsonify({'error': 'No se enviaron archivos'}), 400
        files = request.files.getlist('files')
        if not files:
            return jsonify({'error': 'No se seleccionaron archivos'}), 400

        pages_str = request.form.get('pages', '')
        selected_pages = []
        if pages_str:
            try:
                selected_pages = [int(p.strip()) for p in pages_str.split(',') if p.strip().isdigit()]
            except:
                selected_pages = []

        results = []
        for file in files:
            original_filename = file.filename
            filename = secure_filename(original_filename)
            ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else ''
            file_bytes = file.read()
            print(f"[INFO] Procesando: {original_filename} ({len(file_bytes)} bytes)")

            if ext == 'pdf':
                try:
                    from PyPDF2 import PdfReader
                    reader = PdfReader(io.BytesIO(file_bytes))
                    total_pages = len(reader.pages)
                except:
                    total_pages = 1

                if not selected_pages:
                    selected_pages = list(range(1, total_pages + 1))
                valid_pages = [p for p in selected_pages if 1 <= p <= total_pages]
                if not valid_pages:
                    return jsonify({'error': f'No hay páginas válidas (PDF tiene {total_pages} páginas)'}), 400

                for page_num in valid_pages:
                    try:
                        img = convert_from_bytes(file_bytes, dpi=150, first_page=page_num, last_page=page_num)[0]
                        img_bytes = io.BytesIO()
                        img.save(img_bytes, format='JPEG', quality=75)
                        img_bytes.seek(0)

                        board_images = detect_boards_in_image(img_bytes.getvalue(), use_grid=True)

                        for board_idx, board_img in enumerate(board_images):
                            if board_img is None:
                                continue
                            _, board_bytes_cv = cv2.imencode('.jpg', board_img)
                            board_bytes_cv = board_bytes_cv.tobytes()
                            thumbnail, fen, error = process_image_to_fen_and_thumbnail(board_bytes_cv)
                            if fen and thumbnail:
                                results.append({
                                    'original_filename': original_filename,
                                    'file': filename,
                                    'page': page_num,
                                    'board': board_idx + 1,
                                    'fen': fen,
                                    'thumbnail': thumbnail,
                                    'error': None
                                })
                            else:
                                results.append({
                                    'original_filename': original_filename,
                                    'file': filename,
                                    'page': page_num,
                                    'board': board_idx + 1,
                                    'fen': None,
                                    'thumbnail': thumbnail if thumbnail else None,
                                    'error': error or 'No se pudo obtener FEN'
                                })
                    except Exception as e:
                        print(f"[ERROR] Página {page_num}: {traceback.format_exc()}")
                        results.append({'original_filename': original_filename, 'file': filename, 'page': page_num, 'error': f'Error en página {page_num}: {str(e)[:80]}'})
            elif ext in ['png', 'jpg', 'jpeg', 'gif', 'bmp']:
                thumbnail, fen, error = process_image_to_fen_and_thumbnail(file_bytes)
                if fen and thumbnail:
                    results.append({
                        'original_filename': original_filename,
                        'file': filename,
                        'fen': fen,
                        'thumbnail': thumbnail,
                        'error': None
                    })
                else:
                    results.append({
                        'original_filename': original_filename,
                        'file': filename,
                        'fen': None,
                        'thumbnail': thumbnail if thumbnail else None,
                        'error': error or 'No se pudo obtener FEN'
                    })
            else:
                results.append({'original_filename': original_filename, 'file': filename, 'error': 'Formato no soportado'})

        shutil.rmtree(app.config['UPLOAD_FOLDER'], ignore_errors=True)
        app.config['UPLOAD_FOLDER'] = tempfile.mkdtemp()
        return jsonify({'results': results, 'success': True})
    except Exception as e:
        print(f"[ERROR] upload_files: {traceback.format_exc()}")
        return jsonify({'error': f'Error interno: {str(e)[:100]}'}), 500

@app.route('/upload-crop', methods=['POST'])
def upload_crop():
    try:
        data = request.get_json()
        image_base64 = data.get('image', '')
        if not image_base64:
            return jsonify({'error': 'No se proporcionó imagen'}), 400
        if image_base64.startswith('data:image'):
            image_base64 = image_base64.split(',')[1]
        image_bytes = base64.b64decode(image_base64)
        thumbnail, fen, error = process_image_to_fen_and_thumbnail(image_bytes)
        if fen:
            return jsonify({'success': True, 'fen': fen, 'thumbnail': thumbnail})
        else:
            return jsonify({'success': False, 'error': error or 'No se pudo obtener FEN'}), 400
    except Exception as e:
        print(f"[ERROR] upload_crop: {traceback.format_exc()}")
        return jsonify({'error': str(e)}), 500

@app.route('/export-pgn', methods=['POST'])
def export_pgn():
    try:
        data = request.get_json()
        fens = data.get('fens', [])
        study_name = data.get('study_name', 'Mi Estudio de Ajedrez')
        user = data.get('user', 'Anónimo')
        if not fens:
            return jsonify({'error': 'No se proporcionaron FEN'}), 400
        if len(fens) > 64:
            fens = fens[:64]
        now = datetime.now(timezone.utc)
        date_str = now.strftime("%Y.%m.%d")
        time_str = now.strftime("%H:%M:%S")
        pgn_lines = []
        for idx, fen in enumerate(fens, 1):
            chapter_name = f"Capítulo {idx}"
            pgn_lines.append(f'[Event "{study_name}: {chapter_name}"]')
            pgn_lines.append(f'[Date "{date_str}"]')
            pgn_lines.append('[Result "*"]')
            pgn_lines.append('[Variant "Standard"]')
            pgn_lines.append('[ECO "?"]')
            pgn_lines.append('[Opening "?"]')
            pgn_lines.append(f'[StudyName "{study_name}"]')
            pgn_lines.append(f'[ChapterName "{chapter_name}"]')
            pgn_lines.append(f'[Annotator "https://lichess.org/@/{user}"]')
            pgn_lines.append(f'[FEN "{fen}"]')
            pgn_lines.append('[SetUp "1"]')
            pgn_lines.append(f'[UTCDate "{date_str}"]')
            pgn_lines.append(f'[UTCTime "{time_str}"]')
            pgn_lines.append('[ChapterMode "gamebook"]')
            pgn_lines.append("")
            pgn_lines.append(" *")
            pgn_lines.append("")
        pgn_text = "\n".join(pgn_lines)
        safe_study_name = re.sub(r'[^a-zA-Z0-9-]', '-', study_name).lower()
        safe_user = re.sub(r'[^a-zA-Z0-9-]', '-', user).lower()
        filename = f"lichess_study_{safe_study_name}_by_{safe_user}_{date_str.replace('.', '-')}.pgn"
        response = Response(pgn_text, mimetype='text/plain')
        response.headers.set("Content-Disposition", "attachment", filename=filename)
        return response
    except Exception as e:
        print(f"[ERROR] export_pgn: {traceback.format_exc()}")
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))
    app.run(host='0.0.0.0', port=port)
