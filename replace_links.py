import os
import re

path = r'C:\Users\pranavnath\OneDrive\Desktop\CLAP\app\admin\layout.tsx'
with open(path, 'r', encoding='utf-8') as f:
    text = f.read()

if "import Link from 'next/link'" not in text:
    text = text.replace("import Image from 'next/image'", "import Image from 'next/image'\nimport Link from 'next/link'")

def replacer(match):
    route = match.group(1)
    class_name = match.group(2)
    inner = match.group(3)
    return (
        f'<Link\n'
        f'              onClick={{() => setSidebarOpen(false)}}\n'
        f'              href={{{route}}}\n'
        f'              className={{{class_name}}}\n'
        f'            >\n'
        f'{inner}</Link>'
    )

pattern = re.compile(r'<button\s*onClick=\{\(\) => goTo\(([^)]+)\)\}\s*className=\{([^}]+)\}\s*>(.*?)<\/button>', re.DOTALL)
text = pattern.sub(replacer, text)

with open(path, 'w', encoding='utf-8') as f:
    f.write(text)

print("Replacement complete")
