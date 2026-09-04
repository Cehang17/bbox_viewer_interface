import json
import stanza
import logging
import os
import sys
import re
import pysbd
import difflib
import copy
from typing import Optional, Dict, List, Any
import difflib

# Utils modülünden import
from utils import find_matching_key

# Loglama ayarları
logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')

def initialize_nlp(pdf_lang):
    """
    Türkçe için Stanza NLP pipeline'ını oluşturur. Arapça için pysbd'yi döndürür.
    """
    if pdf_lang == "ar":
        segmenter = pysbd.Segmenter(language="ar", clean=True)
        return segmenter
    else:
        # Model zaten cache'deyse (~/stanza_resources) indirmeye gerek yok. İndirme
        # denemesi GitHub'a gidip 429 (rate limit) verebiliyor; bu durumda mevcut
        # cache ile devam et. Pipeline'ı download_method=None ile kurunca ağ çağrısı
        # yapılmaz, yerel model kullanılır.
        try:
            stanza.download(f'{pdf_lang}', processors='tokenize', verbose=False)
        except Exception as e:
            logging.warning(f"Stanza indirme atlandı, mevcut cache kullanılacak: {e}")
        try:
            nlp = stanza.Pipeline(f'{pdf_lang}', processors='tokenize', verbose=False,
                                  use_gpu=False, download_method=None)
        except Exception:
            # download_method desteklenmiyorsa klasik yola düş
            nlp = stanza.Pipeline(f'{pdf_lang}', processors='tokenize', verbose=False, use_gpu=False)
        return nlp

def load_json_files(centroid_matches_path, new_layout_with_text_path):
    """
    Verilen dosya yollarından JSON verilerini yükler.
    """
    if not os.path.exists(centroid_matches_path):
        logging.error(f'{centroid_matches_path} bulunamadı.')
        return None, None

    if not os.path.exists(new_layout_with_text_path):
        logging.error(f'{new_layout_with_text_path} bulunamadı.')
        return None, None

    with open(centroid_matches_path, 'r', encoding='utf-8') as f:
        centroid_matches = json.load(f)

    with open(new_layout_with_text_path, 'r', encoding='utf-8') as f:
        new_layout_with_text = json.load(f)

    return centroid_matches, new_layout_with_text

def get_paragraphs_for_page(new_layout_with_text, page_number, file_key):
    """
    Verilen sayfa numarası için paragrafları ve image_bbox'u döndürür.
    """
    # Dinamik anahtar eşleştirmesi
    try:
        actual_key = find_matching_key(new_layout_with_text, file_key)
        for layout in new_layout_with_text[actual_key]:
            if layout['page'] == page_number:
                return layout['bboxes'], layout['image_bbox']
    except KeyError as e:
        logging.error(f"'{file_key}' anahtarı new_layout_with_text içinde bulunamadı: {e}")
    return [], None


def is_similar(a, b, threshold=0.8):
    """
    İki metin arasındaki benzerliği kontrol eder.
    """
    return difflib.SequenceMatcher(None, a, b).ratio() > threshold

def postprocess_sentences(sentences):
    """
    Cümleleri son işleyerek, gereksiz ayrımları birleştirir. 
    Özellikle virgül ile biten cümlelerin birleştirilmesini sağlar.
    """
    processed = []
    temp = ""
    for sentence in sentences:
        if sentence.endswith(','):  # Eğer cümle virgül ile bitiyorsa
            temp += sentence + " "
        else:
            temp += sentence
            processed.append(temp.strip())  # Cümleyi birleştir ve listeye ekle
            temp = ""
    return processed

def is_abbreviation(sentence, abbreviations):
    """
    Cümlenin sonunda bir kısaltma olup olmadığını, büyük–küçük harf duyarsız biçimde kontrol eder.
    """
    words = sentence.strip().split()
    if not words:
        return False

    last_word = words[-1]
    last_word_lower = last_word.lower().rstrip('.,:;()[]{}"\'“”‘’')
    last_word_with_dot = last_word.lower().rstrip(',:;()[]{}"\'“”‘’')

    abbreviations_lower = {abbr.lower().rstrip('.') for abbr in abbreviations}

    # 1) Eğer son kelime abbreviations listesinde varsa
    if last_word_lower in abbreviations_lower or last_word_with_dot in abbreviations_lower:
        return True

    # 2) Nokta ile biten kelimeler için başlama kontrolü ("Maks." gibi)
    if any(last_word_lower.startswith(abbr) for abbr in abbreviations_lower):
        return True

    return False

