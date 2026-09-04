/**
 * Sample Data and PDF Generator for SignForDeaf style instant demo
 */

class SampleDataset {
  static getJSON() {
    return [
      {
        "page": 1,
        "elements": [
          {
            "type": "title",
            "coords": [200, 94, 1473, 175],
            "confidence": 0.99,
            "text": "TÜRKİYE VAKIFLAR BANKASI T.A.O. SABİT FAİZLİ ESNEK VE ALTERNATİF ÖDEME SEÇENEKLİ\nKONUT FINANSMANI SÖZLEŞMESİ"
          },
          {
            "type": "plain text",
            "coords": [76, 204, 820, 742],
            "confidence": 0.97,
            "text": "Madde 1- TARAFLAR ve SÖZLEŞMENİN AMACI\nİşbu Sözleşme, bir taraftan TÜRKİYE VAKIFLAR BANKASI T.A.O. (Bundan sonra “Banka” olarak adlandırılacaktır) ile diğer taraftan son sayfada isim ve imzaları bulunan Müşteri ve Kefil/Kefiller arasında, Müşteri’nin satın alacağı konutun finansmanında kullanılmak üzere veya Müşterinin sahip olduğu konutun teminatı altında veyahut bu kapsamdaki kredilerin yeniden finansmanı amacıyla düzenlenmiştir."
          },
          {
            "type": "plain text",
            "coords": [854, 209, 1597, 321],
            "confidence": 0.95,
            "text": "fazla Müşteri tarafından borçlu sıfatıyla imzalanması halinde Kredi Banka tarafından Müşterilerden herhangi birinin hesabına yatırılabilecektir."
          },
          {
            "type": "plain text",
            "coords": [853, 324, 1597, 474],
            "confidence": 0.94,
            "text": "2.5. Müşteri, Krediyi Tüketicinin Korunması Hakkında Kanun ve işbu Sözleşmede belirtilen amaçlara uygun olarak kullanacağını, mesleki veya ticari bir amaçla kullanmayacağını kabul, beyan ve taahhüt eder."
          },
          {
            "type": "plain text",
            "coords": [853, 477, 1598, 703],
            "confidence": 0.96,
            "text": "2.6. Müşteri ve Kefil/Kefiller, Kredi konusu konut ile ilgili olarak müşteri ile satıcı/yüklenici arasında çıkabilecek uyuşmazlıkların Kredinin geri ödenmesine engel olmayacağını ve ödemelerin ertelenemeyeceğini kabul ve taahhüt eder."
          },
          {
            "type": "plain text",
            "coords": [76, 780, 820, 1161],
            "confidence": 0.98,
            "text": "Madde 2- KREDİ KULLANDIRIM KOŞULLARI ve ŞEKLİ\n2.1. Banka Krediyi, Kredi konusu konuta ilişkin ekspertiz raporu, Müşteri ve/veya Kefil/Kefillerin ödeme gücü, kredi itibarı, Bankaya beyan ve ibraz ettikleri bilgi ve belgelere göre tahsis etmektedir."
          },
          {
            "type": "title",
            "coords": [854, 1162, 1596, 1276],
            "confidence": 0.92,
            "text": "Madde 3- “AFET RİSKİ ALTINDAKİ ALANLARIN DÖNÜŞTÜRÜLMESİ HAKKINDA KANUN” KAPSAMINDA KULLANDIRILAN KONUT KREDİLERİ"
          },
          {
            "type": "plain text",
            "coords": [74, 1164, 820, 1545],
            "confidence": 0.96,
            "text": "2.2. Müşteri ve/veya Kefil/Kefillerin Bankaya vermiş oldukları bilgi ve belgelerin doğru olmadığının öğrenilmesi, Bankaca talep edilen bilgi ve belgelerin verilmemesi halinde Banka Krediyi kullandırmaktan vazgeçebilir."
          },
          {
            "type": "plain text",
            "coords": [853, 1281, 1597, 1582],
            "confidence": 0.95,
            "text": "3.1. Kredinin, “Afet Riski Altındaki Alanların Dönüştürülmesi Hakkında Kanun” kapsamında kullandırılması halinde faiz desteği Bakanlıkça karşılanacaktır."
          }
        ]
      }
    ];
  }

  static generateSamplePDFArrayBuffer() {
    const title = "TURKIYE VAKIFLAR BANKASI T.A.O. SABIT FAIZLI KONUT FINANSMANI SOZLESMESI";
    const m1_h = "Madde 1- TARAFLAR ve SOZLESMENIN AMACI";
    const m1_1 = "Isbu Sozlesme, bir taraftan TURKIYE VAKIFLAR BANKASI T.A.O. ile musteri";
    const m1_2 = "ve kefiller arasinda konutun finansmaninda kullanilmak uzere duzenlenmistir.";
    const r1 = "fazla Musteri tarafindan borclu sifatiyla imzalanmasi halinde kredi";
    const r1_2 = "musterilerden herhangi birinin hesabina yatirilabilecektir.";
    const r2_h = "2.5. Musteri, Krediyi Kanuna uygun olarak kullanacagini taahhut eder.";
    const m2_h = "Madde 2- KREDI KULLANDIRIM KOSULLARI ve SEKLI";
    const m2_1 = "2.1. Banka Krediyi ekspertiz raporu ve odeme gucu esas alinarak tahsis eder.";
    const m3_h = "Madde 3- AFET RISKI KAPSAMINDA KULLANDIRILAN KREDILER";

    const streamContent = `
BT
/F1 14 Tf
50 745 Td
(${title}) Tj
/F1 11 Tf
0 -45 Td
(${m1_h}) Tj
/F2 9.5 Tf
0 -20 Td
(${m1_1}) Tj
0 -15 Td
(${m1_2}) Tj
0 -40 Td
(${m2_h}) Tj
0 -20 Td
(${m2_1}) Tj
/F1 10 Tf
300 680 Td
(${r1}) Tj
/F2 9 Tf
0 -16 Td
(${r1_2}) Tj
0 -30 Td
(${r2_h}) Tj
0 -60 Td
(${m3_h}) Tj
ET
`;

    const streamLength = streamContent.length;

    const pdfString = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Contents 4 0 R /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> /F2 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> >>
endobj
4 0 obj
<< /Length ${streamLength} >>
stream${streamContent}endstream
endobj
xref
0 5
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000305 00000 n 
trailer
<< /Size 5 /Root 1 0 R >>
startxref
${400 + streamLength}
%%EOF`;

    const buffer = new Uint8Array(pdfString.length);
    for (let i = 0; i < pdfString.length; i++) {
      buffer[i] = pdfString.charCodeAt(i);
    }
    return buffer.buffer;
  }
}

window.SampleDataset = SampleDataset;
