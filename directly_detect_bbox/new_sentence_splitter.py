"""Reference sentence splitter for Turkish-focused bbox segmentation."""

import re
from dataclasses import dataclass
from typing import Iterable, List

ABBREVIATIONS = {
    "vb.", "vs.", "örn.", "sn.", "bkz.", "vd.", "dr.", "av.", "cad.", "sk.", "a.ş.", "t.c.", "no.", "mah."
}


@dataclass
class LayoutBlock:
    page: int
    layout_type: str
    text: str
    x: float
    y: float
    width: float
    height: float


def split_sentences(text: str) -> List[str]:
    src = re.sub(r"\s+", " ", text or "").strip()
    if not src:
        return []

    out, start = [], 0
    for i, ch in enumerate(src):
        if ch not in ".!?:":
            continue
        token = re.search(r"([\wÇĞİÖŞÜçğıöşü\.]+)$", src[max(0, i - 12) : i + 1])
        token = token.group(1).lower() if token else ""
        if token in ABBREVIATIONS or re.fullmatch(r"\d+\.", token):
            continue
        if i + 1 < len(src) and not src[i + 1].isspace():
            continue
        piece = src[start : i + 1].strip()
        if piece:
            out.append(piece)
        start = i + 1

    tail = src[start:].strip()
    if tail:
        out.append(tail)
    return out


def split_layouts(layouts: Iterable[LayoutBlock]) -> List[dict]:
    sentences, sentence_id = [], 1
    for block in layouts:
        text = re.sub(r"^(?:[•▪\-]|[a-zçğıöşü]\)|\d+[\).])\s+", "", block.text.strip(), flags=re.I)
        parts = [text] if block.layout_type in {"title", "abandon"} else split_sentences(text)
        parts = parts or [text]
        total = sum(len(p) for p in parts) or 1
        cursor = 0
        for part in parts:
            width = block.width if len(parts) == 1 else max(1.0, block.width * len(part) / total)
            sentences.append(
                {
                    "sentence_id": sentence_id,
                    "page": block.page,
                    "category": block.layout_type.title(),
                    "text": part,
                    "x": block.x + cursor,
                    "y": block.y,
                    "width": width,
                    "height": block.height,
                }
            )
            cursor += width
            sentence_id += 1
    return sentences