def split_paragraph_into_sentences(paragraph_text, nlp, pdf_lang):
    """
    Paragraf metnini cümlelere böler ve her bir cümlenin başlangıç ve bitiş indekslerini belirler.
    Stanza veya pysbd tarafından yanlış ayrılmış cümleleri kontrol eder ve düzeltir.
    """
    ABBREVIATIONS = {"vb", "vs", "örn", "sn", "bkz", "vd", "dr", "av", "Cad", "Sk", 
                     "A.Ş", "T.C", "No", "Min.", "Maks.", "USD", "Mah", "T.A.O", "T",
                     "vb.", "vs.", "örn.", "sn.", "bkz.", "vd.", "dr.", "av.", "cad.", "sk.",
                     "a.ş.", "t.c.", "no.", "mah."}
    SENTENCE_ENDINGS = {".", "!", "?", "؟"}
    ITEM_MARKERS = r'(?:(?<=^)|(?<=[\s(]))[a-z]\)(?=\s|$)'  # a), b), c) gibi madde belirteçleri için bağlam-duyarlı regex

    paragraph_text = paragraph_text.strip().replace("\n", " ").replace("\t", " ").replace("،", ",")

    

    # Madde belirteçlerini nokta ile değiştir (sadece satır başı/boşluk/paren sonrası gelen gerçek maddeler)
    paragraph_text = re.sub(ITEM_MARKERS, '.', paragraph_text, flags=re.MULTILINE)

    # Arapça metinler için pysbd, diğer dillerde Stanza kullanılıyor.
    if pdf_lang == "ar":
        segmenter = nlp
        raw_sentences = postprocess_sentences(segmenter.segment(paragraph_text))
    else:
        doc = nlp(paragraph_text)
        raw_sentences = [sentence.text.strip() for sentence in doc.sentences]


    

    # Eğer segmentasyon sonucu tek ve çok uzun bir cümle elde edildiyse (2000 karakterden fazla)
    if len(raw_sentences) == 1 and len(raw_sentences[0]) > 2000:
        # Eğer cümlede nokta, ünlem veya soru işareti bulunmuyorsa, virgüllere göre bölme yap
        if not re.search(r'[.!؟]', raw_sentences[0]):
            raw_sentences = [s.strip() for s in raw_sentences[0].split(',') if s.strip()]
            raw_sentences = postprocess_sentences(raw_sentences)
            logging.info("Cümle bölünmesinde noktalama işareti bulunamadı, virgüle göre bölme yapıldı.")

    corrected_sentences = []
    temp_sentence = ""
    search_idx = 0
    prev_sentence_end = None

    for i, sentence in enumerate(raw_sentences):
        sentence = sentence.strip()
        if not sentence:
            continue

        # Orijinal metindeki konumu tespit edelim.
        index_in_text = paragraph_text.find(sentence, search_idx)
        if index_in_text == -1:
            index_in_text = paragraph_text.find(sentence)
        if index_in_text != -1:
            search_idx = index_in_text + len(sentence)
        # İki segment arasındaki orijinal boşluğu (ya da boşluk yoksa boşluğu) alalım.
        join_str = ""
        if prev_sentence_end is not None:
            join_str = paragraph_text[prev_sentence_end:index_in_text]

        # Cümle sonu koşullarını değerlendirelim.
        is_end = sentence[-1] in SENTENCE_ENDINGS

        # Kural 1: Eğer cümle ".)" ile bitiyorsa, sonlandırma yapılmaz.
        if len(sentence) >= 2 and sentence[-2:] == ".)":
            is_end = False

        # Kural 2: Noktalama işaretinin hemen öncesinde rakam varsa, cümle bölünmez.
        if len(sentence) >= 2 and sentence[-1] in SENTENCE_ENDINGS and sentence[-2].isdigit():
            is_end = False

        # Kural 3: Eğer cümlenin sonundaki nokta için orijinal metinde
        # noktadan sonra boşluk yoksa, cümle sonlandırılmaz.
        if sentence[-1] == '.':
            if index_in_text != -1 and index_in_text + len(sentence) < len(paragraph_text):
                if paragraph_text[index_in_text + len(sentence)] != " ":
                    is_end = False

        is_abbr = is_abbreviation(sentence, ABBREVIATIONS)
        is_sentence_end = is_end and not is_abbr

        # Eğer sırada başka segment varsa:
        if i < len(raw_sentences) - 1:
            if is_sentence_end:
                # Orijinal metindeki boşluk bilgisini koruyarak ekleme yapıyoruz.
                corrected_sentences.append((temp_sentence + join_str + sentence) if temp_sentence else (join_str + sentence))
                temp_sentence = ""
            else:
                temp_sentence = (temp_sentence + join_str + sentence) if temp_sentence else (join_str + sentence)
        else:
            # Son segment: varsa temp_sentence ile birleştir.
            corrected_sentences.append((temp_sentence + join_str + sentence) if temp_sentence else (join_str + sentence))
        prev_sentence_end = index_in_text + len(sentence)

    sentences = []
    start_idx = 0
    for sentence_text in corrected_sentences:
        start_idx = paragraph_text.find(sentence_text, start_idx)
        if start_idx == -1:
            continue
        end_idx = start_idx + len(sentence_text)
        sentences.append({'text': sentence_text, 'start': start_idx, 'end': end_idx})
        start_idx = end_idx
    return sentences

def get_lines_for_paragraph(centroid_matches_page, paragraph_bbox):
    """
    Verilen paragrafın bbox'una göre satırları döndürür.
    """
    lines = []
    for match in centroid_matches_page['matches']:
        if match['layout_bbox'] == paragraph_bbox and match['layout_label'] in ['Caption', 'Footnote', 'List-item', 'Page-footer', 'Page-header', 'Section-header', 'Form', 'Text', 'Text-inline-math', 'Title']:
            lines.append({
                'text': match['ocr_text'],
                'bbox': match['ocr_polygon']
            })
    return lines

def get_line_indices(paragraph_text, lines):
    """
    Satır metinlerinin paragraf metni içerisindeki başlangıç ve bitiş indekslerini belirler.
    """
    line_indices = []
    start_idx = 0

    for line in lines:
        line_text = line['text'].strip().replace("\n", " ").replace("\t", " ")
        start = paragraph_text.find(line_text, start_idx)

        # Eğer tam eşleşme bulunamazsa alternatif yöntemler
        if start == -1:
            for idx in range(len(paragraph_text)):
                if paragraph_text[idx:idx + len(line_text)] == line_text:
                    start = idx
                    break

        # Eğer hala bulunamazsa kısmi eşleşme kontrolü
        if start == -1:
            for idx in range(len(paragraph_text)):
                if is_similar(paragraph_text[idx:idx + len(line_text)], line_text):
                    start = idx
                    break

        # Eğer hala bulunamazsa hata logla ve devam et
        if start == -1:
            logging.warning(f"Line text not found: {line_text}")
            continue

        end = start + len(line_text)
        line_indices.append({'text': line_text, 'start': start, 'end': end, 'bbox': line['bbox']})
        start_idx = end

    return line_indices

def map_sentences_to_lines(sentences, line_indices):
    """
    Cümleleri satırlara eşler ve her cümleye ilişkin ilgili satırları döndürür.
    """
    for sentence in sentences:
        sentence_lines = []
        for line in line_indices:
            # Cümle ve satır indeksleri örtüşüyorsa
            if line['end'] > sentence['start'] and line['start'] < sentence['end']:
                overlap_start = max(sentence['start'], line['start']) - line['start']
                overlap_end = min(sentence['end'], line['end']) - line['start']
                sentence_lines.append({
                    'line': line,
                    'overlap_start': overlap_start,
                    'overlap_end': overlap_end
                })

        sentence['lines'] = sentence_lines

    return sentences

def calculate_ratios(text):
    """
    Metindeki Arapça, Latin ve diğer karakterlerin oranlarını hesaplar.

    Args:
        text (str): Analiz edilecek metin.

    Returns:
        dict: Arapça, Latin ve diğer karakter oranlarını içeren sözlük.
    """
    arabic_ranges = [
        range(0x0600, 0x06FF + 1),  # Arabic
        range(0x0750, 0x077F + 1),  # Arabic Supplement
        range(0x08A0, 0x08FF + 1),  # Arabic Extended-A
        range(0xFB50, 0xFDFF + 1),  # Arabic Presentation Forms-A
        range(0xFE70, 0xFEFF + 1),  # Arabic Presentation Forms-B
        range(0x1EE00, 0x1EEFF + 1)  # Arabic Mathematical Alphabetic Symbols
    ]

    arabic_count = sum(
        1 for char in text if any(ord(char) in arabic_range for arabic_range in arabic_ranges)
    )
    latin_count = sum(1 for char in text if char.isascii() and char.isalpha())
    total_count = len(text)
    other_count = total_count - (arabic_count + latin_count)

    return {
        "arabic_ratio": arabic_count / total_count if total_count > 0 else 0,
        "latin_ratio": latin_count / total_count if total_count > 0 else 0,
        "other_ratio": other_count / total_count if total_count > 0 else 0
    }

