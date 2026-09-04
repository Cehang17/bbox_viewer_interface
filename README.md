# PDF & JSON Bounding Box Inspector & NLP Cümle Ayrıştırma Editörü

PDF belgeleri üzerinde JSON formatındaki sınırlayıcı kutuları (**Bounding Box**) görselleştiren, Türkçe ve çok dilli **NLP kurallarıyla cümle segmentasyonu** gerçekleştiren, kutuları sürükleyip boyutlandırarak düzenlemeye ve dışa aktarmaya olanak tanıyan etkileşimli web uygulaması.

---

## 🚀 Öne Çıkan Özellikler

### 1. 🧠 Gelişmiş NLP Cümle Ayrıştırma Motoru (`sentence-splitter.js`)
- **Türkçe Kısaltma & İstisna Yönetimi:** `vb.`, `vs.`, `örn.`, `sn.`, `bkz.`, `vd.`, `dr.`, `av.`, `cad.`, `sk.`, `A.Ş.`, `T.C.`, `No.`, `Mah.`, madde başlıkları (`Madde 16:`, vb.) ve sayısal nokta dizilimleri (`15.`, `5.`) yanlış cümle sonu olarak bölünmez.
- **Çok Satırlı Cümleler için Oransal BBox:** Tek bir cümle birden fazla satıra yayıldığında her satır için karakter oranına göre ayrı BBox üretilir ancak tüm satırlar **aynı `sentence_id` ve rozet numarasını** paylaşır.
- **Madde İmleri & Başlık Ayrımı:** Madde imleri (`•`, `-`, `▪`, `a)`, `b)`) oransal olarak ayıklanır, başlıklar ve iki nokta ile biten ibareler bağımsız cümle olarak konumlandırılır.

### 2. 📊 Tablo Sınıflandırma ve Erişilebilir Okuma Sırası (`table-classifier.js`)
Sistem, PDF belgelerindeki tabloları yalnızca standart $N \times M$ grid olarak ele almak yerine, yapısal özelliklerini analiz ederek **6 temel kategoride** sınıflandırır ve ekran okuyucu/TTS dostu anlamsal okuma sırasına dönüştürür:
- **`A_MATRIX` (Matris Tablo):** Satır ve sütun başlıklarının kesişimini ilişkilendirerek okur (`"[Ocak Ayı] - [Elektrik Gideri]: 1.250 TL"`).
- **`B_KEY_VALUE` (Form / Anahtar-Değer):** Soldan sağa etiket ve değer çifti olarak okur (`"[Müşteri Adı]: Hasan Yılmaz"`).
- **`C_PARALLEL_TEXT` (Paralel Metin / Sahte Tablo):** Yanlış tespit edilmiş yan yana gazete sütunlarında tablo yapısını kaldırır; sütun bazında yukarıdan aşağıya standart paragraf akışıyla okur.
- **`D_MERGED_CELLS` (Birleştirilmiş Hücreli Tablo):** `rowspan` ve `colspan` yayımlı hiyerarşik başlıkları ilişkilendirerek okur (`"[2025 Yılı] altındaki [Gelir]: 50.000 TL"`).
- **`E_FORMULA` (Formül / Hesaplama Cetveli):** Matematiksel eşitlikleri ve operatörleri seslendirilebilir metne dönüştürür (`"KDV Tutarı = Matrah çarpı yüzde 20 eşittir 200 TL"`).
- **`F_HYBRID_NOTE` (Hibrit / Dipnotlu Tablo):** Ana tabloyu tamamladıktan sonra altındaki açıklama ve dipnot bloklarını ayrık olarak okur (`"Tablo Notu: Veriler TCMB kurlarına göredir."`).

### 3. 📑 Layout (Düzen) ve Kategori Duyarlılığı
- **`title` (Başlık):** Bağımsız bir varlık olarak ele alınır. Başlıktan önce veya sonra gelen düz metinler kesinlikle başlıkla birleştirilmez.
- **`table` (Tablo):** `TableClassifier` ile otomatik analiz edilir; hücre bazlı (`cell-by-cell`) işlenir ve türe özel anlamsal okuma metni üretilir.
- **`abandon` (Arka Plan / Filigran / Dipnot):** BBox katmanında kendi kategorisiyle (`Abandon`) bağımsız olarak görselleştirilir.
- **`plain text` (Düz Metin):** Aynı sütun akışı içerisindeki ardışık düz metin layout blokları önce birleştirilir, ardından NLP kurallarıyla cümlelere bölünür.
- **İki Sütun (2-Column) Ayrımı:** İki sütunlu sayfalarda sol ve sağ sütunlar kesin olarak ayrı gruplanır; sütunlar arası yatay birleşme engellenir.
- **Makro Kutu & Mükerrer Filtreleme:** Cümle ve satır kutularının arkasında kalan dev konteyner kutuları (`macro container`) ve yüksek çakışmalı mükerrer tespitler otomatik olarak temizlenir.

