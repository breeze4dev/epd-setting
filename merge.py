#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import re

print('开始合并HTML文件...')

# Read HTML file (original file remains unchanged)
with open('index.html', 'r', encoding='utf-8') as f:
    html = f.read()
print('读取 index.html 完成')

# Inline CSS file
print('处理 css/main.css...')
css_pattern = re.compile(r'<link rel="stylesheet" href="css/main\.css\?v=\d+">')
css_match = css_pattern.search(html)
if css_match:
    with open('css/main.css', 'r', encoding='utf-8') as f:
        css_content = f.read()
    css_replacement = f'<style>\n{css_content}\n</style>'
    html = html[:css_match.start()] + css_replacement + html[css_match.end():]
    print('  css/main.css 已内联')

# Read and inline JavaScript files
js_files = [
    ('js/dithering.js', 'js/dithering.js'),
    ('js/paint.js', 'js/paint.js'),
    ('js/crop.js', 'js/crop.js'),
    ('js/templates.js', 'js/templates.js'),
    ('js/main.js', 'js/main.js')
]

for js_file, js_name in js_files:
    print(f'处理 {js_file}...')
    with open(js_file, 'r', encoding='utf-8') as f:
        js_content = f.read()
    replacement = '<script type="text/javascript">\n' + js_content + '\n</script>'
    # Find the script tag using regex and replace with string replacement
    pattern = re.compile(r'<script type="text/javascript" src="' + re.escape(js_name) + r'\?v=\d+"></script>')
    match = pattern.search(html)
    if match:
        html = html[:match.start()] + replacement + html[match.end():]
        print(f'  {js_file} 已内联')

# Write merged HTML (original index.html remains unchanged)
with open('index_merged.html', 'w', encoding='utf-8') as f:
    f.write(html)
print('合并完成: index_merged.html (原始文件 index.html 保持不变)')