def calculate_sentence_bboxes(sentence, adjust_threshold=3, pdf_lang="tr"):
    """
    Cümleye ait satırların bbox bilgilerini kullanarak cümlenin bbox'larını hesaplar.
    Her bbox için ilgili metni de belirler.
    Aynı satırda bulunan ve birbirine yakın olan bbox'ları birleştirir.
    """
    bbox_list = []
    bbox_texts = []  # Her bbox için metin listesi
    previous_bbox = None
    current_line_bboxes = []  # Aynı satırdaki bbox'ları geçici olarak tutmak için
    current_line_y = None  # Mevcut satırın y koordinatı

    for item in sentence['lines']:
        line = item['line']
        overlap_start = item['overlap_start']
        overlap_end = item['overlap_end']
        line_text = line['text']
        line_bbox = line['bbox']

        # ÖNEMLİ: overlap_start/overlap_end, get_line_indices() içinde satırın
        # STRIP EDİLMİŞ metnine göre hesaplanıyor (satır başı/sonu boşluklar
        # atılıyor). Buradaki oran hesabı da aynı (strip edilmiş) uzunluğu
        # kullanmalı; aksi halde (ör. " 04" gibi baştan boşluklu satırlarda)
        # payda gerçek uzunluktan büyük kalır, oran 1.0'ın altında kalır ve
        # kutunun sağ kenarı erken kesilir (son karakter dışarıda kalır).
        stripped_line_text = line_text.strip().replace("\n", " ").replace("\t", " ")
        line_length = len(stripped_line_text)

        if line_length == 0:
            continue

        # Orantısal hesaplama (Sağdan sola diller için düzenlendi)
        x1_ratio = overlap_start / line_length
        x2_ratio = overlap_end / line_length

        # Satırın bbox koordinatları
        x_coords = [point[0] for point in line_bbox]
        y_coords = [point[1] for point in line_bbox]
        x_min = min(x_coords)
        x_max = max(x_coords)
        y_min = min(y_coords)
        y_max = max(y_coords)

        # Karakter-oranı bazlı hesap, sabit genişlikli karakter varsayımı
        # yapar; orantısal (proportional) fontlarda - özellikle kısa
        # başlık/etiket metinlerinde - bu varsayım son karakteri (ör. "i",
        # "k", "l" gibi dar harfleri) kutunun dışında bırakabiliyor. Satırın
        # TAMAMI bu cümleye aitse (overlap_start/end tüm satırı kapsıyorsa),
        # oran hesabına hiç gerek yok - satırın kendi (gerçek OCR/layout
        # tespitli) bbox'ını doğrudan kullanmak her zaman daha doğru.
        if overlap_start <= 0 and overlap_end >= line_length:
            x1_ratio, x2_ratio = 0.0, 1.0

        if pdf_lang == "ar":
            # Sağdan sola okuma yönü
            x1 = x_min + (1 - x2_ratio) * (x_max - x_min)
            x2 = x_min + (1 - x1_ratio) * (x_max - x_min)
        else:
            # Soldan sağa okuma yönü
            x1 = x_min + x1_ratio * (x_max - x_min)
            x2 = x_min + x2_ratio * (x_max - x_min)

        y1 = y_min
        y2 = y_max

        # Aynı satır mı? Dikey örtüşme ile karar ver (toleranslı)
        is_new_line = False
        if current_line_bboxes:
            prev = current_line_bboxes[-1]
            prev_y_min, prev_y_max = prev[1], prev[3]
            curr_y_min, curr_y_max = y1, y2
            overlap = max(0.0, min(prev_y_max, curr_y_max) - max(prev_y_min, curr_y_min))
            denom = max(prev_y_max - prev_y_min, curr_y_max - curr_y_min, 1e-6)
            overlap_ratio = overlap / denom
            # Eski sabit piksel eşiğine kıyasla daha sağlam: 0.4 altı yeni satır kabul
            if overlap_ratio < 0.4:
                is_new_line = True
            else:
                # Y bandı örtüşüyor olsa bile aradaki YATAY boşluk anormal
                # büyükse (ör. iki sütuna bölünmüş bir form tablosunda sol/sağ
                # sütun aynı satırda ama aralarında bir sütun ayracı kadar
                # boşluk varsa) bunu aynı satır sayma - aksi halde iki ayrı
                # sütundaki metinler tek bir dev bbox'ta birleşir.
                line_height = max(prev_y_max - prev_y_min, curr_y_max - curr_y_min, 1e-6)
                horizontal_gap = x1 - prev[2]
                if horizontal_gap > max(40.0, line_height * 3):
                    is_new_line = True

        if is_new_line:
            # Önceki satırdaki bbox'ları birleştir
            if current_line_bboxes:
                merged_bbox = [
                    min(b[0] for b in current_line_bboxes),
                    min(b[1] for b in current_line_bboxes),
                    max(b[2] for b in current_line_bboxes),
                    max(b[3] for b in current_line_bboxes)
                ]
                bbox_list.append(merged_bbox)
                # Birleştirilmiş bbox'ın metnini de ekle
                merged_text = " ".join(bbox_texts[-len(current_line_bboxes):])
                bbox_texts[-len(current_line_bboxes):] = [merged_text]
            current_line_bboxes = []

        # Mevcut bbox'ı geçici listeye ekle
        current_line_bboxes.append([x1, y1, x2, y2])
        current_line_y = y1

        # Bu bbox'a karşılık gelen metni belirle (overlap_start/end de
        # strip edilmiş metne göre hesaplandığından, stripped_line_text
        # üzerinden dilimlemeliyiz - aksi halde baştaki boşluk kayması
        # yüzünden son karakter(ler) metinden de düşer).
        start_char = int(overlap_start)
        end_char = int(overlap_end)
        bbox_text = stripped_line_text[start_char:end_char].strip()
        bbox_texts.append(bbox_text)

    # Son satırdaki bbox'ları da birleştir
    if current_line_bboxes:
        merged_bbox = [
            min(b[0] for b in current_line_bboxes),
            min(b[1] for b in current_line_bboxes),
            max(b[2] for b in current_line_bboxes),
            max(b[3] for b in current_line_bboxes)
        ]
        bbox_list.append(merged_bbox)
        # Son satırın birleştirilmiş metnini ekle
        merged_text = " ".join(bbox_texts[-len(current_line_bboxes):])
        bbox_texts[-len(current_line_bboxes):] = [merged_text]

    # Bbox'ları ve metinleri sentence'a ekle
    sentence['bboxes'] = bbox_list
    sentence['bbox_texts'] = bbox_texts

    # Genel aynı-satır birleştirme: ardışık bbox'lar aynı y-bandında ve aradaki
    # yatay boşluk küçükse tek satır olarak birleştir, metinleri de birleştir.
    if sentence.get('bboxes') and sentence.get('bbox_texts'):
        merged_bboxes: List[List[float]] = []
        merged_texts: List[str] = []
        y_tolerance_px = 2
        max_gap_px = 18
        for bb, tx in zip(sentence['bboxes'], sentence['bbox_texts']):
            if merged_bboxes:
                prev = merged_bboxes[-1]
                same_line = abs(bb[1]-prev[1]) <= y_tolerance_px and abs(bb[3]-prev[3]) <= y_tolerance_px
                small_gap = (bb[0] - prev[2]) <= max_gap_px
                if same_line and small_gap:
                    merged_bboxes[-1] = [min(prev[0], bb[0]), min(prev[1], bb[1]), max(prev[2], bb[2]), max(prev[3], bb[3])]
                    merged_texts[-1] = (merged_texts[-1] + " " + (tx or "").strip()).strip()
                    continue
            merged_bboxes.append(bb)
            merged_texts.append(tx)
        sentence['bboxes'] = merged_bboxes
        sentence['bbox_texts'] = merged_texts

    # Ek koruma: Başta çok küçük bir virgül/kısım varsa ve bir sonraki bbox ile
    # dikey örtüşmesi yüksekse, ikisini birleştir.
    if len(sentence['bboxes']) >= 2 and len(sentence['bbox_texts']) >= 2:
        first_bb = sentence['bboxes'][0]
        second_bb = sentence['bboxes'][1]
        first_txt = (sentence['bbox_texts'][0] or "").strip()
        is_tiny_text = len(first_txt) <= 6 and first_txt.endswith(',')
        y_overlap = max(0.0, min(first_bb[3], second_bb[3]) - max(first_bb[1], second_bb[1]))
        y_denom = max(first_bb[3]-first_bb[1], second_bb[3]-second_bb[1], 1e-6)
        same_line = (y_overlap / y_denom) >= 0.5
        gap = max(0.0, second_bb[0] - first_bb[2])
        if is_tiny_text and same_line and gap <= 15:
            merged = [
                min(first_bb[0], second_bb[0]),
                min(first_bb[1], second_bb[1]),
                max(first_bb[2], second_bb[2]),
                max(first_bb[3], second_bb[3])
            ]
            sentence['bboxes'][0] = merged
            sentence['bboxes'].pop(1)
            sentence['bbox_texts'][0] = (first_txt + " " + (sentence['bbox_texts'][1] or "").strip()).strip()
            sentence['bbox_texts'].pop(1)

    # Not: Fonksiyon içinde sentence['bboxes'] üzerinde ek birleştirmeler yapılmış olabilir.
    # Dışarıya, güncel (birleştirilmiş) listeyi döndürelim.
    return sentence.get('bboxes', bbox_list)

