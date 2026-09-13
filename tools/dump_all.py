"""Extract every .odt in the source folder to a plain-text file, one line per paragraph."""

import os
import zipfile
from xml.etree import ElementTree

SRC = "Source de données"
OUT = os.path.join("tools", "_texte_brut")

NS = {
    "office": "urn:oasis:names:tc:opendocument:xmlns:office:1.0",
    "text": "urn:oasis:names:tc:opendocument:xmlns:text:1.0",
    "table": "urn:oasis:names:tc:opendocument:xmlns:table:1.0",
}


def tag(name):
    prefix, local = name.split(":")
    return "{%s}%s" % (NS[prefix], local)


P_TAGS = {tag("text:p"), tag("text:h")}


def node_text(node):
    parts = []

    def walk(elem):
        if elem.tag == tag("text:line-break"):
            parts.append("\n")
        elif elem.tag == tag("text:tab"):
            parts.append("\t")
        elif elem.tag == tag("text:s"):
            count = elem.get(tag("text:c"))
            parts.append(" " * (int(count) if count else 1))
        if elem.text:
            parts.append(elem.text)
        for child in elem:
            walk(child)
            if child.tail:
                parts.append(child.tail)

    walk(node)
    return "".join(parts)


def paragraphs(path):
    """Yield every paragraph of the document in reading order, including inside tables."""
    with zipfile.ZipFile(path) as archive:
        root = ElementTree.fromstring(archive.read("content.xml"))

    body = root.find(tag("office:body"))
    doc = body.find(tag("office:text"))

    for node in doc.iter():
        if node.tag in P_TAGS:
            for line in node_text(node).split("\n"):
                yield line


def main():
    os.makedirs(OUT, exist_ok=True)
    names = sorted(n for n in os.listdir(SRC) if n.lower().endswith(".odt"))
    for name in names:
        lines = [l.rstrip() for l in paragraphs(os.path.join(SRC, name))]
        target = os.path.join(OUT, os.path.splitext(name)[0] + ".txt")
        with open(target, "w", encoding="utf-8") as handle:
            handle.write("\n".join(lines))
        print("%-40s %4d lignes" % (name, len(lines)))


if __name__ == "__main__":
    main()
