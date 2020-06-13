# -*- mode: python ; coding: utf-8 -*-

block_cipher = None
options = [('u', None, 'OPTION')]

a = Analysis(['.\\build\\scripts\\beatmapsynth.py'],
             pathex=['.\\build\\scripts'],
             binaries=[('.\\lib\\vcomp140.dll', '.\\sklearn\\.libs\\')],
             datas=[],
             hiddenimports=['sklearn.utils._cython_blas', 'sklearn.neighbors.typedefs', 'sklearn.neighbors.quad_tree', 'sklearn.tree._utils'],
             hookspath=[],
             runtime_hooks=[],
             excludes=[],
             win_no_prefer_redirects=False,
             win_private_assemblies=False,
             cipher=block_cipher,
             noarchive=False)
pyz = PYZ(a.pure, a.zipped_data,
             cipher=block_cipher)
exe = EXE(pyz,
          a.scripts,
          a.binaries,
          a.zipfiles,
          a.datas,
          options,
          name='beatmapsynth',
          debug=False,
          bootloader_ignore_signals=False,
          strip=False,
          upx=False,
          upx_exclude=[],
          runtime_tmpdir=None,
          console=True )