def calculate_paragraph_bbox(sentences):
    """
    Paragrafın genel bbox'unu, cümlelerin bbox'ından hesaplar.
    """
    bbox_list = []
    for sentence in sentences:
        for bbox in sentence['bboxes']:
            if bbox is not None:
                bbox_list.append(bbox)
    if bbox_list:
        paragraph_x1 = min(bbox[0] for bbox in bbox_list)
        paragraph_y1 = min(bbox[1] for bbox in bbox_list)
        paragraph_x2 = max(bbox[2] for bbox in bbox_list)
        paragraph_y2 = max(bbox[3] for bbox in bbox_list)
        paragraph_bbox = [paragraph_x1, paragraph_y1, paragraph_x2, paragraph_y2]
    else:
        paragraph_bbox = None
    return paragraph_bbox

def clean_sentences(sentences):
    """
    Cümleleri temizler ve yalnızca anlamlı cümleleri sonuçta bırakır.
    - Sadece noktalama işaretlerinden oluşan cümleler kaldırılır.
    - Madde işaretleri silinirken, bu işaretlere ait bbox'lar da silinir.
    """
    CLEAN_PATTERNS = ["•", "-", "▪", "·", "●", "*", "◦", ">>"]  # Madde işareti örnekleri
    cleaned_sentences = []

    for sentence in sentences:
        text = sentence['text'].strip()
        original_text = text

        # Cümlenin başındaki madde işaretini kaldır
        for pattern in CLEAN_PATTERNS:
            if text.startswith(pattern):
                # Madde işaretinin uzunluğunu hesapla
                pattern_length = len(pattern)
                text = text[pattern_length:].strip()
                
                # Eğer bbox'lar varsa, ilk bbox'ı güncelle veya kaldır
                if 'bboxes' in sentence and sentence['bboxes']:
                    # İlk bbox'ın genişliğini hesapla
                    first_bbox = sentence['bboxes'][0]
                    bbox_width = first_bbox[2] - first_bbox[0]
                    
                    # Madde işaretinin bbox genişliğini tahmin et (metin genişliğine orantılı)
                    pattern_ratio = pattern_length / len(original_text)
                    pattern_bbox_width = bbox_width * pattern_ratio
                    
                    # İlk bbox'ı güncelle
                    if pattern_bbox_width < bbox_width * 0.5:  # Eğer madde işareti bbox'ın yarısından küçükse
                        first_bbox[0] += pattern_bbox_width
                    else:  # Eğer madde işareti bbox'ın yarısından büyükse, bbox'ı tamamen kaldır
                        sentence['bboxes'].pop(0)
                        # bbox_texts listesinin boş olup olmadığını kontrol et
                        if 'bbox_texts' in sentence and sentence['bbox_texts']:
                            sentence['bbox_texts'].pop(0)

        # Cümlenin anlamlı olup olmadığını kontrol et
        if any(char.isalpha() for char in text) or text.replace(".", "").isdigit():
            # Cümle içinde harf varsa VEYA sadece sayı + nokta içeriyorsa
            sentence['text'] = text
            cleaned_sentences.append(sentence)

    return cleaned_sentences
    
