#!/usr/bin/env python3
import json
import sys
from pathlib import Path

import xlsxwriter


def clean_sheet_name(name):
    bad = '[]:*?/\\'
    for ch in bad:
        name = name.replace(ch, ' ')
    return name[:31]


def main():
    if len(sys.argv) < 3:
        raise SystemExit('Usage: write_tuesday_mirror_xlsx.py <workbook.json> <output.xlsx>')
    workbook_json = Path(sys.argv[1])
    output = Path(sys.argv[2])
    data = json.loads(workbook_json.read_text())
    output.parent.mkdir(parents=True, exist_ok=True)

    wb = xlsxwriter.Workbook(str(output), {'constant_memory': True, 'strings_to_urls': False})
    header_fmt = wb.add_format({'bold': True, 'font_color': 'white', 'bg_color': '#1a1a1a', 'border': 1})
    raw_tab_fmt = wb.add_format({'bg_color': '#f2f2f2'})
    red_fmt = wb.add_format({'bg_color': '#f4cccc'})
    amber_fmt = wb.add_format({'bg_color': '#fff2cc'})
    green_fmt = wb.add_format({'bg_color': '#d9ead3'})

    used = set()
    for tab in data['tabs']:
        name = clean_sheet_name(tab['name'])
        base = name
        i = 2
        while name in used:
            suffix = f' {i}'
            name = (base[:31-len(suffix)] + suffix)
            i += 1
        used.add(name)
        ws = wb.add_worksheet(name)
        values = tab['values']
        if tab['name'].startswith('RAW '):
            ws.set_tab_color('#999999')
        elif tab['name'].startswith('VIEW '):
            ws.set_tab_color('#0c7c7a')
        elif tab['name'].startswith('FIX '):
            ws.set_tab_color('#c8a96e')
        elif tab['name'].startswith('AUDIT '):
            ws.set_tab_color('#6e8a6a')
        ws.freeze_panes(1, 0)
        for r, row in enumerate(values):
            for c, val in enumerate(row):
                fmt = header_fmt if r == 0 else None
                ws.write(r, c, val, fmt)
        if values:
            ws.autofilter(0, 0, max(0, len(values)-1), max(0, len(values[0])-1))
            widths = [min(max(len(str(values[0][c])) + 2, 10), 36) for c in range(len(values[0]))]
            for row in values[1:min(len(values), 100)]:
                for c, val in enumerate(row[:len(widths)]):
                    widths[c] = min(max(widths[c], len(str(val)) + 2), 48)
            for c, w in enumerate(widths):
                ws.set_column(c, c, w)
            # Simple conditional formatting across used range.
            rng = xlsxwriter.utility.xl_range(1, 0, max(1, len(values)-1), max(0, len(values[0])-1))
            ws.conditional_format(rng, {'type': 'text', 'criteria': 'containing', 'value': 'red', 'format': red_fmt})
            ws.conditional_format(rng, {'type': 'text', 'criteria': 'containing', 'value': 'amber', 'format': amber_fmt})
            ws.conditional_format(rng, {'type': 'text', 'criteria': 'containing', 'value': 'yes', 'format': amber_fmt})
            ws.conditional_format(rng, {'type': 'text', 'criteria': 'containing', 'value': 'OK', 'format': green_fmt})
    wb.close()
    print(output)

if __name__ == '__main__':
    main()
