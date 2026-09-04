export const SAMPLE_PDF_BASE64 = 'JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCA2MTIgNzkyXSAvUmVzb3VyY2VzIDw8IC9Gb250IDw8IC9GMSA0IDAgUiA+PiA+PiAvQ29udGVudHMgNSAwIFIgPj4KZW5kb2JqCjQgMCBvYmoKPDwgL1R5cGUgL0ZvbnQgL1N1YnR5cGUgL1R5cGUxIC9CYXNlRm9udCAvSGVsdmV0aWNhID4+CmVuZG9iago1IDAgb2JqCjw8IC9MZW5ndGggNTYgPj4Kc3RyZWFtCkJUCi9GMSAyMCBUZgoxMDAgNzAwIFRkCihTYW1wbGUgUERGLCBCT1ggSW5zcGVjdG9yKSBUagpFVAplbmRzdHJlYW0KZW5kb2JqCnhyZWYKMCA2CjAwMDAwMDAwMDAgNjU1MzUgZiAKMDAwMDAwMDAxMCAwMDAwMCBuIAowMDAwMDAwMDYzIDAwMDAwIG4gCjAwMDAwMDAxMjAgMDAwMDAgbiAKMDAwMDAwMDI0NiAwMDAwMCBuIAowMDAwMDAwMzE2IDAwMDAwIG4gCnRyYWlsZXIKPDwgL1Jvb3QgMSAwIFIgL1NpemUgNiA+PgpzdGFydHhyZWYKNDIyCiUlRU9G';

export const SAMPLE_BBOX_DATA = [
  { id: '1', sentence_id: 1, page: 1, category: 'Title', text: 'Örnek Başlık:', x: 90, y: 120, width: 180, height: 24 },
  { id: '2', sentence_id: 2, page: 1, category: 'Plain Text', text: 'Dr. Ali vb. ifadeleri tek cümlede kalmalı.', x: 90, y: 170, width: 330, height: 24 },
  { id: '3', sentence_id: 3, page: 1, category: 'Abandon', text: 'Filigran', x: 430, y: 730, width: 120, height: 20 },
  { id: '4', sentence_id: 4, page: 1, category: 'Table', text: 'Hücre 1', x: 90, y: 230, width: 120, height: 30 },
  { id: '5', sentence_id: 5, page: 1, category: 'Table', text: 'Hücre 2', x: 215, y: 230, width: 120, height: 30 }
];

export const SAMPLE_LAYOUT_DATA = {
  layouts: [
    { page: 1, layout_type: 'title', text: 'Örnek Başlık:', x: 90, y: 120, width: 220, height: 24 },
    { page: 1, layout_type: 'plain text', text: 'Dr. Ali vb. ifadesi korunur. Yeni cümle başlar.', x: 90, y: 170, width: 420, height: 24 },
    { page: 1, layout_type: 'table', text: 'Tablo', x: 90, y: 230, width: 250, height: 30, cells: [
      { text: 'Hücre 1', x: 90, y: 230, width: 120, height: 30 },
      { text: 'Hücre 2', x: 215, y: 230, width: 120, height: 30 }
    ] },
    { page: 1, layout_type: 'abandon', text: 'Filigran', x: 430, y: 730, width: 120, height: 20 }
  ]
};