def fix_tiny_leading_bboxes(sentences, gap_thr=1, char_width_factor=4):
    """
    sentences: her biri {..., 'bboxes': [[x1,y1,x2,y2],…], 'lines': […]} 
    gap_thr: x2_prev ile x1_curr arasındaki maks. tolerans (px)
    char_width_factor: ortalama karakter genişliğinin kaç katı altındaki bbox'lar
                       küçük sayılacak.

    Eğer sentences[i]'nin ilk bbox'u,
      1) önceki sentences[i-1]'nin son bbox'una çok yakın (|x1_i - x2_prev| < gap_thr veya tam eşit),
      2) aynı satırda (y1 & y2 değerleri gap_thr içinde),
      3) ve fragment genişliği < (o satırın ort. karakter genişliği × char_width_factor),
    → bu dar kutuyu ayrı değil union mantığıyla önceki cümlenin son bbox'una ekle,
       ve sentences[i]['bboxes'][0]'ı sil.
    """
    for i in range(1, len(sentences)):
        curr = sentences[i]
        prev = sentences[i-1]
        curr_b = curr.get('bboxes', [])
        prev_b = prev.get('bboxes', [])
        if not curr_b or not prev_b:
            continue

        first = curr_b[0]
        lastp = prev_b[-1]

        # 1) hemen bitişik mi?
        if not (abs(first[0] - lastp[2]) < gap_thr or first[0] == lastp[2]):
            continue
        # 2) aynı satır mı? y değerleri yakın mı?
        if abs(first[1] - lastp[1]) > gap_thr or abs(first[3] - lastp[3]) > gap_thr:
            continue

        # 3) Ortalama karakter genişliğini hesapla:
        #    Bu fragment'ın ait olduğu satırı bul:
        line_info = curr['lines'][0] if curr['lines'] else prev['lines'][-1]
        ln = line_info['line']['text']
        ln_bbox = line_info['line']['bbox']
        if not ln or not ln_bbox:
            continue
        # Satır pixel genişliği:
        xs = [pt[0] for pt in ln_bbox]
        avg_char_px = (max(xs) - min(xs)) / len(ln)
        # Fragment piksel genişliği:
        frag_w = first[2] - first[0]
        # Fragman metnini bul (curr'deki ilk line parçasına göre)
        try:
            ov_s = int(line_info.get('overlap_start', 0))
            ov_e = int(line_info.get('overlap_end', 0))
            frag_text = ln[ov_s:ov_e].strip()
        except Exception:
            frag_text = ""

        # Virgülle biten (örn. "Üye,") önde kalan geçerli token'ları asla birleştirme
        if frag_text.endswith(','):
            continue

        if frag_w > avg_char_px * char_width_factor:
            # 1.2× ort. karakter genişliğinden büyükse
            # => muhtemelen kelime başı, atlama
            continue

        # ──── UNION (birleştir) ────
        new_x1 = min(lastp[0], first[0])
        new_y1 = min(lastp[1], first[1])
        new_x2 = max(lastp[2], first[2])
        new_y2 = max(lastp[3], first[3])
        prev_b[-1] = [new_x1, new_y1, new_x2, new_y2]

        # i-inci cümlenin bu ufak bbox'unu sil
        curr_b.pop(0)

def classify_paragraphs_by_columns(paragraphs, image_bbox):
    """
    Paragrafları sütunlara göre sınıflandırır ve sıra numarası verir.
    
    Args:
        paragraphs: İşlenecek paragraflar listesi
        image_bbox: Sayfa boyutları [x1,y1,x2,y2]
    
    Returns:
        List[dict]: Her paragrafa column_number ve paragraph_number eklenmiş liste
    """
    if not paragraphs:
        return []

    # 1. Sütunları belirle
    x_centers = []
    for p in paragraphs:
        bbox = p['paragraph_bbox']
        if bbox:
            center_x = (bbox[0] + bbox[2]) / 2
            x_centers.append(center_x)

    # X merkezlerini kümeleme
    x_centers = sorted(set(x_centers))

    # Eğer hiç geçerli bbox yoksa veya image_bbox yoksa tek sütun kabul et
    if not x_centers or not image_bbox:
        classified_paragraphs = []
        for p in paragraphs:
            p_with_info = p.copy()
            p_with_info['column_number'] = 1
            # Aynı sütundaki (1) mevcut sayısını bul
            paragraph_number = sum(1 for cp in classified_paragraphs if cp.get('column_number') == 1) + 1
            p_with_info['paragraph_number'] = paragraph_number
            classified_paragraphs.append(p_with_info)
        return classified_paragraphs

    gap_threshold = (image_bbox[2] - image_bbox[0]) * 0.1  # Sayfa genişliğinin %10'u

    # Sütunları belirleme
    columns = []
    current_column = [x_centers[0]]
    
    for x in x_centers[1:]:
        if x - current_column[-1] > gap_threshold:
            columns.append(current_column)
            current_column = [x]
        else:
            current_column.append(x)
    columns.append(current_column)
    
    # 2. Her paragrafa sütun ve sıra numarası ver
    classified_paragraphs = []
    for p in paragraphs:
        bbox = p['paragraph_bbox']
        if bbox:
            center_x = (bbox[0] + bbox[2]) / 2
            center_y = (bbox[1] + bbox[3]) / 2
            
            # Hangi sütunda olduğunu bul
            column_number = 0
            for i, col in enumerate(columns):
                if min(col) <= center_x <= max(col):
                    column_number = i + 1
                    break
            
            # Sütun içindeki sırasını bul
            same_column_paragraphs = [
                cp for cp in classified_paragraphs 
                if cp.get('column_number') == column_number
            ]
            paragraph_number = len(same_column_paragraphs) + 1
            
            # Yeni bilgileri ekle
            p_with_info = p.copy()
            p_with_info['column_number'] = column_number
            p_with_info['paragraph_number'] = paragraph_number
            classified_paragraphs.append(p_with_info)
    
    return classified_paragraphs

def _rect_from_polygon(polygon):
    """
    Bir çokgen bbox'tan [x1,y1,x2,y2] dikdörtgenini üretir.
    """
    if not polygon:
        return None
    xs = [pt[0] for pt in polygon]
    ys = [pt[1] for pt in polygon]
    return [min(xs), min(ys), max(xs), max(ys)]

def _iou(b1, b2):
    if not b1 or not b2:
        return 0.0
    x1 = max(b1[0], b2[0])
    y1 = max(b1[1], b2[1])
    x2 = min(b1[2], b2[2])
    y2 = min(b1[3], b2[3])
    if x1 >= x2 or y1 >= y2:
        return 0.0
    inter = (x2 - x1) * (y2 - y1)
    a1 = (b1[2] - b1[0]) * (b1[3] - b1[1])
    a2 = (b2[2] - b2[0]) * (b2[3] - b2[1])
    return inter / (a1 + a2 - inter)

def _vertical_overlap_ratio(b1_polygon, b2_polygon):
    """
    İki polygon bbox'ın dikey (Y ekseni) örtüşme oranını döndürür.
    0.0–1.0 arasında değer üretir; 1.0 tam örtüşme demektir.
    """
    if not b1_polygon or not b2_polygon:
        return 0.0
    y1_min = min(p[1] for p in b1_polygon)
    y1_max = max(p[1] for p in b1_polygon)
    y2_min = min(p[1] for p in b2_polygon)
    y2_max = max(p[1] for p in b2_polygon)
    overlap = max(0.0, min(y1_max, y2_max) - max(y1_min, y2_min))
    height = max(y1_max - y1_min, y2_max - y2_min, 1e-6)
    return overlap / height

def _normalize_text(s: str) -> str:
    if s is None:
        return ""
    # Boşlukları sadeleştir, son iki nokta/iki nokta benzeri işaretleri kaldır, küçük harfe çevir
    s = s.strip()
    s = s.replace("\n", " ").replace("\t", " ")
    s = " ".join(s.split())
    if s.endswith(":") or s.endswith("："):
        s = s[:-1].strip()
    return s.casefold()