### 4. 🎯 Etkileşimli Bounding Box Editörü (`overlay.js`)
- **8 Noktalı Boyutlandırma & Taşıma:** Her kutu 8 tutamaç (`nw, n, ne, e, se, s, sw, w`) ile yeniden boyutlandırılabilir ve fareyle sürüklenebilir.
- **Yeni BBox Çizim Modu:** "Draw Mode" aktif edilerek PDF üzerinde fare ile serbestçe yeni sınırlayıcı kutular çizilebilir.
- **Görünürlük Filtreleri:**
  - `All Sentence`: Tüm sayfalardaki kutuları gösterir.
  - `Just Selected`: Yalnızca seçili olan cümlenin kutularını gösterir.
- **ID & Metin Düzenleme:** Seçili kutunun ID'si ve metin içeriği sağ panelden anında düzenlenebilir ve kaydedilebilir.
- **Dışa Aktarma:** Güncellenmiş BBox koordinatları ve metinleri JSON olarak indirilebilir.

### 5. 🖥️ Modern Arayüz & PDF Görüntüleyici (`pdf-viewer.js`, `style.css`)
- **PDF.js Entegrasyonu:** Yüksek çözünürlüklü sürekli sayfa akışı (Continuous Scroll).
- **Görünüm Kontrolleri:** Yakınlaştırma (Zoom In / Zoom Out / Fit Width / Fit Page).
- **Tema Desteği:** Açık ve Koyu Tema (Light / Dark Mode).
- **Çift Yönlü Etkileşim:** PDF'teki kutuya tıklandığında sağ paneldeki form güncellenir; formdaki değişiklikler anında PDF üzerine yansır.

---

## 📂 Proje Yapısı

```text
directly_detect_bbox/
├── index.html                  # Ana web arayüzü
├── README.md                   # Proje dokümantasyonu
├── new_sentence_splitter.py    # Python NLP & BBox referans motoru
├── css/
│   └── style.css               # Modern karanlık/aydınlık tema stilleri
├── js/
│   ├── app.js                  # Uygulama mantığı ve durum yönetimi
│   ├── bbox-parser.js          # Evrensel JSON & koordinat ayrıştırma motoru
│   ├── table-classifier.js     # 6 tipli tablo sınıflandırıcı & okuma sırası motoru
│   ├── sentence-splitter.js    # JavaScript NLP cümle ve BBox hesaplayıcı
│   ├── overlay.js              # BBox çizim, seçim, sürükleme ve boyutlandırma
│   ├── pdf-viewer.js           # PDF render ve sayfa ölçekleme yönetimi
│   └── pdf.min.js              # PDF.js kütüphanesi
└── sample_data/
    ├── sample.pdf              # Örnek PDF belgesi
    ├── sample.json             # Örnek JSON koordinat verisi
    └── sample-data.js          # Dahili test verisi
```

---

## 🛠️ Kurulum ve Çalıştırma

Proje herhangi bir derleme adımı (build step) gerektirmez. Doğrudan statik web sunucusu ile çalıştırılabilir:

### 1. Sunucuyu Başlatın
```bash
python -m http.server 8080
```

### 2. Tarayıcınızda Açın
```text
http://localhost:8080
```
*(veya doğrudan `index.html` dosyasını modern bir tarayıcıda açabilirsiniz.)*

---

## 📖 Kullanım Kılavuzu

1. **Dosya Yükleme:**
   - PDF dosyanızı sol yükleme alanına sürükleyin veya dosya seçici ile yükleyin.
   - Model çıktısı olan JSON dosyanızı sağ yükleme alanına bırakın.
2. **Kutuları İnceleme:**
   - PDF üzerinde kırmızı rozetli sınırlayıcı kutular görüntülenecektir.
   - Bir kutuya tıkladığınızda sağ panelde cümlenin metni ve ID'si görüntülenir.
3. **Kutuları Düzenleme:**
   - Seçili kutunun köşelerindeki tutamaçları kullanarak boyutunu ayarlayın veya kutuyu yeni bir konuma sürükleyin.
   - Sağ panelden metni veya ID'yi güncelleyip **Save Text** / **Save Id** butonlarına basın.
4. **Yeni Kutu Ekleme:**
   - Üst bardaki **Draw Mode** butonuna tıklayarak çizim modunu açın ve PDF üzerinde sürükleyerek yeni kutu oluşturun.
5. **JSON İndirme:**
   - Yapılan tüm düzenlemeleri içeren güncel JSON verisini üst bardaki **Export JSON** butonuyla kaydedin.
