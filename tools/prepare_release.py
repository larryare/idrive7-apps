#!/usr/bin/env python3
"""Prepare a release from the built packages in packages/: writes catalog.json and mgu-store.json
(the car Store's metadata) and release_notes.md, and prints the release tag.

    python3 tools/prepare_release.py [tag]

The tag defaults to the highest package version (v1.0.0), bumped to the next free patch when the
tag exists. Run after copying the built dist/*.tgz into packages/.
"""
import glob
import hashlib
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PACKAGES = os.path.join(ROOT, 'packages')
NAME = 'Larryare BMW Apps'


def main():
    packages = sorted(glob.glob(os.path.join(PACKAGES, '*.tgz')))
    if not packages:
        print('no packages in packages/ - build first: python3 kit/tools/build.py larryare_zodlys')
        sys.exit(1)

    apps_meta = {}
    components = []
    notes = ['### Žodlys - the Lithuanian daily word game on the iDrive\n', '#### Apps:\n']
    highest = [0, 0, 0]

    for p in packages:
        fname = os.path.basename(p)
        app_id = fname.split('@')[0]
        version = fname.split('@')[1].replace('.tgz', '')
        size = os.path.getsize(p)
        sha = hashlib.sha256(open(p, 'rb').read()).hexdigest()

        spec = {}
        try:
            import json
            spec = json.load(open(os.path.join(ROOT, 'apps', app_id, 'app.json')))
        except Exception:
            pass
        title = spec.get('title', app_id)
        desc = spec.get('description', '')

        apps_meta[app_id] = {
            'title': title,
            'description': desc,
            'author': 'custom',
            'icon': f'{app_id}.png',
        }
        icon_path = os.path.join(ROOT, f'{app_id}.png')
        if os.path.exists(icon_path):
            apps_meta[app_id]['iconSha256'] = hashlib.sha256(open(icon_path, 'rb').read()).hexdigest()

        components.append({
            'id': app_id,
            'kind': 'app',
            'version': version,
            'title': title,
            'description': desc,
            'mguHmi': spec.get('mguHmi', ['ID7']),
            'artifact': {'name': fname, 'size': size, 'sha256': sha, 'url': f'packages/{fname}'},
            'uninstallable': True,
        })
        notes.append(f'* **{title}** (`{fname}`) v{version}\n  {desc}\n')

        try:
            v = [int(x) for x in version.split('.')]
            if len(v) == 3 and v > highest:
                highest = v
        except Exception:
            pass

    with open(os.path.join(ROOT, 'mgu-store.json'), 'w', encoding='utf-8') as f:
        import json
        json.dump({'apps': apps_meta}, f, indent=2)
    print('Wrote mgu-store.json')

    with open(os.path.join(ROOT, 'catalog.json'), 'w', encoding='utf-8') as f:
        import json
        json.dump({'schema': 2, 'name': NAME, 'components': components}, f, indent=2)
    print('Wrote catalog.json')

    with open(os.path.join(ROOT, 'release_notes.md'), 'w', encoding='utf-8') as f:
        f.write('\n'.join(notes))
    print('Wrote release_notes.md')

    tag = os.environ.get('INPUT_TAG', '').strip() or (sys.argv[1] if len(sys.argv) > 1 else '')
    if not tag:
        base = 'v%d.%d.%d' % tuple(highest)
        try:
            tags = set(subprocess.run(['git', 'tag', '-l'], stdout=subprocess.PIPE, text=True).stdout.split())
        except Exception:
            tags = set()
        tag = base
        patch = highest[2]
        while tag in tags:
            patch += 1
            tag = 'v%d.%d.%d' % (highest[0], highest[1], patch)
    print('Tag:', tag)

    out = os.environ.get('GITHUB_OUTPUT')
    if out:
        with open(out, 'a') as f:
            f.write('tag=%s\n' % tag)
            f.write('title=Release %s\n' % tag)


if __name__ == '__main__':
    main()