def _header_texts_for_page(headers_for_page: List[Dict[str, Any]]) -> List[str]:
    if not headers_for_page:
        return []
    texts = []
    for h in headers_for_page:
        t = h.get("text", "")
        nt = _normalize_text(t)
        if nt:
            texts.append(nt)
    return texts

def _is_header_line_text(line_text: str, headers_for_page: List[Dict[str, Any]], prefix_ratio=0.9, similar_ratio=0.92) -> bool:
    """
    Satır metni, sayfadaki header metinlerinden biriyle güçlü bir metinsel eşleşme gösteriyorsa True.
    Öncelik: tam eşleşme > başında eşleşme > benzerlik oranı.
    """
    if not headers_for_page:
        return False
    lt = _normalize_text(line_text)
    if not lt:
        return False
    header_texts = _header_texts_for_page(headers_for_page)
    # Ek: headers_for_page içinde aynı normalize metne ait next_word bilgisini hazırla
    next_word_by_text: Dict[str, str] = {}
    for h in headers_for_page:
        ht_full = _normalize_text(h.get("text", ""))
        if not ht_full:
            continue
        nw = h.get("next_word")
        if isinstance(nw, str) and nw.strip():
            next_word_by_text[ht_full] = _normalize_text(nw)

    for ht in header_texts:
        if not ht:
            continue
        # Tam eşleşme
        if lt == ht:
            return True
        # Başında eşleşme (satır daha uzun olabilir) ve ardından ':'/'：'/boşluk gelebilir
        if lt.startswith(ht):
            # ht'den sonra gelen ilk karaktere bakalım
            next_idx = len(ht)
            if next_idx < len(lt):
                ch = lt[next_idx]
                if ch in (':', '：', ' '):
                    if ch == ' ':
                        # Ek kural: Eğer header için next_word verilmişse ve satırdaki ilk token bu değilse, bu eşleşmeyi kabul etme
                        rest = lt[next_idx:].lstrip()
                        next_token = rest.split()[0] if rest else ""
                        expected_nw = next_word_by_text.get(ht)
                        if expected_nw and next_token and next_token != expected_nw:
                            # Bu header adayı, bağlama uymuyor; diğer header adaylarına bakmaya devam et
                            pass
                        else:
                            return True
                    else:
                        return True
            # Orijinal katı oran kuralını da koru ama esnek tut
            if (len(ht) / max(len(lt), 1)) >= max(0.2, prefix_ratio):
                return True
        # İlk kolon öncesi parça ht ile eşitse
        colon_idx = lt.find(':')
        fullwidth_colon_idx = lt.find('：')
        first_sep_idx = -1
        if colon_idx != -1 and fullwidth_colon_idx != -1:
            first_sep_idx = min(colon_idx, fullwidth_colon_idx)
        else:
            first_sep_idx = max(colon_idx, fullwidth_colon_idx)
        if first_sep_idx > 0:
            before = lt[:first_sep_idx].strip()
            if before == ht:
                return True
        # Benzerlik (özellikle küçük OCR farkları için)
        if difflib.SequenceMatcher(None, lt, ht).ratio() >= similar_ratio:
            return True
    return False

def _match_header_and_split(line_text: str, headers_for_page: List[Dict[str, Any]]):
    """
    Header satırlarını ikiye böler: (left=header, right=devam).
    Sadece satırda ':' veya '：' varsa split yapılır.
    Dönüş:
      (True, left_raw, right_raw)  -> split yapıldı
      (False, None, None)          -> split uygun değil
    """
    if not headers_for_page or not line_text:
        return (False, None, None)

    raw = line_text.rstrip()
    if not _is_header_line_text(raw, headers_for_page):
        return (False, None, None)

    colon_idx = raw.find(':')
    fullwidth_colon_idx = raw.find('：')
    sep_idx = -1
    if colon_idx != -1 and fullwidth_colon_idx != -1:
        sep_idx = min(colon_idx, fullwidth_colon_idx)
    else:
        sep_idx = max(colon_idx, fullwidth_colon_idx)

    if sep_idx == -1:
        return (False, None, None)

    left_raw = raw[:sep_idx+1].strip()    # ':' dahil
    right_raw = raw[sep_idx+1:].lstrip()  # iki noktadan sonrası
    if not left_raw:
        return (False, None, None)

    # Bölmeyi engelle: Eğer tam başlık eşleşmesi veya sol parçadan daha uzun bir başlık prefix'i varsa
    lt_norm = _normalize_text(raw)
    header_texts = _header_texts_for_page(headers_for_page)
    left_core_norm = _normalize_text(raw[:sep_idx])
    # 1) Tam başlık eşleşmesi: tüm satır detected_headers'ta ise split etme
    if any(lt_norm == ht for ht in header_texts):
        return (False, None, None)
    # 2) Uzun başlık prefix'i: ör. 'madde 2: tanımlar ve kısaltmalar' gibi sol çekirdeği aşan başlık
    if any(lt_norm.startswith(ht) and len(ht) > len(left_core_norm) for ht in header_texts):
        return (False, None, None)
    return (True, left_raw, right_raw)

