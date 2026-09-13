"""Dump the plain-text structure of an .odt file to understand how data was entered."""

import sys
import zipfile
from xml.etree import ElementTree

NS = {
    "office": "urn:oasis:names:tc:opendocument:xmlns:office:1.0",
    "text": "urn:oasis:names:tc:opendocument:xmlns:text:1.0",
    "table": "urn:oasis:names:tc:opendocument:xmlns:table:1.0",
}


def tag(name):
    prefix, local = name.split(":")
    return "{%s}%s" % (NS[prefix], local)


def cell_text(node):
    """Concatenate all text inside a node, turning line breaks and tabs into markers."""
    parts = []
    for elem in node.iter():
        if elem.tag == tag("text:line-break"):
            parts.append(" \\n ")
        elif elem.tag == tag("text:tab"):
            parts.append(" \\t ")
        elif elem.tag == tag("text:s"):
            parts.append(" ")
        if elem.text:
            parts.append(elem.text)
        if elem.tail and elem is not node:
            parts.append(elem.tail)
    return "".join(parts).strip()


def main(path):
    with zipfile.ZipFile(path) as archive:
        xml = archive.read("content.xml")

    root = ElementTree.fromstring(xml)
    body = root.find(tag("office:body"))
    doc = body.find(tag("office:text"))

    for child in doc:
        if child.tag == tag("table:table"):
            name = child.get(tag("table:name"))
            rows = child.findall(tag("table:table-row"))
            print("=== TABLE %s (%d rows) ===" % (name, len(rows)))
            for i, row in enumerate(rows):
                cells = row.findall(tag("table:table-cell"))
                values = [cell_text(c) for c in cells]
                print("ROW %d | %s" % (i, " || ".join(values)))
        elif child.tag == tag("text:p") or child.tag == tag("text:h"):
            text = cell_text(child)
            if text:
                print("PARA | %s" % text)
        elif child.tag == tag("text:list"):
            print("LIST | %s" % cell_text(child))


if __name__ == "__main__":
    main(sys.argv[1])