def preprocess_lines_for_sentence_splitting(lines, ratio_threshold=0.9, headers_by_page: Optional[Dict[int, List[Dict[str, Any]]]] = None, page_number: Optional[int] = None):
    """
    • Erken virgül kuralı: Satır ',', ';' ile bitiyor ve genişliği < ratio_threshold×referans 
      ise son karakter → '.'  (cümle sonu). Bu kural SADECE satırda başka bbox yoksa uygulanır.
    • Bullet kuralı   : Satır sonu .!? değil  **ve**  sonraki satır bullet ile başlıyorsa
      mevcut satıra '.' eklenir.
    """
    if not lines:
        return ""

    bullet_chars = ("•", "-", "▪", "·", "●", "*", "◦", ">>")
    punctuation_to_replace = (',', ';')

    # Referans genişliği hesapla
    ref_width = max(
        (max(pt[0] for pt in ln['bbox']) - min(pt[0] for pt in ln['bbox']))
        for ln in lines if ln.get('bbox')
    ) if any(ln.get('bbox') for ln in lines) else 1

    processed = []
    processed_lines = []  # {'text': str, 'bbox': polygon}
    n = len(lines)

    headers_for_page = headers_by_page.get(page_number, []) if headers_by_page and page_number is not None else []

    

    for i, ln in enumerate(lines):
        txt = ln['text'].rstrip()
        ln_bbox = ln.get('bbox')
        _before_any = txt
        
        # Debug: "kendisine ait bilgiler ile" satırını izle
        KEY = "kendisine ait bilgiler ile"
        is_target = KEY in txt

        # 0) Header kuralı: önce split etmeye çalış
        did_split, left_raw, right_raw = _match_header_and_split(txt, headers_for_page)
        if did_split:
            # Önce: Önceki fragman cümle sonu değilse kapat (header'ın önceki cümleye yapışmasını engelle)
            if processed:
                last = processed[-1].rstrip()
                # Debug: Header split yapıldığında önceki satıra nokta ekleniyor mu?
                if KEY in last:
                    logging.info(f"[DEBUG][line={i}] HEADER_SPLIT_ADDED_PERIOD_TO_PREV | prev_line='{last[:100]}' ends_with_punct={last.endswith(('.', '!', '?'))}")
                if not last.endswith(('.', '!', '?')):
                    last_before = last
                    # sonda varsa gevşek noktalama/boşluğu temizle, nokta ekle
                    last = re.sub(r"[,:;\s]+$", "", last) + '.'
                    processed[-1] = last
                    if KEY in last_before:
                        logging.info(f"[DEBUG][line={i}] HEADER_SPLIT_ADDED_PERIOD | before='{last_before[:100]}' after='{last[:100]}'")
                    if processed_lines:
                        pl_last = processed_lines[-1]['text']
                        pl_last_before = pl_last
                        pl_last = re.sub(r"[,:;\s]+$", "", pl_last) + '.'
                        processed_lines[-1]['text'] = pl_last
                        if KEY in pl_last_before:
                            logging.info(f"[DEBUG][line={i}] HEADER_SPLIT_ADDED_PERIOD_TO_LINES | before='{pl_last_before[:100]}' after='{pl_last[:100]}'")
            # Sol parçayı header cümlesi yap
            # İstekte: ':' başlıkta kalmalı; NLP'nin ayırması için '.'' ekleyeceğiz ve sonra geri ':' yapacağız
            left_norm = left_raw.strip()
            if re.search(r"[,;]\s*$", left_norm):
                left_norm = re.sub(r"[,;]+\s*$", ":", left_norm)
            # Sonunda ':' yoksa ekle
            if not re.search(r"[:：]\s*$", left_norm):
                left_norm = left_norm + ':'
            # NLP cümle ayırması için geçici olarak nokta ekle
            left_norm = left_norm + '.'
            processed.append(left_norm)
            # BBox'ı ikiye böl: sol ve sağ poligonlar (ilk ':' konumuna göre)
            raw_line = txt
            colon_idx0 = raw_line.find(':')
            colon_idx1 = raw_line.find('：')
            sep_idx_local = -1
            if colon_idx0 != -1 and colon_idx1 != -1:
                sep_idx_local = min(colon_idx0, colon_idx1)
            else:
                sep_idx_local = max(colon_idx0, colon_idx1)
            split_ratio = (sep_idx_local + 1) / max(len(raw_line), 1) if sep_idx_local >= 0 else 0.5
            rect = _rect_from_polygon(ln_bbox)
            if rect:
                x_min, y_min, x_max, y_max = rect
                split_x = x_min + (x_max - x_min) * split_ratio
                left_poly = [[x_min, y_min], [split_x, y_min], [split_x, y_max], [x_min, y_max]]
                right_poly = [[split_x, y_min], [x_max, y_min], [x_max, y_max], [split_x, y_max]]
                processed_lines.append({'text': left_norm, 'bbox': left_poly})
                # Sağ parça ile devam: bbox'u sağ poligon yap
                ln_bbox = right_poly
            else:
                processed_lines.append({'text': left_norm, 'bbox': ln_bbox})
            # Sağ parça ile devam
            txt = right_raw
            
        elif _is_header_line_text(txt, headers_for_page):
            # Split yapılamadıysa ama header ise, cümle sonuna zorla
            if is_target:
                logging.info(f"[DEBUG][line={i}] HEADER_FORCE_END_CHECK | txt='{txt[:100]}' ends_with_punct={txt.endswith(('.', '!', '?'))}")
            if not txt.endswith(('.', '!', '?')):
                txt_before = txt
                txt = re.sub(r"[,:;]+\s*$", "", txt) + '.'
                if is_target:
                    logging.info(f"[DEBUG][line={i}] HEADER_FORCE_END_ADDED_PERIOD | before='{txt_before[:100]}' after='{txt[:100]}'")

        # 1) Erken-virgül/noktalı virgül kontrolü
        if is_target:
            logging.info(f"[DEBUG][line={i}] EARLY_COMMA_CHECK | txt='{txt[:100]}' ends_with_punct_to_replace={txt.endswith(punctuation_to_replace)}")
        if txt.endswith(punctuation_to_replace) and ln.get('bbox'):
            # Aynı satırda başka bbox var mı? Dikey örtüşme ile toleranslı kontrol
            SAME_LINE_THRESHOLD = 0.4
            other_bboxes_in_line = sum(
                1 for l in lines
                if l.get('bbox') and l is not ln and _vertical_overlap_ratio(l['bbox'], ln['bbox']) >= SAME_LINE_THRESHOLD
            )

            # Eğer aynı satırda başka bbox yoksa ve genişlik kriterini sağlıyorsa
            if other_bboxes_in_line == 0:
                x_min = min(p[0] for p in ln['bbox'])
                x_max = max(p[0] for p in ln['bbox'])
                line_width = x_max - x_min
                
                # Büyük harfli kelimeler için genişlik düzeltmesi
                uppercase_ratio = sum(1 for c in txt if c.isupper()) / len(txt) if txt else 0
                adjusted_width = line_width * (1 + uppercase_ratio * 0.2)  # Büyük harfler için %20 ek genişlik
                if adjusted_width / ref_width < ratio_threshold:
                    txt_before = txt
                    txt = txt[:-1] + '.'
                    if is_target:
                        logging.info(f"[DEBUG][line={i}] EARLY_COMMA_ADDED_PERIOD | before='{txt_before[:100]}' after='{txt[:100]}'")

        # 2) Bullet kuralı
        if is_target and i < n - 1:
            next_txt = lines[i + 1]['text'].lstrip()
            logging.info(f"[DEBUG][line={i}] BULLET_CHECK | txt='{txt[:100]}' next_starts_with_bullet={next_txt.startswith(bullet_chars)}")
        if i < n - 1:
            next_txt = lines[i + 1]['text'].lstrip()
            if (not txt.endswith(('.', '!', '?'))) and next_txt.startswith(bullet_chars):
                txt_before = txt
                txt += '.'
                if is_target:
                    logging.info(f"[DEBUG][line={i}] BULLET_ADDED_PERIOD | before='{txt_before[:100]}' after='{txt[:100]}'")
        
        if is_target:
            logging.info(f"[DEBUG][line={i}] FINAL_TEXT | txt='{txt[:100]}'")
        processed.append(txt)
        processed_lines.append({'text': txt, 'bbox': ln_bbox})

    return ' '.join(processed), processed_lines

def process_page(page_data, new_layout_with_text, nlp, file_key, pdf_lang, headers_by_page: Optional[Dict[int, List[Dict[str, Any]]]] = None):
    page_number = page_data['page']
    paragraphs, image_bbox = get_paragraphs_for_page(new_layout_with_text, page_number, file_key)
    if not paragraphs:
        logging.warning(f'Sayfa {page_number} için paragraf bulunamadı.')
        return []

    # Geçici paragraf listesi oluştur
    paragraphs_temp = []
    sentence_counter = 1  # Global cümle sayacı
    
    for paragraph in paragraphs:
        if paragraph['label'] not in ['Caption', 'Footnote', 'List-item',
                                      'Page-footer', 'Page-header',
                                      'Section-header', 'Form', 'Text', 'Text-inline-math']:
            continue

        paragraph_text = paragraph['text']
        paragraph_bbox = paragraph['bbox']

        # 1) Paragrafa ait satırları al
        lines = get_lines_for_paragraph(page_data, paragraph_bbox)

        # 2) Sadece satır metinlerini alıp kendi kuralımıza göre ön işleme
        preprocessed_paragraph, processed_lines = preprocess_lines_for_sentence_splitting(
            lines,
            headers_by_page=headers_by_page,
            page_number=page_number
        )

        # 3) Cümleleri bölme
        sentences = split_paragraph_into_sentences(preprocessed_paragraph, nlp, pdf_lang)

        # 4) Satır indekslerini eşleştir (preprocess sonrası üretime uygun şekilde)
        # processed_lines dizisi, preprocessed metnin üretim sırasındaki satırları taşır,
        # cümle-satır eşleşmesinde bu diziyi referans alalım
        line_indices = []
        start_idx = 0
        para_text_for_index = preprocessed_paragraph
        for pl in processed_lines:
            lt = pl['text']
            idx = para_text_for_index.find(lt, start_idx)
            if idx == -1:
                idx = para_text_for_index.find(lt)
            if idx == -1:
                continue
            end = idx + len(lt)
            line_indices.append({'text': lt, 'start': idx, 'end': end, 'bbox': pl['bbox']})
            start_idx = end
        sentences = map_sentences_to_lines(sentences, line_indices)

        # 5) Cümle bbox'larını hesapla
        for s in sentences:
            bbs = calculate_sentence_bboxes(s, pdf_lang=pdf_lang)
            s['bboxes'] = copy.deepcopy(bbs) if bbs else [paragraph_bbox]

        # 5.1) Header noktalama uyumu:
        # Eğer cümle metni ':.', '：.' ile bitiyorsa, metinde '.' kaldırıp ':' bırak
        for s in sentences:
            txt_clean = s.get('text', '').strip()
            if re.search(r"[:：]\.$", txt_clean):
                s['text'] = re.sub(r"\.$", "", txt_clean)
            # bbox_texts son parçayı da senkronize et
            if s.get('bbox_texts') and isinstance(s.get('bbox_texts'), list):
                last_idx = len(s['bbox_texts']) - 1
                if last_idx >= 0:
                    last_txt = s['bbox_texts'][last_idx]
                    if isinstance(last_txt, str):
                        # ':.', '：.' -> ':' yap
                        if re.search(r"[:：]\.$", last_txt.strip()):
                            s['bbox_texts'][last_idx] = re.sub(r"\.$", "", last_txt.strip())

        # 6) Küçük bbox'ları düzelt
        fix_tiny_leading_bboxes(sentences)

        # 7) Cümleleri temizle
        sentences = clean_sentences(sentences)
        
        # 8) Paragraf bbox'ını güncelle
        paragraph_bbox = calculate_paragraph_bbox(sentences)

        # 9) Cümleleri numaralandırarak geçici listeye ekle
        paragraph_sentences = []
        for sentence in sentences:
            paragraph_sentences.append({
                'sentence_text': sentence['text'],
                'sentence_bboxes': sentence['bboxes'],
                'bbox_texts': sentence['bbox_texts'] if 'bbox_texts' in sentence else [],
                'sentence_number': sentence_counter
            })
            sentence_counter += 1

        # 10) Paragrafa ait tüm bilgileri geçici listeye ekle
        paragraphs_temp.append({
            'page': page_number,
            'image_bbox': image_bbox,
            'paragraph_text': paragraph_text,
            'paragraph_bbox': paragraph_bbox,
            'sentences': paragraph_sentences
        })
    
    # 11) Paragrafları sütunlara göre sınıflandır
    results = classify_paragraphs_by_columns(paragraphs_temp, image_bbox)

    return results
        
def _load_headers(headers_path: Optional[str]) -> Dict[int, List[Dict[str, Any]]]:
    """
    header_detector.py çıktısını sayfa numarasına göre gruplar.
    Dönüş: {page_number: [header, ...]}
    """
    if not headers_path or not os.path.exists(headers_path):
        return {}
    try:
        with open(headers_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        headers = data.get('headers') or []
        grouped = {}
        for h in headers:
            p = int(h.get('page', 0))
            if p <= 0:
                continue
            grouped.setdefault(p, []).append(h)
        return grouped
    except Exception:
        return {}

def process_sentence_splitting(centroid_matches_path, new_layout_with_text_path, output_path, file_key, pdf_lang, headers_path=None, debug=False):
    """
    Subprocess yükünü azaltmak için CLI (main) yerine doğrudan çağrılabilir fonksiyon.
    """
    nlp = initialize_nlp(pdf_lang)
    centroid_matches, new_layout_with_text = load_json_files(centroid_matches_path, new_layout_with_text_path)
    if centroid_matches is None or new_layout_with_text is None:
        raise FileNotFoundError("JSON input files could not be loaded.")

    headers_by_page = _load_headers(headers_path)
    all_results = []

    for page_data in centroid_matches:
        page_results = process_page(page_data, new_layout_with_text, nlp, file_key, pdf_lang, headers_by_page=headers_by_page)
        all_results.extend(page_results)

    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(all_results, f, ensure_ascii=False, indent=4)

    if debug:
        logging.info(f'İşlem tamamlandı. Sonuçlar {output_path} dosyasına kaydedildi.')
    return output_path

def main():
    if len(sys.argv) < 6:
        print("Usage: python new_sentence_splitter.py centroid_matches_path new_layout_with_text_path output_path file_key pdf_language [--headers path] [--debug]")
        sys.exit(1)

    centroid_matches_path = sys.argv[1]
    new_layout_with_text_path = sys.argv[2]
    output_path = sys.argv[3]
    file_key = sys.argv[4]
    pdf_lang = sys.argv[5]
    headers_path = None
    debug = False

    i = 6
    while i < len(sys.argv):
        if sys.argv[i] == "--headers" and i + 1 < len(sys.argv):
            headers_path = sys.argv[i + 1]
            i += 2
        elif sys.argv[i] == "--debug":
            debug = True
            i += 1
        else:
            i += 1

    process_sentence_splitting(centroid_matches_path, new_layout_with_text_path, output_path, file_key, pdf_lang, headers_path, debug)

if __name__ == '__main__':
    main()
